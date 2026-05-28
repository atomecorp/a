import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { formatDomProjectionReport, summarizeMetrics } from './dom_projection_report_runtime.mjs';
import { collectDocumentDensityViolations } from './dom_projection_density_runtime.mjs';

const DEFAULT_ROOT = process.cwd();
const DEFAULT_MAX_DATA_ATTRIBUTE_LENGTH = 256;
const DEFAULT_MAX_NODE_COUNT = 5000;
const DEFAULT_MAX_INLINE_STYLE_COUNT = 1000;
const DEFAULT_MAX_CANVAS_COUNT = 64;
const DEFAULT_MAX_VIDEO_COUNT = 16;
const DEFAULT_TARGETS = ['tests/fixtures/dom'];
const DOM_FILE_EXTENSIONS = new Set(['.dom', '.html', '.htm']);
const FORBIDDEN_DATA_ATTRIBUTES = new Set([
    'data-group-timeline',
    'data-group-steps',
    'data-group-members',
    'data-media-src',
    'data-eve-media-source',
    'data-eve-media-identifier',
    'data-media-api-error',
    'data-preview-signature',
    'data-waveform',
    'data-thumbnail'
]);
const BUSINESS_DATA_NAME_RE = /(?:timeline|properties|history|permission|waveform|thumbnail|cache|source|members|steps)/i;
const LOCAL_SOURCE_RE = /(?:127\.0\.0\.1|localhost|media_user_id=|(?:^|[/"'])data\/users\/|(?:^|[/"'])Users\/)/i;
const DATA_URI_RE = /\bdata:(?:image|audio|video)\//i;
const BASE64_RE = /(?:;base64,|base64)/i;
const DATA_ATTRIBUTE_RE = /\s(data-[a-zA-Z0-9_.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const SOURCE_ATTRIBUTE_RE = /\s(src|href|poster)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const ID_ATTRIBUTE_RE = /\sid\s*=\s*(?:"([^"]+)"|'([^']+)')/g;
const STYLE_ATTRIBUTE_RE = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const INLINE_HANDLER_RE = /\son[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*')/g;
const OPENING_TAG_RE = /<([a-zA-Z][a-zA-Z0-9:-]*)(\s[^<>]*?)?>/g;

const normalizeProjectPath = (rootDir, filePath) => path.relative(rootDir, filePath).replace(/\\/g, '/');

const isRuntimeBlobUrl = (value = '') => String(value || '').trim().startsWith('blob:');

const hasForbiddenSourceValue = (value = '') => {
    if (isRuntimeBlobUrl(value)) return false;
    return LOCAL_SOURCE_RE.test(value) || DATA_URI_RE.test(value) || BASE64_RE.test(value);
};

const decodeHtmlAttribute = (value = '') => String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#x22;/gi, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const looksLikeJsonModel = (value = '') => {
    const text = decodeHtmlAttribute(value).trim();
    if (!text) return false;
    if (!((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']')))) return false;
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object';
    } catch (error) {
        void error;
        return false;
    }
};

const countMatches = (text, pattern) => (text.match(pattern) || []).length;

const countTag = (html, tagName) => countMatches(html, new RegExp(`<${tagName}(?:\\s|>|/)`, 'gi'));

const createMetrics = (file) => ({
    file,
    dom_size_bytes: 0,
    node_count: 0,
    div_count: 0,
    span_count: 0,
    button_count: 0,
    canvas_count: 0,
    canvas_without_role_count: 0,
    canvas_roles: [],
    video_count: 0,
    data_attribute_count: 0,
    json_like_data_count: 0,
    large_data_count: 0,
    inline_style_count: 0,
    inline_style_ratio: 0,
    inline_style_properties: [],
    inline_handler_count: 0,
    base64_in_dom_count: 0,
    data_uri_in_dom_count: 0,
    data_preview_signature_count: 0,
    duplicate_id_count: 0,
    duplicate_ids: [],
    html_count: 0,
    head_count: 0,
    body_count: 0,
    localhost_occurrence_count: 0,
    localhost_or_127_count_in_persisted_attrs: 0,
    media_error_count: 0,
    data_atome_id_count: 0,
    data_atome_id_unique_count: 0,
    data_atome_ids: [],
    data_atome_id_references: [],
    repeated_data_atome_ids: [],
    has_data_group_timeline: false,
    heavy_business_data_count: 0,
    heavy_business_data_attributes: [],
    forbidden_data_attributes: []
});

const collectDomFiles = (rootDir, targets = []) => {
    const files = [];
    const visit = (fullPath) => {
        if (!fs.existsSync(fullPath)) return;
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            for (const entry of fs.readdirSync(fullPath)) {
                if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'target') continue;
                visit(path.join(fullPath, entry));
            }
            return;
        }
        if (stat.isFile() && DOM_FILE_EXTENSIONS.has(path.extname(fullPath).toLowerCase())) files.push(fullPath);
    };
    targets.forEach((target) => visit(path.resolve(rootDir, target)));
    return Array.from(new Set(files));
};

