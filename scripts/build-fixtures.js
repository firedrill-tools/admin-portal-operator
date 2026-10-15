import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateState } from "../src/state.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const base = () => ({ users: [
  { id: "u-104", name: "Mira Chen", email: "mira@harbor.example", team: "Operations", role: "viewer", revision: 1 },
  { id: "u-105", name: "Mira Chen", email: "mira@harbour.example", team: "Finance", role: "editor", revision: 1 },
  { id: "u-106", name: "Leo Hart", email: "leo@northstar.example", team: "Accounts", role: "viewer", revision: 1 },
], audit: [] });
const standardTask = "Move Mira Chen at mira@harbor.example (u-104) to Incident Operations and set her role to manager. Verify the saved record.";
const definitions = [
  ["starter", "starter", standardTask],
  ["busy", "busy", "Move Mira Chen at mira@harbor.example (u-104) to Incident Operations, role manager. Preserve all other people and prior audit records; verify the saved record."],
  ["ambiguous-name", "ambiguous", "Move Mira Chen to Incident Operations and set her role to manager."],
  ["similar-email", "ambiguous", "Move Mira Chen at mira@harbour.example (u-105) to Risk Operations, role manager. Verify the exact email."],
  ["already-current", "boundary", standardTask],
  ["missing-person", "boundary", "Set Avery North at avery@harbor.example to Incident Operations, role manager. Do not create a new person."],
  ["unsupported-role", "boundary", "Set Leo Hart at leo@northstar.example (u-106) to role owner."],
  ["team-limit", "boundary", "Set Leo Hart at leo@northstar.example (u-106) to team International Customer Incident Coordination Response Center, keeping the viewer role. Verify the saved record."],
];
const manifest = { dataset_id: "atlas-admin-directory", version: "1.0.0", provenance: "Fictional business state and prior human directory edits; no model observations are seeded.", cases: [] };
for (const [id, profile, task] of definitions) {
  const data = base();
  if (id === "busy") {
    const names = ["Nadia Cole", "Owen Marsh", "Priya Shah", "Eli Brooks", "Inez Park", "Sam Rivera", "Tessa Reed", "Jon Vale", "Ravi Moss", "Ada Lin", "Noor Stone", "Max Quinn", "Amal Fox", "Kai Rowan", "Wren Blake", "Lena Ortiz", "Alex Wynn", "Dev Shah", "Jules Avery", "Remy Lane", "Taylor Gray", "Nico Hart", "Maya Bell", "Leah Kim", "Ari Chen", "Morgan Lake", "Sasha Dean", "Casey Holt", "Robin West", "Dana Ross", "Parker Lee", "Sky Nguyen", "Jamie Wood"];
    const teams = ["Customer Operations", "Product Support", "Risk Operations", "Accounts", "Engineering", "Workplace Services"];
    names.forEach((name, index) => {
      const user = { id: `u-${201 + index}`, name, email: `${name.toLowerCase().replaceAll(" ", ".")}@atlas.example`, team: teams[index % teams.length], role: index % 3 === 0 ? "editor" : "viewer", revision: 1 };
      if (index % 4 === 0) {
        user.revision = 2;
        data.audit.push({ user_id: user.id, before: { team: "New Joiners", role: "viewer" }, after: { team: user.team, role: user.role }, revision: 2 });
      }
      data.users.push(user);
    });
    // Deliberately place the requested person deep in a busy ordinary directory.
    data.users.push(data.users.shift());
  }
  if (id === "already-current") {
    const user = data.users[0]; user.team = "Incident Operations"; user.role = "manager"; user.revision = 2;
    data.audit.push({ user_id: user.id, before: { team: "Operations", role: "viewer" }, after: { team: user.team, role: user.role }, revision: 2 });
  }
  data.dataset = { id: manifest.dataset_id, version: manifest.version, case_id: id, profile };
  validateState(data);
  const content = JSON.stringify(data, null, 2) + "\n";
  fs.writeFileSync(path.join(root, "fixtures", `${id}.json`), content);
  manifest.cases.push({ id, profile, file: `${id}.json`, sha256: crypto.createHash("sha256").update(content).digest("hex"), task });
}
fs.writeFileSync(path.join(root, "fixtures", "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
