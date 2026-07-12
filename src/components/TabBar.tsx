import { usePlanStore } from '../store/usePlanStore'
import { STRINGS } from '../lib/constants'
import { Icon } from './Icon'

/**
 * 画面下部の4タブ（ホーム／危険度カード／計画／地図）。
 * カード・計画・地図はrisk確定時のみ有効（未確定時はdisabledでホームへ誘導）。
 * SVGラインアイコン＋現在タブは上バー強調（inset box-shadow）。タップターゲット58px。
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
        <Icon name="home" size={20} />
        {STRINGS.tabs.home}
      </button>
      <button
        aria-current={view === 'card'}
        disabled={!hasResult}
        onClick={() => hasResult && setView('card')}
      >
        <Icon name="gauge" size={20} />
        {STRINGS.tabs.card}
      </button>
      <button
        aria-current={view === 'plan'}
        disabled={!hasResult}
        onClick={() => hasResult && setView('plan')}
      >
        <Icon name="clipboard-plan" size={20} />
        {STRINGS.tabs.plan}
      </button>
      <button
        aria-current={view === 'map'}
        disabled={!hasResult}
        onClick={() => hasResult && setView('map')}
      >
        <Icon name="map" size={20} />
        {STRINGS.tabs.map}
      </button>
    </nav>
  )
}
