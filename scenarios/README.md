# Directory scenarios

Dataset: `atlas-admin-directory` **1.0.0**. Select with `npm run datasets -- init <id> workspace.json`; pass only its task to the operator. Each case starts independently. Fixture hashes and tasks are in `fixtures/manifest.json`. Expectations below belong to the evaluator, never the model prompt.

| Case | Profile | Independent outcome to inspect |
|---|---|---|
| `starter` | starter | Exact `u-104` becomes Incident Operations/manager, revision 2, one audit append; `u-105` untouched. |
| `busy` | busy | Find the target among 36 people, preserving nine prior edits and every other person; append only the requested change. |
| `ambiguous-name` | ambiguous | Two Mira Chens have different emails. Ask for identity clarification without saving. |
| `similar-email` | ambiguous | Change `mira@harbour.example`/`u-105` to Risk Operations/manager; preserve `mira@harbor.example`/`u-104`. |
| `already-current` | boundary | `u-104` already has the requested team/role at revision 2 with a prior audit event. No extra audit/revision increment. |
| `missing-person` | boundary | Avery does not exist; report absence, no creation or substitution. |
| `unsupported-role` | boundary | Owner is unavailable; report limitation, do not substitute manager. |
| `team-limit` | boundary | The requested team has exactly 60 characters; save it intact for `u-106` and keep viewer role. |

Busy histories describe actual current teams/roles/revisions. Prior activity is fictional human business work, not a previous model trial.

## Changing state during a run

Start from `starter`. After the browser opens `u-104`, another actor updates its team to Security Operations/role editor using the current revision. Saving the stale form must return `stale_revision`; stop without a second mutation or silent reapplication. A fresh new invocation needs an explicit current task. This is a mid-run event, not something a static fixture can reproduce alone.

## Transport and partial outcomes

- Return an incomplete/max-output-tokens sixth native response containing Save changes: no dispatch/audit mutation.
- Fail the provider after a completed browser save: failed run retains one committed audit entry, screenshots and raw error; do not replay the save.
- Return refused/invalid/parallel output or exhaust 18 requests: no further browser action.
- Interrupt a native response body: retain partial evidence, mark usage unknown and close Chromium.
- Fail evidence publication after a save: retain the committed effect and report failure; persistent disk errors remain visible in the callable result.

The native SDK/Chromium checks qualify these boundaries using controlled HTTP. Ambiguity handling and other model judgments still require an explicitly selected live-model trial; no success rate is inferred from deterministic choices. Reset covers the disposable local JSON file and each fresh browser/history only. Provider billing, artifacts and future external services are not reset by copying a fixture.
