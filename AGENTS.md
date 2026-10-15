# Agent working notes

- `src/server.js` serves a local admin portal and read-only `/api/state`. `src/operator.js` runs an OpenAI Responses function-call loop with Playwright browser tools from `src/browser.js`.
- Browser tools use visible roles and labels; no model-supplied arbitrary JavaScript or filesystem action. The browser starts at and stays within the configured local portal URL.
- Each tool action saves a real screenshot and text view to `artifacts/<run-id>/`; the final trace records model response, actions and page state. The model is real only when `OPENAI_API_KEY` is provided.
- State is one local JSON file with revision checks and an audit log. Copy `fixtures/starter.json` to `workspace.json` for a fresh run. Use one portal process per file.
- Grading expectations belong outside the agent's browser context. Offline tests use scripted tool choices and must not be described as model proof.
- No Firedrill integration until the new official interface is qualified.
