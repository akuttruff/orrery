# Orrery

Your transits, forecasts and birth chart, one tap each. The charts are
computed on the Mac by [astro-mcp](../astro-mcp) and drawn at once; a local
model in LM Studio then writes the reading over them, streamed in and kept.

Standalone from LM Chat: nothing here touches the chat app or its data,
though it borrows the chat app's LM Studio settings on first run and the
same chart-drawing code (`src/lib/chartWheel.ts`, `src/components/ChartWheel.tsx`,
the transit tables), copied rather than shared.

## How it works

- **Server runs the tools.** A shortcut (`Today`, `This week`, `This month`,
  `Year ahead`, `Moon`, `Birth chart`) maps to one or two astro-mcp tools
  (`server/cast.ts`). The server keeps one astro-mcp process running over
  stdio (`server/astro.ts`, started the same way LM Studio starts it, from
  `~/.lmstudio/mcp.json`) and calls them directly, so the wheel and tables
  are on screen in under a second and the model never picks a wrong tool.
- **The week is Sunday to Saturday.** A week casting is keyed to its
  Sunday whatever day it is cast on, and covers the days left in that week
  from the day of the cast: seven on a Sunday, one on a Saturday. The tool
  always gives seven days from its start, so the days past Saturday are
  trimmed off (`trimWeek` in `server/cast.ts`).
- **The model writes.** The tool's own result goes to LM Studio's
  `/api/v1/chat` with a brief (`server/prompt.ts`) that asks for a full
  paragraph per contact, explained in plain words and tied to the person's
  life, several hundred words for a day and over a thousand for a year; the
  tool's own notes on reading its fields go too. The reading streams
  to the page and is stored with the casting (`server/readings.ts`). The
  model writes on the server, so a phone that locks mid-reading loses
  nothing, and Back during a reading leaves it writing: the home screen
  lists what is in progress above the shortcuts, and another cast can be
  started meanwhile. A casting is `#/c/<id>` in the address, so the
  browser's Back and a reload both land where expected.
- **Every tap casts anew.** A tile casts the chart afresh and starts its
  reading at once, with the choices made in one panel above the tiles
  beforehand: what the reading is for, in the person's words ("I'm going
  through some anxiety today"), the kind of reading (`src/lib/styles.ts`:
  balanced, companion, coach, strategist, gentle, plain, each a sentence or
  two at the seam of the brief where the tone lives), and memory (the
  switch is Settings' default; the memories left out are remembered by the
  browser). All of it stays on the casting, so Write again and the
  questions under it keep the same frame, and the brief a reading was
  written with is shown under it. The earlier castings of that kind stay,
  so a day can hold
  several readings of the same kind and `Recast` adds one more. The home
  screen's recent list groups them by kind in the tiles' order, with each
  casting's time being its last change (`updated_at`): a reading written or a
  question asked or answered moves it to the top of its group. Long groups
  fold to four until asked.
- **The wheel's popups read too.** Hovering a planet or an aspect line on
  the wheel (a press and hold on a phone) shows its position and aspects;
  on a Today wheel each aspect's popup also carries a sentence on what that
  transit tends to bring up that day, written by the model in one short
  call beside the reading (`server/transits.ts`, the prompt in
  `src/lib/readings.ts`) and kept on the casting.
- **Ask about it.** Under every reading is a box for follow-up questions.
  Each answer is written on the server like the reading (`server/readings.ts`
  writes both) and kept with the casting (`follow_ups` table). An answer may
  call the astrology tools: the request names astro-mcp as an LM Studio
  integration (`mcp/astrology-v2`, the entry in `~/.lmstudio/mcp.json`), so
  LM Studio runs the tool calls itself for anything the casting's data does
  not cover (another day, an exact time, a return, a horary question); the
  stream reports each call and the answer lists what it looked up. LM
  Studio's chat endpoint takes a single turn, so the data, the reading and the
  questions answered so far are replayed in the prompt each time
  (`followUpRequest` in `server/prompt.ts`). One answer at a time per
  casting; deleting the casting deletes its questions.
- **The trail, the cost, the time.** Everything the model does on the way to
  its text is kept in order with it (`written.trail`): each stretch of
  thinking LM Studio streams (shown as lm-chat shows it, a dashed "Thought
  for 4.2s" row that opens to the text) and each tool call (a card with its
  arguments and result). Under the text, as under a reply in lm-chat: when
  it was finished and how long it took, the model, and LM Studio's numbers
  for the turn from its `chat.end` event (tokens per second, tokens in and
  out, thinking tokens, time to first token). Castings, questions, readings
  and answers all carry their times.

## Memory

Orrery keeps its own memories, in `memory.sqlite` beside the castings
database (`.data/` for the real instance, `.data-dev/` for `npm run dev`),
separate from lm-chat's pool. A casting read **with memory on** gets what is
known about the person in its prompt, framed as information to use only
where the chart touches it, and the page says how many memories the reading
and each answer drew on. Memory is off by default; Settings sets the default
and each casting has its own switch, plus a **Choose** list to untick
memories that should stay out of that casting's reading and answers
(`castings.memory_excluded`). Orrery's model has no tools, so the server
does the remembering: with memory on, each question asked under a reading is
also sent to the model for what it reveals about the person, small changes
included (`server/remember.ts`); what is kept is shown under the answer with
a Forget button, and the answer says when nothing new was. The Memories
screen (from Settings or the reading) lists, corrects, adds and deletes.

## Running

```
npm install
npm run dev        # http://localhost:8400, scratch database in .data-dev
npm run check      # typecheck, lint, tests
npm run deploy     # build and restart the launchd instance on :8410
```

The persistent instance is `com.amie.orrery` (launchd), served by Tailscale
at `https://<your-machine>.<your-tailnet>.ts.net:8445`. Its data lives in
`.data/orrery.sqlite`.

## Settings

Whose chart (name, birth date and time, birthplace) and who writes (LM
Studio address, API token, model, reasoning level). The first run copies the
LM Studio settings from LM Chat's database when it is there.
