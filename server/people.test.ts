// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { birthRequest, parseBirth } from './people.ts'

describe('reading a typed birth description', () => {
  it('asks the quick model, with no reasoning, for JSON in the fields the tools take', () => {
    const req = birthRequest('  Jo, June 8 1960 9:45am, Pleasanton CA ')
    expect(req.quick).toBe(true)
    expect(req.reasoning).toBe('off')
    expect(req.input).toBe('The description:\nJo, June 8 1960 9:45am, Pleasanton CA')
    expect(req.system).toContain('"date" as YYYY-MM-DD; "time" as HH:MM')
    expect(req.system).toContain('Never guess')
  })

  it('takes the fields from a reply, fenced or wrapped in a remark', () => {
    expect(parseBirth('Sure:\n```json\n{"name":"Jo","dateTime":"1960-06-08 09:45","city":"Pleasanton","state":"CA","country":"USA"}\n```'))
      .toEqual({ person: { name: 'Jo', dateTime: '1960-06-08 09:45', city: 'Pleasanton', state: 'CA', country: 'USA' } })
    expect(parseBirth('{"name":" Ana ","date":"1990-06-01","time":"15:00","city":"Oakland"}'))
      .toEqual({ person: { name: 'Ana', dateTime: '1990-06-01 15:00', city: 'Oakland', state: '', country: '' } })
  })

  it('passes on what the model says is missing, and refuses what is not JSON', () => {
    expect(parseBirth('{"error": "the birth time is missing."}')).toEqual({ error: 'The birth time is missing. Add it and try again.' })
    expect(parseBirth('I could not tell.')).toHaveProperty('error')
    expect(parseBirth('{not json')).toHaveProperty('error')
  })
})
