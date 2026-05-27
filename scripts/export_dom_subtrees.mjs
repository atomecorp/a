import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { JSDOM } from 'jsdom';

const DEFAULT_OUTPUT_DIR = 'temp/dom_subtree_exports';

const EXPORT_TARGETS = Object.freeze([
    Object.freeze({
        name: 'matrix',
        file: 'export_matrix_subtree.dom',
        selectors: Object.freeze([
            '#eve_project_matrix',
            '.eve-project-matrix',
            '[data-role="eve-project-matrix"]',
            '[data-view-id="matrix"]'
        ])
    }),
    Object.freeze({
        name: 'project',
        file: 'export_project_subtree.dom',
        selectors: Object.freeze([
            '[id^="project_view_"]',
            '.project-view',
            '[data-project-id]'
        ])
    }),
    Object.freeze({
        name: 'timeline',
        file: 'export_timeline_subtree.dom',
        selectors: Object.freeze([
            '[data-role*="timeline"]',
            '.eve-mtrack-timeline',
            '.mtrax-timeline'
        ])
    }),
    Object.freeze({
        name: 'media_hosts',
        file: 'export_media_hosts_subtree.dom',
        selectors: Object.freeze([
            '[data-role="media-host"]',
            '[data-role="eve-media-host"]',
            '[data-atome-id][data-atome-kind="audio"]',
            '[data-atome-id][data-atome-kind="video"]',
            '[data-atome-id][data-atome-kind="audio_recording"]',
            '[data-atome-id][data-atome-kind="video_recording"]'
        ])
    })
]);

const parseArgs = (argv) => {
    const args = { input: '', outDir: DEFAULT_OUTPUT_DIR };
    for (let index = 2; index < argv.length; index += 1) {
        const key = argv[index];
        const value = argv[index + 1] || '';
        if (key === '--input') {
            args.input = value;
            index += 1;
        } else if (key === '--out') {
            args.outDir = value;
            index += 1;
        }
    }
    return args;
};

const resolveOutputDir = (outDir) => {
    const normalized = path.normalize(outDir || DEFAULT_OUTPUT_DIR);
    if (path.isAbsolute(normalized)) {
        const root = process.cwd();
        const relative = path.relative(root, normalized);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error('Output directory must stay inside the workspace temp directory.');
        }
        if (!relative.startsWith(`temp${path.sep}`) && relative !== 'temp') {
            throw new Error('Output directory must be under ./temp.');
        }
        return normalized;
    }
    if (normalized !== 'temp' && !normalized.startsWith(`temp${path.sep}`)) {
        throw new Error('Output directory must be under ./temp.');
    }
    return path.resolve(normalized);
};

const serializeMatches = (document, selectors = []) => {
    const seen = new Set();
    const fragments = [];
    selectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((node) => {
            if (seen.has(node)) return;
            seen.add(node);
            fragments.push(node.outerHTML || '');
        });
    });
    return fragments.filter(Boolean).join('\n');
};

export const exportDomSubtrees = ({ input, outDir = DEFAULT_OUTPUT_DIR } = {}) => {
    if (!input) throw new Error('Missing --input DOM or HTML file.');
    const inputPath = path.resolve(input);
    const outputDir = resolveOutputDir(outDir);
    const html = fs.readFileSync(inputPath, 'utf8');
    const dom = new JSDOM(html);
    const document = dom.window.document;
    fs.mkdirSync(outputDir, { recursive: true });

    const exports = EXPORT_TARGETS.map((target) => {
        const content = serializeMatches(document, target.selectors);
        const outputPath = path.join(outputDir, target.file);
        fs.writeFileSync(outputPath, content ? `${content}\n` : '', 'utf8');
        return {
            name: target.name,
            file: path.relative(process.cwd(), outputPath).replace(/\\/g, '/'),
            bytes: Buffer.byteLength(content, 'utf8'),
            empty: content.length === 0
        };
    });

    const fullAppPath = path.join(outputDir, 'export_full_app_debug.dom');
    fs.writeFileSync(fullAppPath, html.endsWith('\n') ? html : `${html}\n`, 'utf8');
    exports.push({
        name: 'full_app_debug',
        file: path.relative(process.cwd(), fullAppPath).replace(/\\/g, '/'),
        bytes: Buffer.byteLength(html, 'utf8'),
        empty: html.length === 0
    });

    return {
        ok: true,
        input: path.relative(process.cwd(), inputPath).replace(/\\/g, '/'),
        outDir: path.relative(process.cwd(), outputDir).replace(/\\/g, '/'),
        exports
    };
};

const main = () => {
    try {
        const result = exportDomSubtrees(parseArgs(process.argv));
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error(error?.message || String(error));
        process.exit(1);
    }
};

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
