import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { Store } from "./state.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export function createApp(file) {
  const store = new Store(file);
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const origin = `http://127.0.0.1:${req.socket.localPort}`;
    if (req.headers.host !== new URL(origin).host || (req.method === "POST" && req.headers.origin !== origin)) return res.status(403).send("Local origin required");
    res.set("Cache-Control", "no-store");
    res.set("Content-Security-Policy", "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; connect-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    next();
  });
  app.use(express.urlencoded({ extended: false, limit: "4kb", parameterLimit: 8 }));
  app.use("/assets", express.static(path.join(root, "public")));
  const layout = (title, body, snapshot = null) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${snapshot ? `<meta name="atlas-snapshot" content="${escape(JSON.stringify({ dataset: snapshot.dataset || null, state_sha256: crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') }))}">` : ""}<title>${escape(title)} | Atlas Admin</title><link rel="stylesheet" href="/assets/style.css"></head><body><header><div class="brand"><span class="brand-mark"></span>ATLAS / ADMIN</div><span>WORKSPACE DIRECTORY</span><small>LOCAL DEMO</small></header><main>${body}</main></body></html>`;

  app.get("/", (req, res) => {
    const query = String(req.query.q || "").trim().toLowerCase();
    const snapshot = store.read();
    const users = snapshot.users.filter((u) => !query || u.email.toLowerCase().includes(query) || u.name.toLowerCase().includes(query));
    const rows = users.map((u) => `<tr><td><a href="/users/${escape(u.id)}">${escape(u.name)}</a><small>${escape(u.id)}</small></td><td>${escape(u.email)}</td><td>${escape(u.team)}</td><td><span class="role">${escape(u.role)}</span></td><td><a class="row-link" href="/users/${escape(u.id)}">Open record →</a></td></tr>`).join("");
    res.send(layout("Directory", `<div class="eyebrow">PEOPLE / DIRECTORY</div><h1>Team directory</h1><p class="intro">Find the exact account before changing access or ownership.</p><form method="get" class="search"><label for="search">Search by name or email</label><div><input id="search" name="q" value="${escape(req.query.q || "")}" placeholder="Search a person"><button type="submit">Search</button></div></form><div class="table-head"><h2>People</h2><span>${users.length} records</span></div><table><thead><tr><th>Name</th><th>Email</th><th>Team</th><th>Role</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5">No matching people</td></tr>'}</tbody></table>`, snapshot));
  });

  app.get("/users/:id", (req, res) => {
    const snapshot = store.read();
    const user = snapshot.users.find((u) => u.id === req.params.id);
    if (!user) return res.status(404).send(layout("Not found", "<h1>Record not found</h1>"));
    const message = req.query.saved ? '<div role="status" class="notice">Changes saved to this record.</div>' : "";
    res.send(layout(user.name, `<a class="back" href="/">← Directory</a><div class="eyebrow">PERSON / ${escape(user.id.toUpperCase())}</div><h1>${escape(user.name)}</h1><p class="intro">${escape(user.email)} · Revision ${user.revision}</p>${message}<section><div class="section-label">ACCOUNT DETAILS</div><form method="post" action="/users/${escape(user.id)}"><input type="hidden" name="revision" value="${user.revision}"><label for="team">Team</label><input id="team" name="team" value="${escape(user.team)}" required minlength="3" maxlength="60"><label for="role">Role</label><select id="role" name="role"><option value="viewer" ${user.role === "viewer" ? "selected" : ""}>Viewer</option><option value="editor" ${user.role === "editor" ? "selected" : ""}>Editor</option><option value="manager" ${user.role === "manager" ? "selected" : ""}>Manager</option></select><button type="submit">Save changes</button></form></section>`, snapshot));
  });

  app.post("/users/:id", (req, res) => {
    const result = store.update(req.params.id, req.body);
    if (result.error) return res.status(result.error === "not_found" ? 404 : 409).send(layout("Save failed", `<div role="alert" class="error">Could not save: ${escape(result.error)}. Return to the record and reload current values.</div><a href="/users/${escape(req.params.id)}">Back to record</a>`));
    res.redirect(303, `/users/${encodeURIComponent(req.params.id)}?saved=1`);
  });

  app.get("/api/state", (_req, res) => res.json(store.read()));
  return app;
}

export function startServer(file, port = 8787) {
  const app = createApp(file);
  return new Promise((resolve, reject) => {
    const server = app.listen(port, "127.0.0.1", () => resolve(server));
    server.once("error", reject);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "--help") console.log("Usage: npm run portal\nADMIN_WORKSPACE_FILE (default workspace.json), PORT (default 8787); binds 127.0.0.1 only.");
  else if (process.argv.length > 2) { console.error("Unexpected arguments; use --help"); process.exitCode = 2; }
  else {
    const file = path.resolve(process.env.ADMIN_WORKSPACE_FILE || "workspace.json");
    startServer(file, Number(process.env.PORT || 8787)).then((server) => {
      console.log(`Admin portal listening on http://127.0.0.1:${server.address().port}`);
      const stop = () => { server.close(); };
      process.once("SIGINT", stop); process.once("SIGTERM", stop);
    }).catch((error) => { console.error(error.message); process.exitCode = 1; });
  }
}
