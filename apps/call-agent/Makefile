# apps/call-agent targets, called by the root Makefile (scripts/areas.mjs).
# test and lint need no npm install: the Cortex client and its tests import no LiveKit code.
# Real calls need `make setup`, a Chert line, our LiveKit project and a verified iPhone (see README.md).
AGENT := agent

.PHONY: setup test lint

setup:
	cd $(AGENT) && npm ci --no-audit --no-fund

test:
	cd $(AGENT) && node --test cortex.test.mjs

lint:
	cd $(AGENT) && node --check cortex.mjs && node --check cortex-tools.mjs && node --check vision.mjs && node --check agent.mjs && node --check greet.mjs && node --check face.mjs && node --check chert-rooms.mjs
