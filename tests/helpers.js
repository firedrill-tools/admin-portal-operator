import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import OpenAI from "openai";
import { startServer } from "../src/server.js";

export const steps = [
  ["browser_fill", { label: "Search by name or email", value: "mira@harbor.example" }],
  ["browser_click", { role: "button", name: "Search" }],
  ["browser_click", { role: "link", name: "Mira Chen" }],
  ["browser_fill", { label: "Team", value: "Incident Operations" }],
  ["browser_select", { label: "Role", option: "Manager" }],
  ["browser_click", { role: "button", name: "Save changes" }],
];
export function response(index, step, patch = {}) {
  return { id: `resp_synthetic_${index}`, object: "response", created_at: 1792098000, model: "synthetic-controlled-http",
    status: "completed", error: null, incomplete_details: null,
    output: step ? [{ type: "function_call", id: `fc_${index}`, call_id: `call_${index}`, name: step[0], arguments: JSON.stringify(step[1]), status: "completed" }] :
      [{ type: "message", id: `msg_${index}`, status: "completed", role: "assistant", content: [{ type: "output_text", text: "Saved and verified", annotations: [] }] }],
    usage: null, ...patch };
}
export function nativeClient(handler) {
  const requests = [], options = [];
  const client = new OpenAI({ apiKey: "synthetic-not-a-secret", maxRetries: 2, fetch: async (url, init) => {
    const body = JSON.parse(init.body), i = requests.length;
    requests.push(body); options.push(init);
    const result = await handler(i, body, init);
    return result instanceof Response ? result : new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json", "x-request-id": `req_synthetic_${i}` } });
  } });
  return { client, requests, options };
}
export async function workspace(t, name = "starter") {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "firedrill-admin-")), file = path.join(temp, "workspace.json");
  fs.copyFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), file);
  const server = await startServer(file, 0);
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); fs.rmSync(temp, { recursive: true, force: true }); });
  return { temp, file, baseUrl: `http://127.0.0.1:${server.address().port}`, outputRoot: path.join(temp, "artifacts") };
}
