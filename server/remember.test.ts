// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseFacts, rememberRequest } from './remember.ts'
import type { Memory, Profile } from '../src/types.ts'

const sam: Profile = { name: 'Sam', dateTime: '1990-06-15 14:30', city: 'New York', state: 'NY', country: 'USA', houseSystem: 'whole_sign' }
const known: Memory[] = [{ id: 'a1', text: 'The user works nights.', createdAt: 1, updatedAt: 1 }]

describe('rememberRequest', () => {
  it('asks for the durable facts in a question as JSON, with what is already known held back', () => {
    const req = rememberRequest('My friend visits from Lisbon on the 20th, is that a good week?', known, sam, new Date(2026, 9, 16))
    expect(req.system).toContain('JSON array of strings')
    expect(req.system).toContain('The person: Sam. Today is Fri Oct 16 2026.')
    expect(req.system).toContain('Already known (do not repeat):\n- The user works nights.')
    expect(req.input).toBe('The question:\nMy friend visits from Lisbon on the 20th, is that a good week?')
    expect(rememberRequest('q', [], sam).system).toContain('Nothing is known yet.')
    // A short, tool-free job: it goes to the quick jobs model when one is set.
    expect(req).toMatchObject({ quick: true })
    expect(req.tools).toBeUndefined()
  })
})

describe('parseFacts', () => {
  it('reads the array, fenced or chatted around, keeping only real sentences once each', () => {
    const text = 'Sure:\n```json\n["The user\'s friend Jo lives in Lisbon.", "  The user\'s friend   Jo lives in Lisbon. ", 7, "short", "The user has a friend named Jo visiting on 2026-10-20."]\n```'
    expect(parseFacts(text)).toEqual([
      "The user's friend Jo lives in Lisbon.",
      'The user has a friend named Jo visiting on 2026-10-20.',
    ])
  })

  it('gives nothing for an empty list or an answer with no list in it', () => {
    expect(parseFacts('[]')).toEqual([])
    expect(parseFacts('Nothing to keep.')).toEqual([])
    expect(parseFacts('{"a": 1}')).toEqual([])
    expect(parseFacts('["broken')).toEqual([])
  })

  it('stops at the cap', () => {
    const many = JSON.stringify(Array.from({ length: 10 }, (_, i) => `The user fact number ${i} is here.`))
    expect(parseFacts(many)).toHaveLength(6)
  })
})
