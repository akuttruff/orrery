/**
 * A tarot reading as one picture to keep: the cards as they fell, the
 * question, and the reading's text, drawn on a canvas in the app's own
 * colours and saved as a PNG (lib/readingImage.ts's renderReadingImage,
 * components/DownloadButton.tsx's button).
 *
 * The parts that need no canvas are pure and tested on their own: the
 * Markdown reduced to blocks of styled runs, the word wrapping (given a
 * measure), the cards' rows, the scale and the filename.
 */
import { KIND_LABEL } from './kinds.ts'
import { tarotImage } from './tarotImage.ts'
import type { Reading } from './tarotSpread.ts'
import type { Casting, FollowUp } from '../types.ts'

// ---------------------------------------------------------------------------
// What is drawn

/** One card in the picture: its scan, its name, which way up, and where it fell in the spread. */
export interface ImageCard {
  src: string
  name: string
  reversed: boolean
  /** The spread position's name; left out for a lone card, whose position says nothing. */
  position?: string
}

export interface ReadingImage {
  /** For the filename: 'daily-card', 'spread', 'pulled-card'. */
  kind: string
  /** The big line under the wordmark: "Daily card", the spread's name. */
  heading: string
  /** A smaller line under it, when there is more to say (what a pulled card was read against). */
  sub?: string
  /** When it was cast, in ms. */
  date: number
  cards: ImageCard[]
  question: string | null
  /** The reading, as the model wrote it: Markdown. */
  text: string
}

const cardOf = (c: Reading['cards'][number], position: boolean): ImageCard => ({
  src: tarotImage(c.card.id),
  name: c.card.name,
  reversed: c.reversed,
  ...(position ? { position: c.position.name } : {}),
})

/** A daily card or a spread, as the picture of it. */
export function castingImage(casting: Pick<Casting, 'kind' | 'createdAt' | 'note'>, cards: Reading, text: string): ReadingImage {
  const spread = casting.kind === 'spread'
  return {
    kind: spread ? 'spread' : 'daily-card',
    heading: spread ? cards.spread.name : KIND_LABEL.card,
    date: casting.createdAt,
    cards: cards.cards.map((c) => cardOf(c, spread && cards.cards.length > 1)),
    question: cards.question?.trim() || casting.note.trim() || null,
    text,
  }
}

/** A card pulled beside a chart's reading, and what the model read in it. */
export function pulledImage(followUp: Pick<FollowUp, 'card' | 'createdAt'>, text: string, castingTitle?: string): ReadingImage | null {
  if (!followUp.card) return null
  return {
    kind: 'pulled-card',
    heading: 'A card pulled',
    ...(castingTitle ? { sub: `Read against “${castingTitle}”` } : {}),
    date: followUp.createdAt,
    cards: [cardOf(followUp.card, false)],
    question: null,
    text,
  }
}

const pad = (n: number): string => String(n).padStart(2, '0')
/** The local day, YYYY-MM-DD. */
export const ymd = (ms: number): string => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

/** orrery-<kind>-<YYYY-MM-DD>.png */
export const imageFilename = (image: Pick<ReadingImage, 'kind' | 'date'>): string =>
  `orrery-${image.kind.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'reading'}-${ymd(image.date)}.png`

/** The title a share sheet shows. */
export const imageTitle = (image: Pick<ReadingImage, 'heading' | 'date'>): string => `${image.heading} · ${longDate(image.date)}`

export const longDate = (ms: number): string =>
  new Date(ms).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

// ---------------------------------------------------------------------------
// Markdown, reduced to runs

export interface Run { text: string; bold?: boolean; italic?: boolean }

export type Block =
  | { type: 'heading'; level: number; runs: Run[] }
  | { type: 'para'; runs: Run[]; quote?: boolean }
  | { type: 'item'; marker: string; runs: Run[] }
  | { type: 'rule' }

interface Style { bold: boolean; italic: boolean }

