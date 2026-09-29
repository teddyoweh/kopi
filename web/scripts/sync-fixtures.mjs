// Copies the backend's synthetic fixtures and seeded profiles into lib/fixtures/ so the
// web app has one source of truth for demo data. Runs before `dev` and `build`.
import { copyFileSync, mkdirSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = dirname(dirname(realpathSync(fileURLToPath(import.meta.url))));
const backend = join(web, "..", "backend");
const out = join(web, "lib", "fixtures");
mkdirSync(join(out, "profiles"), { recursive: true });

for (const name of ["notices.json", "awards.json", "licences.json"]) {
  copyFileSync(join(backend, "fixtures", name), join(out, name));
}
for (const name of readdirSync(join(backend, "profiles")).filter((f) => f.endsWith(".json"))) {
  copyFileSync(join(backend, "profiles", name), join(out, "profiles", name));
}
console.log(`fixtures synced into ${out}`);
