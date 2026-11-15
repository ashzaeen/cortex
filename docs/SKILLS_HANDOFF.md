# Skills handoff (#51)

Written for the Modes agent and for whoever mounts the Skills UI. Delete when #51 closes.

## What exists
- Backend: `apps/backend/skills/{kit,world,translate,immersion,proactive,coach,nudges,autobrief,people_search,skills_ask,registry,skill_ticker}.py`, routes in `api/skills_routes.py` (its own router, included from `main.py`), model tasks in `core/skill_prompts.py` and `core/skill_mock.py`.
- Mock: `apps/dashboard/mock/skills.mjs` (hooked into `engine.mjs`; also runs in `/demo`).
- Dashboard: `lib/skills-api.ts`, `lib/useSkillEvents.ts`, `components/brass/skills/*`, preview page `app/demo/skills`.

## Shared files I touched (one small hook each)
- `skills/ask.py`: after the `mode_ask` route, calls `skills_ask.route` (got it, contact search, what is this, translate, name things, quiz me, coach me).
- `main.py`: includes `skills_router`, starts `skill_ticker`.
- `core/events.py`: five event types (`nudge.due`, `brief.due`, `brief.call`, `skill.offer`, `coach.updated`). `core/llm.py` and `core/llm_mock.py`: one `skill()` method each.

## To mount in the Home screen (after the Modes UI is committed)
1. Add a "Skills" segment at the right end of the dock that sets `sheet = "skills"`.
2. Render `<SkillsSheet open onClose data refresh onOpenMoment onOpenPeople onOpenWaiting />` and, once, `<SkillsLive />` inside the toast provider.
3. Optionally replace the hand-written types in `lib/skills-api.ts` with the generated ones (`npm run types`).
4. The Modes tools rail has Brief, Follow-Up and Waiting On entries; they can stay as they are.

## Gotchas
- Glasses source with no fresh glasses frame (2 minutes) is `409 no_glasses`; the UI then offers the camera.
- Proactive nudge is off by default; nudges default to quiet 22:00 to 08:00, cap 3 a day.
