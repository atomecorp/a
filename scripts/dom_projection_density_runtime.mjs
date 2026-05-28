const countMatches = (text, pattern) => (text.match(pattern) || []).length;

export const collectDocumentDensityViolations = ({
    location,
    html,
    maxNodeCount,
    maxInlineStyleCount,
    maxCanvasCount,
    maxVideoCount
}) => {
    const violations = [];
    const nodeCount = countMatches(html, /<[a-zA-Z][a-zA-Z0-9:-]*(?:\s|>|\/)/g);
    const inlineStyleCount = countMatches(html, /\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/gi);
    const canvasCount = countMatches(html, /<canvas(?:\s|>|\/)/gi);
    const videoCount = countMatches(html, /<video(?:\s|>|\/)/gi);
    const pushThreshold = (condition, code, attribute, message, excerpt) => {
        if (!condition) return;
        violations.push({ code, file: location, attribute, message, excerpt: String(excerpt) });
    };
    pushThreshold(
        nodeCount > maxNodeCount,
        'dom_node_count_threshold',
        '',
        `DOM projections must stay below ${maxNodeCount} element nodes.`,
        nodeCount
    );
    pushThreshold(
        inlineStyleCount > maxInlineStyleCount,
        'inline_style_count_threshold',
        'style',
        `DOM projections must stay below ${maxInlineStyleCount} inline style attributes.`,
        inlineStyleCount
    );
    pushThreshold(
        canvasCount > maxCanvasCount,
        'canvas_count_threshold',
        'canvas',
        `DOM projections must stay below ${maxCanvasCount} canvas elements.`,
        canvasCount
    );
    pushThreshold(
        videoCount > maxVideoCount,
        'video_count_threshold',
        'video',
        `DOM projections must stay below ${maxVideoCount} video elements.`,
        videoCount
    );
    return violations;
};
