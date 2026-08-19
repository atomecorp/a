import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// Component-reuse guardrail.
//
// `.codex/modules/04-feature-work-cleanup-and-framework-reuse.md` has forbidden
// duplicated implementations since the beginning, in the strongest terms. On
// 2026-08-07 an audit found the inline text editor copied six times — 981 lines
// over a 750-line canonical stack — and the virtualized window three times. The
// prose was not the problem; the absence of a machine check was.
//
// Every other invariant of this repository is enforced by a `check_*` script.
// This is that script for component reuse.
//
// A rule here names the canonical owner to consume. Adding a consumer is always
// allowed; writing a second owner never is. When the owner cannot serve a new
// need, the correct answer is an additive parameter on the owner.

const DEFAULT_ROOT = process.cwd();
const SCANNED_ROOTS = ['eVe/intuition', 'eVe/domains', 'atome/src/squirrel/components'];
const SOURCE_EXTENSION = '.js';

const rule = (definition) => Object.freeze(definition);

const RULES = [
    rule({
        id: 'text-editing-session',
        owner: 'eVe/intuition/runtime/bevy_panel/bevy_panel_text_editing.js',
        what: 'inline text editing',
        // Opening a text session is what every one of the six copies did.
        pattern: /\b(createTextEditingSession|createBevyUiTextInputSession)\s*\(/,
        allow: [
            // The sessions themselves.
            'eVe/domains/rendering/text_editing_session.js',
            'eVe/domains/rendering/bevy_ui_text_input_session.js',
            // The canonical panel owner.
            'eVe/intuition/runtime/bevy_panel/bevy_panel_text_editing.js',
            // Canvas text Atomes are a different surface at a lower layer: they
            // edit rich text in the scene, not a panel field. Legitimate.
            'eVe/domains/rendering/text_bridge.js',
            // --- declared debt, 2026-08-07 -------------------------------
            // Tracked in `todo/ui_bevy/component_convergence.md`, registered in
            // `todo/execution_order.md`. Listed here so the count cannot grow
            // silently; removing an entry is the definition of done.
            // `numeric_field` belongs to workstream slot A (Size/Font);
            // `inline_search` holds no editor skeleton and may not be a copy.
            // The two Panel Lab runtimes left with the Panel Lab retirement
            // (2026-08-16) and are struck from this list — done, not deferred.
            'eVe/intuition/ribbon/bevy_ui_main_menu_inline_search_runtime.js',
            'eVe/intuition/runtime/bevy_panel/bevy_panel_numeric_field_runtime.js'
        ]
    }),
    rule({
        id: 'virtual-window',
        owner: 'eVe/intuition/runtime/bevy_panel/bevy_panel_virtual_window.js',
        what: 'virtualized scrolling',
        // The shape all three copies share: a scroll area holding a leading and
        // a trailing spacer around the built window.
        pattern: /_before`?,[\s\S]{0,400}?_after`?/,
        requires: /scroll_area/,
        allow: [
            'eVe/intuition/runtime/bevy_panel/bevy_panel_virtual_window.js',
            // --- declared debt, 2026-08-07 -------------------------------
            // Two strategies, not three copies: the first two window by page,
            // the third by viewport. Choosing between them is a product
            // decision on a `validated` panel — see
            // `todo/ui_bevy/component_convergence.md`. What is unambiguously
            // duplicated is `virtualPageIndex` / `matrixPageIndex`, identical
            // character for character.
            'eVe/intuition/runtime/bevy_panel/bevy_panel_selectable_list.js',
            'eVe/intuition/runtime/bevy_panel/bevy_panel_matrix.js',
            'eVe/domains/rendering/project_view_matrix_content.js'
        ]
    }),
    rule({
        id: 'record-preview',
        owner: 'eVe/intuition/runtime/bevy_panel/bevy_panel_record_preview.js',
        what: 'a record preview inside a frame',
        // On 2026-08-17 the list and the Matrix each carried their own copy of
        // this recipe. Both stretched the record to the frame, so images came
        // out deformed and text kept its scene font size — invisible in a 26px
        // row, truncated in a 104px tile. The recipe is the tell: pinning a
        // record to a node's box is what a preview does.
        pattern: /overlayRecordLayout\s*:/,
        allow: ['eVe/intuition/runtime/bevy_panel/bevy_panel_record_preview.js']
    }),
    rule({
        id: 'column-widths',
        owner: 'atome/src/squirrel/components/table_contract.js',
        what: 'table column geometry',
        // A second width resolver is what makes a header and its rows disagree.
        pattern: /const\s+resolveColumnWidths\s*=/,
        allow: ['atome/src/squirrel/components/table_contract.js']
    })
];

// A new file whose name announces a component the repository already owns is
// almost always a copy. This is a naming check, deliberately cheap: it fires
// before the duplicated logic is even written.
const RESERVED_BASENAMES = [
    { pattern: /_editing\.js$/, owner: RULES[0].owner, what: 'inline text editing' },
    { pattern: /_virtual_window\.js$/, owner: RULES[1].owner, what: 'virtualized scrolling' }
];
const RESERVED_ALLOW = new Set([
    RULES[0].owner,
    RULES[1].owner,
    // Calendar editing is a domain concern (recurrence, alarms), not a text
    // editor; its name predates this rule.
    'eVe/intuition/runtime/bevy_panel/bevy_panel_calendar_editor_view.js'
]);

const toProjectPath = (rootDir, filePath) => path.relative(rootDir, filePath).replace(/\\/g, '/');

const collectSourceFiles = (rootDir) => {
    const files = [];
    const visit = (directory) => {
        let entries = [];
        try {
            entries = fs.readdirSync(directory, { withFileTypes: true });
        } catch (_) {
            return;
        }
        entries.forEach((entry) => {
            const full = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.')) return;
                visit(full);
                return;
            }
            if (entry.name.endsWith(SOURCE_EXTENSION)) files.push(full);
        });
    };
    SCANNED_ROOTS.forEach((root) => visit(path.join(rootDir, root)));
    return files;
};

