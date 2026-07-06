/**
 * gen-icons.mjs — 八咫烏ロゴから PWA用アイコン一式を生成する（R1）。
 *
 * デザイン: デジタル庁ブルー #0017C1 の角丸タイルに、白い八咫烏シルエットを中央配置。
 * 元素材 src/assets/logo-mini.png（黒シルエット・白背景, 1254px）を
 *   1) しきい値で二値化→アルファ化（白背景を透過, 黒烏を残す）
 *   2) 白へ着色
 *   3) ブランド地の角丸タイルへ中央合成（maskable安全領域80%を確保）
 * して各サイズを書き出す。
 *
 * 生成物（すべて public/ 直下）:
 *   - pwa-192.png / pwa-512.png            （manifest icons / purpose any）
 *   - pwa-maskable-512.png                 （purpose maskable。安全領域込み）
 *   - apple-touch-icon.png (180)           （iOS ホーム画面用）
 *   - favicon.svg / pwa-icon.svg           （SVGフォールバックは別途手書き）
 *
 * 使い方: `node scripts/gen-icons.mjs`（sharp が必要）。
 */
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const publicDir = resolve(root, 'public')
const logoSrc = resolve(root, 'src/assets/logo-mini.png')

const BRAND = { r: 0, g: 0x17, b: 0xc1 } // #0017C1

/**
 * 黒烏/白背景のロゴを「白いシルエット（透過背景）」のPNGバッファにする。
 * raw画素を直接走査し、暗い画素（=烏）ほどアルファ大の白RGBAを組む。
 */
async function whiteSilhouette(px) {
  // 元PNGの最外周に薄い枠線が焼き込まれているため、内側3%をクロップして除去する。
  const meta = await sharp(logoSrc).metadata()
  const cut = Math.round(Math.min(meta.width, meta.height) * 0.03)
  const { data, info } = await sharp(logoSrc)
    .extract({
      left: cut,
      top: cut,
      width: meta.width - cut * 2,
      height: meta.height - cut * 2,
    })
    .resize(px, px, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const w = info.width
  const h = info.height
  const rgba = Buffer.alloc(w * h * 4)
  // 明るい側のしきい値。これより明るい画素（白背景＋元PNGの薄い枠線）は完全透明にする。
  const HI = 205
  // 暗い側のしきい値。これより暗い画素は完全不透明にする（烏本体）。
  const LO = 90
  for (let i = 0; i < w * h; i++) {
    const lum = data[i * info.channels] // greyscale: 1ch（安全のためchannels掛け）
    let alpha
    if (lum >= HI) alpha = 0
    else if (lum <= LO) alpha = 255
    else alpha = Math.round(((HI - lum) / (HI - LO)) * 255) // 縁のアンチエイリアスを線形補間
    rgba[i * 4] = 255
    rgba[i * 4 + 1] = 255
    rgba[i * 4 + 2] = 255
    rgba[i * 4 + 3] = alpha
  }
  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
}

/**
 * サイズ size の角丸ブランドタイルに、白烏シルエットを中央合成して書き出す。
 * inset: 烏を配置する領域の割合（maskableは安全領域を狭めるため小さめ）。
 */
async function renderTile(size, filename, { inset = 0.62, radius = 0.22 } = {}) {
  const rad = Math.round(size * radius)
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${rad}" ry="${rad}" fill="rgb(${BRAND.r},${BRAND.g},${BRAND.b})"/></svg>`,
  )
  const inner = Math.round(size * inset)
  const crow = await whiteSilhouette(inner)
  const off = Math.round((size - inner) / 2)
  const out = resolve(publicDir, filename)
  await sharp(bg)
    .composite([{ input: crow, top: off, left: off }])
    .png()
    .toFile(out)
  console.log(`✓ ${filename} (${size}x${size})`)
}

// any 用（角丸込み・烏やや大きめ）
await renderTile(192, 'pwa-192.png', { inset: 0.66 })
await renderTile(512, 'pwa-512.png', { inset: 0.66 })
// maskable 用（安全領域80% → 烏は中央約56%に収める）
await renderTile(512, 'pwa-maskable-512.png', { inset: 0.56 })
// iOS（角丸はOS側が付けるが、地色で塗りつぶし。烏やや大きめ）
await renderTile(180, 'apple-touch-icon.png', { inset: 0.66 })
console.log('done.')
