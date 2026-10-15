import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runOperator, limits, nextAction, reportedUsage, validateArguments } from "../src/operator.js";
import { Store } from "../src/state.js";
import { nativeClient, response, steps, workspace } from "./helpers.js";

const task = "Move Mira Chen at mira@harbor.example (u-104) to Incident Operations, role manager. Verify the saved record.";
async function failedRun(options) {
  try { await runOperator(task, options); assert.fail("expected failed run"); }
  catch (error) {
    assert.ok(error.outputDir, error.stack);
    assert.equal(error.result.status, "failed");
    assert.equal(error.result.browser_closed, true);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(error.outputDir, "trace.json"))), error.result);
    return error;
  }
}

test("native SDK and real Chromium update only exact identity; stateless history retains reasoning and raw reported usage", async (t) => {
  const w = await workspace(t);
  const usage = { input_tokens: 5, output_tokens: 3, total_tokens: 8 };
  const { client, requests, options } = nativeClient((i) => {
    const result = response(i, steps[i], { usage });
    if (i === 0) result.output.unshift({ type: "reasoning", id: "rs_test", summary: [], encrypted_content: "controlled-encrypted-content" });
    return result;
  });
  const { result, outputDir } = await runOperator(task, { ...w, client });
  const state = new Store(w.file).read();
  assert.equal(state.users[0].team, "Incident Operations"); assert.equal(state.users[0].role, "manager");
  assert.equal(state.users[1].team, "Finance"); assert.equal(state.audit.length, 1);
  assert.equal(result.status, "completed"); assert.equal(result.browser_closed, true);
  assert.equal(requests.length, 7); assert.equal(result.actions.length, 6);
  assert.match(result.trace.at(-1).text, /Changes saved to this record/);
  assert.ok(result.trace.every((view) => fs.readFileSync(view.screenshot).subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))));
  assert.equal(result.screenshot_input, false);
  assert.equal(result.attempts[0].request_id, "req_synthetic_0");
  assert.deepEqual(result.attempts[0].raw_response.usage, usage);
  assert.deepEqual(result.usage.totals, { input_tokens: 35, output_tokens: 21, total_tokens: 56 });
  assert.equal(result.usage.cost.amount, null);
  assert.ok(requests.every((r) => r.store === false && !r.previous_response_id && r.max_output_tokens === 4096 && r.parallel_tool_calls === false));
  assert.ok(requests[1].input.some((item) => item.encrypted_content === "controlled-encrypted-content"));
  assert.ok(options.every((o) => new Headers(o.headers).get("x-stainless-retry-count") === "0"));
  assert.ok(options.every((o) => new Headers(o.headers).get("x-stainless-timeout") === "30"));
  for (const r of requests.slice(1)) {
    const ids = new Set(r.input.filter((item) => item.type === "function_call").map((item) => item.call_id));
    assert.equal(r.input.filter((item) => item.type === "function_call_output" && ids.has(item.call_id)).length, ids.size);
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outputDir, "trace.json"))), result);
  // Caller-owned native client is still usable after the run.
  assert.equal((await client.responses.create({ model: "test", input: "test" })).status, "completed");
});

test("incomplete sixth native response cannot execute Save changes", async (t) => {
  const w = await workspace(t);
  const before = fs.readFileSync(w.file, "utf8");
  const { client, requests } = nativeClient((i) => response(i, steps[i], i === 5 ? { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, usage: { input_tokens: 9, output_tokens: 4, total_tokens: 13 } } : {}));
  const error = await failedRun({ ...w, client });
  assert.match(error.message, /not completed/); assert.equal(requests.length, 6);
  assert.equal(error.result.actions.length, 5); assert.equal(fs.readFileSync(w.file, "utf8"), before);
  assert.equal(error.result.attempts[5].raw_response.status, "incomplete");
  assert.equal(error.result.usage.status, "unknown"); assert.equal(error.result.usage.measured_attempts, 1);
});

