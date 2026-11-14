# scripts: agent notes

- **Owns:** repo tooling, the Makefile and CI (`area:infra`). Owner: @ashzaeen.
- **Run alone:** `make check`; each script also runs as `node scripts/<name>.mjs`.
- **Contract:** every Makefile target must succeed while areas are stubs, printing a clear message instead of failing. Areas plug in through their own `apps/<area>/Makefile`.
- **Done when:** `make check` passes locally and in CI, on a fresh clone after `make setup`.
- **Rules:** cross-platform Node only (no bash-only features in recipes); pin dependency versions; checks must never fake a pass.
