import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const roles = new Set(["viewer", "editor", "manager"]);
const integer = (n) => Number.isSafeInteger(n) && n > 0;
const teamName = (s) => typeof s === "string" && s === s.trim() && s.length >= 3 && s.length <= 60;
export function validateState(data) {
  if (!data || !Array.isArray(data.users) || !Array.isArray(data.audit) || !data.users.length) throw new Error("invalid workspace schema");
  const users = new Map(), emails = new Set();
  for (const user of data.users) {
    if (!user || typeof user.id !== "string" || !/^u-[a-z0-9-]+$/.test(user.id) || users.has(user.id) ||
      typeof user.name !== "string" || !user.name.trim() || user.name.length > 100 || typeof user.email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email) || emails.has(user.email.toLowerCase()) ||
      !teamName(user.team) || !roles.has(user.role) || !integer(user.revision)) throw new Error("invalid or duplicate user record");
    users.set(user.id, user); emails.add(user.email.toLowerCase());
  }
  const previous = new Map();
  for (const event of data.audit) {
    const user = users.get(event?.user_id), prior = previous.get(event?.user_id);
    if (!user || !integer(event.revision) || event.revision < 2 || !teamName(event.before?.team) || !teamName(event.after?.team) ||
      !roles.has(event.before?.role) || !roles.has(event.after?.role) ||
      (event.before.team === event.after.team && event.before.role === event.after.role) ||
      (prior && (event.revision !== prior.revision + 1 || event.before.team !== prior.after.team || event.before.role !== prior.after.role))) throw new Error("invalid audit history");
    previous.set(event.user_id, event);
  }
  for (const [id, event] of previous) {
    const user = users.get(id);
    if (user.revision !== event.revision || user.team !== event.after.team || user.role !== event.after.role) throw new Error("audit does not match current record");
  }
  return data;
}
export class Store {
  constructor(file) { this.file = path.resolve(file); this.read(); }
  read() { return validateState(JSON.parse(fs.readFileSync(this.file, "utf8"))); }
  write(data) {
    validateState(data);
    const temp = `${this.file}.${crypto.randomUUID()}.tmp`;
    try { fs.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { flag: "wx", mode: 0o600 }); fs.renameSync(temp, this.file); }
    finally { fs.rmSync(temp, { force: true }); }
  }
  update(id, input) {
    const data = this.read(), user = data.users.find((item) => item.id === id);
    if (!user) return { error: "not_found" };
    const rawRevision = input?.revision;
    const revision = typeof rawRevision === "string" && /^[1-9][0-9]*$/.test(rawRevision) ? Number(rawRevision) : rawRevision;
    if (!integer(revision) || revision !== user.revision) return { error: "stale_revision" };
    if (typeof input?.team !== "string" || !teamName(input.team.trim())) return { error: "team_length" };
    const team = input.team.trim(), role = input.role;
    if (!roles.has(role)) return { error: "invalid_role" };
    if (team === user.team && role === user.role) return { user, unchanged: true };
    if (user.revision === Number.MAX_SAFE_INTEGER) return { error: "revision_exhausted" };
    const before = { team: user.team, role: user.role };
    user.team = team; user.role = role; user.revision += 1;
    data.audit.push({ user_id: id, before, after: { team, role }, revision: user.revision });
    this.write(data); return { user };
  }
}
