/**
 * 計画カード用の「わが家と避難場所」静止画を端末内で描く。
 *
 * なぜ必要か：災害時に通信が切れた状態でヤタガラスを開くと、避難先が文字だけになる。
 * 「荒川南岸・河川敷緑地一帯」と書かれていても、そこがどっちなのか分からない。
 * 紙に印刷する用途も含め、位置関係が一目で分かる絵が要る。
 *
 * なぜ外部の静止画APIを使わないか：自宅座標を外部へ送ることになり、
 * 「位置情報を端末外に送信しない」という本アプリの前提が崩れる。
 * ここでは画面外に一時的なMapLibreを立て、地理院タイル（オフラインパックで
 * キャッシュ済み）だけで描いてPNGに書き出す＝通信も送信もなしで完結する。
 *
 * なぜ直線を引かないか：荒川6丁目→荒川南岸のように、直線が河川や線路を横切る
 * 組み合わせが実際にある。防災アプリで「そこを通れる」と読める線を引く害の方が大きい。
 * 向き（方角）と距離は文字で添え、道順は地図上の道と目印から読んでもらう。
 */
import maplibregl from 'maplibre-gl'

export type Pt = { lng: number; lat: number }

/** オフスクリーン地図の描画サイズ（CSS px）。4:3。 */
const W = 640
const H = 480
/**
 * 書き出しサイズ（px）。端末のdevicePixelRatioに関係なく常にこの寸法にする
 * （DPR3の端末で無駄に重い画像を作らないため）。カード幅約358pxに対して約2.7倍で、
 * 画面表示にも印刷にも足りる。
 */
const OUT_W = 960
const OUT_H = 720
/**
 * 2点が近いときに寄りすぎないための上限。z16＝約2.4m/px、書き出し幅960pxで
 * 横約2.3kmが入る。避難場所が200m先でも街区と周辺の道が一緒に見える。
 * これより寄せると「拡大されすぎて現在地がどこか分からない」絵になる。
 */
const MAX_ZOOM = 16
/** タイル読み込みの待ち上限。オフラインで欠けても待ち続けない。 */
const IDLE_TIMEOUT_MS = 6000

const HOME_RING = '#0017c1'
const DEST_FILL = '#0f7a4d'
const INK = '#1a1a1c'

/** 同じ組み合わせを再描画しないための簡易キャッシュ（タブ往復のたびに描くのを防ぐ）。 */
const cache = new Map<string, string>()
const keyOf = (home: Pt, dest: Pt) =>
  `${home.lng.toFixed(6)},${home.lat.toFixed(6)}|${dest.lng.toFixed(6)},${dest.lat.toFixed(6)}`

function waitIdle(map: maplibregl.Map): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      window.clearTimeout(t)
      resolve()
    }
    // オフラインでタイルが欠けると idle が来ないことがあるため、必ず時間で打ち切る。
    const t = window.setTimeout(finish, IDLE_TIMEOUT_MS)
    map.once('idle', finish)
  })
}

/**
 * 角丸の吹き出しラベル。マーカーの下に置くが、下端に近いときは上へ回す
 * （そのままだと画像の外へはみ出して読めなくなる）。
 */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  markerY: number,
  s: number,
  prefer: 'above' | 'below',
) {
  ctx.font = `700 ${13 * s}px "Yu Gothic UI","Yu Gothic","Hiragino Sans",sans-serif`
  const padX = 7 * s
  const w = ctx.measureText(text).width + padX * 2
  const h = 21 * s
  const gap = 15 * s
  const below = markerY + gap
  const above = markerY - gap - h
  // 希望側に置けないときだけ反対側へ回す（出典帯・キャンバス外で読めなくなるのを防ぐ）
  let top = prefer === 'below' ? below : above
  if (prefer === 'below' && below + h > ctx.canvas.height - 20 * s) top = above
  if (prefer === 'above' && above < 4 * s) top = below
  const x = Math.min(Math.max(cx - w / 2, 4 * s), ctx.canvas.width - w - 4 * s)
  const r = 5 * s
  ctx.beginPath()
  ctx.roundRect(x, top, w, h, r)
  ctx.fillStyle = 'rgba(255,255,255,0.94)'
  ctx.fill()
  ctx.lineWidth = 1 * s
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'
  ctx.stroke()
  ctx.fillStyle = INK
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + w / 2, top + h / 2 + 0.5 * s)
}

