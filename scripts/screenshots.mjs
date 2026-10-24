// Screenshots of the app for the README, taken with headless Chrome over its
// DevTools protocol (a raw WebSocket; no npm dependency). Run the dev server
// on the demo database first:
//
//   npm run seed:demo && npm run dev        (in one terminal)
//   npm run screenshots [scenario]          (in another; writes docs/screenshots/*.png)
//
// Needs Google Chrome at the usual macOS path, or CHROME=/path/to/chrome.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { encodeRecording, glide, startRecording, typeInto, waitUntil } from './recording.mjs'

const URL = process.env.ORRERY_URL ?? 'http://127.0.0.1:8400'
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = 'docs/screenshots'
const PORT = Number(process.env.CHROME_PORT ?? 9335)

const PHONE = { width: 430, height: 932, scale: 2, mobile: true }
const DESKTOP = { width: 1280, height: 840, scale: 2, mobile: false }

/**
 * Each scenario is a list of steps against a fresh browser profile:
 *  click <text>          the innermost element whose text contains it, or its enclosing button
 *  sel <css>             click the first element matching the selector
 *  aria <label>          click the element with that aria-label
 *  wait <ms>             pause (animations, lazy chunks)
 *  scroll <css> <px>     scroll an element, or the window when the selector matches nothing
 *  glide <css> <px> <ms> scroll it smoothly, for a recording
 *  type <css> <text>     type into a field a few characters at a time
 *  ask <css>             click what sends a question (the recording runs the wait for the answer fast)
 *  until <js> <ms> <opt> wait until the expression is true in the page ({ follow, faster }: see run)
 *  letgo                 let go of the wheel's popup
 *  hover <css> <text>    move the mouse over each matching element in turn until the popup says <text>
 *  press <css> <text>    the same with a finger, so the popup stays up
 */
/** What the phone's recording asks, and how the recordings know the answer has started and finished (the newest answer). */
const QUESTION = 'What does this mean for a conversation I keep putting off?'
const LAST = `[...document.querySelectorAll('.followup-a')].pop()`
const WRITING = `(() => { const a = ${LAST}; return !!a && !a.querySelector('.reading-status') && a.textContent.length > 60 })()`
const ANSWERED = `(() => { const a = ${LAST}; return !!a && !!a.querySelector('.followup-memory') })()`

