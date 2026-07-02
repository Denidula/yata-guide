import { MapView } from './components/MapView'

function App() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <header className="z-10 flex items-baseline gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <h1 className="text-lg font-bold tracking-tight text-slate-900">YATA GUIDE</h1>
        <p className="text-sm text-slate-500">わが家の避難計画、3秒で。</p>
      </header>
      <main className="relative flex-1">
        <MapView />
      </main>
    </div>
  )
}

export default App
