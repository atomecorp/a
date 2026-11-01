// Structural rules of the registry, shared by the build (refuses to write a broken map) and the check:
// schema validity (draft 2020-12), unresolved ids, duplicate owners, orphan placements, alias collisions,
// forbidden cycles (relation types the schema marks `x-acyclic`) and stale declared entries.
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { ROOT, SCHEMA_FILE, readJson, SOURCE_NAMES } from './registry_paths.mjs';

const schema = readJson(SCHEMA_FILE);
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
ajv.addKeyword({ keyword: 'x-acyclic', schemaType: 'boolean' });
ajv.addSchema(schema);
const validateMap = ajv.getSchema(schema.$id);
const validateSource = Object.fromEntries(SOURCE_NAMES.map(name => [name, ajv.compile({ $ref: `${schema.$id}#/$defs/sources/${name}` })]));
const ACYCLIC = schema.$defs.relation.allOf.filter(rule => rule.then['x-acyclic']).map(rule => rule.if.properties.type.const);
const ROOT_ROLES = new Set(['home', 'menu_slot']);

const ajvErrors = (where, validate) => (validate.errors || []).slice(0, 20).map(error => `schema:${where}${error.instancePath} ${error.message}`);

export function schemaErrors(map, sources) {
    const errors = [];
    for (const name of SOURCE_NAMES) if (!validateSource[name](sources[name])) errors.push(...ajvErrors(`source/${name}`, validateSource[name]));
    if (!validateMap(map)) errors.push(...ajvErrors('full-map', validateMap));
    return errors;
}

function cycles(relations, type) {
    const next = new Map();
    relations.filter(relation => relation.type === type).forEach(relation => { if (!next.has(relation.from)) next.set(relation.from, []); next.get(relation.from).push(relation.to); });
    const state = new Map(), found = [];
    const visit = (node, trail) => {
        state.set(node, 'open');
        for (const to of next.get(node) || []) {
            if (state.get(to) === 'open') found.push([...trail.slice(trail.indexOf(to)), to].join(' > '));
            else if (!state.has(to)) visit(to, [...trail, to]);
        }
        state.set(node, 'done');
    };
    [...next.keys()].sort().forEach(node => { if (!state.has(node)) visit(node, [node]); });
    return found;
}

const quotedIn = (file, value) => {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    return [`'${value}'`, `"${value}"`, `\`${value}\``].some(quoted => text.includes(quoted));
};

// A placement whose parent is neither a root nor placed anywhere: unreachable. In an owned source it is an error;
// projected from the code (a menu palette no menu shows) it is a finding of the inventory report.
export function orphanPlacements(map) {
    const entries = map.entries, placements = Object.values(entries).filter(entry => entry.kind === 'ui_placement');
    const placedTargets = new Set(placements.filter(placement => placement.effect === 'show').map(placement => placement.target));
    return placements.filter(placement => entries[placement.parent] && !ROOT_ROLES.has(entries[placement.parent].role) && !placedTargets.has(placement.parent));
}

export function integrityErrors(map, sources, findings) {
    const errors = [], entries = map.entries, has = id => Boolean(entries[id]);
    findings.filter(finding => finding.type === 'duplicate_owner').forEach(finding => errors.push(`duplicate_owner:${finding.id} (${finding.owners.join(' | ')})`));
    for (const placement of Object.values(entries).filter(entry => entry.kind === 'ui_placement')) {
        if (!has(placement.parent)) errors.push(`unresolved_id:${placement.id} parent ${placement.parent}`);
        if (!has(placement.target)) errors.push(`unresolved_id:${placement.id} target ${placement.target}`);
    }
    orphanPlacements(map).filter(placement => placement.origin !== 'projected')
        .forEach(placement => errors.push(`orphan_placement:${placement.id} (parent ${placement.parent} is never placed)`));
    for (const relation of map.relations) for (const end of [relation.from, relation.to]) if (!has(end)) errors.push(`unresolved_id:${relation.type} ${relation.from} > ${relation.to}`);
    for (const entry of Object.values(entries)) {
        if (entry.execution_ref && !has(`action_contract:${entry.execution_ref.contract}`)) errors.push(`unresolved_id:${entry.id} execution_ref ${entry.execution_ref.contract}`);
        if (entry.origin === 'declared' && !quotedIn(entry.owner, entry.native_id)) errors.push(`stale_declared_entry:${entry.id} not named in ${entry.owner}`);
    }
    const aliasNames = sources.aliases.aliases.map(alias => alias.alias);
    aliasNames.filter((name, index) => aliasNames.indexOf(name) !== index).forEach(name => errors.push(`alias_collision:${name} declared twice`));
    for (const [alias, { target }] of Object.entries(map.aliases)) {
        if (!has(target)) errors.push(`unresolved_id:alias ${alias} > ${target}`);
        if (has(alias)) errors.push(`alias_collision:${alias} is also an entry id`);
        if (map.archived[alias]) errors.push(`alias_collision:${alias} is also archived`);
        const owners = Object.values(entries).filter(entry => entry.native_id === alias && entry.id !== target).map(entry => entry.id);
        if (owners.length) errors.push(`alias_collision:${alias} is the native id of ${owners.join(', ')}`);
    }
    for (const type of ACYCLIC) cycles(map.relations, type).forEach(cycle => errors.push(`forbidden_cycle:${type} ${cycle}`));
    const codeAliased = new Set(map.relations.filter(relation => relation.type === 'aliases' && relation.status === 'code_declared').map(relation => relation.from));
    for (const brick of Object.values(entries).filter(entry => entry.kind === 'doc_brick')) {
        if ((brick.alias_status === 'code_declared') !== codeAliased.has(brick.id)) errors.push(`alias_status_mismatch:${brick.id} ${brick.alias_status}`);
    }
    return errors;
}
