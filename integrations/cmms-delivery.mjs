import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalJson, verifyWorkOrderIntegrity } from "../src/work-order.js";

function endpointFor(value) {
  const endpoint = new URL(value);
  const local = endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname);
  if (endpoint.protocol !== "https:" && !local) throw new Error("Remote CMMS delivery requires HTTPS; HTTP is accepted only for localhost testing");
  return endpoint;
}

export function signPayload(body, secret) {
  if (typeof secret !== "string" || secret.length < 16) throw new Error("CMMS signing secret must contain at least 16 characters");
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function verifyPayload(body, signature, secret) {
  if (typeof signature !== "string") return false;
  const expected = Buffer.from(signPayload(body, secret));
  const supplied = Buffer.from(signature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function deliverWorkOrder({ url, workOrder, secret, retries = 2 }, { fetchImpl = fetch } = {}) {
  if (!Number.isInteger(retries) || retries < 0 || retries > 5) throw new Error("Retries must be an integer from 0 to 5");
  if (!verifyWorkOrderIntegrity(workOrder)) throw new Error("Work-order content hash does not match its canonical body");
  const endpoint = endpointFor(url);
  const body = canonicalJson(workOrder);
  const signature = signPayload(body, secret);
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-rotornote-signature": signature,
          "idempotency-key": workOrder.externalId,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      const payload = await response.json();
      if (response.ok) return { attempt: attempt + 1, status: response.status, payload, bodySha256: workOrder.contentSha256 };
      const error = new Error(`${response.status}: ${payload.message || payload.error || "CMMS delivery rejected"}`);
      if (response.status !== 429 && response.status < 500) {
        error.nonRetryable = true;
        throw error;
      }
      if (attempt === retries) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (error.nonRetryable || attempt === retries) throw error;
    }
  }
  throw lastError;
}
