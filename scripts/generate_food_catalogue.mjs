// Builds the shopping list's generic food catalogue from the ANSES Ciqual table
// (Etalab 2.0, attribution in THIRD_PARTY_LICENSES.md): the foods one buys, by aisle,
// with their name in French and English and their energy (kcal per 100 g, EU 1169/2011).
// The XML comes from the dataset's files (Dataverse API `/api/access/datafile/<id>`):
// alim_*.xml and compo_*.xml, both in <ciqual-dir>.
//
//   node scripts/generate_food_catalogue.mjs <ciqual-dir>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { FOOD_CATALOGUE_ASSET } from '../eVe/domains/shopping/food_catalogue.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SOURCE = Object.freeze({ name: 'Ciqual 2025, ANSES', updated: '2025-11-19', doi: '10.57745/RDMHWY', licence: 'etalab-2.0' });
const ENERGY_KCAL = '328';
// Each aisle takes these Ciqual sub-groups (alim_ssgrp_code). Composed dishes (01),
// infant foods (11), foods for special diets (1008) and the overseas regional
// sub-groups stay out: they are not what a shopping list names.
const AISLES = Object.freeze([
    ['fruits', ['0204']], ['vegetables', ['0201', '0202', '0203']], ['meat', ['0401', '0402', '0403', '0404', '0411']],
    ['fish', ['0405', '0406', '0407', '0408', '0409']], ['dairy', ['0501', '0502', '0504', '0410']], ['cheese', ['0503']],
    ['bread', ['0301', '0302', '0304', '0305']], ['sweet', ['0701', '0702', '0703', '0704', '0705', '0706', '0707', '0708', '0709', '0801', '0802', '0803']],
    ['drinks', ['0601', '0602', '0603']], ['pantry', ['0205', '0303', '0901', '0902', '0903', '0904', '0905', '1001', '1002', '1003', '1004', '1005', '1006', '1007', '1009', '1010']]
]);
const LEFT_OUT = new Set(['020104', '020105', '020405', '020406', '050204', '050205']);
// A shopping name stays short (a cell's label band); the branded mineral waters are left to the products.
const MAX_WORDS = 3;
const BRANDED = /^Eau minérale [A-ZÉ]/;
// Among the variants of one name, the entry that names it and gives its energy is, in
// that order: one with a known energy, the raw food (what is bought), Ciqual's own
// average of the food, the plainest description. « X ou assimilé » (X or alike) names no food.
const RAW = /(^|[ ,])(crue?s?|frais|fraîche?s?)(,|$| )/i;
const AVERAGE = /\(aliment moyen\)/;
// « cru », « cuit » and « sans précision… » (unspecified) qualify the food, they do not name another.
const STATE = / (crue?s?|cuite?s?|sans précision.*)$/;
const ALIKE = / ou assimilée?s?/;
// Spelling slips of the Ciqual 2025 release itself.
const CORRECTIONS = Object.freeze({ Ceriser: 'Cerise' });

const [dir] = process.argv.slice(2);
if (!dir) throw new Error('usage: node scripts/generate_food_catalogue.mjs <ciqual-dir>');
const fileOf = prefix => {
    const name = readdirSync(dir).find(entry => entry.startsWith(prefix) && entry.endsWith('.xml'));
    if (!name) throw new Error(`ciqual_file_missing:${prefix}`);
    return readFileSync(path.join(dir, name), 'utf8');
};
const records = (xml, tag) => Array.from(xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g')),
    match => Object.fromEntries(Array.from(match[1].matchAll(/<(\w+)>\s*([^<]*?)\s*<\/\1>/g), ([, key, value]) => [key, value])));
const decode = value => value.replace(/&apos;/g, '\'').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// « Pomme, pulpe et peau, crue » → « Pomme », « Calmar ou calamar » → « Calmar »:
// the shopping name is the first segment's first alternative.
const segments = name => decode(name).split(/, | \(/).map(part => part.replace(/[()]/g, '').trim());
const shortName = (name) => {
    const short = segments(name)[0].split(/ ou | or /)[0].replace(STATE, '').trim();
    return CORRECTIONS[short] || short;
};
const kcalOf = (value) => {
    if (value === undefined || value === '-') return null;
    if (value === 'traces') return 0;
    return Math.round(Number(value.replace(',', '.')));
};

const energy = new Map(records(fileOf('compo_'), 'COMPO').filter(entry => entry.const_code === ENERGY_KCAL)
    .map(entry => [entry.alim_code, kcalOf(entry.teneur)]));
const aisleOf = new Map(AISLES.flatMap(([, groups], index) => groups.map(group => [group, index])));
const chosen = new Map();
for (const food of records(fileOf('alim_2'), 'ALIM')) {
    const aisle = aisleOf.get(food.alim_ssgrp_code);
    if (aisle === undefined || LEFT_OUT.has(food.alim_ssssgrp_code)) continue;
    const fr = shortName(food.alim_nom_fr), key = `${aisle}|${fr.toLowerCase()}`, current = chosen.get(key);
    if (fr.split(/\s+/).length > MAX_WORDS || BRANDED.test(fr) || ALIKE.test(food.alim_nom_fr)) continue;
    const name = decode(food.alim_nom_fr), kcal = energy.get(food.alim_code) ?? null;
    const rank = (kcal === null ? 0 : 8) + (RAW.test(name) ? 4 : 0) + (AVERAGE.test(name) ? 2 : 0) + (segments(name).length <= 2 ? 1 : 0);
    if (current && current.rank >= rank) continue;
    chosen.set(key, { rank, en: segments(food.alim_nom_eng), entry: [Number(food.alim_code), aisle, fr, shortName(food.alim_nom_eng), kcal] });
}
// English often names variants alike (« Apricot » for raw and in syrup): a repeated
// English name in an aisle takes its second segment too.
const english = new Map();
for (const { entry } of chosen.values()) english.set(`${entry[1]}|${entry[3]}`, (english.get(`${entry[1]}|${entry[3]}`) || 0) + 1);
const foods = [...chosen.values()].map(({ entry, en }) => (english.get(`${entry[1]}|${entry[3]}`) > 1 && en[1] ? [...entry.slice(0, 3), `${en[0]} ${en[1]}`, entry[4]] : entry)).sort((a, b) => a[1] - b[1] || a[2].localeCompare(b[2], 'fr'));
const output = path.join(ROOT, 'atome/src', FOOD_CATALOGUE_ASSET);
writeFileSync(output, `${JSON.stringify({ source: SOURCE, aisles: AISLES.map(([key]) => key), foods })}\n`);
console.log(`${foods.length} foods → ${path.relative(ROOT, output)}`);
AISLES.forEach(([key], index) => console.log(key, foods.filter(food => food[1] === index).length));
