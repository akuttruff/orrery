import { describe, expect, it } from 'vitest'
import { formatSeconds, formatWhen, statsLine } from './when.ts'

describe('when', () => {
  it('shows the time alone today, the day otherwise, the year when it differs', () => {
    const now = new Date(2026, 9, 17, 14, 0).getTime()
    expect(formatWhen(new Date(2026, 9, 17, 11, 32).getTime(), now)).toMatch(/^11:32/)
    expect(formatWhen(new Date(2026, 9, 3, 9, 5).getTime(), now)).toMatch(/Oct 3.*9:05/)
    expect(formatWhen(new Date(2025, 11, 25, 9, 5).getTime(), now)).toMatch(/2025/)
  })

  it('shows a span in seconds, then minutes', () => {
    expect(formatSeconds(48_210)).toBe('48.2s')
    expect(formatSeconds(125_000)).toBe('2m 5s')
  })

  it('writes the cost line as lm-chat does', () => {
    expect(statsLine({ model: 'm', inputTokens: 12345, outputTokens: 820, reasoningTokens: 210, tokensPerSecond: 21.3, firstTokenSeconds: 2.4 }))
      .toBe('21.3 tok/s · 12.3K in / 820 out (210 thinking) · 2.4s to first token')
    expect(statsLine({ model: 'm', inputTokens: 10, outputTokens: 5, reasoningTokens: 0, tokensPerSecond: 9, firstTokenSeconds: 0.1 }))
      .toBe('9 tok/s · 10 in / 5 out · 0.1s to first token')
  })
})
