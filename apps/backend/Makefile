# apps/backend: FastAPI memory API and agent brain (ADR 0001, ADR 0002).
# The root Makefile calls setup / lint / test / seed here. test and lint create the venv on demand,
# so CI (which only runs `make check`) installs what it needs. Without Python 3.11+ they skip locally.

ifeq ($(OS),Windows_NT)
  PY_SYS ?= python
  VENV_PY := .venv/Scripts/python.exe
else
  PY_SYS ?= python3
  VENV_PY := .venv/bin/python
endif
PORT ?= 8000
STAMP := .venv/.installed
HAVE_PY := $(shell $(PY_SYS) -c "import sys; print(int(sys.version_info >= (3, 11)))" 2>/dev/null)

.PHONY: setup dev test lint seed seed-reset clean

$(STAMP): requirements.txt requirements-dev.txt
	$(PY_SYS) -m venv .venv
	$(VENV_PY) -m pip install --quiet --upgrade pip
	$(VENV_PY) -m pip install --quiet -r requirements-dev.txt
	@$(VENV_PY) -c "open('$(STAMP)', 'w').write('ok')"

setup: ## Create .venv and install dependencies
ifeq ($(HAVE_PY),1)
	@$(MAKE) --no-print-directory $(STAMP)
	@echo "backend setup: done. Copy apps/backend/.env.example to apps/backend/.env (or fill the root .env)."
else
	@echo "backend setup: skipped, Python 3.11+ not found ($(PY_SYS))."
endif

dev: $(STAMP) ## Run the API on http://localhost:8000 with reload
	$(VENV_PY) -m uvicorn main:app --reload --host 0.0.0.0 --port $(PORT)

test: ## Contract tests and demo checklist done-when tests (offline: mongomock + mock LLM)
ifeq ($(HAVE_PY),1)
	@$(MAKE) --no-print-directory $(STAMP)
	$(VENV_PY) -m pytest -q
else
	@echo "backend test: skipped, Python 3.11+ not found locally. CI still runs these tests."
endif

lint: ## ruff
ifeq ($(HAVE_PY),1)
	@$(MAKE) --no-print-directory $(STAMP)
	$(VENV_PY) -m ruff check .
else
	@echo "backend lint: skipped, Python 3.11+ not found locally. CI still runs it."
endif

seed: $(STAMP) ## Load fixtures/*.json into the configured store (upsert by id)
	$(VENV_PY) -m scripts.seed

seed-reset: $(STAMP) ## Delete all backend data, then load fixtures
	$(VENV_PY) -m scripts.seed --reset

clean:
	$(PY_SYS) -c "import shutil; shutil.rmtree('.venv', ignore_errors=True)"