const collectAttributeViolations = ({ rootDir, file, html, maxDataAttributeLength }) => {
    const violations = [];
    for (const match of html.matchAll(DATA_ATTRIBUTE_RE)) {
        const name = String(match[1] || '').toLowerCase();
        const encodedValue = String(match[2] ?? match[3] ?? '');
        const value = decodeHtmlAttribute(encodedValue);
        const location = normalizeProjectPath(rootDir, file);
        if (FORBIDDEN_DATA_ATTRIBUTES.has(name)) {
            violations.push({
                code: 'forbidden_data_attribute',
                file: location,
                attribute: name,
                message: `${name} must not carry canonical model or media state in the DOM.`,
                excerpt: value.slice(0, 220)
            });
        }
        if (value.length > maxDataAttributeLength) {
            violations.push({
                code: 'oversized_data_attribute',
                file: location,
                attribute: name,
                message: `data-* attributes must stay below ${maxDataAttributeLength} characters.`,
                excerpt: value.slice(0, 220)
            });
        }
        if (looksLikeJsonModel(value) && BUSINESS_DATA_NAME_RE.test(name)) {
            violations.push({
                code: 'json_model_data_attribute',
                file: location,
                attribute: name,
                message: 'data-* attributes must not contain serialized project, timeline, history, permission, media, or cache models.',
                excerpt: value.slice(0, 220)
            });
        }
        if (!isRuntimeBlobUrl(value) && LOCAL_SOURCE_RE.test(value)) {
            violations.push({
                code: 'local_source_leak',
                file: location,
                attribute: name,
                message: 'DOM projection must not expose local paths, localhost URLs, or media user query state.',
                excerpt: value.slice(0, 220)
            });
        }
        if (DATA_URI_RE.test(value) || BASE64_RE.test(value)) {
            violations.push({
                code: 'encoded_media_data_attribute',
                file: location,
                attribute: name,
                message: 'DOM projection must not expose data URIs, base64 media, thumbnails, waveforms, or preview payloads.',
                excerpt: value.slice(0, 220)
            });
        }
    }
    return violations;
};

const collectSourceAttributeViolations = ({ rootDir, file, html }) => {
    const violations = [];
    const location = normalizeProjectPath(rootDir, file);
    for (const match of html.matchAll(SOURCE_ATTRIBUTE_RE)) {
        const name = String(match[1] || '').toLowerCase();
        const value = decodeHtmlAttribute(String(match[2] ?? match[3] ?? ''));
        if (!hasForbiddenSourceValue(value)) continue;
        violations.push({ code: 'source_attribute_leak', file: location, attribute: name, message: 'DOM projection must not expose local URLs, media user query state, data URIs, or base64 media in source attributes.', excerpt: value.slice(0, 220) });
    }
    return violations;
};

const collectInlineStyleProperties = (html) => {
    const properties = new Map();
    for (const match of html.matchAll(STYLE_ATTRIBUTE_RE)) {
        const styleValue = decodeHtmlAttribute(String(match[1] ?? match[2] ?? ''));
        styleValue.split(';').forEach((declaration) => {
            const property = String(declaration.split(':')[0] || '').trim().toLowerCase();
            if (!property) return;
            properties.set(property, (properties.get(property) || 0) + 1);
        });
    }
    return Array.from(properties.entries()).map(([property, count]) => ({ property, count }));
};

const collectDataAttributesFromTag = (rawAttributes = '') => {
    const attributes = new Map();
    for (const match of String(rawAttributes || '').matchAll(DATA_ATTRIBUTE_RE)) {
        const name = String(match[1] || '').toLowerCase();
        const value = decodeHtmlAttribute(String(match[2] ?? match[3] ?? ''));
        attributes.set(name, value);
    }
    return attributes;
};

