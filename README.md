# ヤタガラス（YATAGARASU）

**わが家の避難計画、2秒で。**

ヤタガラスは、住所を入力するだけで自宅周辺の災害リスク（地域危険度・浸水・津波・高潮など、行政公表データに基づく）を即座に可視化し、家族単位の避難計画づくりを支援するPWA（Progressive Web App）です。地図表示にはMapLibre GL JS、危険度データの配信にはPMTiles（HTTP Range requestによる軽量なベクトルタイル配信）を採用し、平時はどこからでも、災害時は電波が細くてもすぐに開ける軽さを目指しています。

> アプリ名の由来：八咫烏（ヤタガラス）＝神武天皇を導いたとされる導きの烏。災害時に家族を安全へ導く、の意。（旧称: YATA GUIDE）

現在の実装: 危険度カード（Phase1）＋マイ避難計画カード・QR共有・災害モード＝オフライン対応（Phase2）。

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

## データ出典・ライセンス

`public/data/` 配下のGeoJSON・JSONは、東京都および国の機関が公開するオープンデータを**加工した派生物**です。このリポジトリはそれらを同梱して配布しているため、アプリ画面上の表記とは別に、ここにも出典を記載します。

### 加工内容の開示

以下の加工を行っています。**東京都または都内区市町村が作成した情報ではありません。**

- 座標系変換（平面直角座標系 → WGS84）
- GeoJSON／PMTiles／グリッド分割JSONへの形式変換
- 危険度スコアのランク別色分け、地図タイル化のための座標間引き・簡略化
- 住所からのジオコーディングによる座標の独自付与（緯度経度を持たない元データ）
- 地盤分類データを用いた液状化しやすさの簡易区分（独自の加工。東京都公式の「液状化予測図」ではありません）

### 出典一覧

| データ | 提供者 | ライセンス | 本リポジトリでの所在 |
|---|---|---|---|
| 地震に関する地域危険度測定調査 地域危険度一覧（第9回・令和4年9月公表） | 東京都都市整備局 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja) | `public/data/chomoku_lookup.json`, `chomoku_pip.geojson` ／ PMTilesは別途R2配信 |
| 東京都防災マップ 避難所・避難場所一覧データ | 東京都総務局 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja) | `public/data/evacuation_centers.geojson`, `evacuation_areas.geojson` |
| 東京消防庁 消火栓及び防火水槽等（公設消火栓情報） | 東京消防庁 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja) | `public/data/hydrants/*.json`（0.01°グリッド分割。公設上水道消火栓のみ収録、防火水槽は含まれません） |
| 東京都の災害拠点病院等（拠点病院・連携病院リスト） | 東京都保健医療局 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja) | `public/data/hospitals.geojson`（元データに緯度経度が無いため国土地理院APIでジオコーディング） |
| 浸水予想区域図（洪水・内水） | 東京都建設局 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja) | PMTilesとしてR2配信（本リポジトリには含まれません） |
| 津波浸水分布（令和4年度首都直下地震等による東京の被害想定結果） | 東京都総務局 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja) | 同上 |
| 高潮浸水想定区域図 | 東京都港湾局 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja) | 同上 |
| 背景地図タイル（淡色地図） | 国土地理院 | [国土地理院コンテンツ利用規約](https://maps.gsi.go.jp/development/ichiran.html) | 同梱せず実行時に取得 |

> **福祉避難所について**：福祉避難所は区市町村がそれぞれ指定・公表しており、一覧の再利用条件も区市ごとに異なります。本アプリは施設一覧を収録・再配布せず、判定した区市の公表ページへのリンクだけを持ちます（`public/data/fukushi_links.json`＝区市名とURLの対応表）。リンク先ページの内容は各区市に帰属します。

アプリ画面に表示している出典・免責の文面は `src/lib/constants.ts` の `STRINGS.map.attribution` および `STRINGS.disclaimer` にあります。

## ライセンス

**このリポジトリは閲覧目的で公開しています。** ソースコードの再利用・改変・再配布は許諾していません（著作権はすべて留保します）。

同梱している `public/data/` 配下のデータは上表のとおり各提供元のライセンス（主に CC BY 4.0）に従うため、この制限の対象外です。それぞれのライセンス条件に従ってご利用ください。

本アプリは行政公表データを加工した参考情報であり、災害に対する安全を保証するものではありません。避難行動の最終判断は、自治体・気象庁等の公式な指示を優先してください。

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