test("provider HTTP failure after save preserves actual effect and all evidence without retry", async (t) => {
  const w = await workspace(t);
  const { client, requests } = nativeClient((i) => i === 6 ? new Response(JSON.stringify({ error: { message: "synthetic outage", type: "server_error" } }), { status: 503, headers: { "content-type": "application/json", "x-request-id": "req_failed" } }) : response(i, steps[i]));
  const error = await failedRun({ ...w, client });
  assert.equal(new Store(w.file).read().audit.length, 1);
  assert.equal(requests.length, 7); assert.equal(error.result.actions.at(-1).status, "observed");
  assert.equal(error.result.attempts.at(-1).error.http_status, 503);
  assert.equal(error.result.attempts.at(-1).error.request_id, "req_failed");
  assert.match(error.result.attempts.at(-1).error.provider_error.message, /synthetic outage/);
  assert.equal(error.result.usage.totals, null);
});

test("stale form after another actor changes record stops without a second mutation", async (t) => {
  const w = await workspace(t);
  const { client, requests } = nativeClient((i) => {
    if (i === 5) new Store(w.file).update("u-104", { revision: 1, team: "Security Operations", role: "editor" });
    return response(i, steps[i]);
  });
  const error = await failedRun({ ...w, client });
  assert.match(error.message, /stale_revision/); assert.equal(requests.length, 6);
  const state = new Store(w.file).read(); assert.equal(state.audit.length, 1); assert.equal(state.users[0].team, "Security Operations");
  assert.equal(error.result.actions.at(-1).status, "failed");
});

test("ambiguous visible link is a browser error and no update", async (t) => {
  const w = await workspace(t);
  const { client, requests } = nativeClient((i) => response(i, ["browser_click", { role: "link", name: "Mira Chen" }]));
  const error = await failedRun({ ...w, client });
  assert.match(error.message, /strict mode violation/); assert.equal(requests.length, 1);
  assert.equal(new Store(w.file).read().audit.length, 0);
});

test("last request cannot dispatch another action; exactly 18 HTTP requests", async (t) => {
  const w = await workspace(t);
  const { client, requests } = nativeClient((i) => response(i, ["browser_inspect", {}]));
  const error = await failedRun({ ...w, client });
  assert.match(error.message, /request limit/); assert.equal(requests.length, limits.requests);
  assert.equal(error.result.actions.length, limits.requests - 1);
});

test("external cancellation interrupts native SDK call and closes Chromium with durable error", async (t) => {
  const w = await workspace(t), controller = new AbortController();
  const { client, requests } = nativeClient((_i, _body, init) => new Promise((_resolve, reject) => {
    const cancel = () => reject(init.signal.reason);
    init.signal.addEventListener("abort", cancel, { once: true });
    controller.abort(new Error("synthetic cancellation"));
  }));
  const error = await failedRun({ ...w, client, signal: controller.signal });
  assert.equal(requests.length, 1); assert.equal(error.result.actions.length, 0);
  assert.equal(error.result.attempts[0].error.name, "APIUserAbortError");
});

for (const [label, patch] of [
  ["refusal", { output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "declined" }] }] }],
  ["blank", { output: [] }], ["nonfinal item", { output: [{ ...response(0, steps[0]).output[0], status: "in_progress" }] }],
  ["unknown output", { output: [{ type: "computer_call", status: "completed" }] }],
  ["invalid JSON", { output: [{ ...response(0, steps[0]).output[0], arguments: "{invalid" }] }],
  ["parallel batch", { output: [response(0, steps[0]).output[0], response(1, steps[1]).output[0]] }],
  ["mixed final and tool", { output: [...response(0).output, ...response(0, steps[0]).output] }],
]) test(`rejects ${label} before action`, () => assert.throws(() => nextAction(response(0, steps[0], patch), new Set())));

test("duplicate call ID and malformed arguments cannot replay a completed click", () => {
  assert.throws(() => nextAction(response(0, steps[0]), new Set(["call_0"])), /repeated/);
  for (const [name, args] of [["browser_fill", { label: "Team", value: "abc", extra: "x" }], ["browser_click", { role: "checkbox", name: "x" }], ["browser_inspect", []], ["browser_fill", { label: "Team", value: 7 }], ["execute_js", {}]]) {
    assert.throws(() => validateArguments(name, JSON.stringify(args)));
  }
});

