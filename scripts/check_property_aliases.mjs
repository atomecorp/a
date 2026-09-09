// Cliquet sur les propriétés persistées écrites sous DEUX orthographes.
//
// Mesuré sur un coffre réel (2026-09-09): 15 clés sur 85 existaient en camelCase
// ET en snake_case. `svgMarkup`/`svg_markup` stockaient deux fois les mêmes
// 35 789 octets, avec doublement dans `particles_versions` et dans les événements.
//
// La double écriture n'est pas supprimable d'un coup: certains modules ne lisent
// QUE l'une des deux formes. La dette est déclarée dans
// atome/src/shared/property_aliases.js; cette garde empêche d'en AJOUTER.
//
// Le compte ne peut que descendre. Baissez BUDGET quand vous le faites baisser.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BUDGET = 148;
const ROOTS = ['atome/src', 'eVe'];
const SKIP = new Set(['node_modules', 'target', 'dist', 'js', 'vendor', 'R&D', 'wasm', 'assets']);

const CAMEL_TO_SNAKE = /^[a-z]+(?:[A-Z][a-z0-9]*)+$/;
const toSnake = (name) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

const walk = (dir, acc = []) => {
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
    for (const entry of entries) {
        if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, acc);
        else if (/\.js$/.test(entry.name)) acc.push(full);
    }
    return acc;
};

// Une double écriture est deux affectations ADJACENTES de la même valeur sous les
// deux orthographes: `x: v,` suivi de `xSnake: v,` (ou l'inverse), dans un objet
// ou par `obj.a = v; obj.a_b = v;`.
const OBJECT_PAIR = /(\w+)\s*:\s*([^,\n]+),?\s*\n\s*(\w+)\s*:\s*([^,\n]+),?/g;
const ASSIGN_PAIR = /(\w+)\.(\w+)\s*=\s*([^;\n]+);\s*\n\s*\1\.(\w+)\s*=\s*([^;\n]+);/g;

let total = 0;
const hits = [];
for (const root of ROOTS) {
    for (const file of walk(path.join(ROOT, root))) {
        const src = fs.readFileSync(file, 'utf8');
        const rel = path.relative(ROOT, file).split(path.sep).join('/');
        for (const m of src.matchAll(OBJECT_PAIR)) {
            const [, k1, v1, k2, v2] = m;
            if (v1.trim() !== v2.trim()) continue;
            if (!(CAMEL_TO_SNAKE.test(k1) && toSnake(k1) === k2) && !(CAMEL_TO_SNAKE.test(k2) && toSnake(k2) === k1)) continue;
            total += 1; hits.push(`${rel}: ${k1} + ${k2}`);
        }
        for (const m of src.matchAll(ASSIGN_PAIR)) {
            const [, , k1, v1, k2, v2] = m;
            if (v1.trim() !== v2.trim()) continue;
            if (!(CAMEL_TO_SNAKE.test(k1) && toSnake(k1) === k2) && !(CAMEL_TO_SNAKE.test(k2) && toSnake(k2) === k1)) continue;
            total += 1; hits.push(`${rel}: .${k1} + .${k2}`);
        }
    }
}

if (total > BUDGET) {
    console.error(`property-alias budget exceeded: ${total} > ${BUDGET}`);
    hits.slice(0, 12).forEach((h) => console.error(`- ${h}`));
    process.exit(1);
}
if (total < BUDGET) {
    console.log(`property-alias budget: ${total} (budget ${BUDGET}) — lower BUDGET in this file to ${total}.`);
} else {
    console.log(`property-alias budget: ${total}/${BUDGET}`);
}
