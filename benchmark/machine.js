import { execFileSync } from "node:child_process";
import os from "node:os";

function lscpuModel() {
  try {
    const parsed = JSON.parse(execFileSync("lscpu", ["-J"], { encoding: "utf8", timeout: 2_000 }));
    const row = parsed.lscpu?.find((entry) => entry.field?.replace(/:$/, "") === "Model name");
    return row?.data?.trim() || null;
  } catch {
    return null;
  }
}

export function machineIdentity() {
  const reported = os.cpus()[0]?.model?.trim();
  const cpuModel = reported && reported.toLowerCase() !== "unknown" ? reported : lscpuModel() || "unreported";
  return { architecture: process.arch, platform: process.platform, cpus: os.cpus().length, cpuModel, node: process.version };
}
