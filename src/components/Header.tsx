import { useState, useRef, useEffect } from 'react'
import logoMini from '../assets/logo-mini-header.png'
import { Icon } from './Icon'

/**
 * 全画面共通ヘッダー（R1）。八咫烏ロゴ＋タイトル＋多言語切替ボタン。
 * 多言語UIはPhase2でi18next実装予定。それまでは押下で「準備中」ポップオーバーを出し、
 * 無反応で壊れて見えないようにする（機能はまだ無いが導線の存在は示す）。
 * 白地・下罫線・sticky。
 */
export function Header() {
  const [soon, setSoon] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!soon) return
    const onOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setSoon(false)
    }
    const timer = window.setTimeout(() => setSoon(false), 3200)
    document.addEventListener('pointerdown', onOutside)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', onOutside)
    }
  }, [soon])

  return (
    <header className="appbar">
      <img className="logo" src={logoMini} alt="" aria-hidden="true" />
      <div className="title">
        <div className="name">ヤタガラス</div>
        <small>わが家の避難計画 東京都版（デモ）</small>
      </div>
      <div className="lang-wrap" ref={wrapRef}>
        {/* ポップオーバーはrole=statusの案内であってdialogではないため、aria-haspopupは付けない
            （実装と宣言の不一致を避ける。開閉状態はaria-expandedで伝える。レビューL-6） */}
        <button
          className="lang-btn"
          aria-expanded={soon}
          aria-label="言語を切り替え（準備中）"
          title="言語切替（準備中）"
          onClick={() => setSoon((v) => !v)}
        >
          <Icon name="globe-language" size={16} />
          Language
          <span className="caret" aria-hidden="true">
            ▾
          </span>
        </button>
        {soon && (
          <div className="lang-soon" role="status">
            多言語対応（やさしい日本語・英・中・韓）は<b>準備中</b>です。
            <span className="sub">いまは日本語で表示しています。</span>
          </div>
        )}
      </div>
    </header>
  )
}
