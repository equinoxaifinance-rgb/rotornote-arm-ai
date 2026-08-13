import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../field/training/mechanical-manifest.json", import.meta.url), "utf8"));
for (const [label, expected] of Object.entries(manifest.sampleSha256)) {
  const bytes = await readFile(new URL(`../samples/real-${label}.csv`, import.meta.url));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) throw new Error(`Real sample integrity failed for ${label}`);
}
console.log(`verified ${Object.keys(manifest.sampleSha256).length} attributed real demo recordings`);
