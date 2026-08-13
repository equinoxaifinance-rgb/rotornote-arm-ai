import { mkdir, writeFile } from "node:fs/promises";
import { simulateSignal } from "../src/signal.js";

const directory = new URL("../samples/", import.meta.url);
await mkdir(directory, { recursive: true });

async function writeSample(name, sections) {
  const values = new Float32Array(sections.reduce((sum, section) => sum + section.seconds * 1024, 0));
  let offset = 0;
  for (const [index, section] of sections.entries()) {
    const generated = simulateSignal(section.kind, section.seconds * 1024, 1024, section.seed + index);
    values.set(generated, offset);
    offset += generated.length;
  }
  const rows = ["amplitude", ...Array.from(values, (value) => value.toFixed(7))];
  await writeFile(new URL(name, directory), `${rows.join("\n")}\n`);
  console.log(`built samples/${name} (${values.length} samples)`);
}

await writeSample("steady-baseline.csv", [{ kind: "healthy", seconds: 8, seed: 17 }]);
await writeSample("bearing-pulse.csv", [{ kind: "bearing", seconds: 8, seed: 29 }]);
await writeSample("shift-change.csv", [
  { kind: "healthy", seconds: 4, seed: 41 },
  { kind: "imbalance", seconds: 5, seed: 43 },
]);

