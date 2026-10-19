# Firedrill agent-first integration

The optional toolchain pins released `@firedrill-run/cli` and `@firedrill-run/sdk` **2.2.2** (October 19, 2026), Node 22+. The app retains its locked OpenAI and Playwright dependencies.

## Prepare and run

From the repository root:

```sh
npm ci
npx playwright install chromium
npm ci --prefix firedrill --ignore-scripts --no-audit --no-fund
npm test --prefix firedrill
node firedrill/node_modules/@firedrill-run/cli/bin/firedrill.mjs validate firedrill/scenario.json --json --non-interactive
```

Validation is offline. In a human terminal, use the same CLI `init` to authorize/select the actual project/environment. Automation uses protected `FIREDRILL_TOKEN`, `FIREDRILL_PROJECT_ID`, `FIREDRILL_ENVIRONMENT_ID`. Model operations independently need `OPENAI_API_KEY` and an enabled `OPENAI_MODEL` or recipe model parameter. Do not put credentials in recipes.

After scope and provider budget are authorized:

```sh
node firedrill/simulate.mjs --preview
node firedrill/simulate.mjs
```

The sequential bounded recipe includes two native operator tasks and one model-free busy-directory inspection. The adapter initializes a hash-validated private fictional JSON copy, starts the actual loopback Express portal on an ephemeral port, and calls the real `runOperator`. Inspection opens the real restricted Chromium session, captures actual page observations/PNG, and makes no model call. No browser/client/model injection or scripted production fallback is added.

Each attempt retains private `.runs/firedrill/attempt-*` state and `invocation.json` mapping outer run/attempt/scenario IDs before application dispatch. Operator/CI credentials are removed from the child environment. Only explicit bounded case/action/task input and optional model configuration are accepted; controller assessments and unsupported Tool bindings are rejected. Normal operator permissions remain restricted to the fictional local portal. A provider final answer does not verify business effects: compare actual before/after state and original audit, and inspect the operator trace. A later error cannot roll back an earlier save.

The owned browser and portal are closed in `finally`, including key preflight failure. The driver retains actual failure reports/partial state. Existing browser origin restrictions, request/output bounds and native cancellation remain in place. Local process cleanup does not prove provider cancellation or billing completion. Output paths/screenshots are local evidence, **not uploaded Firedrill artifacts**. A new attempt creates fresh state; it never resets earlier evidence.

## MCP and recovery

Configure remote OAuth operator MCP at **https://mcp.firedrill.run/mcp** using [host setup](https://docs.firedrill.run/guides/coding-agents). MCP prepares, queues and inspects; the local SDK/CLI executes the command target. Host OAuth and execution login are separate. Use `--run BATCH_ID` to attach queued work, `--resume OPERATION_ID` after uncertainty, and `--result BATCH_ID` to read retained results. Preserve SDK journals and local evidence. These scripts retain public SDK diagnostics and whole-batch exit status; a new simulation starts new work.

CI and the fresh locked source archive run offline integration tests with actual Chromium and the real missing-key boundary. They establish wiring and cleanup, not live model quality, platform persistence, or uploaded captures. The observation recipe defines no grader/gate. Authenticated persisted happy/negative runs, paid model quality/cost, publication and licensing remain separate gates.

References: [SDK](https://docs.firedrill.run/sdk/typescript), [command targets](https://docs.firedrill.run/guides/callbacks), [operator MCP](https://docs.firedrill.run/guides/control-mcp), [CI](https://docs.firedrill.run/guides/ci).
