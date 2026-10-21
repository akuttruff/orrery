import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Root from './Root.tsx'
import { registerAppShell } from './lib/appShell.ts'
import './App.css'

// The page from the cache on later launches, so it paints before the network answers.
registerAppShell()

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root is missing from index.html')

createRoot(rootEl).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
