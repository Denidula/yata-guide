import { usePlanStore } from './store/usePlanStore'
import { Header } from './components/Header'
import { Home } from './components/Home'
import { RiskCard } from './components/RiskCard'
import { MapView } from './components/MapView'
import { TabBar } from './components/TabBar'
import { LoadingScreen, ErrorScreen } from './components/StatusScreens'

/**
 * 画面ルーティング。
 * - 判定中(locating)/エラー(error)は最優先で専用画面。
 * - それ以外は下部タブの view（home/card/map）で切替。
 *   card/map は risk 確定時のみ到達（storeがviewを管理）。
 * - risk 確定後は下部タブバーを表示し、カード⇄地図⇄ホームを行き来できる。
 */
function App() {
  const uiStatus = usePlanStore((s) => s.uiStatus)
  const view = usePlanStore((s) => s.view)
  const risk = usePlanStore((s) => s.risk)

  const isLocating = uiStatus.kind === 'locating'
  const isError = uiStatus.kind === 'error'
  const hasResult = risk != null
  // タブバーは結果確定後（判定中・エラー・ホーム以外）に表示
  const showTabBar = hasResult && !isLocating && !isError

  return (
    <div className={`stage${showTabBar ? ' has-tabbar' : ''}`}>
      <Header />

      {isLocating && <LoadingScreen />}
      {isError && <ErrorScreen code={uiStatus.code} />}

      {!isLocating && !isError && (
        <>
          {view === 'card' && risk && <RiskCard risk={risk} />}
          {view === 'map' && risk && <MapView />}
          {(view === 'home' || !risk) && <Home />}
        </>
      )}

      {showTabBar && <TabBar />}
    </div>
  )
}

export default App
