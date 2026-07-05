/**
 * gen-icons.mjs — public/pwa-icon.svg から PWA用PNGアイコンを生成する。
 *
 * 生成物（すべて public/ 直下）:
 *   - pwa-192.png         192x192  （manifest icons / purpose any）
 *   - pwa-512.png         512x512  （manifest icons / purpose any）
 *   - pwa-maskable-512.png 512x512 （manifest icons / purpose maskable。安全領域込みのSVGをそのまま使用）
 *   - apple-touch-icon.png 180x180 （iOS ホーム画面用。角丸・余白はiOS側が付けるため角丸SVGでも可）
 *
 * 使い方: `node scripts/gen-icons.mjs`（sharp が必要。暫定アイコンのため devDependency 非常設でもよい）。
 * 依存を常設したくない場合は `npm i -D sharp` 後に実行→アンインストールでも可。
 * R1で本デザインへ差し替える際もこのスクリプトを再実行するだけでよい。
 */
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(__dirname, '..', 'public')
const src = readFileSync(resolve(publicDir, 'pwa-icon.svg'))

// density=384 で 512pxに対して十分な解像度でラスタライズしてから縮小する（テキストのアンチエイリアス品質確保）。
async function render(size, filename) {
  const out = resolve(publicDir, filename)
  await sharp(src, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(out)
  console.log(`✓ ${filename} (${size}x${size})`)
}

await render(192, 'pwa-192.png')
await render(512, 'pwa-512.png')
await render(512, 'pwa-maskable-512.png')
await render(180, 'apple-touch-icon.png')
console.log('done.')
