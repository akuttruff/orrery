// Regenerates src/test/fixtures/*.json from astro-mcp for the demo person the
// tests use (a fictional birth: 1990-06-15 14:30 in New York). The dates of
// the castings are fixed so the tests' expectations stay put.
//
//   node --experimental-transform-types --no-warnings scripts/fixtures.ts
//
// lm-chat's src/test/fixtures/ holds copies of five of these.
import fs from 'node:fs'
import path from 'node:path'
import { Astro } from '../server/astro.ts'
import { SCAN_OBJECTS } from '../server/cast.ts'

export const DEMO_BIRTH = { date_time: '1990-06-15 14:30', city: 'New York', state: 'NY', country: 'USA' }
const OUT = path.resolve('src/test/fixtures')

const jobs: [file: string, tool: string, args: Record<string, unknown>][] = [
  ['natal-chart.json', 'create_natal_chart', DEMO_BIRTH],
  ['transit-chart.json', 'create_transit_chart', { ...DEMO_BIRTH, transit_date_time: '2026-10-13 05:58' }],
  // A busy day, for the demo's second Today casting: fourteen contacts on the wheel.
  ['transit-chart-nov7.json', 'create_transit_chart', { ...DEMO_BIRTH, transit_date_time: '2026-11-07 05:58' }],
  ['forecast-week.json', 'forecast_week', { ...DEMO_BIRTH, start_date: '2026-10-12' }],
  ['forecast-week-oct18.json', 'forecast_week', { ...DEMO_BIRTH, start_date: '2026-10-18' }],
  ['forecast-month.json', 'forecast_month', { ...DEMO_BIRTH, month: '2026-10' }],
  ['forecast-year.json', 'forecast_year', { ...DEMO_BIRTH, start_date: '2026-10-14' }],
  ['scan-week.json', 'list_upcoming_transits', { ...DEMO_BIRTH, start_date: '2026-10-18', end_date: '2026-10-24', object_filter: SCAN_OBJECTS.week }],
  ['scan-month.json', 'list_upcoming_transits', { ...DEMO_BIRTH, start_date: '2026-10-01', end_date: '2026-10-31', object_filter: SCAN_OBJECTS.month }],
]

const astro = new Astro()
for (const [file, tool, args] of jobs) {
  const text = await astro.call(tool, args)
  JSON.parse(text)
  fs.writeFileSync(path.join(OUT, file), text.endsWith('\n') ? text : `${text}\n`)
  console.log(`wrote ${file} (${text.length} chars)`)
}
process.exit(0)
