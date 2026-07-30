import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { STRINGS } from '../lib/constants'

/**
 * ページ先頭に戻るボタン。全画面共通（App直下に1つだけ置く）。
 *
 * どの画面も縦に長く、避難先リストや持ち出し品を見た後に上へ戻りたくなる。
 * タブを押し直せば戻れるが、それは「同じ画面をもう一度開く」操作で分かりにくい。
 *
 * 位置は左下。右下はやっくんが常駐しており、地図画面ではさらに
 * 現在地FABと拡大ボタンが乗るため、左下だけが空いている。
 * 高さはやっくんと揃える（タブバーの上）。
 */

/** これだけスクロールしたら出す。短いページで居座らせないため。 */
const SHOW_AFTER_PX = 320

export function ScrollTopButton() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const sync = () => setShow(window.scrollY > SHOW_AFTER_PX)
    sync() // 復元スクロール位置で開いた場合にも合わせる
    window.addEventListener('scroll', sync, { passive: true })
    return () => window.removeEventListener('scroll', sync)
  }, [])

  if (!show) return null

  return (
    <button
      className="scroll-top"
      aria-label={STRINGS.app.scrollTop}
      onClick={() => {
        const reduce =
          typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
      }}
    >
      <Icon name="chevron-up" size={22} />
    </button>
  )
}
