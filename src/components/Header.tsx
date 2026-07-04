import { STRINGS } from '../lib/constants'

/**
 * 全画面共通ヘッダー。ロゴ＋タイトル＋多言語切替プレースホルダ（表示のみ、Phase2でi18next）。
 */
export function Header() {
  return (
    <header className="appbar">
      <div className="logo" aria-hidden="true">
        {STRINGS.app.logo}
      </div>
      <div className="title">
        {STRINGS.app.name}
        <small>{STRINGS.app.tagline}</small>
      </div>
      {/* 多言語切替UI（プレースホルダ。実装はPhase2 / i18next） */}
      <nav className="lang" aria-label="言語切替（実装予定）">
        <button aria-pressed="true" title="日本語">
          JA
        </button>
        <button aria-pressed="false" title="やさしい日本語">
          やさ
        </button>
        <button aria-pressed="false" title="English">
          EN
        </button>
        <button aria-pressed="false" title="中文">
          中
        </button>
        <button aria-pressed="false" title="한국어">
          한
        </button>
      </nav>
    </header>
  )
}
