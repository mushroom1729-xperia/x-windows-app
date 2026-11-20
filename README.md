# X for Windows

A lightweight X (Twitter) client for Windows, built with Tauri v2 + WebView2.
Created by **mushroom1729-xperia**, co-developed with AI (Muse).

## Features

- **X in its own window** — x.com wrapped in a small native shell (the browser engine is the system WebView2, shared with Windows).
- **Control Panel for Twitter built in** — the [Control Panel for Twitter](https://github.com/insin/control-panel-for-twitter) user script (by insin) is injected at document start: chronological timeline by default, hide "For you", hide view counts, hide Grok, hide Premium upsells, and dozens more options. Its settings UI is available inside the page as usual.
- **Promoted posts hidden** — tweets labelled プロモーション / Promoted / 広告 are removed from timelines automatically.
- **One-click media downloads** — a download button is added to every tweet with media (inspired by [Media Harvest](https://github.com/EltonChou/TwitterMediaHarvest) by Elton Chou). Videos are saved at the highest available bitrate, photos at original size.
  - Save folder: `Downloads/twitter_media_harvest/`
  - Filename pattern: `{accountId}-{tweetId}-{serial}-{downloadDate}` (e.g. `306048589-1145141919810-02-20261120.jpg`)
- **External links open in your default browser**; X and the sign-in flow stay in the app.

## Downloads

See [Releases](https://github.com/mushroom1729-xperia/x-windows-app/releases): a portable exe (no install) and an NSIS setup exe.

## Notes

- Sign in with your X username/password inside the app (social sign-in popups open in the browser instead).
- Login state is stored in the app's own WebView2 profile, separate from your browser.

## License / credits

- This wrapper's own code: MIT.
- Control Panel for Twitter: MIT, © insin — included as `src-tauri/assets/cpt.user.js`.
- The X name and logo belong to X Corp. This is an unofficial personal project.