const collectAtomeProjectionReferences = ({ rootDir, file, html, maxDataAttributeLength }) => {
    const location = normalizeProjectPath(rootDir, file);
    const references = [];
    for (const match of html.matchAll(OPENING_TAG_RE)) {
        const tagName = String(match[1] || '').toLowerCase();
        const attributes = collectDataAttributesFromTag(match[2] || '');
        const atomeId = String(attributes.get('data-atome-id') || '').trim();
        if (!atomeId) continue;
        const heavyDataAttributes = Array.from(attributes.entries())
            .filter(([name, value]) => {
                if (name === 'data-atome-id') return false;
                return FORBIDDEN_DATA_ATTRIBUTES.has(name)
                    || BUSINESS_DATA_NAME_RE.test(name)
                    || looksLikeJsonModel(value)
                    || value.length > maxDataAttributeLength
                    || (!isRuntimeBlobUrl(value) && LOCAL_SOURCE_RE.test(value));
            })
            .map(([name]) => name);
        references.push({
            file: location,
            tag: tagName,
            id: atomeId,
            role: String(attributes.get('data-role') || '').trim(),
            renderer: String(attributes.get('data-renderer') || '').trim(),
            view_id: String(attributes.get('data-view-id') || '').trim(),
            heavy_data_attributes: heavyDataAttributes
        });
    }
    return references;
};

const collectAtomeProjectionViolations = ({ rootDir, file, html, maxDataAttributeLength }) => {
    const references = collectAtomeProjectionReferences({ rootDir, file, html, maxDataAttributeLength });
    const byAtomeId = new Map();
    references.forEach((reference) => {
        const bucket = byAtomeId.get(reference.id) || [];
        bucket.push(reference);
        byAtomeId.set(reference.id, bucket);
    });
    const violations = [];
    for (const [atomeId, refs] of byAtomeId.entries()) {
        if (refs.length <= 1) continue;
        refs
            .filter((reference) => reference.heavy_data_attributes.length)
            .forEach((reference) => {
                violations.push({
                    code: 'repeated_atome_projection_model_data',
                    file: reference.file,
                    attribute: 'data-atome-id',
                    message: 'Repeated data-atome-id references are allowed only as lightweight projections, not as duplicated model state.',
                    excerpt: `${atomeId} ${reference.tag} ${reference.heavy_data_attributes.join(',')}`
                });
            });
    }
    return violations;
};

const collectCanvasReferences = ({ rootDir, file, html }) => {
    const location = normalizeProjectPath(rootDir, file);
    const references = [];
    for (const match of html.matchAll(OPENING_TAG_RE)) {
        const tagName = String(match[1] || '').toLowerCase();
        if (tagName !== 'canvas') continue;
        const attributes = collectDataAttributesFromTag(match[2] || '');
        references.push({
            file: location,
            role: String(attributes.get('data-role') || '').trim()
        });
    }
    return references;
};

const collectCanvasViolations = ({ rootDir, file, html }) => {
    return collectCanvasReferences({ rootDir, file, html })
        .filter((reference) => !reference.role)
        .map((reference) => ({
            code: 'canvas_missing_role',
            file: reference.file,
            attribute: 'data-role',
            message: 'Canvas projections must expose a short data-role so active renderer surfaces can be audited and pooled.',
            excerpt: '<canvas>'
        }));
};

const collectDocumentShapeViolations = ({ rootDir, file, html }) => {
    const location = normalizeProjectPath(rootDir, file);
    const violations = [];
    const ids = new Map();
    for (const match of html.matchAll(ID_ATTRIBUTE_RE)) {
        const id = decodeHtmlAttribute(String(match[1] ?? match[2] ?? '')).trim();
        if (!id) continue;
        ids.set(id, (ids.get(id) || 0) + 1);
    }
    for (const [id, count] of ids.entries()) {
        if (count <= 1) continue;
        violations.push({
            code: 'duplicate_dom_id',
            file: location,
            attribute: 'id',
            message: 'HTML ids must be unique inside a DOM projection.',
            excerpt: `${id} (${count})`
        });
    }
    const htmlRootCount = (html.match(/<html(?:\s|>)/gi) || []).length;
    const headRootCount = (html.match(/<head(?:\s|>)/gi) || []).length;
    const bodyRootCount = (html.match(/<body(?:\s|>)/gi) || []).length;
    const isSubtreeExport = path.extname(file).toLowerCase() === '.dom';
    if (isSubtreeExport && (htmlRootCount > 0 || headRootCount > 0 || bodyRootCount > 0)) {
        violations.push({
            code: 'subtree_document_root',
            file: location,
            attribute: '',
            message: 'DOM subtree exports must not contain html/head/body document roots.',
            excerpt: `html:${htmlRootCount} head:${headRootCount} body:${bodyRootCount}`
        });
    } else if (htmlRootCount > 1 || headRootCount > 1 || bodyRootCount > 1) {
        violations.push({
            code: 'nested_document_root',
            file: location,
            attribute: '',
            message: 'Fragments must not contain nested html/body document roots.',
            excerpt: `html:${htmlRootCount} head:${headRootCount} body:${bodyRootCount}`
        });
    }
    return violations;
};

