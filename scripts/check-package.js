import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "firedrill-admin-package-"));
const env = { ...process.env }; delete env.OPENAI_API_KEY;
// npm run exports user configuration as environment configuration. npm 12 rejects
// this specific setting from the environment for project installs; keep the user
// config file intact, and --ignore-scripts still suppresses every install script.
for (const key of Object.keys(env)) if (key.toLowerCase() === "npm_config_allow_scripts") delete env[key];
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, env, encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
let portal;
try {
  const archive = path.join(temp, "source.tar.gz");
  run(process.execPath, ["scripts/package.js", archive], root);
  run("tar", ["-xzf", archive, "-C", temp], temp);
  const directory = path.join(temp, "package");
  if (!fs.existsSync(path.join(directory, "package-lock.json"))) throw new Error("archive lacks locked dependencies");
  run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], directory);
  if (!fs.existsSync(path.join(directory, "firedrill", "scenario.json")) || fs.existsSync(path.join(directory, "firedrill", "node_modules"))) throw new Error("archive integration source/dependency boundary differs");
  run("npm", ["ci", "--prefix", "firedrill", "--ignore-scripts", "--no-audit", "--no-fund"], directory);
  run("npm", ["test", "--prefix", "firedrill"], directory);
  const manifest = JSON.parse(run(process.execPath, ["src/datasets.js", "list"], directory));
  if (manifest.cases.length !== 8) throw new Error("packaged dataset list differs");
  run(process.execPath, ["src/datasets.js", "--help"], directory);
  run(process.execPath, ["src/operator.js", "--help"], directory);
  run(process.execPath, ["src/server.js", "--help"], directory);
  for (const item of manifest.cases) run(process.execPath, ["src/datasets.js", "init", item.id, `${item.id}.json`], directory);
  try { run(process.execPath, ["src/operator.js", "Inspect the exact record"], directory); throw new Error("missing key accepted"); }
  catch (error) { if (!String(error.stderr).includes("OPENAI_API_KEY required")) throw error; }
  portal = spawn(process.execPath, ["src/server.js"], { cwd: directory, env: { ...env, ADMIN_WORKSPACE_FILE: "busy.json", PORT: "0" }, stdio: ["ignore", "pipe", "pipe"] });
  let timer;
  const address = await Promise.race([
    new Promise((resolve, reject) => {
      let output = "";
      portal.stdout.on("data", (bytes) => { output += bytes; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0]); });
      portal.once("error", reject); portal.once("exit", (code) => reject(new Error(`portal exited: ${code}`)));
    }),
    new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error("portal startup timed out")), 10_000); }),
  ]).finally(() => clearTimeout(timer));
  const state = await (await fetch(`${address}/api/state`, { signal: AbortSignal.timeout(5000) })).json();
  if (state.dataset.case_id !== "busy" || state.users.length !== 36 || state.audit.length !== 9) throw new Error("packaged portal state differs");
  console.log("Locked archive: help/list/eight private initializations, key preflight and actual loopback portal passed outside checkout.");
} finally {
  if (portal && portal.exitCode === null) { portal.kill("SIGTERM"); await once(portal, "exit"); }
  fs.rmSync(temp, { recursive: true, force: true });
}
