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
- **A week and a month list every transit.** The forecast tool picks
  eight headlines for a week, the contacts exact inside it first, so the
  slow planets in orb all week fall off a busy one; for a month it keeps
  twelve by weight alone, so there the slow backdrop fills the slots and
  the month's dated events, mostly Mars, fall off instead. Both castings
  therefore also run the ephemeris scan (`list_upcoming_transits`) over
  the same days, with the planets the forecast itself ranks (a week every
  planet but the Moon, a month Mars outward), and keep it on the result as
  `week_transits` or `month_transits`. The table shows all of them in two
  groups, the period's events (exact inside it, in date order) and its
  backdrop (in orb without perfecting, heaviest first, folded past the
  first four), and the brief asks the model for the same. The forecast
  still casts if the scan fails.
- **Read it again as.** Under the questions, the kinds of reading again:
  a tap casts the same kind anew in that tone, with the note and memory
  choices carried over, and the earlier casting stays beside it.
- **Every transit has a weight.** The tables' last column is the
  forecasts' own ranking (astro-mcp's `forecast.py`): the transiting
  planet's slowness (Mercury 0.5 up to Pluto 5), doubled on the Sun, Moon,
  Ascendant, MC or chart ruler, times the aspect (conjunction and
  opposition 1, square 0.9, trine 0.7, sextile 0.5). A forecast's rows
  carry the tool's number; a day's transit chart comes unweighted, so
  `src/lib/weight.ts` works it out the same way, with the Moon at 0.2
  since the tool never ranks her. Pluto on the Sun is 10 and fills the bar.
- **The model writes.** The tool's own result goes to LM Studio's
  `/api/v1/chat` with a brief (`server/prompt.ts`) that asks for a full
  paragraph per contact, explained in plain words and tied to the person's
  life, several hundred words for a day and over a thousand for a year; the
  tool's own notes on reading its fields go too. The reading streams
  to the page and is stored with the casting (`server/readings.ts`). The
  model writes on the server, so a phone that locks mid-reading loses
  nothing, and Back during a reading leaves it writing: the home screen
  lists what is in progress above the shortcuts, and another cast can be
  started meanwhile. Stop keeps what was written and says it was stopped;
  a model that never finishes is given up on after ten minutes
  (`WRITE_TIMEOUT_MS` in `server/readings.ts`), so a hang cannot hold a
  casting, its questions or a deploy forever. A casting is `#/c/<id>` in the address, so the
  browser's Back and a reload both land where expected.
- **Every tap casts anew.** A tile opens a popup for the choices a reading
  is made with, and its button casts the chart afresh and starts the reading
  at once: what the reading is for, in the person's words ("I'm going
  through some anxiety today"), the kind of reading (`src/lib/styles.ts`:
  balanced, companion, coach, strategist, gentle, plain, each a sentence or
  two at the seam of the brief where the tone lives; a popup over each chip
  says what that reading is like and what the model is told, and a phone
  reads the chosen one's line under the row), and memory (the
  switch is Settings' default; the memories left out are remembered by the
  browser). All of it stays on the casting, so Write again and the
  questions under it keep the same frame, and the brief a reading was
  written with is shown under it. The earlier castings of that kind stay,
  so a day can hold
  several readings of the same kind and `Recast` adds one more. The home
  screen's recent list groups them by kind in the tiles' order, with each
  casting's time being its last change (`updated_at`): a reading written or a
  question asked or answered moves it to the top of its group. Long groups
  fold to four until asked. On a wide window the castings sit in a sidebar
  instead, every kind a section with a + to cast another; a star on a row
  keeps that casting at the top of its kind, and a bin removes it, with
  its reading and questions.
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

The persistent instance is `com.sam.orrery` (launchd), served by Tailscale
at `https://<your-machine>.<your-tailnet>.ts.net:8445`. Its data lives in
`.data/orrery.sqlite`.

## Local models

Everything the model does happens on this machine, through
[LM Studio](https://lmstudio.ai): no cloud service, no account.

1. **LM Studio 0.4 or newer**, since Orrery talks to its `/api/v1/chat`
   endpoint. In the **Developer** tab, start the server. It listens on
   `http://127.0.0.1:1234`, which is Orrery's default address.
2. **A model.** Orrery is written and tested against `qwen/qwen3.8-27b`
   (Qwen3.8 27B, 8-bit, on a 128 GB M4 Max). Any chat model LM Studio can
   load works; a smaller one writes faster and shallower. Load it in LM
   Studio, then pick it in Settings, where the loaded models are listed
   first. Give it a context length of at least 16K: a year's forecast with
   its data runs to a few thousand tokens, and the model thinks before it
   writes.
3. **Reasoning.** Settings offers LM Studio's reasoning levels. `low` is
   the default and the sweet spot: the model thinks for a few thousand
   tokens before a reading, which the token ceilings in `server/prompt.ts`
   leave room for. `off` is faster and flatter. The popup sentences for a
   day's transits are always written without thinking.
4. **A token**, only if LM Studio's **Require Authentication** is on.
   Create one under **Manage Tokens** and paste it in Settings; it is kept
   on the server and never sent to the browser. Authentication is required
   for the follow-up questions' tool calls (below).
5. **astro-mcp**, the ephemeris. Orrery starts it itself for every cast,
   over stdio, using the command written for it in `~/.lmstudio/mcp.json`
   under the name `astrology-v2` (falling back to
   `~/Code/astro-mcp/start-server.sh`), so the one entry serves both LM
   Studio and Orrery. Follow-up questions may also call it through LM
   Studio: enable **Allow calling servers from mcp.json** in LM Studio's
   Developer settings, and the answer can look up another day, a return
   chart or a horary question on its own.

What goes to the model is the tool's own JSON and a brief; the readings are
written from that and nothing else. The first run copies the LM Studio
address, token and model from LM Chat's database when it is on this
machine, so there is nothing to type twice.

## Settings

Whose chart (name, birth date and time, birthplace) and who writes (LM
Studio address, API token, model, reasoning level), plus whether readings
draw on memory by default.
