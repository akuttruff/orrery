import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import WheelPage from './components/WheelPage.tsx'
import { registerAppShell } from './lib/appShell.ts'
import { wheelIdIn } from './lib/route.ts'
import './App.css'

// The page from the cache on later launches, so it paints before the network answers.
registerAppShell()

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root is missing from index.html')

// A wheel's own page (opened from a card in a new tab) is just the wheel, not the app round it.
const wheelId = wheelIdIn(window.location.hash)

createRoot(rootEl).render(
  <StrictMode>
    {wheelId ? <WheelPage id={wheelId} /> : <App />}
  </StrictMode>,
)
