import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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
    'data-media-api-error'
]);
const BUSINESS_DATA_NAME_RE = /(?:timeline|properties|history|permission|waveform|thumbnail|cache|source|members|steps)/i;
const LOCAL_SOURCE_RE = /(?:127\.0\.0\.1|localhost|media_user_id=|(?:^|[/"'])data\/users\/|(?:^|[/"'])Users\/)/i;
const DATA_ATTRIBUTE_RE = /\s(data-[a-zA-Z0-9_.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const ID_ATTRIBUTE_RE = /\sid\s*=\s*(?:"([^"]+)"|'([^']+)')/g;
const OPENING_TAG_RE = /<([a-zA-Z][a-zA-Z0-9:-]*)(\s[^<>]*?)?>/g;

const normalizeProjectPath = (rootDir, filePath) => path.relative(rootDir, filePath).replace(/\\/g, '/');

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
    duplicate_id_count: 0,
    duplicate_ids: [],
    html_count: 0,
    head_count: 0,
    body_count: 0,
    localhost_occurrence_count: 0,
    media_error_count: 0,
    data_atome_id_count: 0,
    data_atome_id_unique_count: 0,
    data_atome_ids: [],
    data_atome_id_references: [],
    repeated_data_atome_ids: [],
    has_data_group_timeline: false,
    heavy_business_data_count: 0,
    heavy_business_data_attributes: []
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
        if (LOCAL_SOURCE_RE.test(value)) {
            violations.push({
                code: 'local_source_leak',
                file: location,
                attribute: name,
                message: 'DOM projection must not expose local paths, localhost URLs, or media user query state.',
                excerpt: value.slice(0, 220)
            });
        }
    }
    return violations;
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
                    || LOCAL_SOURCE_RE.test(value);
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
        if (FORBIDDEN_DATA_ATTRIBUTES.has(name) || BUSINESS_DATA_NAME_RE.test(name)) {
            metrics.heavy_business_data_count += 1;
            heavyBusinessAttributes.set(name, (heavyBusinessAttributes.get(name) || 0) + 1);
        }
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
    return metrics;
};

const sumMetric = (metrics, key) => metrics.reduce((total, item) => total + item[key], 0);

const summarizeMetrics = (metrics = []) => {
    const atomeIds = new Map();
    const atomeReferences = [];
    const canvasRoles = new Map();
    const duplicateIds = [];
    const heavyBusinessAttributes = new Map();
    for (const item of metrics) {
        item.data_atome_ids.forEach((id) => {
            atomeIds.set(id, (atomeIds.get(id) || 0) + 1);
        });
        item.data_atome_id_references.forEach((reference) => atomeReferences.push(reference));
        item.canvas_roles.forEach(({ role, count }) => {
            canvasRoles.set(role, (canvasRoles.get(role) || 0) + count);
        });
        item.duplicate_ids.forEach(({ id, count }) => duplicateIds.push({ file: item.file, id, count }));
        item.heavy_business_data_attributes.forEach(({ attribute, count }) => {
            heavyBusinessAttributes.set(attribute, (heavyBusinessAttributes.get(attribute) || 0) + count);
        });
    }
    return {
        file_count: metrics.length,
        dom_size_bytes: sumMetric(metrics, 'dom_size_bytes'),
        node_count: sumMetric(metrics, 'node_count'),
        div_count: sumMetric(metrics, 'div_count'),
        span_count: sumMetric(metrics, 'span_count'),
        button_count: sumMetric(metrics, 'button_count'),
        canvas_count: sumMetric(metrics, 'canvas_count'),
        canvas_without_role_count: sumMetric(metrics, 'canvas_without_role_count'),
        canvas_roles: Array.from(canvasRoles.entries()).map(([role, count]) => ({ role, count })),
        video_count: sumMetric(metrics, 'video_count'),
        data_attribute_count: sumMetric(metrics, 'data_attribute_count'),
        json_like_data_count: sumMetric(metrics, 'json_like_data_count'),
        large_data_count: sumMetric(metrics, 'large_data_count'),
        inline_style_count: sumMetric(metrics, 'inline_style_count'),
        duplicate_id_count: duplicateIds.length,
        duplicate_ids: duplicateIds,
        html_count: sumMetric(metrics, 'html_count'),
        head_count: sumMetric(metrics, 'head_count'),
        body_count: sumMetric(metrics, 'body_count'),
        localhost_occurrence_count: sumMetric(metrics, 'localhost_occurrence_count'),
        media_error_count: sumMetric(metrics, 'media_error_count'),
        data_atome_id_count: sumMetric(metrics, 'data_atome_id_count'),
        data_atome_id_unique_count: atomeIds.size,
        repeated_data_atome_ids: Array.from(atomeIds.entries())
            .filter(([, count]) => count > 1)
            .map(([id, count]) => ({ id, count })),
        repeated_data_atome_id_references: atomeReferences.filter((reference) => {
            const count = atomeIds.get(reference.id) || 0;
            return count > 1;
        }),
        has_data_group_timeline: metrics.some((item) => item.has_data_group_timeline),
        heavy_business_data_count: sumMetric(metrics, 'heavy_business_data_count'),
        heavy_business_data_attributes: Array.from(heavyBusinessAttributes.entries()).map(([attribute, count]) => ({
            attribute,
            count
        }))
    };
};

export const formatDomProjectionReport = (result) => {
    const summary = result.summary || summarizeMetrics(result.metrics || []);
    const lines = [
        'DOM projection audit report',
        `files: ${summary.file_count}`,
        `dom_size_bytes: ${summary.dom_size_bytes}`,
        `node_count: ${summary.node_count}`,
        `div_count: ${summary.div_count}`,
        `span_count: ${summary.span_count}`,
        `button_count: ${summary.button_count}`,
        `canvas_count: ${summary.canvas_count}`,
        `canvas_without_role_count: ${summary.canvas_without_role_count}`,
        `video_count: ${summary.video_count}`,
        `data_attribute_count: ${summary.data_attribute_count}`,
        `json_like_data_count: ${summary.json_like_data_count}`,
        `large_data_count: ${summary.large_data_count}`,
        `inline_style_count: ${summary.inline_style_count}`,
        `duplicate_id_count: ${summary.duplicate_id_count}`,
        `html_count: ${summary.html_count}`,
        `head_count: ${summary.head_count}`,
        `body_count: ${summary.body_count}`,
        `localhost_occurrence_count: ${summary.localhost_occurrence_count}`,
        `media_error_count: ${summary.media_error_count}`,
        `data_atome_id_count: ${summary.data_atome_id_count}`,
        `data_atome_id_unique_count: ${summary.data_atome_id_unique_count}`,
        `data_group_timeline: ${summary.has_data_group_timeline ? 'present' : 'absent'}`,
        `heavy_business_data_count: ${summary.heavy_business_data_count}`,
        `violations: ${result.violations.length}`
    ];
    if (summary.duplicate_ids.length) {
        lines.push(`duplicate_ids: ${summary.duplicate_ids.map((item) => `${item.file}:${item.id}(${item.count})`).join(', ')}`);
    }
    if (summary.repeated_data_atome_ids.length) {
        lines.push(`repeated_data_atome_ids: ${summary.repeated_data_atome_ids.map((item) => `${item.id}(${item.count})`).join(', ')}`);
        lines.push(`repeated_data_atome_projection_refs: ${summary.repeated_data_atome_id_references.map((item) => {
            const role = item.role || 'no-role';
            const renderer = item.renderer || 'no-renderer';
            const viewId = item.view_id || 'no-view';
            return `${item.id}:${item.tag}/${role}/${renderer}/${viewId}`;
        }).join(', ')}`);
    }
    if (summary.heavy_business_data_attributes.length) {
        lines.push(`heavy_business_data_attributes: ${summary.heavy_business_data_attributes.map((item) => `${item.attribute}(${item.count})`).join(', ')}`);
    }
    if (summary.canvas_roles.length) {
        lines.push(`canvas_roles: ${summary.canvas_roles.map((item) => `${item.role}(${item.count})`).join(', ')}`);
    }
    return lines.join('\n');
};

const collectDocumentDensityViolations = ({
    rootDir,
    file,
    html,
    maxNodeCount,
    maxInlineStyleCount,
    maxCanvasCount,
    maxVideoCount
}) => {
    const location = normalizeProjectPath(rootDir, file);
    const violations = [];
    const nodeCount = (html.match(/<[a-zA-Z][a-zA-Z0-9:-]*(?:\s|>|\/)/g) || []).length;
    const inlineStyleCount = (html.match(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/gi) || []).length;
    const canvasCount = (html.match(/<canvas(?:\s|>|\/)/gi) || []).length;
    const videoCount = (html.match(/<video(?:\s|>|\/)/gi) || []).length;

    if (nodeCount > maxNodeCount) {
        violations.push({
            code: 'dom_node_count_threshold',
            file: location,
            attribute: '',
            message: `DOM projections must stay below ${maxNodeCount} element nodes.`,
            excerpt: String(nodeCount)
        });
    }
    if (inlineStyleCount > maxInlineStyleCount) {
        violations.push({
            code: 'inline_style_count_threshold',
            file: location,
            attribute: 'style',
            message: `DOM projections must stay below ${maxInlineStyleCount} inline style attributes.`,
            excerpt: String(inlineStyleCount)
        });
    }
    if (canvasCount > maxCanvasCount) {
        violations.push({
            code: 'canvas_count_threshold',
            file: location,
            attribute: 'canvas',
            message: `DOM projections must stay below ${maxCanvasCount} canvas elements.`,
            excerpt: String(canvasCount)
        });
    }
    if (videoCount > maxVideoCount) {
        violations.push({
            code: 'video_count_threshold',
            file: location,
            attribute: 'video',
            message: `DOM projections must stay below ${maxVideoCount} video elements.`,
            excerpt: String(videoCount)
        });
    }
    return violations;
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
            ...collectDocumentShapeViolations({ rootDir, file, html }),
            ...collectAtomeProjectionViolations({ rootDir, file, html, maxDataAttributeLength }),
            ...collectCanvasViolations({ rootDir, file, html }),
            ...collectDocumentDensityViolations({
                rootDir,
                file,
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
