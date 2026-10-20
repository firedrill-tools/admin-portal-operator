# Firedrill agent-first integration

The optional toolchain pins released `@firedrill-run/cli` and `@firedrill-run/sdk` **2.2.2** (October 19, 2026), Node 22+. The app retains its locked OpenAI and Playwright dependencies.

## Set up Firedrill

From the repository root, install this application's locked dependencies and the optional simulation clients:

```sh
npm ci
npx playwright install chromium
npm ci --prefix firedrill --ignore-scripts --no-audit --no-fund
```

Sign in and choose the Firedrill project and environment once:

```sh
npx firedrill-run init
```

Complete browser authorization when prompted. Initialization writes `firedrill.config.json` in this repository; it does not run the AI agent. Installation choices are optional: skip duplicate SDK/client installation if you are using the locked `firedrill/` toolchain above. Keep this application's runtime requirements from the root README; the clients' Node.js minimum does not replace them.

Automation uses protected `FIREDRILL_TOKEN`, `FIREDRILL_PROJECT_ID`, `FIREDRILL_ENVIRONMENT_ID`. Model operations independently need `OPENAI_API_KEY` and an enabled `OPENAI_MODEL` or recipe model parameter. Do not put credentials in recipes.

After scope and provider budget are authorized:

```sh
node firedrill/simulate.mjs --preview
node firedrill/simulate.mjs
```

The sequential bounded recipe includes two native operator tasks and one model-free busy-directory inspection. The adapter initializes a hash-validated private fictional JSON copy, starts the actual loopback Express portal on an ephemeral port, and calls the real `runOperator`. Inspection opens the real restricted Chromium session, captures actual page observations/PNG, and makes no model call. No browser/client/model injection or scripted production fallback is added.

Each attempt retains private `.runs/firedrill/attempt-*` state and `invocation.json` mapping outer run/attempt/scenario IDs before application dispatch. Operator/CI credentials are removed from the child environment. Only explicit bounded case/action/task input and optional model configuration are accepted; controller assessments and unsupported Tool bindings are rejected. Normal operator permissions remain restricted to the fictional local portal. A provider final answer does not verify business effects: compare actual before/after state and original audit, and inspect the operator trace. A later error cannot roll back an earlier save.

The owned browser and portal are closed in `finally`, including key preflight failure. The driver retains actual failure reports/partial state. Existing browser origin restrictions, request/output bounds and native cancellation remain in place. Local process cleanup does not prove provider cancellation or billing completion. Output paths/screenshots are local evidence, **not uploaded Firedrill artifacts**. A new attempt creates fresh state; it never resets earlier evidence.

## Offline verification

These checks are optional when getting started; they do not authorize an account or run a paid model:

```sh
node firedrill/node_modules/@firedrill-run/cli/bin/firedrill.mjs validate firedrill/scenario.json --json --non-interactive
npm test --prefix firedrill
```

The saved recipe is an observation/exploration example, not a claim of agent correctness. It has no Firedrill rubric or CI gate. Execution success and any application-owned checks are distinct from a scored assessment. Local evidence paths are not uploaded captures; the evidence and proof limits described in this guide remain in effect.

## MCP and recovery

Configure remote OAuth operator MCP at **https://mcp.firedrill.run/mcp** using [host setup](https://docs.firedrill.run/guides/coding-agents). MCP prepares, queues and inspects; the local SDK/CLI executes the command target. Host OAuth and execution login are separate. Use `--run BATCH_ID` to attach queued work, `--resume OPERATION_ID` after uncertainty, and `--result BATCH_ID` to read retained results. Preserve SDK journals and local evidence. These scripts retain public SDK diagnostics and whole-batch exit status; a new simulation starts new work.

CI and the fresh locked source archive run offline integration tests with actual Chromium and the real missing-key boundary. They establish wiring and cleanup, not live model quality, platform persistence, or uploaded captures. The observation recipe defines no grader/gate. Authenticated persisted happy/negative runs, paid model quality/cost, publication and licensing remain separate gates.

References: [SDK](https://docs.firedrill.run/sdk/typescript), [command targets](https://docs.firedrill.run/guides/callbacks), [operator MCP](https://docs.firedrill.run/guides/control-mcp), [CI](https://docs.firedrill.run/guides/ci).
