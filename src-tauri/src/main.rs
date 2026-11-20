// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::Write;
use tauri::webview::{NewWindowResponse, WebviewWindowBuilder};
use tauri::{AppHandle, Manager, Url, WebviewUrl};

const LOG_PATH: &str = "C:\\Users\\mushroom\\muse-work\\x-app-log.txt";
const CPT_SCRIPT: &str = include_str!("../assets/cpt.user.js");
const HARVEST_SCRIPT: &str = include_str!("../assets/harvest.js");

fn log_line(msg: &str) {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(LOG_PATH)
    {
        let _ = writeln!(f, "[{ts}] {msg}");
    }
}

// Hosts that stay inside the app: X itself and the social sign-in flow.
fn is_internal(url: &Url) -> bool {
    if url.scheme() != "http" && url.scheme() != "https" {
        return true; // about:, data:, etc.
    }
    let host = match url.host_str() {
        Some(h) => h.to_ascii_lowercase(),
        None => return true,
    };
    const DOMAINS: [&str; 4] = [
        "x.com",
        "twitter.com",
        "accounts.google.com",
        "appleid.apple.com",
    ];
    DOMAINS
        .iter()
        .any(|d| host == *d || host.ends_with(&format!(".{d}")))
}

// Open a URL in the default browser via the Windows file-protocol handler.
fn open_external(url: &Url) {
    let u = url.as_str();
    match std::process::Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", u])
        .spawn()
    {
        Ok(_) => log_line(&format!("open ok: {u}")),
        Err(e) => log_line(&format!("open FAILED: {u} err={e}")),
    }
}

fn sanitize(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect()
}

/// Save one media file (image or video) from X's CDN to
/// Downloads/twitter_media_harvest/, named
/// {accountId}-{tweetId}-{serial:02}-{downloadDate}.{ext}
/// (the filename pattern from Media Harvest's settings).
#[tauri::command]
async fn download_media(
    app: AppHandle,
    url: String,
    account_id: String,
    screen_name: String,
    tweet_id: String,
    serial: u32,
    date: String,
    ext: String,
) -> Result<String, String> {
    let parsed = Url::parse(&url).map_err(|e| format!("bad url: {e}"))?;
    let host = parsed.host_str().unwrap_or("");
    if host != "pbs.twimg.com" && host != "video.twimg.com" {
        return Err(format!("host not allowed: {host}"));
    }
    let account = {
        let a = sanitize(&account_id);
        if a.is_empty() {
            sanitize(&screen_name)
        } else {
            a
        }
    };
    let filename = format!(
        "{}-{}-{:02}-{}.{}",
        account,
        sanitize(&tweet_id),
        serial,
        sanitize(&date),
        sanitize(&ext)
    );
    let downloads = app.path().download_dir().map_err(|e| e.to_string())?;
    let dir = downloads.join("twitter_media_harvest");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&filename);
    let resp = reqwest::get(parsed.as_str())
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("http {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    log_line(&format!("downloaded {filename} ({} bytes)", bytes.len()));
    Ok(filename)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![download_media])
        .setup(|app| {
            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External("https://x.com".parse().unwrap()),
            )
            .title("X")
            .inner_size(1100.0, 760.0)
            .min_inner_size(720.0, 480.0)
            .center()
            .initialization_script(CPT_SCRIPT)
            .initialization_script(HARVEST_SCRIPT)
            .on_navigation(|url| {
                if is_internal(url) {
                    true
                } else {
                    log_line(&format!("navigation intercepted: {}", url.as_str()));
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
        .run(tauri::generate_context!())
        .expect("error while running X");
}
