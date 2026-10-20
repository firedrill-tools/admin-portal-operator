# Admin portal browser agent with OpenAI Responses and Playwright

An OpenAI Responses agent searches a fictional people directory, opens an exact account, edits its team and role through visible controls, and checks the saved page. Chromium performs the actual actions. The portal keeps revisioned records and an audit history in a local JSON workspace.

Simulate this OpenAI Responses AI agent with [Firedrill](https://firedrill.run/), a simulation platform for AI agents. Start with the [Firedrill setup and simulation guide](firedrill/README.md); your coding agent can operate it while this application's runner stays in your repository or CI.

This example repository is publicly viewable. A project license has not been selected.

## Run a small case

Requires Node.js 24, npm, Playwright Chromium and an OpenAI API key for model execution. Dependencies are locked in `package-lock.json`.

```sh
npm ci
npx playwright install chromium
npm run datasets -- list
npm run datasets -- init starter workspace.json
npm run portal
```

In another terminal:

```sh
npm run operate -- \
  'Move Mira Chen at mira@harbor.example (u-104) to Incident Operations and set her role to manager. Verify the saved record.'
```

Set `OPENAI_API_KEY` in the environment. `OPENAI_MODEL` selects the model (default `gpt-6.1-sol`). The portal binds `127.0.0.1:8787`; `PORT`, `ADMIN_WORKSPACE_FILE` and `ADMIN_PORTAL_URL` configure the two processes. Only an HTTP `127.0.0.1` origin is accepted. Help, dataset selection and tests need no key. A missing key stops model execution before Chromium opens.

Callable seam:

```js
import { runOperator } from './src/operator.js';
const { outputDir, result } = await runOperator(task, {
  baseUrl: 'http://127.0.0.1:8787',
  outputRoot: 'artifacts',
  signal: abortController.signal, // optional caller cancellation
});
```

A caller may inject an actual `OpenAI` client. Its credentials, fetch transport and ownership are preserved through the SDK's public `withOptions` clone; it remains usable afterward. There is no scripted production mode. The JS SDK uses the supplied/shared fetch transport and exposes no client close operation. The application owns request abort controllers and a fresh Chromium browser/context, closes them on success/failure/interruption, and cleans up navigation startup failures. SIGINT/SIGTERM cancel CLI execution. A forced process kill can leave a `running` trace: inspect state before another save.

## Completion and evidence

At most 18 HTTP requests, 30 seconds per request, 4,096 output tokens and no SDK retries. One validated browser action per completed provider response; the final request is reserved for a final answer. Incomplete, refused, blank, unsupported, malformed, repeated-ID and parallel output cannot dispatch actions. Commentary alone is not completion. Tool/form/stale-revision errors stop the run. Requests use `store:false` and explicit in-memory history, including encrypted reasoning items, following the [Responses stateless conversation contract](https://developers.openai.com/api/reference/resources/responses/methods/create). No provider-side conversation needs resetting.

`artifacts/<run-id>/trace.json` is atomically updated before dispatch, after actions and on exit. It contains raw JSON/error/partial-body observations before SDK normalization, request IDs/hashes, requested and reported models, timestamps, action status, actual page text/controls, state hashes/dataset identity exposed by the portal, screenshot paths and cleanup status. JSON capture is capped at 1 MiB. Missing, partial, inconsistent and reported-zero usage remain distinguishable; aggregate totals are reported only when every attempt has complete measurements. Cost remains unknown. Files are private to the local run directory; capture failures are errors, not invented observations.

`status:"completed"` means a valid model terminal answer was received. **Verify the business outcome independently:** inspect the exact person's team/role/revision, untouched lookalikes and the audit delta in `workspace.json` or read-only `GET /api/state`. A model sentence does not prove the right record changed. A failed response after a successful save leaves that save committed; there is no rollback, automatic retry or resume. Errors expose `outputDir` and `result` to callers; the CLI exits nonzero and reports the evidence directory. If disk publication itself remains unavailable, the callable retains the in-memory failure/evidence error.

Screenshots are genuine Playwright PNGs; this is a text/control browser agent, **not a vision benchmark**. The model receives text/control observations, not screenshot pixels. Browser tools expose no navigation URL, arbitrary JavaScript, filesystem or API action. Exact visible labels/roles drive edits. Requests to other origins, popups, downloads and all WebSockets are blocked; page JavaScript and service workers are disabled for this server-rendered portal. The portal escapes business text, rejects foreign POST origins/Host headers and enforces integer revisions, valid roles and team lengths. These local demo controls do not provide a production identity/access system.

## Data and reset

`atlas-admin-directory` version `1.0.0` has eight hash-bound cases across starter, busy, ambiguous and boundary profiles. Busy has 36 people and nine coherent prior human edits; two people share a name and have distinct similar emails. No model observations are seeded. [Scenario briefs](scenarios/README.md) describe each case and the separate mid-run stale-record experiment. The model sees only portal data and the caller's task; scenario expectations are outside its context.

Use one portal process per workspace file. Stop the portal, remove your disposable `workspace.json`, then run `npm run datasets -- init <case-id> workspace.json` to reset local records/audit. Initialization is private and exclusive: it refuses an existing destination and checks fixture hashes/identity. Browser state and model history are fresh per invocation. Artifacts remain as evidence; reset does not erase them or change provider billing. Concurrent external file writers are unsupported; a browser's stale revision is rejected against freshly read state.

## Verify and package

```sh
npm test
npm run check:package
npm audit --audit-level=low
npm run package
```

Thirty-two offline checks use the actual OpenAI JS 7.34.0 Responses SDK over controlled HTTP and actual Chromium/portal traffic. They reproduce the sixth-response incomplete-save defect, failure after a committed save, stale/ambiguous edits, invalid output, raw usage/errors, request exhaustion, cancellation, data integrity and publication failure. Controlled choices prove the execution boundary; they do not measure model judgment. CI also checks fixture regeneration and the locked source archive outside the checkout (help/list/eight initializations, missing-key preflight and a real loopback portal). `npm run package` creates a private source archive containing code, fixtures, checks and `package-lock.json`; this does not publish an npm package.

Live model quality/billing, authenticated Firedrill persistence and license approval remain pending. No paid model run or compatibility benchmark is claimed. Explore the [Firedrill examples](https://docs.firedrill.run/guides/examples), [Firedrill](https://firedrill.run/) and [official developer documentation](https://docs.firedrill.run/). Use the checked-in [Firedrill integration](firedrill/README.md) through the existing CLI seam; authenticated persistence is a separate verification step.

## Current Firedrill integration

Released CLI/SDK 2.2.2 execution, current command invocation, remote operator MCP and recovery are documented in [firedrill/README.md](firedrill/README.md). CI checks actual Chromium inspection and the provider-key boundary; authenticated platform/model runs remain separately gated.
