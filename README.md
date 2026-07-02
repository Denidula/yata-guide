# YATA GUIDE

**わが家の避難計画、3秒で。**

YATA GUIDEは、住所を入力するだけで自宅周辺の災害リスク（浸水・液状化・木密地域など、行政公表データに基づく）を即座に可視化し、家族単位の避難計画づくりを支援するPWA（Progressive Web App）です。地図表示にはMapLibre GL JS、危険度データの配信にはPMTiles（HTTP Range requestによる軽量なベクトルタイル配信）を採用し、平時はどこからでも、災害時は電波が細くてもすぐに開ける軽さを目指しています。

> アプリ名の由来：YATA GUIDE＝八咫烏（ヤタガラス：神武天皇を導いたとされる導きの烏）＋ガイド。災害時に家族を安全へ導く、の意。

現在のこのリポジトリは、技術基盤（地図Hello World・PMTilesプロトコル動作確認・PWA最小構成）を確認するためのアプリスケルトンです。危険度データの本実装や避難計画UIは後続フェーズで追加します。

## 起動手順

```bash
# 依存パッケージのインストール
npm install

# 開発サーバー起動（http://localhost:5173）
npm run dev

# 本番ビルド
npm run build

# ビルド結果のローカル確認（http://localhost:4173）
npm run preview
```

## 技術スタック

- [Vite](https://vite.dev/)
- [React 18](https://react.dev/) + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com/)（`@tailwindcss/vite`）
- [Zustand](https://zustand.docs.pmnd.rs/)（状態管理）
- [MapLibre GL JS v4](https://maplibre.org/maplibre-gl-js/docs/)（地図表示）
- [PMTiles](https://docs.protomaps.com/pmtiles/)（ベクトル/ラスタタイルのHTTP Range配信、カスタムプロトコル登録済み）
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)（`registerType: 'autoUpdate'`、app shellのprecache）

背景地図タイルは国土地理院淡色地図タイル（`https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png`）を使用しています。

## データ出典について

危険度データ等の出典・ライセンス表記は、実装時にアプリ内（カード表示・フッター等）の表記に従います。本READMEでは個別データセットの出典は記載しません。

## Cloudflare Pages接続（TODO・後日）

Cloudflare Pagesへの接続・デプロイは本スケルトン作成時点では未実施です。後日、以下の手順で対応します。

- [ ] Cloudflareアカウントでのプロジェクト作成、このGitHubリポジトリとの連携
- [ ] ビルドコマンド（`npm run build`）・出力ディレクトリ（`dist`）の設定
- [ ] 本番デプロイ後、実際に公開URLで地図が表示されることの確認
- [ ] **PMTilesに必須のHTTP Range requestが本番環境でも効いているかの実測確認**
  - [ ] レスポンスヘッダーに `Accept-Ranges: bytes` が含まれるか
  - [ ] Rangeリクエスト時に `206 Partial Content` が返るか（`200`で全体を返してしまっていないか）
  - [ ] 実際のPMTilesファイル（ダミーではなく本番相当サイズ）で、タイル読み込み時に必要な範囲のみがダウンロードされているか（ブラウザのネットワークタブで転送量を確認）
- [ ] カスタムドメイン設定（必要な場合）
- [ ] PWAのオフライン機能・キャッシュ戦略の本実装（現状はapp shellのprecacheのみ）