const scenarios = [
  { name: 'home-phone', view: PHONE, steps: [] },
  { name: 'today-phone', view: PHONE, steps: [['click', 'Today · Oct 13'], ['wait', 1500]] },
  { name: 'reading-phone', view: PHONE, steps: [['click', 'Today · Oct 13'], ['wait', 1500], ['scroll', '.scroll', 1500]] },
  { name: 'week-phone', view: PHONE, steps: [['click', 'Week of Oct 18'], ['wait', 1500]] },
  { name: 'natal-phone', view: PHONE, steps: [['click', "Sam's birth chart"], ['wait', 1500]] },
  { name: 'desktop', view: DESKTOP, steps: [['click', 'Today · Oct 13'], ['wait', 1500]] },
  { name: 'hover-desktop', view: DESKTOP, steps: [['click', 'Today · Nov 7'], ['wait', 1500], ['hover', '.wheel-aspect', 'gets said plainly']] },
  { name: 'busy-phone', view: PHONE, steps: [['click', 'Today · Nov 7'], ['wait', 1500]] },
  { name: 'busy-desktop', view: DESKTOP, steps: [['click', 'Today · Nov 7'], ['wait', 1500]] },
  { name: 'hover-phone', view: PHONE, steps: [['click', 'Today · Nov 7'], ['wait', 1500], ['press', '.wheel-aspect', 'gets said plainly']] },
  { name: 'wheel-phone', view: PHONE, steps: [['click', 'Today · Nov 7'], ['wait', 1500], ['sel', '.wheel-open'], ['wait', 800]] },
  { name: 'spread-phone', view: PHONE, steps: [['click', 'Past, present, future · Oct 14'], ['wait', 1500]] },
  { name: 'card-phone', view: PHONE, steps: [['click', 'Card · Oct 14'], ['wait', 1500]] },
  // Walkthroughs, recorded (see recording.mjs): the phone's and the desktop's.
  // A question typed under a reading and answered as it streams (the phone), and a card pulled against one (the desktop).
  { name: 'demo-phone', view: PHONE, record: true, speed: 1.3, steps: [['wait', 900], ['click', 'Today · Nov 7'], ['wait', 1700], ['press', '.wheel-aspect', 'gets said plainly'], ['wait', 1500], ['letgo'], ['wait', 300], ['glide', '.scroll', 99999, 2200], ['wait', 500], ['type', '.ask-box', QUESTION], ['wait', 400], ['ask', '.ask-send'], ['wait', 300], ['glide', '.scroll', 99999, 600], ['until', WRITING, 150000, { faster: 8, follow: true }], ['until', ANSWERED, 200000, { faster: 2.5, follow: true }], ['wait', 600], ['glide', '.scroll', 99999, 1200], ['wait', 1600]] },
  { name: 'demo-desktop', view: DESKTOP, record: true, speed: 1.3, steps: [['wait', 900], ['click', 'Today · Nov 7'], ['wait', 1700], ['hover', '.wheel-aspect', 'gets said plainly'], ['wait', 1500], ['letgo'], ['wait', 300], ['glide', '.scroll', 99999, 2200], ['wait', 700], ['ask', '.pull-row .chip'], ['wait', 300], ['glide', '.scroll', 99999, 600], ['until', WRITING, 150000, { faster: 8, follow: true }], ['until', ANSWERED, 200000, { faster: 2.5, follow: true }], ['wait', 600], ['glide', '.scroll', 99999, 1200], ['wait', 1600]] },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function withChrome(view, fn) {
  // A fresh profile per scenario, so nothing carries over.
  const profile = mkdtempSync(join(tmpdir(), 'orrery-shots-'))
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check', `--window-size=${view.width},${view.height}`, '--hide-scrollbars', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
  const exited = new Promise((r) => chrome.on('exit', r))
  try {
    let targets = []
    for (let i = 0; i < 40 && targets.length === 0; i++) {
      await sleep(250)
      try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json() } catch { /* not up yet */ }
    }
    const page = targets.find((t) => t.type === 'page')
    if (!page) throw new Error('Chrome did not expose a page target')
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((r) => (ws.onopen = r))
    let id = 0
    const pending = new Map()
    const listeners = new Map()
    const on = (method, fn) => listeners.set(method, fn)
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } else if (m.method && listeners.has(m.method)) listeners.get(m.method)(m.params) }
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
    const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value
    await send('Page.enable')
    await send('Emulation.setDeviceMetricsOverride', { width: view.width, height: view.height, deviceScaleFactor: view.scale, mobile: view.mobile })
    await fn({ send, evaluate, on })
    ws.close()
  } finally {
    chrome.kill()
    await exited
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}

const clickText = (text, sel = 'button, div, span, h2, h3, h4, b, strong, em, p, li, a, summary') =>
  `(() => { const t = ${JSON.stringify(text)}; const all = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.textContent.includes(t)); const el = all.find((e) => !all.some((o) => o !== e && e.contains(o))); if (!el) return 'missing ' + t; (el.closest('button, a, summary, li') ?? el).click(); return 'clicked' })()`

/**
 * A mouse hover, or a finger's press, as the pointer events the popup opens
 * on, sent to each matching element in turn. Sent rather than hit-tested,
 * since a short line can sit wholly under the planets at its ends.
 */
