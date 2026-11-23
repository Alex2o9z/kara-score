import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold tracking-tight mb-4">KaraScore</h1>
      <p className="text-slate-400 mb-6">YouTube Karaoke Pitch Scoring (MVP v1)</p>
      <button
        type="button"
        onClick={() => setCount((c) => c + 1)}
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-md font-medium transition-colors"
      >
        Count: {count}
      </button>
    </div>
  )
}

export default App