/** The inline marks, earliest first; each gives the text inside and how it is styled. */
const INLINE: { re: RegExp; style?: Partial<Style>; plain?: boolean; drop?: boolean }[] = [
  { re: /!\[[^\]]*\]\([^)]*\)/, drop: true },
  { re: /\[([^\]]+)\]\([^)]*\)/ },
  { re: /`([^`]+)`/, plain: true },
  { re: /\*\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*\*/, style: { bold: true, italic: true } },
  { re: /\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/, style: { bold: true } },
  { re: /(?<![\w])__(?=\S)([\s\S]+?)(?<=\S)__(?![\w])/, style: { bold: true } },
  { re: /\*(?=\S)([\s\S]+?)(?<=\S)\*/, style: { italic: true } },
  { re: /(?<![\w])_(?=\S)([\s\S]+?)(?<=\S)_(?![\w])/, style: { italic: true } },
  { re: /~~(?=\S)([\s\S]+?)(?<=\S)~~/ },
]

function inline(text: string, style: Style, out: Run[]): void {
  let rest = text
  while (rest) {
    let best: { index: number; length: number; inner: string; rule: (typeof INLINE)[number] } | null = null
    for (const rule of INLINE) {
      const m = rule.re.exec(rest)
      if (m && (!best || m.index < best.index)) best = { index: m.index, length: m[0].length, inner: m[1] ?? '', rule }
    }
    if (!best) { push(out, rest, style); return }
    if (best.index) push(out, rest.slice(0, best.index), style)
    if (!best.rule.drop) {
      const inner = { bold: style.bold || !!best.rule.style?.bold, italic: style.italic || !!best.rule.style?.italic }
      if (best.rule.plain) push(out, best.inner, inner)
      else inline(best.inner, inner, out)
    }
    rest = rest.slice(best.index + best.length)
  }
}

function push(out: Run[], text: string, style: Style): void {
  if (!text) return
  // A lone marker the model left open is markup, not text.
  const clean = text.replace(/\*\*|__/g, '').replace(/\\([\\`*_{}[\]()#+\-.!>|~])/g, '$1')
  if (!clean) return
  const last = out[out.length - 1]
  if (last && !!last.bold === style.bold && !!last.italic === style.italic) { last.text += clean; return }
  out.push({ text: clean, ...(style.bold ? { bold: true } : {}), ...(style.italic ? { italic: true } : {}) })
}

/** A line of Markdown's inline text as styled runs: bold, italic, links as their words, code as plain text. */
export function parseInline(text: string): Run[] {
  const out: Run[] = []
  inline(text.replace(/\s+/g, ' ').trim(), { bold: false, italic: false }, out)
  return out
}

/**
 * The reading's Markdown as blocks to draw: headings, paragraphs, list
 * items and rules. Tables become a line per row, cells joined by a dot;
 * code fences are kept as plain paragraphs.
 */
