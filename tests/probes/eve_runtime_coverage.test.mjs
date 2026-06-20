import fs from 'node:fs';
import path from 'node:path';

import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const outDir = path.resolve('temp/probe_reports');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'eve_runtime_coverage.json');

const FAMILY_RULES = [
    {
        key: 'finder_navigation',
        label: 'Finder / project navigation',
        matchers: ['finder', 'project', 'home', 'contact']
    },
    {
        key: 'selection_transform',
        label: 'Selection / move / resize / rotate / scale',
        matchers: ['select', 'selection', 'drag', 'move', 'resize', 'rotate', 'scale', 'lasso']
    },
    {
        key: 'draw_vector_text',
        label: 'Draw / vector / text',
        matchers: ['circle', 'box', 'shape', 'draw', 'vector', 'pen', 'path', 'text', 'typography']
    },
    {
        key: 'transport_media',
        label: 'Transport / media / animation',
        matchers: ['play', 'pause', 'stop', 'timeline', 'transport', 'media', 'animation', 'matrix']
    },
    {
        key: 'capture_record_import',
        label: 'Capture / record / import',
        matchers: ['capture', 'record', 'import', 'camera', 'photo', 'screen', 'mic', 'audio', 'video']
    },
    {
        key: 'panels',
        label: 'Panels / info / ai / comm / calendar',
        matchers: ['panel', 'info', 'calendar', 'comm', 'message', 'mail', 'ai']
    },
    {
        key: 'perform',
        label: 'Perform / fullscreen / UI reveal',
        matchers: ['perform', 'fullscreen', 'reveal']
    },
    {
        key: 'calendar',
        label: 'Calendar read / create / update',
        matchers: ['calendar']
    }
];

const normalizeToken = (value = '') => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^ui\./, '')
    .replace(/[^a-z0-9]+/g, '_');

const matchesFamily = (tokens = [], rule = {}) => {
    const matchers = Array.isArray(rule.matchers) ? rule.matchers : [];
    return matchers.some((matcher) => tokens.some((token) => token.includes(matcher)));
};

const categorizeTool = (tool = {}) => {
    const tokens = [
        normalizeToken(tool.id),
        normalizeToken(tool.tool_key),
        normalizeToken(tool.runtime?.execution_mode),
        normalizeToken(tool.meta?.name),
        normalizeToken(tool.ui?.label_fallback)
    ].filter(Boolean);
    const matched = FAMILY_RULES
        .filter((rule) => matchesFamily(tokens, rule))
        .map((rule) => rule.key);
    return matched.length ? matched : ['uncategorized'];
};

const summarizeFamily = (key, label, entries = []) => ({
    key,
    label,
    count: entries.length,
    tool_ids: entries.map((entry) => entry.tool_id),
    execution_modes: Array.from(new Set(entries.map((entry) => entry.execution_mode).filter(Boolean))).sort()
});

const run = async () => {
    const report = {
        created_at: new Date().toISOString(),
        ok: false,
        totals: {
            tools: 0,
            categorized_tools: 0,
            uncategorized_tools: 0
        },
        families: [],
        uncategorized: [],
        catalog: [],
        errors: []
    };

    try {
        installMockBrowserEnv({
            runTool: async (payload = {}) => ({ ok: true, previous: true, payload }),
            eveToolBase: {
                createAtome: async (spec) => ({ ok: true, id: `atome_coverage_${Date.now()}`, spec })
            }
        });

        const { toolRuntimeV2 } = await import('../../eVe/intuition/runtime/index.js');
        const tools = await toolRuntimeV2.listTools({ includeDisabled: true });
        const catalog = Array.isArray(tools) ? tools : [];

        const familyBuckets = new Map();
        FAMILY_RULES.forEach((rule) => {
            familyBuckets.set(rule.key, {
                key: rule.key,
                label: rule.label,
                entries: []
            });
        });

        const uncategorized = [];
        catalog.forEach((tool) => {
            const item = {
                tool_id: String(tool?.id || '').trim(),
                tool_key: String(tool?.tool_key || '').trim(),
                execution_mode: String(tool?.runtime?.execution_mode || '').trim(),
                contexts: Array.isArray(tool?.capabilities?.contexts) ? tool.capabilities.contexts.slice() : [],
                selection_required: tool?.capabilities?.selection_required === true,
                disabled: tool?.capabilities?.disabled === true,
                visibility: String(tool?.visibility || '').trim() || null
            };
            report.catalog.push(item);
            const families = categorizeTool(tool);
            if (families.includes('uncategorized')) {
                uncategorized.push(item);
                return;
            }
            families.forEach((familyKey) => {
                familyBuckets.get(familyKey)?.entries.push(item);
            });
        });

        report.catalog.sort((a, b) => a.tool_id.localeCompare(b.tool_id));
        report.families = Array.from(familyBuckets.values())
            .map((family) => summarizeFamily(family.key, family.label, family.entries))
            .sort((a, b) => a.label.localeCompare(b.label));
        report.uncategorized = uncategorized.sort((a, b) => a.tool_id.localeCompare(b.tool_id));
        report.totals.tools = report.catalog.length;
        report.totals.categorized_tools = report.catalog.length - report.uncategorized.length;
        report.totals.uncategorized_tools = report.uncategorized.length;
        report.ok = true;
    } catch (error) {
        report.errors.push(String(error?.message || error));
    }

    fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
        ok: report.ok,
        out_file: outFile,
        totals: report.totals,
        family_counts: report.families.map((entry) => ({ key: entry.key, count: entry.count })),
        uncategorized_count: report.uncategorized.length,
        errors: report.errors
    }, null, 2));
};

await run();
