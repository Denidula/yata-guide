import { usePlanStore } from '../store/usePlanStore'
import { STRINGS } from '../lib/constants'

/**
 * 画面下部の3タブ（ホーム／危険度カード／地図）。
 * カード・地図はrisk確定時のみ有効（未確定時はdisabledでホームへ誘導）。
 * ワイヤーフレームのtabbar準拠。タップターゲット56px。
 */
export function TabBar() {
  const view = usePlanStore((s) => s.view)
  const setView = usePlanStore((s) => s.setView)
  const backToHome = usePlanStore((s) => s.backToHome)
  const hasResult = usePlanStore((s) => s.risk != null)

  return (
    <nav className="tabbar" aria-label="メインナビゲーション">
      <button
        aria-current={view === 'home'}
        onClick={() => {
          // ホームタブは結果をクリアして住所入力に戻る
          backToHome()
        }}
      >
        <span className="ic" aria-hidden="true">
          🏠
        </span>
        {STRINGS.tabs.home}
      </button>
      <button
        aria-current={view === 'card'}
        disabled={!hasResult}
        onClick={() => hasResult && setView('card')}
      >
        <span className="ic" aria-hidden="true">
          🏚️
        </span>
        {STRINGS.tabs.card}
      </button>
      <button
        aria-current={view === 'map'}
        disabled={!hasResult}
        onClick={() => hasResult && setView('map')}
      >
        <span className="ic" aria-hidden="true">
          🗺️
        </span>
        {STRINGS.tabs.map}
      </button>
    </nav>
  )
}