async function hover(evaluate, selector, text, finger = false) {
  const n = await evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`)
  if (!n) return `missing ${selector}`
  const open = finger ? ['pointerdown', 'touch'] : ['pointerover', 'mouse']
  const close = finger ? ['pointerdown', 'touch'] : ['pointerout', 'mouse']
  const seen = []
  for (let i = 0; i < n; i++) {
    const tip = await evaluate(`(async () => {
      const el = document.querySelectorAll(${JSON.stringify(selector)})[${i}]
      el.dispatchEvent(new PointerEvent(${JSON.stringify(open[0])}, { bubbles: true, pointerType: ${JSON.stringify(open[1])} }))
      await new Promise((r) => setTimeout(r, 200))
      const tip = document.querySelector('.wheel-tip')?.textContent ?? ''
      if (!tip.includes(${JSON.stringify(text)})) el.dispatchEvent(new PointerEvent(${JSON.stringify(close[0])}, { bubbles: true, pointerType: ${JSON.stringify(close[1])} }))
      return tip
    })()`)
    if (tip.includes(text)) return finger ? 'pressed' : 'hovered'
    seen.push(tip.slice(0, 60) || '(no popup)')
  }
  return `missing popup saying ${text}; saw: ${seen.join(' | ')}`
}

async function run(scenario) {
  await withChrome(scenario.view, async ({ send, evaluate, on }) => {
    await send('Page.navigate', { url: URL + (scenario.path ?? '') })
    await sleep(2500)
    const recording = scenario.record ? startRecording({ send, on }) : null
    // Waits marked `faster` (for the model's first word, for a long answer) run that much faster in the recording.
    const fast = []
    let asked = null
    for (const [op, a, b, c] of scenario.steps) {
      let result = ''
      if (op === 'click') result = await evaluate(clickText(a))
      else if (op === 'glide') result = await glide(evaluate, a, b, c)
      else if (op === 'type') result = await typeInto(send, evaluate, a, b, 45)
      else if (op === 'ask') { result = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(a)}); if (!el) return 'missing ' + ${JSON.stringify(a)}; el.click(); return 'clicked' })()`); asked = Date.now() / 1000 }
      else if (op === 'until') {
        // `follow` keeps the newest text in view as it streams; `faster` runs this wait (from the question, for the first one) that much faster.
        const from = asked ?? Date.now() / 1000
        asked = null
        result = await waitUntil(evaluate, c?.follow ? `(() => { const el = document.querySelector('.scroll'); if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); return ${a} })()` : a, b, c?.follow ? 400 : 250)
        if (result === 'timeout') throw new Error(`${scenario.name}: gave up waiting for ${a}`)
        if (c?.faster) fast.push({ from, to: Date.now() / 1000, factor: c.faster })
      }
      else if (op === 'letgo') result = await evaluate(`(async () => { document.querySelectorAll('.wheel-aspect, .wheel-point').forEach((el) => el.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse' }))); document.querySelector('.wheel-aspect')?.closest('svg')?.querySelector('rect')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })); await new Promise((r) => requestAnimationFrame(r)); return document.querySelector('.wheel-tip') ? 'missing: the popup is still up' : 'let go' })()`)
      else if (op === 'sel') result = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(a)}); if (!el) return 'missing ' + ${JSON.stringify(a)}; el.click(); return 'clicked' })()`)
      else if (op === 'aria') result = await evaluate(`(() => { const el = document.querySelector('[aria-label=' + ${JSON.stringify(JSON.stringify(a))} + ']'); if (!el) return 'missing ' + ${JSON.stringify(a)}; el.click(); return 'clicked' })()`)
      else if (op === 'wait') { await sleep(a); continue }
      else if (op === 'scroll') result = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(a)}); if (el && el.scrollHeight > el.clientHeight) { el.scrollTop = ${b}; return 'scrolled' } window.scrollTo(0, ${b}); return 'scrolled window' })()`)
      else if (op === 'hover') result = await hover(evaluate, a, b)
      else if (op === 'press') result = await hover(evaluate, a, b, true)
      if (String(result).startsWith('missing')) throw new Error(`${scenario.name}: ${result}`)
      await sleep(700)
    }
    if (recording) {
      const frames = await recording.stop()
      const made = encodeRecording(frames, { out: OUT, name: scenario.name, wide: !scenario.view.mobile, speed: scenario.speed ?? 1, fast })
      console.log(`wrote ${made.gif} and ${made.mp4} (${made.seconds} s, ${made.frames} frames)`)
      return
    }
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(`${OUT}/${scenario.name}.png`, Buffer.from(shot.result.data, 'base64'))
    console.log(`wrote ${OUT}/${scenario.name}.png`)
  })
}

mkdirSync(OUT, { recursive: true })
const only = process.argv[2]
for (const s of scenarios) {
  if (only && s.name !== only) continue
  await run(s)
}
