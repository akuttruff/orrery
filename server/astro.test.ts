// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'
import { Astro, AstroToolError, connectionLost, serverLabel } from './astro.ts'
import type { ConnectClient, ToolClient } from './astro.ts'

/** A fake server per connection: each call answers with what `answer` returns or throws, by connection number. */
function fakeServers(answer: (conn: number, name: string) => Promise<string> | string) {
  let conns = 0
  const closed: number[] = []
  const closers: (() => void)[] = []
  const open: ConnectClient = async (onClose) => {
    const conn = ++conns
    closers.push(onClose)
    const client: ToolClient = {
      callTool: (async (params: { name: string }) => ({ content: [{ type: 'text', text: await answer(conn, params.name) }] })) as unknown as ToolClient['callTool'],
      close: vi.fn(async () => { closed.push(conn) }),
    }
    return client
  }
  return { open, connections: () => conns, closed, drop: (i: number) => closers[i]!() }
}

describe('Astro', () => {
  it('keeps one server for many calls', async () => {
    const s = fakeServers((conn, name) => `${name} on ${conn}`)
    const astro = new Astro({ command: 'x' }, 1000, s.open)
    expect(astro.running).toBe(false)
    expect(await astro.call('a', {})).toBe('a on 1')
    expect(await astro.call('b', {})).toBe('b on 1')
    expect(astro.running).toBe(true)
    expect(s.connections()).toBe(1)
  })

  it('starts a fresh server once when the connection closed under a call', async () => {
    const s = fakeServers((conn) => { if (conn === 1) throw new McpError(ErrorCode.ConnectionClosed, 'Connection closed'); return 'ok' })
    const astro = new Astro({ command: 'x' }, 1000, s.open)
    expect(await astro.call('a', {})).toBe('ok')
    expect(s.connections()).toBe(2)
    expect(s.closed).toEqual([1])
  })

  it('rethrows a timeout or a JSON-RPC error without touching the server the other calls are on', async () => {
    let slow: (() => void) | null = null
    const s = fakeServers((_conn, name) => {
      if (name === 'timeout') throw new McpError(ErrorCode.RequestTimeout, 'Request timed out')
      if (name === 'bad') throw new McpError(ErrorCode.InvalidParams, 'bad arguments')
      if (name === 'slow') return new Promise<string>((resolve) => { slow = () => resolve('slow done') })
      return 'ok'
    })
    const astro = new Astro({ command: 'x' }, 1000, s.open)
    const inFlight = astro.call('slow', {})
    await expect(astro.call('timeout', {})).rejects.toThrow(/timed out/)
    await expect(astro.call('bad', {})).rejects.toThrow(/bad arguments/)
    slow!()
    expect(await inFlight).toBe('slow done')
    expect(s.connections()).toBe(1)
    expect(s.closed).toEqual([])
  })

  it('says a tool error is the tool\'s, and starts again after the server went away between calls', async () => {
    const s = fakeServers((_conn, name) => { if (name === 'fail') throw new AstroToolError('no such city'); return 'ok' })
    const astro = new Astro({ command: 'x' }, 1000, s.open)
    await expect(astro.call('fail', {})).rejects.toBeInstanceOf(AstroToolError)
    s.drop(0)
    expect(astro.running).toBe(false)
    expect(await astro.call('a', {})).toBe('ok')
    expect(s.connections()).toBe(2)
  })

  it('tells a lost connection from the call\'s own failures', () => {
    expect(connectionLost(new McpError(ErrorCode.ConnectionClosed, 'Connection closed'))).toBe(true)
    expect(connectionLost(new Error('Not connected'))).toBe(true)
    expect(connectionLost(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))).toBe(true)
    expect(connectionLost(new McpError(ErrorCode.RequestTimeout, 'Request timed out'))).toBe(false)
    expect(connectionLost(new McpError(ErrorCode.InternalError, 'boom'))).toBe(false)
    expect(connectionLost(new Error('something else'))).toBe(false)
  })

  it('labels the log by the repo the server runs from', () => {
    expect(serverLabel({ command: '/Users/x/Code/astro-mcp/start-server.sh' })).toBe('astro-mcp')
    expect(serverLabel({ command: 'node', args: ['/Users/x/Code/tarot-mcp/dist/index.js'] })).toBe('tarot-mcp')
  })
})
