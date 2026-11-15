#!/bin/sh
# Keeps `chert dev` running for the hosted call agent, and signs in when it has to.
#  - Not signed in: runs `chert login --device`, which prints a link and a code in the logs. The Chert project
#    owner or admin opens the link and approves. The sign-in is kept in CHERT_HOME (a volume), so this happens
#    once, not on every restart.
#  - Signed in: `chert dev --agent $AGENT_NAME`. If it exits (line busy, paused, network), try again in 20 s.
#  - SIGTERM/SIGINT (a redeploy) is passed on to chert and we wait for it: Chert asks never to SIGKILL it,
#    because the line stays held until its lease lapses.
# Needs LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET (the same project the agent uses) and AGENT_NAME.
RETRY_SECONDS="${RETRY_SECONDS:-20}"
CHERT_HOME="${CHERT_HOME:-/data/chert}"
export CHERT_HOME
mkdir -p "$CHERT_HOME" 2>/dev/null

missing=""
for name in LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET AGENT_NAME; do
  eval "value=\${$name:-}"
  case "$value" in ""|YOUR_*|wss://YOUR_*) missing="$missing $name" ;; esac
done
if [ -n "$missing" ]; then
  echo "connector: not starting. Set these variables on this Railway service:$missing"
  # Even so, prove the image works: the Chert CLI must be installed.
  if chert --version >/dev/null 2>&1; then echo "connector: image check OK ($(chert --version 2>&1 | head -1))"; else echo "connector: image check FAILED (chert is not installed)"; fi
  exit 1
fi

pid=""
stopping=0
on_stop() {
  stopping=1
  echo "connector: stopping. Waiting for chert to release the line."
  [ -n "$pid" ] && kill -TERM "$pid" 2>/dev/null
}
trap on_stop TERM INT

# Run a command in the background so the trap can fire, and wait for it. Sets $rc.
run() {
  "$@" &
  pid=$!
  wait "$pid"
  rc=$?
  # A trapped signal interrupts the first wait: wait again so chert can finish releasing the line.
  while kill -0 "$pid" 2>/dev/null; do wait "$pid"; rc=$?; done
  pid=""
}

pause() { sleep "$RETRY_SECONDS" & pid=$!; wait "$pid"; pid=""; }

signed_in() { chert whoami --json 2>/dev/null | grep -q '"signed_in":true'; }

checked=0
while [ "$stopping" -eq 0 ]; do
  if ! signed_in; then
    echo "connector: not signed in to Chert. Open the link below as the project owner or admin and approve this server."
    run chert login --device
    if [ "$rc" -ne 0 ]; then
      [ "$stopping" -eq 1 ] && break
      echo "connector: sign-in did not finish (exit $rc). A new code follows in ${RETRY_SECONDS}s."
      pause
      continue
    fi
  fi
  if [ "$checked" -eq 0 ]; then
    checked=1
    echo "connector: chert doctor (the model check only knows OpenAI keys and fails for our Gemini agent; ignore that one)"
    run chert doctor --agent "$AGENT_NAME"
    [ "$stopping" -eq 1 ] && break
  fi
  echo "connector: chert dev --agent $AGENT_NAME"
  run chert dev --agent "$AGENT_NAME"
  [ "$stopping" -eq 1 ] && break
  echo "connector: chert dev exited ($rc). Trying again in ${RETRY_SECONDS}s."
  pause
done
echo "connector: stopped."
exit 0
