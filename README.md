# X for Windows

X（旧 Twitter）を Windows でアプリとして使うための軽量クライアントです。Tauri v2 + WebView2 で作られています。
作者： **mushroom1729-xperia** / AI（Muse）との共同開発

## 機能

- **X を専用ウィンドウで表示** — x.com を小さなネイティブシェルで包んだもの。ブラウザエンジンは Windows 標準の WebView2 を使うので軽量です。
- **Control Panel for Twitter を内蔵** — [Control Panel for Twitter](https://github.com/insin/control-panel-for-twitter)（作者 insin）のユーザースクリプトをページ読み込み時に注入します。時系列タイムライン、「おすすめ」を隠す、閲覧数を隠す、Grok を隠す、Premium の勧誘を隠すなど。
  - ユーザースクリプト版には設定 UI がないため、このアプリでは**タスクトレイのアイコン →「設定を開く」**から専用の設定画面で変更できます（反映にはアプリの再起動が必要）。
  - 認証バッジを往年の鳥マークに置き換える機能は、名前の横で少し重なって見えたため、少し小さく表示する修正を入れています。
- **プロモーション投稿を非表示** — 「プロモーション / Promoted / 広告」と表示される投稿をタイムラインから自動で取り除きます。
- **メディアをワンクリック保存** — [Media Harvest](https://github.com/EltonChou/TwitterMediaHarvest)（作者 Elton Chou）に着想を得た保存ボタンを、メディア付きの投稿に追加します。動画は最高画質、画像は原寸で保存します。
  - 保存先やファイル名のパターンは設定画面で変更できます（Media Harvest の設定画面と同じ項目を用意）。
  - 既定： 保存先は「ダウンロード\twitter_media_harvest」、ファイル名は「アカウントID-ツイートID-連番-ダウンロード日付」（例： `306048589-1145141919810-02-20261120.jpg`）
- **外部リンクは既定のブラウザで開く**。X 本体とログインの流れはアプリ内に残ります。

## ダウンロード

[Releases](https://github.com/mushroom1729-xperia/x-windows-app/releases) に、ポータブル版（インストール不要）と NSIS インストーラーがあります。𝕏 版（`X-portable-…` / `X_…-setup`）と Twitter 版（`Twitter-portable-…` / `Twitter_…-setup`）の2種類があり、中身は同じでアイコンとアプリ名だけが違います。

## 注意

- ログインはアプリ内で X の ID / パスワードを使ってください（Google ログインなどのポップアップはブラウザ側で開きます）。
- ログイン状態はアプリ専用の WebView2 プロファイルに保存され、普段のブラウザとは分離されています。

## ライセンス / クレジット

- このラッパー自体のコード： MIT
- Control Panel for Twitter： MIT、© insin — `src-tauri/assets/cpt.user.js` として同梱
- X の名称とロゴは X Corp. のものです。これは非公式の個人プロジェクトです。
