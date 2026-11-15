#!/bin/sh
# Tests connector.sh and the agent's start.sh against a stub `chert` (no network, no Chert account).
# Run: sh connector/connector.test.sh   (from apps/call-agent)
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0
check() { if [ "$1" = ok ]; then echo "  ok   $2"; else echo "  FAIL $2"; fail=1; fi; }
has() { grep -q -- "$1" "$2" && echo ok || echo no; }
yes_if() { if "$@"; then echo ok; else echo no; fi; }

# ---- stub chert: its state is in the folder named by $STATE
mkdir -p "$tmp/bin" "$tmp/state"
cat > "$tmp/bin/chert" <<'STUB'
#!/bin/sh
case "$1" in
  whoami) if [ -f "$STATE/signed" ]; then echo '{"signed_in":true}'; else echo '{"signed_in":false}'; fi ;;
  login)
    if [ -f "$STATE/login_fails_once" ]; then rm "$STATE/login_fails_once"; echo "stub: link and code (this attempt fails)"; exit 4; fi
    echo "stub: open https://example.invalid/activate and enter ABCD-1234"; touch "$STATE/signed" ;;
  doctor) echo "stub: doctor $*"; exit 2 ;;
  dev)
    echo "stub: dev started $*"
    if [ -f "$STATE/dev_exits" ]; then exit 3; fi
    trap 'echo "stub: dev released the line"; exit 0' TERM INT
    while :; do sleep 1; done ;;
esac
STUB
chmod +x "$tmp/bin/chert"

wait_for() { # wait_for <pattern> <file> <tries of 0.2 s>
  i=0
  while [ "$i" -lt "$3" ]; do grep -q -- "$1" "$2" && return 0; sleep 0.2; i=$((i + 1)); done
  return 1
}
run_connector() { # run_connector <logfile>: in the background, with the stub on PATH
  env -i PATH="$tmp/bin:$PATH" STATE="$tmp/state" CHERT_HOME="$tmp/home" RETRY_SECONDS=1 \
    LIVEKIT_URL=wss://example.invalid LIVEKIT_API_KEY=xxx-test-key LIVEKIT_API_SECRET=xxx-test-secret AGENT_NAME=cortex-test \
    sh "$here/connector/connector.sh" > "$1" 2>&1 &
  cpid=$!
}

echo "connector: refuses to start without its variables"
env -i PATH="$PATH" CHERT_HOME="$tmp/home" sh "$here/connector/connector.sh" > "$tmp/out0.txt" 2>&1; rc=$?
check "$(yes_if [ "$rc" -eq 1 ])" "exits 1"
check "$(has 'LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET AGENT_NAME' "$tmp/out0.txt")" "names every missing variable"
env -i PATH="$PATH" CHERT_HOME="$tmp/home" LIVEKIT_URL=wss://YOUR_HOST LIVEKIT_API_KEY=xxx-test-key LIVEKIT_API_SECRET=xxx-test-secret AGENT_NAME=a \
  sh "$here/connector/connector.sh" > "$tmp/out0b.txt" 2>&1
check "$(has 'LIVEKIT_URL' "$tmp/out0b.txt")" "treats a YOUR_ placeholder as missing"

echo "connector: signs in (retrying once), runs doctor, then dev, and stops gracefully on SIGTERM"
touch "$tmp/state/login_fails_once"
log="$tmp/out1.txt"
run_connector "$log"
wait_for "stub: dev started" "$log" 100
check "$(has 'stub: dev started dev --agent cortex-test' "$log")" "chert dev gets --agent from AGENT_NAME"
check "$(has 'sign-in did not finish (exit 4)' "$log")" "a failed sign-in is retried, not fatal"
check "$(has 'stub: doctor doctor --agent cortex-test' "$log")" "doctor runs before dev"
kill -TERM "$cpid"
i=0
while kill -0 "$cpid" 2>/dev/null && [ "$i" -lt 50 ]; do sleep 0.2; i=$((i + 1)); done
check "$(yes_if sh -c "! kill -0 $cpid 2>/dev/null")" "connector exits after SIGTERM"
check "$(has 'stub: dev released the line' "$log")" "SIGTERM reached chert and it released the line"
check "$(has 'connector: stopped.' "$log")" "connector says it stopped"
check "$(yes_if [ "$(grep -c 'stub: doctor' "$log")" -eq 1 ])" "doctor ran exactly once"

echo "connector: when chert dev exits it is started again, without signing in again"
touch "$tmp/state/dev_exits"
log2="$tmp/out2.txt"
run_connector "$log2"
sleep 4
kill -TERM "$cpid" 2>/dev/null
wait "$cpid" 2>/dev/null
check "$(yes_if [ "$(grep -c 'stub: dev started' "$log2")" -ge 2 ])" "dev is started again after it exits"
check "$(has 'chert dev exited (3)' "$log2")" "the exit code is reported"
check "$(yes_if [ "$(grep -c 'open https://example.invalid' "$log2")" -eq 0 ])" "already signed in: no second login"

echo "agent start.sh: refuses to start without its variables"
env -i PATH="$PATH" sh "$here/agent/start.sh" > "$tmp/out3.txt" 2>&1; rc=$?
check "$(yes_if [ "$rc" -eq 1 ])" "exits 1"
check "$(has 'LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET GOOGLE_API_KEY AGENT_NAME CORTEX_API_URL' "$tmp/out3.txt")" "names every missing variable"

if [ "$fail" -eq 0 ]; then echo "connector tests: OK"; else echo "connector tests: FAILED"; exit 1; fi
