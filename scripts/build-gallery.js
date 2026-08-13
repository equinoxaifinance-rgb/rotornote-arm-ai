import { mkdir, writeFile } from "node:fs/promises";

const directory = new URL("../assets/gallery/", import.meta.url);
await mkdir(directory, { recursive: true });
const font = "font-family='Arial,Helvetica,sans-serif'";
const mono = "font-family='Courier New,monospace'";
const shell = (body, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" role="img" aria-label="${label}">
<rect width="1600" height="900" fill="#f2f1e9"/><path d="M0 0h1600v900H0z" fill="url(#grid)" opacity=".45"/>
<defs><pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M36 0H0v36" fill="none" stroke="#d9d8ce" stroke-width="1"/></pattern></defs>
${body}</svg>\n`;
const logo = `<g transform="translate(78 62)" fill="none" stroke="#204d3b" stroke-width="4"><circle cx="24" cy="24" r="18"/><circle cx="24" cy="24" r="5"/><path d="M0 24h11m26 0h11M24 0v11m0 26v11"/></g><text x="142" y="97" ${font} font-size="28" font-weight="700" fill="#17211d">RotorNote</text>`;

const hero = shell(`${logo}
<text x="92" y="220" ${mono} font-size="16" font-weight="700" letter-spacing="3" fill="#204d3b">VIBRATION SCREENING · ARM CLOUD READY</text>
<text x="86" y="368" ${font} font-size="116" font-weight="800" letter-spacing="-8" fill="#17211d">Hear the machine</text>
<text x="86" y="480" font-family="Georgia,serif" font-size="116" font-style="italic" letter-spacing="-5" fill="#204d3b">before it stops.</text>
<text x="94" y="556" ${font} font-size="25" fill="#66716c">One vibration trace becomes a fault timeline and a specific field retest.</text>
<g transform="translate(94 642)"><rect width="540" height="104" rx="2" fill="#204d3b"/><text x="30" y="42" ${mono} font-size="13" fill="#d8ff62">01  CHOOSE A RECORDING</text><text x="30" y="77" ${font} font-size="20" font-weight="700" fill="white">real-imbalance.csv</text><text x="502" y="65" ${font} font-size="30" fill="#d8ff62">→</text></g>
<g transform="translate(970 584)"><circle cx="190" cy="90" r="145" fill="none" stroke="#c9cbc2" stroke-width="2"/><circle cx="190" cy="90" r="94" fill="none" stroke="#c9cbc2"/><circle cx="190" cy="90" r="42" fill="none" stroke="#c9cbc2"/><path d="M20 90h340M190-70v320" stroke="#c9cbc2"/><circle cx="260" cy="30" r="10" fill="#ff6b35"/><circle cx="260" cy="30" r="23" fill="#ff6b35" opacity=".15"/></g>`, "RotorNote hero: Hear the machine before it stops");

const analysis = shell(`${logo}
<rect x="72" y="144" width="1456" height="688" rx="5" fill="#fbfaf4" stroke="#d9d8ce"/>
<text x="116" y="205" ${mono} font-size="15" font-weight="700" fill="#66716c">02  SCREENING RESULT</text><rect x="1316" y="177" width="150" height="36" fill="#fff9d9" stroke="#f0b64d"/><text x="1354" y="201" ${mono} font-size="13" font-weight="700" fill="#70590d">PLAN</text>
<text x="114" y="306" font-family="Georgia,serif" font-style="italic" font-size="62" fill="#17211d">Strong once-per-revolution</text><text x="114" y="374" font-family="Georgia,serif" font-style="italic" font-size="62" fill="#17211d">pattern</text>
<text x="116" y="432" ${mono} font-size="13" font-weight="700" fill="#66716c">IMBALANCE</text><text x="1440" y="432" ${mono} text-anchor="end" font-size="18" font-weight="700" fill="#17211d">52%</text><rect x="116" y="450" width="1324" height="7" fill="#e3e2d8"/><rect x="116" y="450" width="688" height="7" fill="#ff6b35"/>
<g transform="translate(116 494)"><rect width="1324" height="162" fill="#17211d"/><text x="22" y="29" ${mono} font-size="11" fill="#8c9992">VIBRATION TRACE</text><path d="M18 98 C72 87 84 105 137 96 S214 83 250 96 S310 101 348 94 L375 52 390 123 408 72 430 101 C480 88 515 102 558 96 L584 46 600 130 620 70 650 100 C720 88 758 102 810 95 L839 48 858 126 875 73 904 99 C968 88 1010 104 1060 95 L1087 44 1104 129 1123 68 1150 101 C1200 87 1258 103 1300 94" fill="none" stroke="#d8ff62" stroke-width="3"/></g>
<text x="116" y="704" ${mono} font-size="11" font-weight="700" fill="#66716c">FAULT TIMELINE</text><g transform="translate(116 725)"><rect width="170" height="48" fill="#84b89b"/><rect x="178" width="170" height="48" fill="#84b89b"/><rect x="356" width="170" height="48" fill="#84b89b"/><rect x="534" width="170" height="48" fill="#e58c50"/><rect x="712" width="170" height="48" fill="#f0b64d"/><rect x="890" width="170" height="48" fill="#f0b64d"/><rect x="1068" width="256" height="48" fill="#f0b64d"/></g>`, "RotorNote analysis report with waveform and fault timeline");

const arm = shell(`${logo}
<rect x="72" y="150" width="1456" height="640" rx="5" fill="#204d3b"/>
<rect x="124" y="206" width="62" height="38" rx="2" fill="#17211d"/><text x="139" y="231" ${mono} font-size="14" font-weight="700" fill="#d8ff62">ARM</text>
<text x="124" y="335" font-family="Georgia,serif" font-style="italic" font-size="75" fill="white">Smaller weights.</text><text x="124" y="414" font-family="Georgia,serif" font-style="italic" font-size="75" fill="white">Vector work.</text>
<text x="126" y="480" ${font} font-size="22" fill="#bdd0c6">The same real-data classifier, measured two honest ways.</text>
<g transform="translate(124 560)"><text y="0" ${mono} font-size="13" fill="#bdd0c6">BASELINE</text><text y="34" ${font} font-size="22" font-weight="700" fill="white">FP32 · scalar JavaScript</text><rect y="58" width="540" height="30" fill="#e6e6de"/><text x="560" y="80" ${mono} font-size="14" fill="white">784 B</text></g>
<g transform="translate(842 560)"><text y="0" ${mono} font-size="13" fill="#bdd0c6">OPTIMIZED</text><text y="34" ${font} font-size="22" font-weight="700" fill="white">INT8 · WebAssembly SIMD</text><rect y="58" width="143" height="30" fill="#d8ff62"/><text x="163" y="80" ${mono} font-size="14" fill="white">208 B</text></g>
<line x1="790" y1="220" x2="790" y2="490" stroke="#517261"/><text x="1170" y="323" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="116" fill="#d8ff62">73.47%</text><text x="1170" y="368" text-anchor="middle" ${mono} font-size="14" letter-spacing="2" fill="#bdd0c6">FEWER WEIGHT BYTES</text><text x="1170" y="430" text-anchor="middle" ${font} font-size="17" fill="white">Recording-level parity: 100%.</text>`, "RotorNote Arm optimization comparison");

await Promise.all([
  writeFile(new URL("01-hero.svg", directory), hero),
  writeFile(new URL("02-analysis.svg", directory), analysis),
  writeFile(new URL("03-arm-optimization.svg", directory), arm),
]);
console.log("built 3 original gallery SVGs (1600×900)");
