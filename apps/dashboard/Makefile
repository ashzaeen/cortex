# apps/dashboard targets, called by the root Makefile (scripts/areas.mjs).
DEPS := node_modules/.package-lock.json

.PHONY: setup dev mock test lint

$(DEPS): package.json package-lock.json
	npm ci --no-audit --no-fund

setup: $(DEPS)

dev: $(DEPS)
	npm run dev

mock:
	node mock/server.mjs

test: $(DEPS)
	node mock/test.mjs
	node mock/profile-test.mjs
	node scripts/build-tokens.mjs --check

lint: $(DEPS)
	npx tsc --noEmit
