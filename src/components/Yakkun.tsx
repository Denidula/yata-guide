import { useEffect, useRef, useState } from 'react'
import { usePlanStore } from '../store/usePlanStore'
import { STRINGS } from '../lib/constants'
import closedImg from '../assets/yakkun/closed.png'
import openImg from '../assets/yakkun/open.png'
import blinkImg from '../assets/yakkun/blink.png'

/**
 * マスコット「やっくん」。画面右下（タブバーの上）に常駐し、
 * タップすると現在のページのかんたん説明を吹き出しで話す（R2レビューの遊び心枠）。
 *
 * アニメーションは素材README（yakkun-assets/README.md）の実装値に準拠:
 *  - まばたき: blink.png を目の位置（closedに対して left33.85%/top8.83%/w16.61%/h18.05%）に
 *    重ね、4.4秒周期で約0.2秒だけ表示（CSSアニメーション）
 *  - 口パク: 吹き出しを開いたとき closed/open を0.6秒交互×2.4秒（=2回パクパク）。
 *    open表示中は closed＋blink を非表示（くちばしの線が透けるため）
 *  - prefers-reduced-motion では両方とも動かさない
 */
export function Yakkun() {
  const view = usePlanStore((s) => s.view)
  const risk = usePlanStore((s) => s.risk)
  // risk未確定時のcatch-all表示はHome（App.tsxの分岐と同じ扱い）
  const effectiveView = risk ? view : 'home'

  const [open, setOpen] = useState(false)
  const [mouthOpen, setMouthOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useRef(
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  ).current

  // ページが変わったら吹き出しは閉じる（古い説明が残らない）
  useEffect(() => {
    setOpen(false)
  }, [effectiveView])

  // 吹き出しを開いたら口パク（0.6s×4ステップ=2.4sで2回）→自動で口を閉じる
  useEffect(() => {
    if (!open || reduceMotion) return
    setMouthOpen(true)
    let step = 0
    const id = window.setInterval(() => {
      step++
      if (step >= 4) {
        window.clearInterval(id)
        setMouthOpen(false)
        return
      }
      setMouthOpen(step % 2 === 0)
    }, 600)
    return () => {
      window.clearInterval(id)
      setMouthOpen(false)
    }
  }, [open, reduceMotion])

  // 外側タップと10秒経過で閉じる（Headerのポップオーバーと同じ作法）
  useEffect(() => {
    if (!open) return
    const onOutside = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const timer = window.setTimeout(() => setOpen(false), 10_000)
    document.addEventListener('pointerdown', onOutside)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', onOutside)
    }
  }, [open])

  return (
    <div className="yakkun-anchor" aria-hidden={false}>
      <div className="yakkun-wrap" ref={wrapRef}>
        {open && (
          <div className="yk-bubble" role="status">
            {/* 名前の見出しは出さない。吹き出しの主役は説明文で、
                誰が喋っているかは隣のマスコット自身が示している。 */}
            {STRINGS.yakkun.byView[effectiveView]}
          </div>
        )}
        <button
          className="yakkun"
          aria-label={STRINGS.yakkun.ariaLabel}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <img src={closedImg} alt="" draggable={false} className={mouthOpen ? 'yk-hide' : ''} />
          <img src={openImg} alt="" draggable={false} className={mouthOpen ? '' : 'yk-hide'} />
          <img
            src={blinkImg}
            alt=""
            draggable={false}
            className={`yk-blink${mouthOpen || reduceMotion ? ' yk-hide' : ''}`}
          />
        </button>
      </div>
    </div>
  )
}
