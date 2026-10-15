import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { validateState } from "./state.js";

const fixtures = fileURLToPath(new URL("../fixtures/", import.meta.url));
export function listCases() {
  const manifest = JSON.parse(fs.readFileSync(path.join(fixtures, "manifest.json"), "utf8"));
  return manifest;
}
export function initialize(caseId, destination) {
  const manifest = listCases(), selected = manifest.cases.find((item) => item.id === caseId);
  if (!selected || path.basename(selected.file) !== selected.file) throw new Error("unknown dataset case");
  const bytes = fs.readFileSync(path.join(fixtures, selected.file));
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== selected.sha256) throw new Error("dataset hash mismatch");
  const state = validateState(JSON.parse(bytes));
  if (state.dataset?.id !== manifest.dataset_id || state.dataset.version !== manifest.version || state.dataset.case_id !== caseId || state.dataset.profile !== selected.profile) throw new Error("dataset identity mismatch");
  fs.writeFileSync(path.resolve(destination), bytes, { flag: "wx", mode: 0o600 });
  return { file: path.resolve(destination), dataset: state.dataset, sha256: selected.sha256, task: selected.task };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, id, destination, ...extra] = process.argv.slice(2);
  try {
    if (command === "--help" || !command) console.log("Usage: node src/datasets.js list | init <case-id> <new-workspace.json>\nStop the portal, remove your disposable JSON workspace, then init again to reset local state only.");
    else if (command === "list" && !id) console.log(JSON.stringify(listCases(), null, 2));
    else if (command === "init" && id && destination && !extra.length) console.log(JSON.stringify(initialize(id, destination), null, 2));
    else throw new Error("invalid arguments; use --help");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