export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = []
  let para: { lines: string[]; quote: boolean } | null = null
  let item: { marker: string; lines: string[] } | null = null
  let fenced = false

  const flush = (): void => {
    if (para) { const runs = parseInline(para.lines.join(' ')); if (runs.length) blocks.push({ type: 'para', runs, ...(para.quote ? { quote: true } : {}) }) }
    if (item) blocks.push({ type: 'item', marker: item.marker, runs: parseInline(item.lines.join(' ')) })
    para = null
    item = null
  }

  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    if (/^\s*(```|~~~)/.test(line)) { flush(); fenced = !fenced; continue }
    if (fenced) { flush(); if (line.trim()) blocks.push({ type: 'para', runs: [{ text: line.trim() }] }); continue }
    if (!line.trim()) { flush(); continue }
    let m: RegExpExecArray | null
    if ((m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) { flush(); blocks.push({ type: 'heading', level: m[1]!.length, runs: parseInline(m[2]!) }); continue }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); blocks.push({ type: 'rule' }); continue }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flush()
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue
      const cells = line.trim().slice(1, -1).split('|').map((c) => c.trim()).filter(Boolean)
      if (cells.length) blocks.push({ type: 'para', runs: parseInline(cells.join(' · ')) })
      continue
    }
    if ((m = /^\s*[-*+]\s+(?:\[[ xX]\]\s+)?(.*)$/.exec(line))) { flush(); item = { marker: '•', lines: [m[1]!] }; continue }
    if ((m = /^\s*(\d+)[.)]\s+(.*)$/.exec(line))) { flush(); item = { marker: `${m[1]}.`, lines: [m[2]!] }; continue }
    if ((m = /^\s*>\s?(.*)$/.exec(line))) {
      if (!para?.quote) { flush(); para = { lines: [], quote: true } }
      para.lines.push(m[1]!)
      continue
    }
    if (item) { item.lines.push(line.trim()); continue }
    if (para?.quote) flush()
    if (!para) para = { lines: [], quote: false }
    para.lines.push(line.trim())
  }
  flush()
  return blocks
}

// ---------------------------------------------------------------------------
// Word wrapping

/** How wide a piece of text is in a run's style, at the size being set. */
export type Measure = (text: string, run: Run) => number

const styled = (text: string, run: Run): Run => ({ text, ...(run.bold ? { bold: true } : {}), ...(run.italic ? { italic: true } : {}) })
const sameStyle = (a: Run, b: Run): boolean => !!a.bold === !!b.bold && !!a.italic === !!b.italic

function merge(line: Run[]): Run[] {
  const out: Run[] = []
  for (const r of line) {
    const last = out[out.length - 1]
    if (last && sameStyle(last, r)) last.text += r.text
    else out.push({ ...r })
  }
  return out
}

/** A run of words broken across lines: no line wider than `width` unless one word is, and then the word is broken. */
export function wrapRuns(runs: Run[], width: number, measure: Measure): Run[][] {
  // Words, each made of pieces in their own styles ("**bold**ly" is one word), and the space after each.
  const words: { pieces: Run[]; space: Run | null }[] = []
  let cur: { pieces: Run[]; space: Run | null } | null = null
  for (const run of runs) {
    for (const part of run.text.split(/(\s+)/)) {
      if (!part) continue
      if (/^\s+$/.test(part)) { if (cur) cur.space = styled(' ', run); continue }
      if (!cur || cur.space) { cur = { pieces: [], space: null }; words.push(cur) }
      cur.pieces.push(styled(part, run))
    }
  }

  const lines: Run[][] = []
  let line: Run[] = []
  let lineW = 0
  let gap: Run | null = null
  const wide = (pieces: Run[]): number => pieces.reduce((w, p) => w + measure(p.text, p), 0)
  const end = (): void => { if (line.length) lines.push(merge(line)); line = []; lineW = 0; gap = null }

  for (const word of words) {
    const w = wide(word.pieces)
    const gapW = gap ? measure(gap.text, gap) : 0
    if (line.length && lineW + gapW + w <= width) {
      line.push(gap!, ...word.pieces)
      lineW += gapW + w
    } else {
      end()
      if (w <= width) { line.push(...word.pieces); lineW = w }
      else {
        // One word wider than the line: break it by letters.
        for (const piece of word.pieces) {
          for (const ch of piece.text) {
            const cw = measure(ch, piece)
            if (line.length && lineW + cw > width) end()
            line.push(styled(ch, piece))
            lineW += cw
          }
        }
      }
    }
    gap = word.space
  }
  end()
  return lines
}

// ---------------------------------------------------------------------------
// The cards' rows

/** How many cards in each row: at most `max` a row, the rows as even as they can be (7 is 4 and 3). */
export function cardRows(n: number, max = 5): number[] {
  if (n <= 0) return []
  const rows = Math.ceil(n / max)
  const base = Math.floor(n / rows)
  const extra = n % rows
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0))
}

export interface CardSlot { x: number; row: number }
export interface CardLayout { cardWidth: number; cardHeight: number; rows: number[]; slots: CardSlot[] }

/** The deck's aspect, 2.75 by 4.75 inches. */
export const CARD_RATIO = 2.75 / 4.75

/** The cards across `width`: each row centred, every card the same size, none wider than `maxCard`. */
export function layoutCards(n: number, width: number, { gap = 32, maxCard = 360, perRow = 5 }: { gap?: number; maxCard?: number; perRow?: number } = {}): CardLayout {
  const rows = cardRows(n, perRow)
  const most = Math.max(1, ...rows)
  const cardWidth = Math.min(maxCard, (width - gap * (most - 1)) / most)
  const slots: CardSlot[] = []
  rows.forEach((count, row) => {
    const rowWidth = count * cardWidth + gap * (count - 1)
    const x0 = (width - rowWidth) / 2
    for (let i = 0; i < count; i++) slots.push({ x: x0 + i * (cardWidth + gap), row })
  })
  return { cardWidth, cardHeight: cardWidth / CARD_RATIO, rows, slots }
}

/** Pixels per point: 2 for sharpness, less for a picture so tall that a phone's canvas would refuse it (iOS stops at 16.7M pixels). */
export function scaleFor(width: number, height: number, best = 2, maxPixels = 16_777_216): number {
  const fit = Math.sqrt(maxPixels / (width * height))
  return Math.max(0.5, Math.min(best, Math.floor(fit * 100) / 100))
}

// ---------------------------------------------------------------------------
// Drawing

/** App.css's tokens, the dark theme. */
const C = {
  bg: '#1B1D1A',
  raised: '#23261F',
  paper: '#EDE8DC',
  dim: '#B9B4A6',
  line: '#34372E',
  moss: '#8FA382',
  gold: '#D9B86A',
}
const FAMILY = '-apple-system, "SF Pro Text", system-ui, sans-serif'
const WIDTH = 1080
const MARGIN = 72
const CONTENT = WIDTH - MARGIN * 2
const FOOTER = 'Rider-Waite-Smith deck, 1909 · Pamela Colman Smith'

const font = (size: number, run: Run = { text: '' }, weight = run.bold ? 700 : 400): string =>
  `${run.italic ? 'italic ' : ''}${weight} ${size}px ${FAMILY}`

interface Pen {
  ctx: CanvasRenderingContext2D
  paint: boolean
  y: number
}

/** Lines of runs at a size, from the pen's y down; returns nothing, moves the pen. */
function writeRuns(pen: Pen, runs: Run[], { x = MARGIN, width = CONTENT, size, lead = 1.5, color = C.paper, weight, align = 'left' }: { x?: number; width?: number; size: number; lead?: number; color?: string; weight?: number; align?: 'left' | 'center' | 'right' }): void {
  const { ctx } = pen
  const measure: Measure = (text, run) => { ctx.font = font(size, run, weight ?? (run.bold ? 700 : 400)); return ctx.measureText(text).width }
  const lineH = size * lead
  for (const line of wrapRuns(runs, width, measure)) {
    if (pen.paint) {
      const total = line.reduce((w, r) => w + measure(r.text, r), 0)
      let cx = align === 'center' ? x + (width - total) / 2 : align === 'right' ? x + width - total : x
      const baseline = pen.y + (lineH - size) / 2 + size * 0.8
      ctx.fillStyle = color
      ctx.textBaseline = 'alphabetic'
      ctx.textAlign = 'left'
      for (const r of line) {
        ctx.font = font(size, r, weight ?? (r.bold ? 700 : 400))
        ctx.fillText(r.text, cx, baseline)
        cx += ctx.measureText(r.text).width
      }
    }
    pen.y += lineH
  }
}

function rule(pen: Pen, y: number, x = MARGIN, width = CONTENT): void {
  if (!pen.paint) return
  pen.ctx.fillStyle = C.line
  pen.ctx.fillRect(x, Math.round(y), width, 2)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** One card: the scan cropped to the deck's shape, turned when reversed, in a rounded frame. */
function drawCard(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, card: ImageCard, x: number, y: number, w: number, h: number): void {
  const r = Math.max(8, w * 0.04)
  ctx.save()
  roundRect(ctx, x, y, w, h, r)
  ctx.fillStyle = C.raised
  ctx.fill()
  ctx.clip()
  if (img && img.naturalWidth) {
    ctx.translate(x + w / 2, y + h / 2)
    if (card.reversed) ctx.rotate(Math.PI)
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
    const dw = img.naturalWidth * scale
    const dh = img.naturalHeight * scale
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh)
  }
  ctx.restore()
  ctx.save()
  roundRect(ctx, x + 1, y + 1, w - 2, h - 2, r)
  ctx.strokeStyle = C.line
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
}

/** The whole picture, drawn when `paint`, measured either way; returns its height. */
function compose(ctx: CanvasRenderingContext2D, image: ReadingImage, imgs: (HTMLImageElement | null)[], paint: boolean, height = 0): number {
  const pen: Pen = { ctx, paint, y: MARGIN }
  if (paint) {
    ctx.fillStyle = C.bg
    ctx.fillRect(0, 0, WIDTH, height)
  }

  // The wordmark and the day.
  const top = pen.y
  writeRuns(pen, [{ text: 'ORRERY' }], { size: 22, color: C.gold, weight: 700, lead: 1.2 })
  pen.y = top
  writeRuns(pen, [{ text: longDate(image.date) }], { size: 22, color: C.dim, lead: 1.2, align: 'right' })
  pen.y += 18
  writeRuns(pen, [{ text: image.heading, bold: true }], { size: 54, lead: 1.2 })
  if (image.sub) { pen.y += 4; writeRuns(pen, [{ text: image.sub }], { size: 26, color: C.dim, lead: 1.4 }) }
  pen.y += 44

  // The cards, each with its position and name under it.
  const layout = layoutCards(image.cards.length, CONTENT, { maxCard: image.cards.length === 1 ? 420 : 360, gap: image.cards.length > 3 ? 26 : 36 })
  const small = layout.cardWidth < 200
  layout.rows.forEach((_, row) => {
    const rowTop = pen.y
    let bottom = rowTop
    layout.slots.forEach((slot, i) => {
      if (slot.row !== row) return
      const card = image.cards[i]!
      const x = MARGIN + slot.x
      if (paint) drawCard(ctx, imgs[i] ?? null, card, x, rowTop, layout.cardWidth, layout.cardHeight)
      const label: Pen = { ctx, paint, y: rowTop + layout.cardHeight + 16 }
      const at = { x: x - 6, width: layout.cardWidth + 12, align: 'center' as const }
      if (card.position) { writeRuns(label, [{ text: card.position.toUpperCase() }], { ...at, size: small ? 17 : 19, color: C.moss, weight: 700, lead: 1.35 }); label.y += 2 }
      writeRuns(label, [{ text: card.name, bold: true }], { ...at, size: small ? 21 : 25, lead: 1.3 })
      if (card.reversed) writeRuns(label, [{ text: 'Reversed', italic: true }], { ...at, size: small ? 19 : 22, color: C.gold, lead: 1.4 })
      bottom = Math.max(bottom, label.y)
    })
    pen.y = bottom + (row < layout.rows.length - 1 ? 36 : 0)
  })
  pen.y += 48

  // The question.
  if (image.question) {
    writeRuns(pen, [{ text: 'THE QUESTION' }], { size: 19, color: C.moss, weight: 700, lead: 1.4 })
    pen.y += 4
    writeRuns(pen, [{ text: `“${image.question}”`, italic: true }], { size: 32, lead: 1.4 })
    pen.y += 40
  }

  rule(pen, pen.y)
  pen.y += 44

  // The reading.
  const BODY = 30
  let first = true
  for (const block of parseMarkdown(image.text)) {
    if (block.type === 'heading') {
      if (!first) pen.y += 22
      writeRuns(pen, block.runs.map((r) => ({ ...r, bold: true })), { size: block.level <= 2 ? 38 : 33, color: C.gold, lead: 1.3 })
      pen.y += 10
    } else if (block.type === 'para') {
      if (block.quote) {
        const from = pen.y
        writeRuns(pen, block.runs.map((r) => ({ ...r, italic: true })), { x: MARGIN + 30, width: CONTENT - 30, size: BODY, color: C.dim })
        if (paint) { ctx.fillStyle = C.moss; ctx.fillRect(MARGIN, from + 6, 4, pen.y - from - 12) }
      } else writeRuns(pen, block.runs, { size: BODY })
      pen.y += 20
    } else if (block.type === 'item') {
      const ind = 44
      if (paint) {
        ctx.font = font(BODY, { text: '', bold: block.marker !== '•' })
        ctx.fillStyle = block.marker === '•' ? C.moss : C.gold
        ctx.textAlign = 'right'
        ctx.textBaseline = 'alphabetic'
        ctx.fillText(block.marker, MARGIN + ind - 14, pen.y + (BODY * 1.5 - BODY) / 2 + BODY * 0.8)
        ctx.textAlign = 'left'
      }
      writeRuns(pen, block.runs, { x: MARGIN + ind, width: CONTENT - ind, size: BODY })
      pen.y += 8
    } else {
      pen.y += 10
      rule(pen, pen.y, MARGIN + CONTENT / 3, CONTENT / 3)
      pen.y += 30
    }
    first = false
  }

  // The deck, credited.
  pen.y += 30
  rule(pen, pen.y)
  pen.y += 30
  writeRuns(pen, [{ text: FOOTER }], { size: 20, color: C.dim, lead: 1.4, align: 'center' })
  return Math.ceil(pen.y + MARGIN * 0.75)
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  const img = new Image()
  img.decoding = 'async'
  img.src = src
  try { await img.decode(); return img } catch { return null }
}

/** The reading drawn as a PNG, at 2x for sharpness: waits for the fonts and the card scans before it draws. */
export async function renderReadingImage(image: ReadingImage): Promise<Blob> {
  const [imgs] = await Promise.all([Promise.all(image.cards.map((c) => loadImage(c.src))), document.fonts?.ready])
  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) throw new Error('This browser cannot draw the image')
  const height = compose(probe, image, imgs, false)
  const scale = scaleFor(WIDTH, height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(WIDTH * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot draw the image')
  ctx.scale(scale, scale)
  compose(ctx, image, imgs, true, height)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The image could not be made'))), 'image/png'))
}

/**
 * Hand the picture over: the share sheet where there is one that takes files
 * (on an iPhone, Save Image is there), otherwise a download.
 */
export async function saveImage(file: File, title: string, nav: Navigator = navigator): Promise<'shared' | 'downloaded'> {
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title })
    return 'shared'
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.rel = 'noopener'
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return 'downloaded'
}
