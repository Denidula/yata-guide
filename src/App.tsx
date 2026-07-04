import { usePlanStore } from './store/usePlanStore'
import { Header } from './components/Header'
import { Home } from './components/Home'
import { RiskCard } from './components/RiskCard'
import { LoadingScreen, ErrorScreen } from './components/StatusScreens'

/**
 * 画面ルーティング。uiStatus に応じてホーム／判定中／危険度カード／エラーを切り替える。
 * （W2で地図・計画・共有画面を追加予定。既存 MapView はW2の地図統合で復帰させる。）
 */
function App() {
  const uiStatus = usePlanStore((s) => s.uiStatus)
  const risk = usePlanStore((s) => s.risk)

  return (
    <div className="stage">
      <Header />
      {uiStatus.kind === 'locating' && <LoadingScreen />}
      {uiStatus.kind === 'error' && <ErrorScreen code={uiStatus.code} />}
      {uiStatus.kind === 'ready' && risk && <RiskCard risk={risk} />}
      {(uiStatus.kind === 'idle' ||
        // ready だが risk 未取得のフォールバック
        (uiStatus.kind === 'ready' && !risk)) && <Home />}
    </div>
  )
}

export default App
