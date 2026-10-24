#!/bin/sh
# Rebuild and restart the persistent instance (launchd: com.amie.orrery),
# the one Tailscale serves. `npm run dev` is unaffected.
#
# A restart cuts off a reading being written, so this refuses while one is
# in flight. FORCE=1 npm run deploy restarts anyway.
set -e
cd "$(dirname "$0")/.."
PORT=8410

if [ "${FORCE:-}" != 1 ]; then
  busy=$(curl -sS -m 2 "http://127.0.0.1:$PORT/api/busy" 2>/dev/null || true)
  if [ -n "$busy" ] && ! printf '%s' "$busy" | grep -q '"readings":0,"casts":0'; then
    echo "orrery: busy right now ($busy); a restart would cut that off." >&2
    echo "        Wait for it to finish, or run: FORCE=1 npm run deploy" >&2
    exit 1
  fi
fi

npm run build
launchctl kickstart -k "gui/$(id -u)/com.amie.orrery"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sfo /dev/null "http://127.0.0.1:$PORT/"; then echo "orrery: deployed"; exit 0; fi
  sleep 1
done
echo "orrery: restarted, but not answering on :$PORT -- see ~/Library/Logs/com.amie.orrery.log" >&2
exit 1
