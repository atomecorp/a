// The bricks' catalogue, read as a tree so a caller pays only for what it opens (R-246, user 24 Nov. 2026: « coder le plus
// rapidement… en mangeant le moins de tokens possible »). `eve://bricks` names the families; `eve://bricks/{path}` opens a
// family (its sub-families while it is large, else its bricks, one line each), and a brick's exact name gives its whole
// entry with its input schema. Everything is read from the caller's own tools/list (mcp_discovery.js): a brick its rights
// refuse is not shown, and nothing here is written by hand.
const BRICKS_ROOT = 'eve://bricks';
const BRICKS_URI = /^eve:\/\/bricks(?:\/([A-Za-z0-9_.:-]+))?$/;
// Past this many bricks a family lays its sub-families instead, so one answer stays a few thousand tokens at most.
const FAMILY_LIMIT = 60;
const SUMMARY_CHARS = 96;
// How bricks are assembled in one request: the chain runs its steps in order, a step's params taking an earlier
// step's result by reference (mcp_toolchain_refs.js).
const COMPOSE = Object.freeze({
    method: 'mcp.toolchains.execute',
    steps: [{ method: 'ai.tools.call', params: { tool_name: '<brick>', params: {} } }],
    ref: { $step: 0, path: 'result.id' }
});

export const BRICKS_TEMPLATE = Object.freeze({
    uriTemplate: `${BRICKS_ROOT}/{path}`,
    name: 'eVe bricks',
    description: `The tools as a tree: ${BRICKS_ROOT} lists the families, ${BRICKS_ROOT}/{family} its sub-families or bricks, ${BRICKS_ROOT}/{tool} one tool with its input schema.`,
    mimeType: 'application/json'
});

export const isBricksUri = uri => BRICKS_URI.test(String(uri || ''));

const segments = name => name.split(/[.:]/);
const summaryOf = (text = '') => {
    const first = String(text).split(/(?<=[.!?])\s/)[0].trim();
    return first.length > SUMMARY_CHARS ? `${first.slice(0, SUMMARY_CHARS - 1)}…` : first;
};
const familiesOf = (tools, depth) => {
    const counts = new Map();
    tools.forEach((tool) => {
        const parts = segments(tool.name);
        if (parts.length <= depth) return;
        const family = tool.name.slice(0, parts.slice(0, depth + 1).join('.').length);
        counts.set(family, (counts.get(family) || 0) + 1);
    });
    return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([family, count]) => [family, count]);
};
const brickLine = tool => [tool.name, tool.risk_tier, summaryOf(tool.description || tool.title)];
const brickEntry = tool => ({
    name: tool.name, ...(tool.title ? { title: tool.title } : {}), description: tool.description || '',
    risk_tier: tool.risk_tier, confirmation_required: tool.confirmation_required === true, input_schema: tool.inputSchema
});

/** One node of the tree, from the caller's listed tools. */
export function readBricks(uri, tools) {
    const match = BRICKS_URI.exec(String(uri || '').trim());
    if (!match) throw new Error(`bricks_uri_invalid:${uri}`);
    const path = match[1] || '';
    if (!path) return { families: familiesOf(tools, 0), columns: ['family', 'bricks'], compose: COMPOSE };
    const exact = tools.find(tool => tool.name === path);
    const depth = segments(path).length;
    const inside = tools.filter(tool => tool.name.length > path.length && tool.name.startsWith(path) && /[.:]/.test(tool.name[path.length]));
    if (!exact && !inside.length) throw new Error(`bricks_path_unknown:${path}`);
    const node = inside.length > FAMILY_LIMIT
        ? { families: familiesOf(inside, depth), columns: ['family', 'bricks'] }
        : inside.length ? { bricks: inside.map(brickLine), columns: ['name', 'risk_tier', 'summary'] } : {};
    return { path, ...(exact ? { brick: brickEntry(exact) } : {}), ...node };
}
