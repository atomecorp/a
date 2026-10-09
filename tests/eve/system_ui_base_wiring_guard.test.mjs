// Recurrence gate for the single-base rule: a drawn length that is authored as a
// literal stays frozen when the base unit changes, so every literal of the UI
// lane must be filed under a declared exception. This is the static twin of
// `system_ui_base_resize_contract`, which measures the same rule at runtime.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LANE_ROOT = new URL('../../eVe', import.meta.url).pathname;
const SKIP_DIR = /(^|\/)(node_modules|concept|R&D|documentations|doc|tests|dist|build)(\/|$)/;
const SKIP_FILE = /\.(html|md|json|css|txt)$/;
const DERIVED = /scalePx|eveCssPx|SYSTEM_UI_METRICS|UNIT_PX|unitScalePx|scaleGeometryPx|HALF_UNIT_PX|DOUBLE_UNIT_PX/;
const PX_LITERAL = /(?<![\w.$])(-?\d+(?:\.\d+)?)px/g;
const KEY_LITERAL = /(?:^|[^\w.?])(?:([A-Za-z_]+[Pp]x)|(font_size|line_height|radius|corner_radius|gap|margin|stroke_width|border_width))(\s*:\s*)([-+*/()\s\d.]+)(?=[,}\n])/g;
const CLAMPED_TEXT = /(?:font_size|fontSize|min_font_size|minFontSize|line_height|lineHeight|font-size|line-height)\s*[:=]?[^\n]*?Math\.(?:max|min)\(\s*(-?\d+(?:\.\d+)?)/;
const ZERO = /^-?0(?:\.0+)?$/;

// Every rule states why a literal may ignore the base. The list is the register
// of accepted exceptions and is meant to be read as documentation.
const RULES = [
    ['count', /dragStackMaxPx:\s*3/, /^elements\/skin\/panel_skin.js$/, 'the maximum number of stacked drag thumbnails'],
    ['ratio', /const PANEL_VISUAL_RATIOS = freezeSkin/, /^elements\/skin\/panel_skin.js$/, 'unitless ratios consumed by the canonical base scaler'],
    ['content', /font_size:\s*17/, /^intuition\/matrix\/core\/project_data.js$/, 'the authored welcome document geometry, not UI chrome'],
    ['content', /runtime.reset\(grid\?\.\[key\]/, /^intuition\/tools\/matrix_objects.js$/, 'a persisted matrix gap editable in document pixels'],
    ['sentinel', /OFF_GRID_SENTINEL|radiusPx:\s*999|radius:\s*999|pill:\s*999|999px/, null, 'the one off-grid pill radius'],
    ['guard', /Math\.(?:max|min)\(\s*[0-6]\s*[,)]|tolerancePx:\s*[0-9]+/, null, 'rounding, legibility or resolution floor'],
    ['guard', CLAMPED_TEXT, null, 'an unreadable-below floor for a size that already follows the base'],
    ['unitless', /(?:softnessPx|opacity|alpha|Mix|Blend|Lift|multiplier|characters|zIndex|ZIndex|Deg)\s*[:=]/, null, 'ratio, count, angle or draw order'],
    ['unitless', /(?:line-height|font-size)\s*:\s*(?:1|inherit)\b/, null, 'a unitless ratio or an inherited size'],
    ['time', /(?:Ms|ms|Delay|Duration)\s*[:=]\s*\d/, null, 'a duration, not a length'],
    ['viewport', /(?:PortraitMaxWidthPx|LandscapeMaxHeightPx|innerWidth|innerHeight)/, null, 'a device breakpoint, not the UI scale'],
    ['gesture', /(?:Tolerance|Threshold|Slop|Overshoot)\w*\s*[:=]/, null, 'pointer intent, calibrated against the hand'],
    ['content', /parsePx\(item\.props\.font_size\)\s*\|\|\s*\d+/, null, 'the fallback size of a document label'],
    ['content', null, /(?:^|\/)default_data\//, 'the geometry a document owns, not UI chrome'],
    ['zoom', /(?:defaultZoom|focusZoom|Zoom)\s*[:=]/, null, 'a map zoom level, not a pixel'],
    ['noise', /index \? gap : 0/, null, 'a ternary, not a length literal']
];

const walk = (dir, out = []) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (SKIP_DIR.test(full)) continue;
        if (entry.isDirectory()) walk(full, out);
        else if (!SKIP_FILE.test(entry.name)) out.push(full);
    }
    return out;
};

const literalsOf = (line) => {
    const hits = [];
    PX_LITERAL.lastIndex = 0;
    let match;
    while ((match = PX_LITERAL.exec(line))) {
        if (ZERO.test(match[1])) continue;
        if (/eveCssPx\(\s*$/.test(line.slice(0, match.index))) continue;
        hits.push(`${match[1]}px`);
    }
    KEY_LITERAL.lastIndex = 0;
    while ((match = KEY_LITERAL.exec(line))) {
        const raw = match[4].trim();
        if (/\d/.test(raw) && !ZERO.test(raw)) hits.push(raw);
    }
    const clamp = CLAMPED_TEXT.exec(line);
    if (clamp && !ZERO.test(clamp[1])) hits.push(clamp[1]);
    const unitlessText = /(?:line-height|font-size)\s*:\s*(1|inherit)\b/.exec(line);
    if (unitlessText) hits.push(unitlessText[1]);
    return hits;
};

const scan = () => {
    const rows = [];
    for (const file of walk(LANE_ROOT)) {
        const relative = file.slice(LANE_ROOT.length + 1);
        readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
            if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
            if (DERIVED.test(line)) return;
            const literals = literalsOf(line);
            if (!literals.length) return;
            const rule = RULES.find(([, pattern, pathPattern]) =>
                (!pattern || pattern.test(line)) && (!pathPattern || pathPattern.test(relative)));
            rows.push({
                file: relative,
                line: index + 1,
                literals,
                rule: rule ? rule[0] : null,
                text: line.trim().slice(0, 110)
            });
        });
    }
    return rows;
};

describe('System UI base wiring guard', () => {
    const rows = scan();

    it('files every drawn length of the lane under a declared exception', () => {
        const violations = rows.filter((row) => !row.rule);
        expect(
            violations.map((row) => `${row.file}:${row.line}  ${row.literals.join(' ')}  |  ${row.text}`),
            'a literal that is not derived from the base unit freezes when the base changes'
        ).toEqual([]);
    });

    it('keeps the residue register explicit and small', () => {
        // A growing register means the base is losing ownership of the lane, so
        // the count is asserted rather than merely reported.
        expect(rows.every((row) => row.rule)).toBe(true);
        expect(rows.length).toBeLessThanOrEqual(60);
    });

    it('derives the drawn rows of the framework from the base, not from literals', () => {
        const owners = [
            'elements/skin/panel_skin.js',
            'elements/skin/tool_skin.js',
            'elements/skin/button_skin.js',
            'elements/skin/tokens.js',
            'elements/system_ui_tokens.js',
            'intuition/runtime/bevy_panel/bevy_panel_tokens.js',
            'intuition/matrix/visual/matrix_visual_tokens.js'
        ];
        for (const owner of owners) {
            const text = readFileSync(join(LANE_ROOT, owner), 'utf8');
            expect(text, `${owner} must read the shared scaler`).toMatch(/scalePx|SYSTEM_UI_METRICS|UNIT_PX/);
        }
    });
});
