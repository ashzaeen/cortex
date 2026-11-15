# Cortex repo commands. Every target works while areas are stubs.
# Areas plug in by adding their own apps/<area>/Makefile with the same target names.
NODE ?= node
export REDOCLY_SUPPRESS_UPDATE_NOTICE := true
export REDOCLY_TELEMETRY := off
TOOLS := node_modules/.package-lock.json

.PHONY: help setup dev mock test lint check seed status github-setup

help: ## List targets
	@$(NODE) -e "require('fs').readFileSync('Makefile','utf8').split('\n').forEach(l=>{const m=l.match(/^([a-z-]+):.*## (.*)/);if(m)console.log(m[1].padEnd(14)+m[2])})"

$(TOOLS): package.json package-lock.json
	npm ci --no-audit --no-fund

setup: $(TOOLS) ## Install repo tooling and each area's dependencies
	@$(NODE) scripts/areas.mjs setup
	@echo "setup: done. Copy .env.example to .env and fill in only the keys your area needs."

dev: $(TOOLS) ## Stateful mock on :4010 + dashboard on :3000 (MOCK=prism for Prism; CORTEX_API_URL for a real backend)
	@$(NODE) scripts/dev.mjs

mock: $(TOOLS) ## Mock API only, from contracts/openapi.yaml
	npx prism mock contracts/openapi.yaml --port 4010 --host 127.0.0.1

lint: $(TOOLS) ## Lint the contract, check repo hygiene, then lint each area
	npx redocly lint contracts/openapi.yaml
	@$(NODE) scripts/check-repo.mjs
	@$(NODE) scripts/areas.mjs lint

test: $(TOOLS) ## Contract tests (schemas, fixtures, ids), status guard, then each area's tests
	@$(NODE) scripts/check-contracts.mjs
	@$(NODE) scripts/check-status.mjs
	@$(NODE) scripts/areas.mjs test

check: lint test ## Everything CI runs; must pass after `git pull` and before every push
	@echo "check: all passed"

seed: $(TOOLS) ## Validate fixtures and load them into the backend (when it exists)
	@$(NODE) scripts/seed.mjs

status: ## Demo checklist status and open checklist issues
	@$(NODE) scripts/status.mjs

github-setup: ## Create or update labels and milestones (needs gh)
	@$(NODE) scripts/setup-github.mjs
