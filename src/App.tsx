import { useEffect, useState } from 'react'
import { usePlanStore } from './store/usePlanStore'
import { useOnlineStatus } from './lib/useOnlineStatus'
import { STRINGS } from './lib/constants'
import { clearSharedHash, decodeSharedPlanFromHash, type SharedPlanPayload } from './lib/share'
import { Header } from './components/Header'
import { SharedPlanView } from './components/SharedPlanView'
import { Yakkun } from './components/Yakkun'
import { Home } from './components/Home'
import { RiskCard } from './components/RiskCard'
import { PlanScreen } from './components/PlanScreen'
import { MapView } from './components/MapView'
import { TabBar } from './components/TabBar'
import { LoadingScreen, ErrorScreen } from './components/StatusScreens'
import { Icon } from './components/Icon'

/**
 * 画面ルーティング。
 * - 判定中(locating)/エラー(error)は最優先で専用画面。
 * - それ以外は下部タブの view（home/card/plan/map）で切替。
 *   card/plan/map は risk 確定時のみ到達（storeがviewを管理）。
 * - risk 確定後は下部タブバーを表示し、カード⇄地図⇄ホームを行き来できる。
 * - オフライン時はヘッダー直下に控えめなバナーを常設表示。
 */
function App() {
  const uiStatus = usePlanStore((s) => s.uiStatus)
  const view = usePlanStore((s) => s.view)
  const risk = usePlanStore((s) => s.risk)
  const online = useOnlineStatus()

  // 共有URL（#p=...）で開かれた場合は受信閲覧モード（W2）。
  const [shared, setShared] = useState<SharedPlanPayload | 'invalid' | null>(() =>
    decodeSharedPlanFromHash(window.location.hash),
  )
  const closeShared = () => {
    clearSharedHash()
    setShared(null)
  }
  // アプリを開いているタブで共有リンクを踏むとリロードせずハッシュだけ変わるため、
  // hashchangeでも解釈する（レビューM-10）。
  useEffect(() => {
    const onHashChange = () => {
      const p = decodeSharedPlanFromHash(window.location.hash)
      if (p) setShared(p)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // 画面切替（タブ・共有ビュー）で必ず先頭から表示する。
  // 全ビューが同じスクローラー（body）を共有しているため、リセットしないと
  // 「計画カードを下まで読む→地図タブ→途中位置から表示」になる（R2レビュー指摘）。
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view, shared])

  const isLocating = uiStatus.kind === 'locating'
  const isError = uiStatus.kind === 'error'
  const hasResult = risk != null
  // タブバーは結果確定後（判定中・エラー・ホーム以外）に表示
  const showTabBar = hasResult && !isLocating && !isError

  if (shared) {
    return (
      <div className="stage">
        <Header />
        <SharedPlanView payload={shared} onClose={closeShared} />
      </div>
    )
  }

  return (
    <div className={`stage${showTabBar ? ' has-tabbar' : ''}`}>
      <Header />

      {/* オフラインバナー（controlled by navigator.onLine）。控えめ・常設。 */}
      {!online && (
        <div className="offline-banner" role="status" aria-live="polite">
          <Icon name="offline" size={16} />
          <span>{STRINGS.offline.banner}</span>
        </div>
      )}

      {isLocating && <LoadingScreen />}
      {isError && <ErrorScreen code={uiStatus.code} />}

      {!isLocating && !isError && (
        <>
          {view === 'card' && risk && <RiskCard risk={risk} />}
          {view === 'plan' && risk && <PlanScreen />}
          {view === 'map' && risk && <MapView />}
          {(view === 'home' || !risk) && <Home />}
        </>
      )}

      {/* マスコット（判定中・エラー中は出さない。共有閲覧モードはこの分岐に来ない） */}
      {!isLocating && !isError && <Yakkun />}

      {showTabBar && <TabBar />}
    </div>
  )
}

export default App