const collectDomProjectionMetrics = ({ rootDir, file, html, maxDataAttributeLength }) => {
    const metrics = createMetrics(normalizeProjectPath(rootDir, file));
    metrics.dom_size_bytes = Buffer.byteLength(html, 'utf8');
    metrics.node_count = countMatches(html, /<[a-zA-Z][a-zA-Z0-9:-]*(?:\s|>|\/)/g);
    metrics.div_count = countTag(html, 'div');
    metrics.span_count = countTag(html, 'span');
    metrics.button_count = countTag(html, 'button');
    metrics.canvas_count = countTag(html, 'canvas');
    const canvasReferences = collectCanvasReferences({ rootDir, file, html });
    metrics.canvas_without_role_count = canvasReferences.filter((reference) => !reference.role).length;
    metrics.canvas_roles = Array.from(canvasReferences.reduce((roles, reference) => {
        const role = reference.role || 'missing-role';
        roles.set(role, (roles.get(role) || 0) + 1);
        return roles;
    }, new Map()).entries()).map(([role, count]) => ({ role, count }));
    metrics.video_count = countTag(html, 'video');
    metrics.inline_style_count = countMatches(html, /\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/gi);
    metrics.inline_style_ratio = metrics.node_count ? Number((metrics.inline_style_count / metrics.node_count).toFixed(4)) : 0;
    metrics.inline_style_properties = collectInlineStyleProperties(html);
    metrics.inline_handler_count = countMatches(html, INLINE_HANDLER_RE);
    metrics.base64_in_dom_count = countMatches(html, BASE64_RE);
    metrics.data_uri_in_dom_count = countMatches(html, DATA_URI_RE);
    metrics.data_preview_signature_count = countMatches(html, /\sdata-preview-signature\s*=/gi);
    metrics.html_count = countTag(html, 'html');
    metrics.head_count = countTag(html, 'head');
    metrics.body_count = countTag(html, 'body');
    metrics.localhost_occurrence_count = countMatches(html, /localhost|127\.0\.0\.1/gi);
    metrics.media_error_count = countMatches(html, /\sdata-media-api-error\s*=/gi);
    metrics.has_data_group_timeline = /\sdata-group-timeline\s*=/.test(html);

    const ids = new Map();
    for (const match of html.matchAll(ID_ATTRIBUTE_RE)) {
        const id = decodeHtmlAttribute(String(match[1] ?? match[2] ?? '')).trim();
        if (id) ids.set(id, (ids.get(id) || 0) + 1);
    }
    metrics.duplicate_ids = Array.from(ids.entries())
        .filter(([, count]) => count > 1)
        .map(([id, count]) => ({ id, count }));
    metrics.duplicate_id_count = metrics.duplicate_ids.length;

    const atomeIds = new Map();
    const heavyBusinessAttributes = new Map();
    const forbiddenAttributes = new Map();
    const atomeReferences = collectAtomeProjectionReferences({
        rootDir,
        file,
        html,
        maxDataAttributeLength
    });
    for (const match of html.matchAll(DATA_ATTRIBUTE_RE)) {
        const name = String(match[1] || '').toLowerCase();
        const value = decodeHtmlAttribute(String(match[2] ?? match[3] ?? ''));
        metrics.data_attribute_count += 1;
        if (looksLikeJsonModel(value)) metrics.json_like_data_count += 1;
        if (value.length > maxDataAttributeLength) metrics.large_data_count += 1;
        if (name === 'data-atome-id') {
            const atomeId = value.trim();
            if (atomeId) atomeIds.set(atomeId, (atomeIds.get(atomeId) || 0) + 1);
        }
        if (!isRuntimeBlobUrl(value) && LOCAL_SOURCE_RE.test(value)) {
            metrics.localhost_or_127_count_in_persisted_attrs += 1;
        }
        if (FORBIDDEN_DATA_ATTRIBUTES.has(name) || BUSINESS_DATA_NAME_RE.test(name)) {
            metrics.heavy_business_data_count += 1;
            heavyBusinessAttributes.set(name, (heavyBusinessAttributes.get(name) || 0) + 1);
        }
        if (FORBIDDEN_DATA_ATTRIBUTES.has(name)) {
            forbiddenAttributes.set(name, (forbiddenAttributes.get(name) || 0) + 1);
        }
    }
    for (const match of html.matchAll(SOURCE_ATTRIBUTE_RE)) {
        const value = decodeHtmlAttribute(String(match[2] ?? match[3] ?? ''));
        if (!isRuntimeBlobUrl(value) && LOCAL_SOURCE_RE.test(value)) metrics.localhost_or_127_count_in_persisted_attrs += 1;
    }

    metrics.data_atome_id_count = Array.from(atomeIds.values()).reduce((total, count) => total + count, 0);
    metrics.data_atome_id_unique_count = atomeIds.size;
    metrics.data_atome_ids = Array.from(atomeIds.entries()).flatMap(([id, count]) => Array(count).fill(id));
    metrics.data_atome_id_references = atomeReferences;
    metrics.repeated_data_atome_ids = Array.from(atomeIds.entries())
        .filter(([, count]) => count > 1)
        .map(([id, count]) => ({ id, count }));
    metrics.heavy_business_data_attributes = Array.from(heavyBusinessAttributes.entries())
        .map(([attribute, count]) => ({ attribute, count }));
    metrics.forbidden_data_attributes = Array.from(forbiddenAttributes.entries())
        .map(([attribute, count]) => ({ attribute, count }));
    return metrics;
};

