import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const ignored = new Set([".git", ".field-work", ".npm-cache", ".pip-cache", ".venv", "node_modules", "receipts/runtime"]);
const binaryExtensions = new Set([".bin", ".wasm", ".f32", ".u8", ".mat", ".zip", ".gz", ".png", ".jpg", ".jpeg", ".webp"]);
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  ["GitHub token", /gh[ps]_[A-Za-z0-9]{36,}/],
  ["OpenAI key", /sk-[A-Za-z0-9]{20,}/],
  ["Slack token", /xox[baprs]-[A-Za-z0-9-]{10,}/],
];

async function walk(path) {
  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    const name = relative(rootPath, full);
    if (ignored.has(entry.name) || ignored.has(name)) continue;
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (!binaryExtensions.has(entry.name.slice(entry.name.lastIndexOf(".")))) files.push(full);
  }
  return files;
}

const findings = [];
const files = await walk(rootPath);
for (const file of files) {
  const text = await readFile(file, "utf8");
  for (const [label, pattern] of patterns) if (pattern.test(text)) findings.push(`${relative(rootPath, file)}: ${label}`);
}
if (findings.length) {
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`secret scan clean across ${files.length} text files (${patterns.length} credential signatures)`);
}
