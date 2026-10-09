// Active map references must exist. Explicit `retired:path` records preserve
// former owners without presenting them as available code; they must stay absent.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BUDGET = 0;
const MAPS = ['maps/CODEMAP.md', 'maps/API_MAP.md', 'maps/ARCHITECTURE_MAP.md', 'maps/DESIGN_MAP.md'];
const PATH_IN_BACKTICKS = /`(retired:)?((?:atome|eVe|server|database|scripts|tests|platforms)\/[A-Za-z0-9_./-]+\.(?:js|mjs|rs|swift|css|html|sql))`/g;

let total = 0;
const perMap = [];
const samples = [];
for (const map of MAPS) {
    const full = path.join(ROOT, map);
    if (!fs.existsSync(full)) {
        total += 1;
        perMap.push({ map, count: 1 });
        samples.push(`${map}: required map missing`);
        continue;
    }
    const cited = [...fs.readFileSync(full, 'utf8').matchAll(PATH_IN_BACKTICKS)];
    const invalid = new Set(cited.flatMap(([, retired, rel]) => {
        const exists = fs.existsSync(path.join(ROOT, rel));
        return retired ? (exists ? [`${rel} (marked retired but exists)`] : []) : (exists ? [] : [rel]);
    }));
    const missing = [...invalid];
    total += missing.length;
    if (missing.length) {
        perMap.push({ map, count: missing.length });
        samples.push(...missing.slice(0, 3).map((rel) => `${map}: ${rel}`));
    }
}

if (total > BUDGET) {
    console.error(`map-path budget exceeded: ${total} > ${BUDGET}`);
    perMap.sort((a, b) => b.count - a.count).forEach((e) => console.error(`- ${e.count}  ${e.map}`));
    samples.slice(0, 10).forEach((s) => console.error(`    ${s}`));
    process.exit(1);
}
console.log(`map-path budget: ${total}/${BUDGET}`);
