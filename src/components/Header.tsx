import logoMini from '../assets/logo-mini-header.png'
import { Icon } from './Icon'

/**
 * 全画面共通ヘッダー（R1）。八咫烏ロゴ＋タイトル＋多言語切替ボタン（表示のみ、Phase2でi18next）。
 * 白地・下罫線・sticky。
 */
export function Header() {
  return (
    <header className="appbar">
      <img className="logo" src={logoMini} alt="" aria-hidden="true" />
      <div className="title">
        <div className="name">ヤタガラス</div>
        <small>わが家の避難計画 東京都版（デモ）</small>
      </div>
      {/* 多言語切替UI（プレースホルダ。実装はPhase2 / i18next） */}
      <button
        className="lang-btn"
        aria-haspopup="listbox"
        aria-label="言語を切り替え（実装予定）"
        title="言語切替（実装予定）"
      >
        <Icon name="globe-language" size={16} />
        Language
        <span className="caret" aria-hidden="true">
          ▾
        </span>
      </button>
    </header>
  )
}
