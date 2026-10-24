import { parseWheel } from '../src/lib/chartWheel.ts'
import { READINGS_PROMPT, aspectKey, parseReadings, readingsInput, readingsTokenCap } from '../src/lib/readings.ts'
import { writeWithModel } from './model.ts'
import type { Store } from './store.ts'

/** How long one wheel's readings may take before they are given up on. */
const TIMEOUT_MS = 180_000

/**
 * A sentence for each transit on a casting's wheel, for the popup over an
 * aspect: what that contact tends to bring up that day. The model writes
 * them in one short call beside the reading, without thinking, and they are
 * kept on the casting. Best effort: a failure leaves the popups with their
 * positions alone, and the next open of the casting asks again.
 */
export class TransitReadings {
  private inFlight = new Set<string>()

  constructor(private readonly store: Store, private readonly write = writeWithModel) {}

  get busy(): number { return this.inFlight.size }

  writing(id: string): boolean { return this.inFlight.has(id) }

  /** Ask for a casting's transit readings unless they are written, being written, or there is no transit wheel to read. */
  ensure(id: string): void {
    const casting = this.store.getCasting(id)
    if (!casting || casting.transitReadings !== null || this.inFlight.has(id)) return
    const wheel = parseWheel(casting.result)
    // No transit wheel (a forecast, the Moon, the birth chart) or a quiet day: nothing to ask, nothing for the
    // page to wait for, and nothing to parse again on the next open.
    const input = wheel?.kind === 'transit' ? readingsInput(wheel) : null
    if (!wheel || !input) { this.store.setTransitReadings(id, {}); return }
    const keys = wheel.aspects.map(aspectKey)
    this.inFlight.add(id)
    void (async () => {
      try {
        const { text } = await this.write(
          this.store.getConfig(),
          { system: READINGS_PROMPT, input, maxTokens: readingsTokenCap(keys.length), reasoning: 'off', quick: true },
          () => {},
          { signal: AbortSignal.timeout(TIMEOUT_MS) },
        )
        const readings = parseReadings(text, keys)
        if (!readings) throw new Error('no readings in the answer')
        if (this.store.getCasting(id)) this.store.setTransitReadings(id, readings)
        console.log(`[orrery] transit readings written for ${Object.keys(readings).length} of ${keys.length} aspects`)
      } catch (err) {
        console.log(`[orrery] transit readings skipped: ${(err as Error).message}`)
      } finally {
        this.inFlight.delete(id)
      }
    })()
  }
}
