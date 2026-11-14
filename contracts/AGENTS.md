# contracts: agent notes

- **Owns:** `openapi.yaml` and `schemas/`. Owner: @ClosetCoderSad, backend lead (`area:contracts`).
- **Run alone:** `make mock` serves the whole API from this file; `make lint test` validates it.
- **Rules:** every change needs the `contract-change` label, a list of affected areas, and a mention of each owner. Update `fixtures/` and the `x-examples` block in the same PR. Never rename or remove a field silently.
- **Shared examples:** `x-examples` at the top of `openapi.yaml` holds the Ash entities, reused through YAML aliases (`*Ash`). Define an anchor before you use it.
- **Done when:** `make check` passes and the mock returns the new shape.
