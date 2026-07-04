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
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'YATA GUIDE',
        short_name: 'YATA',
        description: 'わが家の避難計画、3秒で。',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'ja',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
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
      },
    }),
  ],
})
