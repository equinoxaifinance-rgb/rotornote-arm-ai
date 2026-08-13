import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export function parseArguments(args) {
  const options = { rate: 1024, engine: "optimized", axis: "unknown", point: "unspecified", retries: 2 };
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]?.replace(/^--/, "");
    if (!key || args[index + 1] === undefined) throw new Error(`Expected --name value pairs; failed near ${args[index] || "end"}`);
    options[key] = args[index + 1];
  }
  options.rate = Number(options.rate);
  options.retries = Number(options.retries);
  if (!options.url || !options.file || !options.machine) throw new Error("Required: --url, --file, and --machine");
  if (!Number.isInteger(options.retries) || options.retries < 0 || options.retries > 5) throw new Error("Retries must be an integer from 0 to 5");
  return options;
}

function endpointFor(base, engine) {
  const endpoint = new URL("/api/screen", base);
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname))) {
    throw new Error("Remote gateways require HTTPS; HTTP is accepted only for localhost testing");
  }
  endpoint.searchParams.set("engine", engine);
  return endpoint;
}

export async function runGateway(options, { fetchImpl = fetch } = {}) {
  const csv = await readFile(options.file, "utf8");
  const endpoint = endpointFor(options.url, options.engine);
  const headers = {
    "content-type": "text/csv",
    "x-sample-rate": String(options.rate),
    "x-machine-id": options.machine,
    "x-measurement-point": options.point,
    "x-sensor-axis": options.axis,
  };
  if (options.rpm !== undefined) headers["x-operating-rpm"] = String(options.rpm);
  if (options.load !== undefined) headers["x-load-percent"] = String(options.load);

  let lastError;
  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    try {
      const response = await fetchImpl(endpoint, { method: "POST", headers, body: csv, signal: AbortSignal.timeout(10_000) });
      const payload = await response.json();
      if (response.ok) return payload;
      if (response.status < 500 || attempt === options.retries) throw new Error(`${response.status}: ${payload.message || payload.error}`);
      lastError = new Error(`${response.status}: ${payload.message || payload.error}`);
    } catch (error) {
      lastError = error;
      if (attempt === options.retries) throw error;
    }
  }
  throw lastError;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const payload = await runGateway(parseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`RotorNote gateway failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
