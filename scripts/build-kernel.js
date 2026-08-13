import { readFile, writeFile, mkdir } from "node:fs/promises";
import wabtFactory from "wabt";

const wabt = await wabtFactory();
const source = await readFile(new URL("../kernel/dense.wat", import.meta.url), "utf8");
const module = wabt.parseWat("dense.wat", source, { simd: true });
module.resolveNames();
module.validate({ simd: true });
const { buffer } = module.toBinary({ canonicalize_lebs: true, write_debug_names: false });
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await writeFile(new URL("../dist/dense.wasm", import.meta.url), buffer);
console.log(`built dist/dense.wasm (${buffer.length} bytes)`);
