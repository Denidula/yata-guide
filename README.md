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

## Cloudflare Pages接続

Cloudflare Pagesへの接続・デプロイは完了しています。

- **本番URL**：https://yata-guide.pages.dev/
- **設定**：Framework preset = `None` / Build command = `npm run build` / Output directory = `dist` / 環境変数 `NODE_VERSION=22`
- カスタムドメイン設定・PWAのオフライン機能・キャッシュ戦略の本実装（現状はapp shellのprecacheのみ）は今後対応

### 重要な実測結果：Cloudflare PagesはHTTP Range requestを無視する

PMTilesの配信にはHTTP Range requestへの対応が必須ですが、Cloudflare Pages（本リポジトリのデプロイ先）は**Rangeリクエストを無視し、常に200 OKで全量を返す**ことを実測で確認しました。

- **検証方法**：1MBのバイナリ `public/test-range.pmtiles` をデプロイし、Range指定（`bytes=0-99` および中間レンジ）でGETリクエストを送信。curl（`-H`ヘッダー指定 / `-r`オプションの2方式）＋.NET `HttpWebRequest`の合計3クライアントで検証
- **結果**：キャッシュウォーム後も含め、全てのケースで**200 OK・全量1,048,576バイトを返却**（`206 Partial Content`にならない）。レスポンスヘッダーに`Accept-Ranges: bytes`は含まれるが、実際にはRangeリクエストに対応していない
- **帰結**：**PMTilesを本リポジトリのCloudflare Pagesから配信することはできません。** PMTiles配信はCloudflare R2（Range対応・無料枠10GB・egress無料）または、ハッカソン運営提供環境を使う分離構成にします（最終決定はPre-Meeting後）
- `public/test-range.pmtiles` は将来の再測定用に意図的に残置しています。削除しないでください。
