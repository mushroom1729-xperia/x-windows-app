#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, State, Url, WebviewUrl, WebviewWindowBuilder};

const CPT_SCRIPT: &str = include_str!("../assets/cpt.user.js");
const HARVEST_SCRIPT: &str = include_str!("../assets/harvest.js");

// CSS which shrinks CPT's replacement (classic bird) verified badge a little
// so it does not crowd / overlap the display name next to it.
const BADGE_FIX_CSS: &str = ":is(svg[data-testid=\"icon-verified\"], svg[data-testid=\"verificationBadge\"]).tnt_blue_check{transform:scale(.8);margin:0 1px}";

fn log_line(msg: &str) {
    let path = r"C:\Users\mushroom\muse-work\x-app-log.txt";
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let line = format!("[{}] {}\n", ts, msg);
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(path) {
        use std::io::Write;
        let _ = f.write_all(line.as_bytes());
    }
}

fn is_allowed_host(url: &Url) -> bool {
    match url.host_str() {
        Some(host) => ["x.com", "twitter.com", "accounts.google.com", "appleid.apple.com"]
            .iter()
            .any(|d| host == *d || host.ends_with(&format!(".{}", d))),
        None => false,
    }
}

fn open_external(url: &Url) {
    let _ = std::process::Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", url.as_str()])
        .spawn();
}

// ---------- settings ----------

#[derive(Clone, Serialize, Deserialize)]
struct MediaSettings {
    ask_each: bool,
    pattern: Vec<String>,
    subdir_enabled: bool,
    subdir_name: String,
}

impl Default for MediaSettings {
    fn default() -> Self {
        Self {
            ask_each: false,
            pattern: vec![
                "account".to_string(),
                "tweet".to_string(),
                "serial".to_string(),
                "date".to_string(),
            ],
            subdir_enabled: true,
            subdir_name: "twitter_media_harvest".to_string(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
struct Settings {
    #[serde(default)]
    cpt: Map<String, Value>,
    #[serde(default)]
    media: MediaSettings,
    #[serde(default = "default_true")]
    badge_fix: bool,
}

fn default_true() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            cpt: Map::new(),
            media: MediaSettings::default(),
            badge_fix: true,
        }
    }
}

struct AppState(Mutex<Settings>);

fn settings_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|d| d.join("settings.json"))
}

fn load_settings(app: &AppHandle) -> Settings {
    if let Some(path) = settings_path(app) {
        if let Ok(text) = fs::read_to_string(&path) {
            if let Ok(s) = serde_json::from_str::<Settings>(&text) {
                return s;
            }
        }
    }
    Settings::default()
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Settings {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<(), String> {
    if let Some(path) = settings_path(&app) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let text = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
        fs::write(&path, text).map_err(|e| e.to_string())?;
    }
    *state.0.lock().unwrap() = settings;
    log_line("settings saved");
    Ok(())
}

// Build the CPT userscript with the user's config overrides applied to the
// `const config = { ... }` defaults block near the top of the script. Only
// scalar (bool / number / string) values are replaced.
fn build_cpt_script(settings: &Settings) -> String {
    let mut overrides: BTreeMap<String, Value> = settings
        .cpt
        .iter()
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    let css = if settings.badge_fix { BADGE_FIX_CSS } else { "" };
    overrides.insert("customCss".to_string(), Value::String(css.to_string()));

    let script = CPT_SCRIPT;
    let Some(block_start) = script.find("const config = {") else {
        return script.to_string();
    };
    let window_end = (block_start + 20000).min(script.len());

    let mut edits: Vec<(usize, usize, String)> = Vec::new();
    for (key, value) in &overrides {
        let serialized = match value {
            Value::Bool(b) => b.to_string(),
            Value::Number(n) => n.to_string(),
            Value::String(s) => format!("'{}'", s.replace('\\', "\\\\").replace('\'', "\\'")),
            _ => continue,
        };
        let needle = format!("\n  {}: ", key);
        if let Some(rel) = script[block_start..window_end].find(&needle) {
            let val_start = block_start + rel + needle.len();
            if let Some(comma_rel) = script[val_start..window_end].find(',') {
                let val_end = val_start + comma_rel;
                edits.push((val_start, val_end, serialized));
            }
        }
    }
    edits.sort_by_key(|e| e.0);
    let mut out = script.to_string();
    for (start, end, replacement) in edits.iter().rev() {
        out.replace_range(*start..*end, replacement);
    }
    log_line(&format!("cpt overrides applied: {}", edits.len()));
    out
}

// ---------- media download ----------

fn sanitize_token(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c => c,
        })
        .collect()
}

