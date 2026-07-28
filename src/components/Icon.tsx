/**
 * Icon — R1デザインのラインアイコンをインライン展開する小さなラッパ。
 *
 * uploads の clean名SVG（viewBox 0 0 24 24, fill/stroke=currentColor）を `?raw` で
 * 文字列取り込みし、`currentColor` で親の文字色を継承させる。imgではなくインラインSVGに
 * することで色制御（ランク色・ブルー・グレー）とサイズ指定をCSS/propsから一元化できる。
 *
 * 装飾アイコンは aria-hidden（元SVGに付与済み）。ラベルが必要な箇所は呼び出し側で
 * aria-label を要素に付ける。
 */
import home from '../assets/icons/home.svg?raw'
import map from '../assets/icons/map.svg?raw'
import gauge from '../assets/icons/gauge.svg?raw'
import fire from '../assets/icons/fire.svg?raw'
import houseCollapse from '../assets/icons/house-collapse.svg?raw'
import groundLayers from '../assets/icons/ground-layers.svg?raw'
import pinMap from '../assets/icons/pin-map.svg?raw'
import pinAddress from '../assets/icons/pin-address.svg?raw'
import locationCurrent from '../assets/icons/location-current.svg?raw'
import search from '../assets/icons/search.svg?raw'
import globeLanguage from '../assets/icons/globe-language.svg?raw'
import offline from '../assets/icons/offline.svg?raw'
import info from '../assets/icons/info.svg?raw'
import chevronRight from '../assets/icons/chevron-right.svg?raw'
import airplaneMode from '../assets/icons/airplane-mode.svg?raw'
import clipboardPlan from '../assets/icons/clipboard-plan.svg?raw'
import expand from '../assets/icons/expand.svg?raw'
import collapse from '../assets/icons/collapse.svg?raw'

export type IconName =
  | 'home'
  | 'map'
  | 'gauge'
  | 'fire'
  | 'house-collapse'
  | 'ground-layers'
  | 'pin-map'
  | 'pin-address'
  | 'location-current'
  | 'search'
  | 'globe-language'
  | 'offline'
  | 'info'
  | 'chevron-right'
  | 'airplane-mode'
  | 'clipboard-plan'
  | 'expand'
  | 'collapse'

const RAW: Record<IconName, string> = {
  home,
  map,
  gauge,
  fire,
  'house-collapse': houseCollapse,
  'ground-layers': groundLayers,
  'pin-map': pinMap,
  'pin-address': pinAddress,
  'location-current': locationCurrent,
  search,
  'globe-language': globeLanguage,
  offline,
  info,
  'chevron-right': chevronRight,
  'airplane-mode': airplaneMode,
  expand,
  collapse,
  'clipboard-plan': clipboardPlan,
}

/**
 * 元SVGの width/height 属性を差し込みサイズに置換し、常に currentColor 継承にする。
 * mask id が複数箇所で衝突しないよう、id/参照にインスタンス固有サフィックスを付ける。
 */
let uid = 0
function prepare(raw: string, size: number): string {
  let svg = raw
    .replace(/\swidth="\d+"/, ` width="${size}"`)
    .replace(/\sheight="\d+"/, ` height="${size}"`)
  // mask等の id 衝突回避（house-collapse / ground-layers / globe-language が mask を持つ）
  if (svg.includes('id="')) {
    const suffix = `_i${uid++}`
    svg = svg
      .replace(/id="([^"]+)"/g, `id="$1${suffix}"`)
      .replace(/url\(#([^)]+)\)/g, `url(#$1${suffix})`)
  }
  return svg
}

interface IconProps {
  name: IconName
  /** 一辺px（既定18）。 */
  size?: number
  /** 追加クラス（色は color/CSS変数で制御）。 */
  className?: string
}

export function Icon({ name, size = 18, className }: IconProps) {
  const html = prepare(RAW[name], size)
  return (
    <span
      className={`icon${className ? ` ${className}` : ''}`}
      // 元SVGは静的な同梱アセット（外部入力なし）。currentColor継承のためインライン展開する。
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
