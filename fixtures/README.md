# fixtures

Fake seed data shared by every area. **No real personal data**: fake names, `.example` email domains, placeholder SVG snapshots. `make check` validates every file against `contracts/schemas/` and checks that every person, moment and action id it references exists.

| File | Schema | Contents |
| --- | --- | --- |
| `moments.json` | Moment | Earlier days (Nov 11 to 13, 2026): a career fair, keys, a meeting, a lecture, a shopping note |
| `people.json` | Person | Sam Rivera (Globex), Dana Kim (Initech), Prof. Morgan Lee |
| `promises.json` | Promise | One waiting on (overdue), one I owe |
| `actions.json` | Action | One sent follow-up email |
| `receipts.json` | Receipt | Receipt for that email |
| `modes.json` | Mode | The four mode presets; Focus active |
| `snapshots/` | - | Placeholder images |

**Priya is not seeded.** The demo creates her live ("This is Priya from Acme"). The Priya examples in `contracts/openapi.yaml` (`mom_live_*`, `per_priya`) show what the live flow should produce. Whether to seed earlier Priya history is the demo owner's call (see docs/RISKS.md).

Recall questions for testing T0-2: "Where did I leave my keys?", "What did Sam promise me?", "When are the CSE 3310 demos?", "What do I owe Dana?"

When you change fixtures, keep them valid (`make check`) and mention `area:demo` in the PR.
