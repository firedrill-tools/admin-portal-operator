import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../src/server.js";
import { runOperator } from "../src/operator.js";
import { Store } from "../src/state.js";

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/starter.json");

test("browser-driven update changes only the exact person and saves real captures", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "admin-portal-"));
  const file = path.join(temp, "workspace.json");
  fs.copyFileSync(fixture, file);
  const server = await startServer(file, 0);
  const port = server.address().port;
  const script = [
    ["browser_fill", { label: "Search by name or email", value: "mira@harbor.example" }],
    ["browser_click", { role: "button", name: "Search" }],
    ["browser_click", { role: "link", name: "Mira Chen" }],
    ["browser_fill", { label: "Team", value: "Incident Operations" }],
    ["browser_select", { label: "Role", option: "Manager" }],
    ["browser_click", { role: "button", name: "Save changes" }],
  ];
  let index = 0;
  const client = { responses: { create: async () => {
    const next = script[index++];
    return next ? { id: `r-${index}`, model: "scripted-test", output_text: "", output: [
      { type: "function_call", name: next[0], arguments: JSON.stringify(next[1]), call_id: `c-${index}` }] }
      : { id: `r-${index}`, model: "scripted-test", output_text: "Saved and verified", output: [] };
  } } };
  try {
    const { outputDir, result } = await runOperator("Update exact Mira record", {
      baseUrl: `http://127.0.0.1:${port}`, outputRoot: path.join(temp, "artifacts"), client });
    const state = new Store(file).read();
    assert.equal(state.users[0].team, "Incident Operations");
    assert.equal(state.users[0].role, "manager");
    assert.equal(state.users[1].team, "Finance");
    assert.equal(state.audit.length, 1);
    assert.match(result.trace.at(-1).text, /Changes saved to this record/);
    assert.ok(result.trace.every((step) => fs.existsSync(step.screenshot)));
    assert.ok(fs.existsSync(path.join(outputDir, "trace.json")));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("state validation rejects a stale or invalid edit", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "admin-state-"));
  const file = path.join(temp, "workspace.json");
  fs.copyFileSync(fixture, file);
  const store = new Store(file);
  assert.equal(store.update("u-104", { revision: 0, team: "New Team", role: "manager" }).error, "stale_revision");
  assert.equal(store.update("u-104", { revision: 1, team: "x", role: "manager" }).error, "team_length");
  assert.equal(store.read().audit.length, 0);
});
