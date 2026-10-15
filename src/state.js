import fs from "node:fs";
import path from "node:path";

export class Store {
  constructor(file) { this.file = file; if (!fs.existsSync(file)) throw new Error(`workspace missing: ${file}`); }
  read() { return JSON.parse(fs.readFileSync(this.file, "utf8")); }
  write(data) {
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`);
    fs.renameSync(temp, this.file);
  }
  update(id, input) {
    const data = this.read();
    const user = data.users.find((item) => item.id === id);
    if (!user) return { error: "not_found" };
    if (Number(input.revision) !== user.revision) return { error: "stale_revision" };
    const team = String(input.team || "").trim();
    const role = String(input.role || "");
    if (team.length < 3 || team.length > 60) return { error: "team_length" };
    if (!["viewer", "editor", "manager"].includes(role)) return { error: "invalid_role" };
    if (team === user.team && role === user.role) return { user, unchanged: true };
    const before = { team: user.team, role: user.role };
    user.team = team; user.role = role; user.revision += 1;
    data.audit.push({ user_id: id, before, after: { team, role }, revision: user.revision });
    this.write(data);
    return { user };
  }
}
