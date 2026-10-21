import { useEffect, useState } from 'react'
import App from './App.tsx'
import WheelPage from './components/WheelPage.tsx'
import { wheelIdIn } from './lib/route.ts'

/**
 * The app, with a casting's wheel full size over it whenever the address
 * says so (`#/w/<id>`). The app stays mounted underneath, so closing the
 * wheel finds the reading where it was.
 */
export default function Root() {
  const [wheelId, setWheelId] = useState(() => wheelIdIn(window.location.hash))
  useEffect(() => {
    const onPop = () => setWheelId(wheelIdIn(window.location.hash))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return (
    <>
      <App />
      {wheelId && <WheelPage id={wheelId} />}
    </>
  )
}
