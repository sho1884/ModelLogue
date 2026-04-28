# tests/e2e — Playwright smoke tests

Automated browser tests that drive ModelLogue end-to-end with **mock
AI enabled**, so they cost no Gemini quota and can run on every push.

## What's covered

- `smoke-app-shell.spec.ts` — app loads, model-type selector lists
  all three registered types, scenario runner is visible
- `smoke-state-machine.spec.ts` — runs scenario 01 via the
  ScenarioRunner panel, asserts the diagram image appears
- `smoke-requirement.spec.ts` — switches model type to Requirement,
  runs scenario 08, asserts the Requirement list tab has the
  expected 4 rows
- `smoke-process.spec.ts` — switches to Process, runs scenario 10,
  asserts the 5 process-specific tabs exist and Scenarios populates

## Running

```bash
# from project root
npm run test:e2e            # headless
npm run test:e2e:headed     # with visible browser (needs WSLg or X)
```

The runner reuses an already-running `npm run dev` if one is up on
port 5173; otherwise it spins one up with `VITE_USE_MOCK_AI=true`.

## First-time setup (WSL2 Ubuntu)

After `npm install` the Chromium binary is downloaded automatically
(`npx playwright install chromium`). It needs two system libs:

```bash
sudo apt-get install -y libgbm1 libxkbcommon0
```

If the test launcher fails with `libgbm.so.1 => not found`, that's the
fix. Other distros: equivalent packages.

## Real-AI debug specs

Real-AI tests live in `tests/e2e-live/` (gitignored). Use them sparingly
— each call hits Gemini. Run with:

```bash
npm run test:e2e:live
```

These exist only locally; commit nothing under `tests/e2e-live/` to
git.
