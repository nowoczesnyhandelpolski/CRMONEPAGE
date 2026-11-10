import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXTENSION_FILES, zipStore } from "../lib/extension-pack.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extDir = path.join(root, "extension");
const files = EXTENSION_FILES.map((name) => ({
  name,
  data: new Uint8Array(fs.readFileSync(path.join(extDir, name)))
}));
const zip = zipStore(files);
fs.mkdirSync(path.join(root, "downloads"), { recursive: true });
fs.writeFileSync(path.join(root, "downloads", "nhp-wtyczka.zip"), zip);
const b64 = Buffer.from(zip).toString("base64");
const mod = `// Wygenerowane przez npm run pack:extension. Nie edytuj ręcznie.\nexport const EXTENSION_ZIP_BASE64 = ${JSON.stringify(b64)};\n`;
fs.writeFileSync(path.join(root, "lib", "extension-zip-data.mjs"), mod);
console.log(`ZIP ${zip.length} B, ${files.length} plików.`);
