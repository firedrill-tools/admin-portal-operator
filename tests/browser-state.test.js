import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import { BrowserSession, portalURL } from "../src/browser.js";
import { Store, validateState } from "../src/state.js";
import { runOperator } from "../src/operator.js";
import { initialize, listCases } from "../src/datasets.js";
import { nativeClient, response, steps, workspace } from "./helpers.js";

async function customServer(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("browser blocks foreign requests before network and closes its actual context", async (t) => {
  const w = await workspace(t); let hits = 0;
  const foreign = await customServer(t, (_req, res) => { hits++; res.end("foreign"); });
  const session = await BrowserSession.open(w.baseUrl, path.join(w.temp, "browser"));
  try {
    // Only the test changes the DOM; no corresponding model tool exists.
    await session.page.setContent(`<a href="${foreign}/collect">Foreign portal</a>`);
    const view = await session.execute("browser_click", { role: "link", name: "Foreign portal" });
    assert.ok(view.error); assert.equal(hits, 0);
    assert.equal(session.blockedRequests[0].url, `${foreign}/collect`);
  } finally { await session.close(); }
  assert.equal(session.browser.isConnected(), false); assert.equal(session.page.isClosed(), true);
});

test("startup failure closes actual Chromium even when navigation cannot complete", async (t) => {
  const w = await workspace(t);
  const original = chromium.launch; let browser;
  chromium.launch = async function (...args) { browser = await original.apply(this, args); return browser; };
  t.after(() => { chromium.launch = original; });
  const server = http.createServer(); await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port; await new Promise((resolve) => server.close(resolve));
  await assert.rejects(BrowserSession.open(`http://127.0.0.1:${port}`, path.join(w.temp, "startup")), /ERR_CONNECTION_REFUSED/);
  assert.equal(browser.isConnected(), false);
});

test("portal configuration rejects remote hosts, URL credentials and prefix paths", () => {
  for (const url of ["https://127.0.0.1", "http://localhost:8787", "http://127.0.0.1.example:8787", "http://user:pass@127.0.0.1:8787", "http://127.0.0.1:8787/users/", "http://127.0.0.1:8787/?q=a", "file:///tmp/a"]) assert.throws(() => portalURL(url));
  assert.equal(portalURL("http://127.0.0.1:8787").origin, "http://127.0.0.1:8787");
});

test("local portal rejects foreign Origin/Host before state mutation", async (t) => {
  const w = await workspace(t);
  const body = new URLSearchParams({ revision: "1", team: "Incident Operations", role: "manager" });
  for (const headers of [{ Origin: "https://foreign.example" }, {}]) {
    const response = await fetch(`${w.baseUrl}/users/u-104`, { method: "POST", headers, body });
    assert.equal(response.status, 403);
  }
  const status = await new Promise((resolve, reject) => {
    const request = http.request(`${w.baseUrl}/users/u-104`, { method: "POST", headers: { Origin: w.baseUrl, Host: "foreign.example", "Content-Type": "application/x-www-form-urlencoded" } }, (res) => { res.resume(); resolve(res.statusCode); });
    request.on("error", reject); request.end(body.toString());
  });
  assert.equal(status, 403);
  const state = await (await fetch(`${w.baseUrl}/api/state`)).json(); assert.equal(state.audit.length, 0);
});

test("revision coercion, malformed data and duplicate identities cannot alter state", async (t) => {
  const w = await workspace(t), store = new Store(w.file), before = fs.readFileSync(w.file, "utf8");
  for (const revision of [true, 1.5, "1e0", "01", "1.0", null, [], {}, 0]) assert.equal(store.update("u-104", { revision, team: "Incident Operations", role: "manager" }).error, "stale_revision");
  assert.equal(store.update("u-104", { revision: 1, team: true, role: "manager" }).error, "team_length");
  assert.equal(store.update("u-104", { revision: 1, team: "Operations", role: ["manager"] }).error, "invalid_role");
  assert.equal(fs.readFileSync(w.file, "utf8"), before);
  const duplicated = store.read(); duplicated.users[1].email = duplicated.users[0].email; assert.throws(() => validateState(duplicated));
  const fractional = store.read(); fractional.users[0].revision = 1.5; assert.throws(() => validateState(fractional));
  store.update("u-104", { revision: "1", team: "Incident Operations", role: "manager" });
  const corrupted = store.read(); corrupted.audit[0].after.role = "viewer"; assert.throws(() => validateState(corrupted), /audit/);
});

test("failed atomic publication preserves state and removes private staging file", async (t) => {
  const w = await workspace(t), before = fs.readFileSync(w.file, "utf8"), store = new Store(w.file);
  const rename = fs.renameSync;
  try {
    fs.renameSync = () => { throw new Error("synthetic disk publication failure"); };
    assert.throws(() => store.update("u-104", { revision: 1, team: "Incident Operations", role: "manager" }), /publication/);
  } finally { fs.renameSync = rename; }
  assert.equal(fs.readFileSync(w.file, "utf8"), before);
  assert.deepEqual(fs.readdirSync(w.temp), ["workspace.json"]);
});

test("eight hash-bound datasets span four profiles; initialization is private, exclusive and independent", async (t) => {
  const w = await workspace(t), manifest = listCases();
  assert.equal(manifest.cases.length, 8);
  assert.deepEqual(new Set(manifest.cases.map((c) => c.profile)), new Set(["starter", "busy", "ambiguous", "boundary"]));
  for (const scenario of manifest.cases) {
    const file = path.join(w.temp, `${scenario.id}.json`);
    const selected = initialize(scenario.id, file);
    assert.equal(selected.dataset.case_id, scenario.id); assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.throws(() => initialize(scenario.id, file), /EEXIST/);
    const state = new Store(file).read();
    if (scenario.id === "busy") { assert.equal(state.users.length, 36); assert.equal(state.audit.length, 9); }
  }
  assert.throws(() => initialize("../starter", path.join(w.temp, "bad.json")), /unknown/);
});

for (const scenario of ["busy", "already-current", "similar-email", "team-limit"]) test(`native browser run preserves case invariants in ${scenario}`, async (t) => {
  const w = await workspace(t, scenario), before = new Store(w.file).read(), localSteps = structuredClone(steps);
  let targetId = "u-104", team = "Incident Operations", role = "manager";
  if (scenario === "similar-email") { targetId = "u-105"; team = "Risk Operations"; localSteps[0][1].value = "mira@harbour.example"; localSteps[3][1].value = team; }
  if (scenario === "team-limit") { targetId = "u-106"; team = "International Customer Incident Coordination Response Center"; role = "viewer"; localSteps[0][1].value = "leo@northstar.example"; localSteps[2][1].name = "Leo Hart"; localSteps[3][1].value = team; localSteps[4][1].option = "Viewer"; assert.equal(team.length, 60); }
  const { client } = nativeClient((i) => response(i, localSteps[i]));
  const { result } = await runOperator(listCases().cases.find((item) => item.id === scenario).task, { ...w, client });
  const after = new Store(w.file).read(), target = after.users.find((u) => u.id === targetId);
  assert.equal(target.team, team); assert.equal(target.role, role);
  assert.deepEqual(after.users.filter((u) => u.id !== targetId), before.users.filter((u) => u.id !== targetId));
  assert.deepEqual(after.audit.slice(0, before.audit.length), before.audit);
  assert.equal(after.audit.length, before.audit.length + (scenario === "already-current" ? 0 : 1));
  assert.equal(result.initial_snapshot.dataset.case_id, scenario);
  assert.match(result.initial_snapshot.state_sha256, /^[a-f0-9]{64}$/);
});
