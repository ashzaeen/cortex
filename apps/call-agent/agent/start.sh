#!/bin/sh
# Hosted entry point. The agent only takes the LiveKit worker path when all three LIVEKIT_ values are real;
# without them it would sit waiting for a laptop's `chert dev`, silently. So check first and say what is missing.
missing=""
for name in LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET GOOGLE_API_KEY AGENT_NAME CORTEX_API_URL; do
  eval "value=\${$name:-}"
  case "$value" in ""|YOUR_*|wss://YOUR_*) missing="$missing $name" ;; esac
done
if [ -n "$missing" ]; then
  echo "call-agent: not starting. Set these variables on this Railway service:$missing"
  # Even so, prove the image works: the native LiveKit library must load on this base image.
  node -e "import('@livekit/rtc-node').then(() => console.log('call-agent: image check OK (native LiveKit library loads)')).catch(e => console.log('call-agent: image check FAILED: ' + e.message))"
  exit 1
fi
if [ -z "${CORTEX_API_KEY:-}" ]; then
  echo "call-agent: CORTEX_API_KEY is not set. That is only fine if the Cortex API is open (it answers 401 otherwise)."
fi
exec node agent.mjs start
