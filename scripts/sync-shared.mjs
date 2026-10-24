// Copies the code Orrery shares with lm-chat (the chart wheel, the transit
// tables, the tarot spread, the app shell) from an lm-chat checkout, and
// writes src/shared.json: each shared file and the SHA-256 of its content.
// lm-chat holds the one real copy; change a shared file there, then:
//
//   npm run sync:shared                     (copies every file in the manifest)
//   npm run sync:shared -- src/lib/new.ts   (adds a file to the manifest, then copies)
//
// The checkout is ../mobile-ai-chat/lm-chat beside this repo, or LM_CHAT_DIR.
// src/shared.test.ts fails when a copy here no longer matches the manifest
// (an edit made here by hand), or the manifest no longer matches lm-chat.
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LM_CHAT = resolve(ROOT, process.env.LM_CHAT_DIR ?? '../mobile-ai-chat/lm-chat')
const MANIFEST = join(ROOT, 'src/shared.json')
/** What every shared file starts with, so its copy here says where to change it. */
const HEADER = 'Shared with Orrery: edit here in lm-chat, then run `npm run sync:shared` in Orrery.'

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

if (!existsSync(join(LM_CHAT, 'package.json'))) {
  console.error(`No lm-chat checkout at ${LM_CHAT}; set LM_CHAT_DIR to one.`)
  process.exit(1)
}

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { files: {} }
const files = [...new Set([...Object.keys(manifest.files), ...process.argv.slice(2)])].sort()

const hashes = {}
let failed = false
for (const file of files) {
  const from = join(LM_CHAT, file)
  if (!existsSync(from)) { console.error(`${file}: not in lm-chat`); failed = true; continue }
  // The first line: `// <header>` or, in a stylesheet, `/* <header> */`.
  if (!readFileSync(from, 'utf8').split('\n', 1)[0].includes(HEADER)) {
    console.error(`${file}: lm-chat's copy does not start with the shared-file comment:\n  ${HEADER}`)
    failed = true
    continue
  }
  const to = join(ROOT, file)
  mkdirSync(dirname(to), { recursive: true })
  const before = existsSync(to) ? sha256(to) : null
  copyFileSync(from, to)
  hashes[file] = sha256(to)
  if (before !== hashes[file]) console.log(`${before ? 'updated' : 'added'}  ${file}`)
}
if (failed) process.exit(1)

writeFileSync(MANIFEST, `${JSON.stringify({ from: 'lm-chat', files: hashes }, null, 2)}\n`)
console.log(`${files.length} shared files in step with ${LM_CHAT}`)