test("raw missing, partial, zero and inconsistent usage remain distinguishable", () => {
  const attempt = (usage) => [{ raw_response: { usage } }];
  assert.equal(reportedUsage(attempt(null)).status, "unknown");
  assert.equal(reportedUsage(attempt({ input_tokens: 0 })).totals, null);
  assert.deepEqual(reportedUsage(attempt({ input_tokens: 0, output_tokens: 0, total_tokens: 0 })).totals, { input_tokens: 0, output_tokens: 0, total_tokens: 0 });
  assert.equal(reportedUsage(attempt({ input_tokens: 1, output_tokens: 2, total_tokens: 9 })).totals, null);
  assert.equal(reportedUsage(attempt({ input_tokens: true, output_tokens: 2, total_tokens: 3 })).totals, null);
});

test("HTTP error retains raw usage outside SDK error object", async (t) => {
  const w = await workspace(t), usage = { input_tokens: 2, output_tokens: 0, total_tokens: 2 };
  const { client, requests } = nativeClient(() => new Response(JSON.stringify({ error: { message: "synthetic throttling", type: "rate_limit" }, usage }), { status: 429, headers: { "content-type": "application/json" } }));
  const error = await failedRun({ ...w, client });
  assert.equal(requests.length, 1); assert.deepEqual(error.result.attempts[0].raw_response.usage, usage);
  assert.deepEqual(error.result.usage.totals, usage); assert.equal(error.result.actions.length, 0);
});

test("malformed JSON and oversized native bodies fail before action and retain available bytes", async (t) => {
  const w = await workspace(t);
  for (const body of ['{"status":', "x".repeat(limits.responseBytes + 1)]) {
    const { client } = nativeClient(() => new Response(body, { headers: { "content-type": "application/json" } }));
    const error = await failedRun({ ...w, client });
    assert.equal(error.result.actions.length, 0);
    const attempt = error.result.attempts[0];
    if (body.length < limits.responseBytes) assert.equal(attempt.raw_body, body);
    else { assert.ok(attempt.error); assert.equal(attempt.partial_body, ""); }
  }
});

test("interrupted native body preserves partial evidence and closes owned resources", async (t) => {
  const w = await workspace(t), controller = new AbortController();
  const { client, requests } = nativeClient(() => new Response(new ReadableStream({ start(stream) {
    stream.enqueue(new TextEncoder().encode('{"id":"partial_response",'));
    setTimeout(() => controller.abort("synthetic body interruption"), 20);
  } }), { headers: { "content-type": "application/json" } }));
  const error = await failedRun({ ...w, client, signal: controller.signal });
  assert.equal(requests.length, 1); assert.equal(error.result.actions.length, 0);
  assert.equal(error.result.attempts[0].partial_body, '{"id":"partial_response",');
  assert.equal(error.result.usage.status, "unknown");
});

test("commentary is retained for tool history but cannot masquerade as a terminal answer", () => {
  const commentary = { ...response(0).output[0], phase: "commentary" };
  assert.throws(() => nextAction(response(0, null, { output: [commentary] }), new Set()), /empty final/);
  const action = nextAction(response(0, null, { output: [commentary, ...response(0, steps[0]).output] }), new Set());
  assert.equal(action.call.name, "browser_fill"); assert.equal(action.finalText, "");
});

test("trace publication failure after save reports failure and retains the committed effect", async (t) => {
  const w = await workspace(t), { client } = nativeClient((i) => response(i, steps[i]));
  const rename = fs.renameSync; let injected = false;
  try {
    fs.renameSync = (from, to) => {
      if (!injected && to.endsWith("trace.json")) {
        const trace = JSON.parse(fs.readFileSync(from));
        if (trace.actions.length === 6 && trace.actions.at(-1).status === "observed") { injected = true; throw new Error("synthetic evidence publication failure"); }
      }
      return rename(from, to);
    };
    const error = await failedRun({ ...w, client });
    assert.match(error.message, /evidence publication/); assert.equal(new Store(w.file).read().audit.length, 1);
    assert.equal(error.result.actions.at(-1).status, "observed");
  } finally { fs.renameSync = rename; }
  assert.equal(injected, true);
});
