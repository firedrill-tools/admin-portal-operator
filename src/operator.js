import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { BrowserSession } from "./browser.js";

const tools = [
  { type: "function", name: "browser_inspect", description: "Inspect the current local portal page and save a real screenshot.", parameters: { type: "object", properties: {}, required: [], additionalProperties: false }, strict: true },
  { type: "function", name: "browser_click", description: "Click an exact visible link or button name in the current page. Inspect first when names are ambiguous.", parameters: { type: "object", properties: { role: { type: "string", enum: ["link", "button"] }, name: { type: "string" } }, required: ["role", "name"], additionalProperties: false }, strict: true },
  { type: "function", name: "browser_fill", description: "Fill one form field by its exact visible label.", parameters: { type: "object", properties: { label: { type: "string" }, value: { type: "string" } }, required: ["label", "value"], additionalProperties: false }, strict: true },
  { type: "function", name: "browser_select", description: "Select one visible option in a labelled dropdown.", parameters: { type: "object", properties: { label: { type: "string" }, option: { type: "string" } }, required: ["label", "option"], additionalProperties: false }, strict: true },
];

export async function runOperator(task, { baseUrl, model, outputRoot = "artifacts", client } = {}) {
  if (!process.env.OPENAI_API_KEY && !client) throw new Error("OPENAI_API_KEY required; no model fallback");
  const openai = client || new OpenAI();
  const runId = crypto.randomUUID();
  const outputDir = path.resolve(outputRoot, runId);
  const browser = await BrowserSession.open(baseUrl || process.env.ADMIN_PORTAL_URL || "http://127.0.0.1:8787", outputDir);
  try {
    const initial = await browser.observe("initial");
    const instructions = "You operate only the supplied local Atlas Admin portal through browser tools. " +
      "Identify people by exact email and record ID, not name alone. Inspect the page before acting. " +
      "Use the browser controls to make the requested change, then inspect the saved record to confirm it. " +
      "Do not claim success unless the page confirms the exact target and values. Stop on uncertainty or validation errors.";
    let response = await openai.responses.create({ model: model || process.env.OPENAI_MODEL || "gpt-6.1-sol",
      instructions, tools, parallel_tool_calls: false,
      input: [{ role: "user", content: `${task}\n\nInitial browser view:\n${JSON.stringify(initial)}` }] });
    for (let round = 0; round < 18; round++) {
      const calls = response.output.filter((item) => item.type === "function_call");
      if (!calls.length) {
        const result = { task, model: response.model, response: response.output_text, response_id: response.id,
          final_url: browser.page.url(), trace: browser.trace };
        fs.writeFileSync(path.join(outputDir, "trace.json"), JSON.stringify(result, null, 2));
        return { outputDir, result };
      }
      const outputs = [];
      for (const call of calls) {
        let args;
        try { args = JSON.parse(call.arguments); }
        catch { args = {}; }
        const observation = await browser.execute(call.name, args);
        outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(observation) });
      }
      response = await openai.responses.create({ model: model || process.env.OPENAI_MODEL || "gpt-6.1-sol",
        instructions, tools, parallel_tool_calls: false, previous_response_id: response.id, input: outputs });
    }
    throw new Error("model exceeded 18 browser-action rounds");
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const task = process.argv.slice(2).join(" ");
  if (!task) { console.error("Usage: npm run operate -- <task>"); process.exitCode = 2; }
  else runOperator(task).then(({ outputDir, result }) => console.log(JSON.stringify({ outputDir,
    response: result.response, final_url: result.final_url }, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
