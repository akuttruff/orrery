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
  nothing.
- **One cast per period.** Today's chart is cast once a day and reopened
  from the store; `Recast` throws it away and casts again.

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
