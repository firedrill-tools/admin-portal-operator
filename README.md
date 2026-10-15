# Admin portal operator

This repository contains a small local people directory and an OpenAI Responses agent that operates it through actual Playwright browser actions. The model can inspect the page, click visible links/buttons, fill labelled fields, and choose labelled options. Every action saves a full-page screenshot and a text view. The portal persists user records and an audit log in a synthetic JSON workspace.

## Run

Requires Node.js 24, npm, Playwright Chromium and an OpenAI API key for an agent run.

```sh
npm ci
npx playwright install chromium
cp fixtures/starter.json workspace.json
npm run portal
```

In another terminal:

```sh
OPENAI_API_KEY=... npm run operate -- \
  'Move Mira Chen at mira@harbor.example to Incident Operations and set her role to manager. Verify the saved record.'
npm test
```

The portal binds `127.0.0.1:8787`. The operator is limited to that local origin, starts from the directory page, and has an 18-round action cap. It writes `artifacts/<run-id>/trace.json` and `step-*.png`. Inspect the final page, trace and `workspace.json` audit entry; a model's final sentence alone is not proof of a successful change. Copy the fixture to reset. Run one portal process per workspace file.

The offline test drives the same Playwright tool loop with scripted choices, asserts the exact record change, and verifies real screenshot files. It does not claim that the OpenAI model selected those actions. Without an API key, the agent command stops before opening the browser. No live model run has been performed here. The Firedrill connection will be added against the new official release only. No public license has been selected.

Explore related applications in the [Firedrill example catalog](https://github.com/firedrill-tools/firedrill-example-catalog). Product and setup references: [Firedrill](https://firedrill.run/) and the [official developer documentation](https://docs.firedrill.run/). Use documentation matching the qualified release; this repository records its current integration limits above.