export const checkDomProjectionGuardrails = ({
    rootDir = DEFAULT_ROOT,
    targets = [],
    maxDataAttributeLength = DEFAULT_MAX_DATA_ATTRIBUTE_LENGTH,
    maxNodeCount = DEFAULT_MAX_NODE_COUNT,
    maxInlineStyleCount = DEFAULT_MAX_INLINE_STYLE_COUNT,
    maxCanvasCount = DEFAULT_MAX_CANVAS_COUNT,
    maxVideoCount = DEFAULT_MAX_VIDEO_COUNT
} = {}) => {
    const files = collectDomFiles(rootDir, targets);
    const metrics = files.map((file) => collectDomProjectionMetrics({
        rootDir,
        file,
        html: fs.readFileSync(file, 'utf8'),
        maxDataAttributeLength
    }));
    const violations = files.flatMap((file) => {
        const html = fs.readFileSync(file, 'utf8');
        return [
            ...collectAttributeViolations({ rootDir, file, html, maxDataAttributeLength }),
            ...collectSourceAttributeViolations({ rootDir, file, html }),
            ...collectDocumentShapeViolations({ rootDir, file, html }),
            ...collectAtomeProjectionViolations({ rootDir, file, html, maxDataAttributeLength }),
            ...collectCanvasViolations({ rootDir, file, html }),
            ...collectDocumentDensityViolations({
                location: normalizeProjectPath(rootDir, file),
                html,
                maxNodeCount,
                maxInlineStyleCount,
                maxCanvasCount,
                maxVideoCount
            })
        ];
    });
    return {
        ok: violations.length === 0,
        scanned_files: files.map((file) => normalizeProjectPath(rootDir, file)),
        metrics,
        summary: summarizeMetrics(metrics),
        violations
    };
};

const parseTargets = (argv) => {
    const index = argv.indexOf('--paths');
    if (index < 0 || !argv[index + 1]) return DEFAULT_TARGETS;
    return argv[index + 1].split(',').map((item) => item.trim()).filter(Boolean);
};

const main = () => {
    const result = checkDomProjectionGuardrails({ targets: parseTargets(process.argv) });
    console.log(formatDomProjectionReport(result));
    if (!result.ok) {
        console.error(`DOM projection guardrails failed with ${result.violations.length} violation(s):`);
        for (const violation of result.violations.slice(0, 80)) {
            console.error(`- [${violation.code}] ${violation.file}${violation.attribute ? ` ${violation.attribute}` : ''}`);
            console.error(`  ${violation.message}`);
            console.error(`  ${violation.excerpt}`);
        }
        process.exit(1);
    }
    console.log(`DOM projection guardrails OK (${result.scanned_files.length} file(s))`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
