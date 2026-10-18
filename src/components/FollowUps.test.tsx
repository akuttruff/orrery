import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FollowUps from './FollowUps'
import { NOT_WRITTEN } from '../types.ts'
import type { FollowUp } from '../types.ts'

/** A fetch that serves the follow-up routes from memory. */
function serve(initial: FollowUp[]) {
  const items = [...initial]
  const asked: string[] = []
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/castings/c1/followups' && (!init || init.method === undefined)) return reply(200, items)
    if (url === '/api/castings/c1/followups' && init?.method === 'POST') {
      const { question } = JSON.parse(init.body as string) as { question: string }
      asked.push(question)
      const f: FollowUp = { id: `f${items.length + 1}`, castingId: 'c1', question, answer: 'The Moon says yes.', state: 'done', error: null, createdAt: 1, remembered: null, memoriesUsed: [], written: NOT_WRITTEN }
      items.push(f)
      return reply(202, f)
    }
    return reply(404, { error: 'Not found' })
  }))
  return { asked }
}

describe('FollowUps', () => {
  it('shows the questions asked so far with their answers', async () => {
    serve([{ id: 'f1', castingId: 'c1', question: 'Which day?', answer: 'Thursday, when the **Moon** is in Leo.', state: 'done', error: null, createdAt: 1, remembered: [], memoriesUsed: ['m1', 'm2'], written: { trail: [{ kind: 'reasoning', text: 'Saturn is the key here.', done: true, seconds: 4.2 }, { kind: 'tool', name: 'verify_claim', ok: true, plugin: 'mcp/astrology-v2', args: { claim: 'Saturn trine Saturn' }, output: 'In effect; exact 2026-10-22.' }, { kind: 'tool', name: 'forecast_week', ok: false, output: 'timed out' }], stats: { model: 'qwen', inputTokens: 3100, outputTokens: 820, reasoningTokens: 210, tokensPerSecond: 21.3, firstTokenSeconds: 2.4 }, startedAt: 1_000, finishedAt: 13_000 } }])
    render(<FollowUps castingId="c1" readingState="done" readingText="A reading." />)
    expect(await screen.findByText('Which day?')).toBeInTheDocument()
    expect(screen.getByText('Moon')).toBeInTheDocument()
    expect(screen.getByText('Answered with 2 memories · nothing new to remember')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /verify claim/ })).toHaveTextContent('astrology-v2')
    expect(screen.getByText('claim: Saturn trine Saturn')).toBeInTheDocument()
    expect(screen.getByText('In effect; exact 2026-10-22.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /forecast week/ })).toHaveTextContent('failed')
    // The thinking, collapsed until tapped, ahead of the tool calls; the cost and timing under the answer.
    expect(screen.queryByText('Saturn is the key here.')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Thought for 4.2s/ }))
    expect(screen.getByText('Saturn is the key here.')).toBeInTheDocument()
    expect(screen.getByText(/^Answered .*12\.0s · qwen$/)).toBeInTheDocument()
    expect(screen.getByText('· 21.3 tok/s · 3100 in / 820 out (210 thinking) · 2.4s to first token')).toBeInTheDocument()
    expect(screen.getByLabelText('Ask another')).toBeEnabled()
  })

  it('keeps the box closed until the reading is written', async () => {
    serve([])
    render(<FollowUps castingId="c1" readingState="writing" readingText="" />)
    const box = await screen.findByLabelText('Ask about this reading')
    expect(box).toBeDisabled()
    expect(box).toHaveAttribute('placeholder', expect.stringMatching(/once the reading is written/))
  })

  it('sends a question and shows the answer under it', async () => {
    const { asked } = serve([])
    const user = userEvent.setup()
    render(<FollowUps castingId="c1" readingState="done" readingText="A reading." />)
    const box = await screen.findByLabelText('Ask about this reading')
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled()
    await user.type(box, 'Is Thursday any good?')
    await user.click(screen.getByRole('button', { name: 'Ask' }))
    await waitFor(() => expect(asked).toEqual(['Is Thursday any good?']))
    expect(await screen.findByText('Is Thursday any good?')).toBeInTheDocument()
    expect(screen.getByText('The Moon says yes.')).toBeInTheDocument()
    expect(box).toHaveValue('')
  })
})
