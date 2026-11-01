#!/usr/bin/env node
// npm run registry:build — imports the real owners, merges eVe/registry/source/*.json, validates the result
// (schema 2020-12 + integrity rules) and writes eVe/registry/generated/. Deterministic: sorted, no timestamps.
// A broken registry is never written: the build lists the errors and exits 1.
import fs from 'node:fs';
import path from 'node:path';
import { generatedFile, stable } from './registry_paths.mjs';
import { assembleRegistry } from './registry_assemble.mjs';
import { schemaErrors, integrityErrors, orphanPlacements } from './registry_integrity.mjs';
import { uiTree, searchIndex, inventoryReport, graphMermaid } from './registry_outputs.mjs';
import { indexMarkdown } from './registry_index_md.mjs';
import { writeAtomeTypes } from './registry_atome_types.mjs';

// Owners whose facts cannot be projected in Node, with the reason found (architecture §4).
export const REGISTRY_HOLES = Object.freeze([
    { owner: 'eVe/intuition/tools/core/tool_runtime.js#buildLabelKey', reason: 'tool_runtime.js runs createToolRuntimeBootstrap at import (installs window APIs and the service executors), so the label-key rule cannot be loaded in Node; tool entries carry their label fallback, not a label key.' },
    { owner: 'eVe/intuition/runtime/tool.js (registerUiAction / registerAtomeTool callers)', reason: 'Runtime registrations are spread over modules that touch the page at import; they are declared in annotations.json declared_entries and checked by name in their owner file. Projected by import: main_tool_registration_runtime.js (merged as menu_handler onto the owning tool) and timeline_actions.js (computed ids). Re-registrations by the other modules are not detected in Node.' },
    { owner: 'eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js#registerBevyPanelSurface callers', reason: 'Surfaces registered at runtime by their modules (many touch the DOM at import); declared in annotations.json declared_entries, checked by name in their owner file.' },
    { owner: 'eVe/intuition/tools/core/tool_registry_storage.js, ui.activity.select.<id>', reason: 'Tools created by users or the assistant and per-activity tools are vault data, not definitions. A project band\'s tools are placed (menu_slot.project_band.tools, under the project fact band_tool:<key>).' }
]);

const writeJson = (name, value) => fs.writeFileSync(generatedFile(name), `${JSON.stringify(stable(value), null, 1)}\n`);
// One entry per line: compact for the bundled map, still diff-friendly.
const mapText = map => {
    const head = { format: map.format, inputs_hash: map.inputs_hash, inputs: stable(map.inputs) };
    const lines = Object.entries(map.entries).map(([id, entry]) => `${JSON.stringify(id)}:${JSON.stringify(stable(entry))}`);
    const relations = map.relations.map(relation => JSON.stringify(stable(relation)));
    return `${JSON.stringify(head).slice(0, -1)},\n"entries":{\n${lines.join(',\n')}\n},\n"relations":[\n${relations.join(',\n')}\n],\n`
        + `"aliases":${JSON.stringify(stable(map.aliases))},\n"archived":${JSON.stringify(stable(map.archived))},\n"archived_classes":${JSON.stringify(stable(map.archived_classes))}}\n`;
};

export async function buildRegistry() {
    const { map, sources, findings } = await assembleRegistry();
    const errors = [...schemaErrors(map, sources), ...integrityErrors(map, sources, findings)];
    if (errors.length) return { ok: false, errors };
    fs.mkdirSync(path.dirname(generatedFile('full-map.json')), { recursive: true });
    const search = searchIndex(map), report = inventoryReport(map, [...findings, ...orphanPlacements(map)
        .map(placement => ({ type: 'orphan_projected_placement', id: placement.id, parent: placement.parent }))], REGISTRY_HOLES);
    fs.writeFileSync(generatedFile('full-map.json'), mapText(map));
    writeJson('inventory-report.json', report);
    writeJson('ui-tree.json', uiTree(map));
    await writeAtomeTypes();
    writeJson('search-index.json', search);
    fs.writeFileSync(generatedFile('graph.mmd'), graphMermaid(map));
    fs.writeFileSync(generatedFile('index.md'), indexMarkdown(map, search, report));
    return { ok: true, map, report };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const result = await buildRegistry();
    if (!result.ok) {
        process.stderr.write(`registry:build refused (${result.errors.length} errors)\n${result.errors.slice(0, 80).join('\n')}\n`);
        process.exit(1);
    }
    process.stdout.write(`registry:build ${Object.keys(result.map.entries).length} entries, ${result.map.relations.length} relations, hash ${result.map.inputs_hash.slice(0, 12)}\n`);
}
