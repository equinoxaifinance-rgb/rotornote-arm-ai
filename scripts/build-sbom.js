import { readFile, writeFile } from "node:fs/promises";

const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
const wabt = lock.packages["node_modules/wabt"];
const document = {
  spdxVersion: "SPDX-2.3",
  dataLicense: "CC0-1.0",
  SPDXID: "SPDXRef-DOCUMENT",
  name: "RotorNote-1.1.0",
  documentNamespace: "https://github.com/equinoxaifinance-rgb/rotornote-arm-ai/spdx/1.1.0",
  creationInfo: {
    created: "2026-08-13T00:00:00Z",
    creators: ["Tool: RotorNote deterministic SBOM generator"],
  },
  packages: [
    {
      name: "rotornote",
      SPDXID: "SPDXRef-Package-RotorNote",
      versionInfo: "1.1.0",
      downloadLocation: "https://github.com/equinoxaifinance-rgb/rotornote-arm-ai",
      filesAnalyzed: false,
      licenseConcluded: "MIT",
      licenseDeclared: "MIT",
      copyrightText: "NOASSERTION",
    },
    {
      name: "wabt",
      SPDXID: "SPDXRef-Package-wabt",
      versionInfo: wabt.version,
      downloadLocation: wabt.resolved,
      checksums: [{ algorithm: "SHA512", checksumValue: Buffer.from(wabt.integrity.replace("sha512-", ""), "base64").toString("hex") }],
      filesAnalyzed: false,
      licenseConcluded: "Apache-2.0",
      licenseDeclared: "Apache-2.0",
      copyrightText: "NOASSERTION",
      primaryPackagePurpose: "BUILD_TOOL",
    },
  ],
  relationships: [{
    spdxElementId: "SPDXRef-DOCUMENT",
    relationshipType: "DESCRIBES",
    relatedSpdxElement: "SPDXRef-Package-RotorNote",
  }, {
    spdxElementId: "SPDXRef-Package-RotorNote",
    relationshipType: "DEV_DEPENDENCY_OF",
    relatedSpdxElement: "SPDXRef-Package-wabt",
  }],
};
await writeFile(new URL("../sbom.spdx.json", import.meta.url), `${JSON.stringify(document, null, 2)}\n`);
console.log("built sbom.spdx.json (1 build-only dependency, 0 production dependencies)");
