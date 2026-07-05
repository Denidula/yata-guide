import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'YATA GUIDE',
        short_name: 'YATA',
        description: 'わが家の避難計画、3秒で。',
        theme_color: '#0B2545',
        background_color: '#0B2545',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'ja',
        icons: [
          // any 用（角丸込みのアプリアイコン）。SVGは可変解像度のフォールバックとして残す。
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // maskable 用（安全領域込み）。Android のアダプティブアイコンで余白が切れないよう分離。
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // デプロイ直後に新バンドルを即時有効化する（旧SW/旧キャッシュが検証を妨げないように）。
        // waiting 状態を飛ばして即 activate し、既存クライアントを新SWの制御下へ引き取る。
        skipWaiting: true,
        clientsClaim: true,
        // 旧プリキャッシュ（前デプロイのアセット）を掃除し、古いJS/CSSの取り違えを防ぐ。
        cleanupOutdatedCaches: true,
        // precache 対象は app shell（JS/CSS/HTML/アイコン/フォント）のみ。
        // /data/* は約6.4MBあり precache には重いのでランタイムキャッシュに回す（下記 runtimeCaching）。
        globIgnores: ['**/data/**', '**/tiles/**', '**/test-range.pmtiles'],
        // precache 既定上限（約2MiB）を少し上げる（大きめのJSバンドル/フォントを取りこぼさない）。
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          // 1) 判定に不可欠な同一オリジンのデータ（/data/*.json|geojson, 計約6.4MB）。
          //    初回取得後はオフラインでも判定・カード・避難先が動くよう CacheFirst。
          //    個人情報は含まれない静的な公表データなので端末キャッシュに置いて問題ない。
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/data/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'yata-data',
              expiration: {
                maxEntries: 24,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30日で更新（データ改訂に追従）
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
              matchOptions: { ignoreVary: true },
            },
          },
          // 2) 地理院タイル（ベース地図・ラスタPNG）。オフラインでも既訪範囲のベース地図が出るよう CacheFirst。
          //    ラスタタイルは 200 応答（Range ではない）なので workbox の通常キャッシュと相性がよい。
          {
            urlPattern: ({ url }) => url.hostname === 'cyberjapandata.gsi.go.jp',
            handler: 'CacheFirst',
            options: {
              cacheName: 'gsi-raster-tiles',
              expiration: {
                maxEntries: 300, // 都内を数ズームぶん回遊できる目安
                maxAgeSeconds: 60 * 60 * 24 * 14, // 2週間
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // 3) Geolonia CDN（住所正規化の辞書データ）。オフライン時も既存キャッシュで正規化が効くよう SWR。
          //    （オンライン時は裏で更新、オフライン時はキャッシュ即返し。）
          {
            urlPattern: ({ url }) =>
              url.hostname.endsWith('geolonia.com') || url.hostname.endsWith('geolonia.github.io'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'geolonia-normalize',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // 4) R2 の PMTiles（pub-*.r2.dev）は Range/206 で配信される。
          //    workbox の通常キャッシュ（CacheFirst 等）は 206 partial を正しく扱えず、
          //    rangeRequests プラグインを使っても「一度フルボディを取得」前提のため
          //    大容量PMTiles（6〜70MB）を細切れ取得する本用途には不向き（複雑化のわりに実利が薄い）。
          //    → R2 は NetworkOnly とし「ハザードタイルはオンライン時のみ」と割り切る。
          //    判定・カード・避難先・地理院ベース地図はオフラインで動くため、これで要件を満たす。
          {
            urlPattern: ({ url }) => url.hostname.endsWith('.r2.dev'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
})
