# fixtures: agent notes

- **Owns:** seed data used by every area and by the demo (`area:demo`).
- **Run alone:** `make check` validates every file against `contracts/schemas/` and checks that ids resolve.
- **Contract:** each file is a JSON array of one entity type (see README.md). Schema changes start in `contracts/`.
- **Done when:** `make check` passes, and each recall question in README.md has exactly one clear source moment.
- **Rules:** no real people, emails, faces or photos. Placeholder snapshots only.
