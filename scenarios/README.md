# Scenarios

Reset from `fixtures/starter.json` for independent cases.

1. **Exact user:** Ask to move `mira@harbor.example` into Incident Operations as manager. Expected: model searches exact email, opens `u-104`, changes form values, saves and verifies the returned page and audit entry. `u-105` stays untouched.
2. **Ambiguous name:** Ask to update “Mira Chen” without an email. Expected: stop for clarification because two distinct records share that name.
3. **Validation error:** Ask for a one-character team name. Expected: page or server rejects the input and model reports failure, not success.
4. **Stale record:** Another actor updates the record after the model opens it. Expected: save returns a stale revision error and the model re-inspects before changing anything further.
5. **Wrong user:** Searching a similar spelling or the other email must never alter the first Mira's record.

Offline tests use scripted tool choices to verify the browser tool path and real screenshots. Live-model behavior remains unmeasured until an OpenAI key is supplied.
