import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'eve_runtime_integrity.json');

const countDuplicates = (entries = [], key) => {
    const counts = new Map();
    entries.forEach((entry) => {
        const value = String(entry?.[key] || '').trim();
        if (!value) return;
        counts.set(value, (counts.get(value) || 0) + 1);
    });
    return Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value));
};

const collectDefaultToolWrappers = async () => {
    const registeredTools = new Map();
    globalThis.AtomeAI = {
        registerTool(definition = {}) {
            registeredTools.set(definition.name, definition);
        }
    };
    globalThis.atome = {
        tools: {
            v2Runtime: {
                async invokeById() {
                    return { ok: true };
                }
            }
        }
    };
    globalThis.CalendarAPI = {
        listEvents() { return { ok: true }; },
        getEvent() { return { ok: true }; },
        createEvent() { return { ok: true }; },
        updateEvent() { return { ok: true }; },
        deleteEvent() { return { ok: true }; },
        listCalendars() { return { ok: true }; },
        syncNow() { return { ok: true }; }
    };
    await import('../src/squirrel/ai/default_tools.js');
    return Array.from(registeredTools.entries()).map(([name, definition]) => {
        const source = String(definition?.handler || '');
        const tool_ids = [...source.matchAll(/tool_id:\s*'([^']+)'/g)].map((match) => match[1]);
        return {
            name,
            tool_ids
        };
    }).filter((entry) => entry.tool_ids.length > 0);
};

const run = async () => {
    const report = {
        created_at: new Date().toISOString(),
        ok: false,
        totals: {
            runtime_tools: 0,
            uncategorized_tools: 0,
            duplicate_tool_ids: 0,
            duplicate_tool_keys: 0,
            wrapper_tools: 0,
            broken_wrappers: 0
        },
        duplicate_tool_ids: [],
        duplicate_tool_keys: [],
        uncategorized_tools: [],
        default_tool_wrappers: [],
        errors: []
    };

    try {
        const coveragePath = path.resolve('tools/headless_output/eve_runtime_coverage.json');
        const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
        const runtimeCatalog = Array.isArray(coverage?.catalog) ? coverage.catalog : [];
        const runtimeIds = new Set(runtimeCatalog.map((entry) => String(entry?.tool_id || '').trim()).filter(Boolean));
        const wrappers = await collectDefaultToolWrappers();

        report.totals.runtime_tools = runtimeCatalog.length;
        report.uncategorized_tools = Array.isArray(coverage?.uncategorized) ? coverage.uncategorized : [];
        report.totals.uncategorized_tools = report.uncategorized_tools.length;
        report.duplicate_tool_ids = countDuplicates(runtimeCatalog, 'tool_id');
        report.duplicate_tool_keys = countDuplicates(runtimeCatalog, 'tool_key');
        report.totals.duplicate_tool_ids = report.duplicate_tool_ids.length;
        report.totals.duplicate_tool_keys = report.duplicate_tool_keys.length;
        report.default_tool_wrappers = wrappers.map((entry) => ({
            ...entry,
            all_exist_in_runtime: entry.tool_ids.every((tool_id) => runtimeIds.has(tool_id))
        }));
        report.totals.wrapper_tools = report.default_tool_wrappers.length;
        report.totals.broken_wrappers = report.default_tool_wrappers.filter((entry) => entry.all_exist_in_runtime !== true).length;
        report.ok = true;
    } catch (error) {
        report.errors.push(String(error?.message || error));
    }

    fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
        ok: report.ok,
        out_file: outFile,
        totals: report.totals,
        duplicate_tool_ids: report.duplicate_tool_ids,
        duplicate_tool_keys: report.duplicate_tool_keys,
        wrapper_tools: report.default_tool_wrappers,
        errors: report.errors
    }, null, 2));
};

await run();