function drawMarkers(
  ctx: CanvasRenderingContext2D,
  home: { x: number; y: number },
  dest: { x: number; y: number },
  s: number,
) {
  // 避難場所＝塗りの丸（地図タブと同じ約束：塗り＝逃げる先）
  ctx.beginPath()
  ctx.arc(dest.x, dest.y, 11 * s, 0, Math.PI * 2)
  ctx.fillStyle = DEST_FILL
  ctx.fill()
  ctx.lineWidth = 3 * s
  ctx.strokeStyle = '#fff'
  ctx.stroke()

  // わが家＝白抜き＋青リング（地図タブ・凡例と同じ扱い）
  ctx.beginPath()
  ctx.arc(home.x, home.y, 11 * s, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.lineWidth = 4 * s
  ctx.strokeStyle = HOME_RING
  ctx.stroke()

  // 避難場所は上・わが家は下に固定して置く。2点が近いとき（ズーム上限に当たった場合）でも
  // ラベル同士が必ず離れるため、衝突判定を書かずに読める配置になる。
  drawLabel(ctx, '避難場所', dest.x, dest.y, s, 'above')
  drawLabel(ctx, 'わが家', home.x, home.y, s, 'below')
}

/** 方角の目安（fitBoundsは常に北上なので固定で描ける）。左上＝出典表記と対角に置く。 */
function drawNorth(ctx: CanvasRenderingContext2D, s: number) {
  const x = 22 * s
  const y = 22 * s
  ctx.beginPath()
  ctx.arc(x, y, 14 * s, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fill()
  ctx.lineWidth = 1 * s
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x, y - 8 * s)
  ctx.lineTo(x - 4.5 * s, y + 2 * s)
  ctx.lineTo(x + 4.5 * s, y + 2 * s)
  ctx.closePath()
  ctx.fillStyle = INK
  ctx.fill()
  ctx.font = `700 ${9 * s}px sans-serif`
  ctx.fillStyle = INK
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('N', x, y + 3 * s)
}

/** 出典表記。CC BY / 地理院コンテンツ利用規約の要件なので必ず焼き込む。 */
function drawAttribution(ctx: CanvasRenderingContext2D, s: number) {
  const text = '背景地図：国土地理院'
  ctx.font = `${10 * s}px "Yu Gothic UI","Yu Gothic","Hiragino Sans",sans-serif`
  const w = ctx.measureText(text).width + 10 * s
  const h = 16 * s
  const x = ctx.canvas.width - w
  const y = ctx.canvas.height - h
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = '#414143'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, ctx.canvas.width - 5 * s, y + h / 2)
}

/**
 * 自宅と避難場所が収まる地図をPNGのdata URLで返す。
 * 失敗（WebGL不可・canvas書き出し不可等）は null を返し、呼び出し側は何も出さない。
 */
export async function renderPlanMapImage(home: Pt, dest: Pt): Promise<string | null> {
  const k = keyOf(home, dest)
  const hit = cache.get(k)
  if (hit) return hit

  let container: HTMLDivElement | null = null
  let map: maplibregl.Map | null = null
  try {
    container = document.createElement('div')
    // display:none だとMapLibreがサイズを取れないため、画面外に実寸で置く。
    container.style.cssText = `position:fixed;left:-99999px;top:0;width:${W}px;height:${H}px;pointer-events:none;`
    container.setAttribute('aria-hidden', 'true')
    document.body.appendChild(container)

    map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {
          gsi_pale: {
            type: 'raster',
            // 操作用の地図と同じURL＝オフラインパックのキャッシュがそのまま効く
            tiles: ['https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 18,
          },
        },
        layers: [{ id: 'gsi_pale_layer', type: 'raster', source: 'gsi_pale' }],
      },
      interactive: false,
      attributionControl: false,
      // canvasを書き出すために必須（操作用の地図には付けず、こちらだけで有効化する）
      preserveDrawingBuffer: true,
      fadeDuration: 0,
    })
    map.on('error', (e) => console.debug('[ヤタガラス] plan map image:', e.error?.message ?? e))

    const b = new maplibregl.LngLatBounds()
    b.extend([home.lng, home.lat])
    b.extend([dest.lng, dest.lat])
    map.fitBounds(b, { padding: 56, maxZoom: MAX_ZOOM, animate: false })

    await waitIdle(map)

    const gl = map.getCanvas()
    const out = document.createElement('canvas')
    out.width = OUT_W
    out.height = OUT_H
    const ctx = out.getContext('2d')
    if (!ctx) return null
    // DPRに依存せず固定寸法へ縮小する（DPR3端末で無駄に重い画像を作らない）
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(gl, 0, 0, gl.width, gl.height, 0, 0, OUT_W, OUT_H)

    // project()はCSS px基準なので、書き出し寸法へのスケールを掛ける
    const s = OUT_W / W
    const hp = map.project([home.lng, home.lat])
    const dp = map.project([dest.lng, dest.lat])
    // 方位と出典を先に描き、マーカーとラベルを最後に重ねる
    //（重なったときに読めなくなって困るのはマーカー側なので、そちらを上にする）
    drawNorth(ctx, s)
    drawAttribution(ctx, s)
    drawMarkers(ctx, { x: hp.x * s, y: hp.y * s }, { x: dp.x * s, y: dp.y * s }, s)

    // 淡色地図の線画なのでJPEGでも破綻せず、PNGの1/5〜1/10に収まる。
    // 生成物は端末内に留まり通信しないが、軽い方がメモリと描画に効く。
    const url = out.toDataURL('image/jpeg', 0.85)
    cache.set(k, url)
    return url
  } catch (e) {
    console.debug('[ヤタガラス] plan map image failed:', e)
    return null
  } finally {
    map?.remove()
    container?.remove()
  }
}
