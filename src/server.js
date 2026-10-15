import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./state.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export function createApp(file) {
  const store = new Store(file);
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use("/assets", express.static(path.join(root, "public")));
  const layout = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} | Atlas Admin</title><link rel="stylesheet" href="/assets/style.css"></head><body><header><div class="brand"><span class="brand-mark"></span>ATLAS / ADMIN</div><span>WORKSPACE DIRECTORY</span><small>LOCAL DEMO</small></header><main>${body}</main></body></html>`;

  app.get("/", (req, res) => {
    const query = String(req.query.q || "").trim().toLowerCase();
    const users = store.read().users.filter((u) => !query || u.email.toLowerCase().includes(query) || u.name.toLowerCase().includes(query));
    const rows = users.map((u) => `<tr><td><a href="/users/${escape(u.id)}">${escape(u.name)}</a><small>${escape(u.id)}</small></td><td>${escape(u.email)}</td><td>${escape(u.team)}</td><td><span class="role">${escape(u.role)}</span></td><td><a class="row-link" href="/users/${escape(u.id)}">Open record →</a></td></tr>`).join("");
    res.send(layout("Directory", `<div class="eyebrow">PEOPLE / DIRECTORY</div><h1>Team directory</h1><p class="intro">Find the exact account before changing access or ownership.</p><form method="get" class="search"><label for="search">Search by name or email</label><div><input id="search" name="q" value="${escape(req.query.q || "")}" placeholder="Search a person"><button type="submit">Search</button></div></form><div class="table-head"><h2>People</h2><span>${users.length} records</span></div><table><thead><tr><th>Name</th><th>Email</th><th>Team</th><th>Role</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5">No matching people</td></tr>'}</tbody></table>`));
  });

  app.get("/users/:id", (req, res) => {
    const user = store.read().users.find((u) => u.id === req.params.id);
    if (!user) return res.status(404).send(layout("Not found", "<h1>Record not found</h1>"));
    const message = req.query.saved ? '<div role="status" class="notice">Changes saved to this record.</div>' : "";
    res.send(layout(user.name, `<a class="back" href="/">← Directory</a><div class="eyebrow">PERSON / ${escape(user.id.toUpperCase())}</div><h1>${escape(user.name)}</h1><p class="intro">${escape(user.email)} · Revision ${user.revision}</p>${message}<section><div class="section-label">ACCOUNT DETAILS</div><form method="post" action="/users/${escape(user.id)}"><input type="hidden" name="revision" value="${user.revision}"><label for="team">Team</label><input id="team" name="team" value="${escape(user.team)}" required minlength="3" maxlength="60"><label for="role">Role</label><select id="role" name="role"><option value="viewer" ${user.role === "viewer" ? "selected" : ""}>Viewer</option><option value="editor" ${user.role === "editor" ? "selected" : ""}>Editor</option><option value="manager" ${user.role === "manager" ? "selected" : ""}>Manager</option></select><button type="submit">Save changes</button></form></section>`));
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
  return new Promise((resolve) => {
    const server = app.listen(port, "127.0.0.1", () => resolve(server));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.resolve(process.env.ADMIN_WORKSPACE_FILE || "workspace.json");
  startServer(file, Number(process.env.PORT || 8787)).then(() => console.log("Admin portal listening on 127.0.0.1:8787"));
}