const collectViolations = (rootDir) => {
    const violations = [];
    const files = collectSourceFiles(rootDir);
    files.forEach((filePath) => {
        const projectPath = toProjectPath(rootDir, filePath);
        let source = '';
        try {
            source = fs.readFileSync(filePath, 'utf8');
        } catch (_) {
            return;
        }
        RULES.forEach((currentRule) => {
            if (currentRule.allow.includes(projectPath)) return;
            if (currentRule.requires && !currentRule.requires.test(source)) return;
            if (!currentRule.pattern.test(source)) return;
            violations.push({
                rule: currentRule.id,
                file: projectPath,
                message: `${projectPath} implements ${currentRule.what} on its own. `
                    + `Consume ${currentRule.owner} instead, or add a parameter to it.`
            });
        });
        RESERVED_BASENAMES.forEach((reserved) => {
            if (!reserved.pattern.test(projectPath)) return;
            if (RESERVED_ALLOW.has(projectPath)) return;
            if (RULES.some((currentRule) => currentRule.allow.includes(projectPath))) return;
            violations.push({
                rule: 'reserved-name',
                file: projectPath,
                message: `${projectPath} names a component the repository already owns (${reserved.what}). `
                    + `Extend ${reserved.owner} rather than adding a second one.`
            });
        });
    });
    return violations;
};

const main = () => {
    const rootDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_ROOT;
    const violations = collectViolations(rootDir);
    if (!violations.length) {
        console.log(`component reuse guardrails: ok (${RULES.length} rules)`);
        return 0;
    }
    console.error(`component reuse guardrails: ${violations.length} violation(s)\n`);
    violations.forEach((violation) => {
        console.error(`  [${violation.rule}] ${violation.message}`);
    });
    console.error('\nSee .codex/modules/04-feature-work-cleanup-and-framework-reuse.md,'
        + ' section CANONICAL COMPONENT OWNERS.');
    return 1;
};

process.exitCode = main();

export { RULES, collectViolations };
