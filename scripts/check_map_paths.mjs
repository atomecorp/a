// Cliquet sur les chemins de fichiers cités dans maps/*.md qui n'existent plus.
//
// Les quatre cartes totalisent ~1 Mo de Markdown et servent de référence
// d'architecture. À l'audit du 2026-09-09, 144 des 1 223 chemins cités (11,8 %)
// pointaient vers des fichiers supprimés — dont des dizaines de `tests/**/*.test.mjs`
// laissés derrière par le renommage en `.probe.mjs`. Une carte qui décrit des
// fichiers absents coûte plus qu'elle ne rapporte: elle envoie chercher au mauvais
// endroit.
//
// Le compte ne peut que DESCENDRE. Baissez BUDGET quand vous le faites baisser.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BUDGET = 127;
const MAPS = ['maps/CODEMAP.md', 'maps/API_MAP.md', 'maps/ARCHITECTURE_MAP.md', 'maps/DESIGN_MAP.md'];
const PATH_IN_BACKTICKS = /`((?:atome|eVe|server|database|scripts|tests|platforms)\/[A-Za-z0-9_./-]+\.(?:js|mjs|rs|swift|css|html|sql))`/g;

let total = 0;
const perMap = [];
const samples = [];
for (const map of MAPS) {
    const full = path.join(ROOT, map);
    if (!fs.existsSync(full)) continue;
    const cited = new Set([...fs.readFileSync(full, 'utf8').matchAll(PATH_IN_BACKTICKS)].map((m) => m[1]));
    const missing = [...cited].filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
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
if (total < BUDGET) {
    console.log(`map-path budget: ${total} (budget ${BUDGET}) — lower BUDGET in this file to ${total}.`);
} else {
    console.log(`map-path budget: ${total}/${BUDGET}`);
}
