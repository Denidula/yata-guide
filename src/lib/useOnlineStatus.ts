import { useEffect, useState } from 'react'

/**
 * navigator.onLine を購読するフック。
 * online/offline イベントで再レンダリングし、現在の接続状態（true=オンライン）を返す。
 * 判定・地図の新規取得はオンライン必須なので、UI側でオフライン時の案内に使う。
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    // マウント時点の実値へ同期（初期レンダー後に状態が変わっている場合の保険）。
    setOnline(navigator.onLine)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
