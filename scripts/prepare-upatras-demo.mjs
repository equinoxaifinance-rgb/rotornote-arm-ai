import fs from "node:fs";
import path from "node:path";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}
const source = path.resolve(argument("--source") || "");
if (!fs.existsSync(source)) throw new Error("Usage: node scripts/prepare-upatras-demo.mjs --source <UPATRAS measurement-sequence CSV>");
const lines = fs.readFileSync(source, "utf8").trim().split(/\r?\n/);
const header = lines.shift().split(",");
const speedColumn = header.indexOf("speed_35_0_Hz");
if (speedColumn < 0 || lines.length !== 3500) throw new Error("Unexpected UPATRAS demo source");
const output = [
  "# Source: UPATRAS dataset DOI 10.17632/42v3s74gf9.1, CC BY 4.0",
  "# State: Unbalance 3g; measurement sequence 01; rotating speed 35.0 Hz",
  "sensor",
  ...lines.map((line) => line.split(",")[speedColumn]),
];
fs.writeFileSync(new URL("../samples/real-variable-speed-anomaly.csv", import.meta.url), `${output.join("\n")}\n`);
console.log("built attributed UPATRAS variable-speed anomaly demo (3,500 samples)");