fn build_filename(
    media: &MediaSettings,
    account_id: &str,
    screen_name: &str,
    tweet_id: &str,
    serial: u32,
    date: &str,
    ext: &str,
) -> String {
    let mut parts: Vec<String> = Vec::new();
    for token in &media.pattern {
        let v = match token.as_str() {
            "account" => {
                if !account_id.is_empty() {
                    account_id.to_string()
                } else {
                    screen_name.to_string()
                }
            }
            "tweet" => tweet_id.to_string(),
            "serial" => format!("{:02}", serial),
            "date" => date.to_string(),
            _ => continue,
        };
        if !v.is_empty() {
            parts.push(sanitize_token(&v));
        }
    }
    if parts.is_empty() {
        parts.push(sanitize_token(tweet_id));
    }
    format!("{}.{}", parts.join("-"), ext)
}

#[tauri::command]
async fn download_media(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
    account_id: String,
    screen_name: String,
    tweet_id: String,
    serial: u32,
    date: String,
) -> Result<String, String> {
    let parsed = Url::parse(&url).map_err(|e| e.to_string())?;
    let host = parsed.host_str().unwrap_or("");
    if host != "pbs.twimg.com" && host != "video.twimg.com" {
        return Err(format!("blocked host: {}", host));
    }
    let ext = parsed
        .path_segments()
        .and_then(|mut s| s.next_back())
        .and_then(|name| name.rsplit('.').next())
        .filter(|e| !e.is_empty() && e.len() <= 5)
        .unwrap_or("jpg")
        .to_lowercase();

    let settings = state.0.lock().unwrap().clone();
    let filename = build_filename(
        &settings.media,
        &account_id,
        &screen_name,
        &tweet_id,
        serial,
        &date,
        &ext,
    );

    let downloads = app.path().download_dir().map_err(|e| e.to_string())?;
    let mut dir = downloads;
    if settings.media.subdir_enabled {
        let sub = sanitize_token(&settings.media.subdir_name);
        if !sub.is_empty() {
            dir = dir.join(sub);
        }
    }

    let target: PathBuf = if settings.media.ask_each {
        let _ = fs::create_dir_all(&dir);
        let picked = rfd::FileDialog::new()
            .set_directory(&dir)
            .set_file_name(&filename)
            .save_file();
        match picked {
            Some(p) => p,
            None => return Ok("cancelled".to_string()),
        }
    } else {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        dir.join(&filename)
    };

    let client = reqwest::Client::new();
    let resp = client
        .get(parsed.as_str())
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("http {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    fs::write(&target, &bytes).map_err(|e| e.to_string())?;
    log_line(&format!("downloaded {} -> {}", url, target.display()));
    Ok("saved".to_string())
}

// ---------- windows ----------

fn open_settings_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))
        .title("X for Windows 設定")
        .inner_size(600.0, 780.0)
        .build();
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let settings = load_settings(app.handle());
            let cpt = build_cpt_script(&settings);
            app.manage(AppState(Mutex::new(settings)));

            let settings_item = MenuItem::with_id(app, "settings", "設定を開く", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "終了", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings_item, &quit_item])?;
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("X for Windows")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "settings" => open_settings_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app.handle())?;

            let _win = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External("https://x.com".parse().unwrap()),
            )
            .title("X")
            .inner_size(1100.0, 800.0)
            .initialization_script(&cpt)
            .initialization_script(HARVEST_SCRIPT)
            .on_navigation(|url| {
                if is_allowed_host(url) {
                    true
                } else {
                    log_line(&format!("nav -> external browser: {}", url.as_str()));
                    open_external(url);
                    false
                }
            })
            .on_new_window(|url, _features| {
                log_line(&format!("new-window intercepted: {}", url.as_str()));
                open_external(&url);
                NewWindowResponse::Deny
            })
            .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            download_media,
            get_settings,
            save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
