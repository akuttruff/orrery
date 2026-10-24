// @vitest-environment node
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import manifest from './shared.json'

/**
 * The code Orrery shares with lm-chat (see scripts/sync-shared.mjs): each
 * copy here must be the one the manifest names, so an edit made here by
 * hand fails, and, with an lm-chat checkout beside this repo (or at
 * LM_CHAT_DIR), the manifest must name lm-chat's current files, so a change
 * there not yet synced fails too.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const LM_CHAT = resolve(ROOT, process.env.LM_CHAT_DIR ?? '../mobile-ai-chat/lm-chat')
const HEADER = 'Shared with Orrery: edit here in lm-chat, then run `npm run sync:shared` in Orrery.'
const files = Object.entries(manifest.files as Record<string, string>)

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex')
/** The shared files under `root` that are missing or not what the manifest says. */
const drifted = (root: string): string[] =>
  files.filter(([file, hash]) => !existsSync(join(root, file)) || sha256(join(root, file)) !== hash).map(([file]) => file)

describe('shared with lm-chat', () => {
  it('lists the files it shares', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('keeps each shared file as synced: change it in lm-chat, then npm run sync:shared', () => {
    expect(drifted(ROOT)).toEqual([])
  })

  it('starts each shared file with the comment that says so', () => {
    const unmarked = files.filter(([file]) => !readFileSync(join(ROOT, file), 'utf8').split('\n', 1)[0]!.includes(HEADER)).map(([file]) => file)
    expect(unmarked).toEqual([])
  })

  // Without a checkout (a clone of Orrery alone) there is nothing to compare with; the skip says so.
  it('is in step with lm-chat: after a change there, npm run sync:shared', (ctx) => {
    ctx.skip(!existsSync(join(LM_CHAT, 'package.json')), `no lm-chat checkout at ${LM_CHAT}; set LM_CHAT_DIR to one`)
    expect(drifted(LM_CHAT)).toEqual([])
  })
})
