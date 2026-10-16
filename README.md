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
- **The model writes.** The tool's own result goes to LM Studio's
  `/api/v1/chat` with a short brief (`server/prompt.ts`); the reading streams
  to the page and is stored with the casting (`server/readings.ts`). The
  model writes on the server, so a phone that locks mid-reading loses
  nothing, and Back during a reading leaves it writing: the home screen
  lists what is in progress above the shortcuts, and another cast can be
  started meanwhile. A casting is `#/c/<id>` in the address, so the
  browser's Back and a reload both land where expected.
- **One cast per period.** Today's chart is cast once a day and reopened
  from the store; `Recast` throws it away and casts again.
- **Ask about it.** Under every reading is a box for follow-up questions.
  Each answer is written on the server like the reading (`server/readings.ts`
  writes both) and kept with the casting (`follow_ups` table). LM Studio's
  chat endpoint takes a single turn, so the data, the reading and the
  questions answered so far are replayed in the prompt each time
  (`followUpRequest` in `server/prompt.ts`). One answer at a time per
  casting; deleting the casting deletes its questions.

## Memory

Orrery keeps its own memories, in `memory.sqlite` beside the castings
database (`.data/` for the real instance, `.data-dev/` for `npm run dev`),
separate from lm-chat's pool. A casting read **with memory on** gets what is
known about the person in its prompt, framed as information to use only
where the chart touches it, and the page says how many memories the reading
drew on. Memory is off by default; Settings sets the default and each
casting has its own switch. Orrery's model has no tools, so the server does
the remembering: with memory on, each question asked under a reading is also
sent to the model for the durable facts it reveals (`server/remember.ts`),
which are saved and shown under the answer with a Forget button. The
Memories screen (from Settings or the reading) lists, corrects, adds and
deletes.

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
