import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import WheelPage from './components/WheelPage.tsx'
import { wheelIdIn } from './lib/route.ts'
import './App.css'

// The app shell from cache on later launches: see public/sw.js. Only on a
// built app over a secure origin (the tailnet's HTTPS, or localhost).
if ('serviceWorker' in navigator && window.isSecureContext && import.meta.env.PROD) {
  void navigator.serviceWorker.register('/sw.js')
}

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root is missing from index.html')

// A wheel's own page (opened from a card in a new tab) is just the wheel, not the app round it.
const wheelId = wheelIdIn(window.location.hash)

createRoot(rootEl).render(
  <StrictMode>
    {wheelId ? <WheelPage id={wheelId} /> : <App />}
  </StrictMode>,
)
