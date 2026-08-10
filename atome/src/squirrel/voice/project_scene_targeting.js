import { normalizeSpeechText, speechEditDistance } from './service_speech.js';

const TYPE_ALIASES = Object.freeze({
    text: ['text', 'texte'],
    shape: ['shape', 'forme'],
    image: ['image', 'photo'],
    video: ['video', 'vidéo'],
    sound: ['sound', 'son', 'audio']
});

const toText = (value) => String(value == null ? '' : value).trim();

const sceneAtomes = (projectScene) => Array.isArray(projectScene?.atomes)
    ? projectScene.atomes.filter((entry) => entry && toText(entry.id))
    : [];

const normalizeType = (value = '') => {
    const normalized = normalizeSpeechText(value);
    for (const [canonical, aliases] of Object.entries(TYPE_ALIASES)) {
        if (aliases.some((alias) => normalized === normalizeSpeechText(alias))) return canonical;
    }
    return normalized;
};

const utteranceMentionsType = (utterance, type) => {
    const normalized = ` ${normalizeSpeechText(utterance)} `;
    const aliases = TYPE_ALIASES[normalizeType(type)] || [type];
    return aliases.some((alias) => normalized.includes(` ${normalizeSpeechText(alias)} `));
};

const compactMatches = (matches) => matches.map((entry) => ({
    id: toText(entry.id),
    type: toText(entry.type),
    text: toText(entry.text || entry.name) || null
}));

const resolutionFromMatches = (matches, reason) => {
    if (matches.length === 1) return { ok: true, atome_id: toText(matches[0].id), reason, matches: compactMatches(matches) };
    if (matches.length > 1) return { ok: false, error: 'scene_target_ambiguous', reason, matches: compactMatches(matches) };
    return null;
};

const NUMBER_WORDS = Object.freeze({
    zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
    dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
    vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60
});

const parseNumberWords = (value = '') => {
    const tokens = normalizeSpeechText(value)
        .replace(/quatre[ -]vingts?/g, '80')
        .split(/[\s-]+/)
        .filter((token) => token && token !== 'et');
    if (!tokens.length) return null;
    let total = 0;
    let current = 0;
    for (const token of tokens) {
        if (/^\d+$/.test(token)) {
            current += Number(token);
        } else if (token === 'cent' || token === 'cents') {
            current = (current || 1) * 100;
        } else if (token === 'mille' || token === 'milles') {
            total += (current || 1) * 1000;
            current = 0;
        } else if (Object.hasOwn(NUMBER_WORDS, token)) {
            current += NUMBER_WORDS[token];
        } else {
            return null;
        }
    }
    const result = total + current;
    return Number.isFinite(result) && result > 0 ? result : null;
};

const resolvePixelDistance = (utterance = '') => {
    const normalized = normalizeSpeechText(utterance).replace(/\btrois piscines?\b/g, 'trois cents pixels');
    const numeric = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(?:px|pixels?)\b/);
    if (numeric) return Number(numeric[1].replace(',', '.'));
    const beforeUnit = normalized.match(/(.{1,80})\b(?:px|pixels?)\b/);
    const words = beforeUnit?.[1]?.trim().split(/\s+/).slice(-7) || [];
    for (let index = 0; index < words.length; index += 1) {
        const parsed = parseNumberWords(words.slice(index).join(' '));
        if (parsed != null) return parsed;
    }
    return null;
};

export const resolveProjectSceneTarget = ({
    projectScene = null,
    utterance = '',
    atomeId = '',
    type = '',
    text = '',
    name = ''
} = {}) => {
    const atomes = sceneAtomes(projectScene);
    const explicitId = toText(atomeId);
    if (explicitId) {
        const exactId = atomes.filter((entry) => toText(entry.id) === explicitId);
        return resolutionFromMatches(exactId, 'explicit_id')
            || { ok: false, error: 'scene_target_not_found', reason: 'explicit_id', matches: [] };
    }

    const normalizedUtterance = normalizeSpeechText(utterance);
    if (/\b(selection|selectionne|selectionnee|selected)\b/.test(normalizedUtterance)) {
        const selected = atomes.filter((entry) => entry.selected === true);
        const selectedResolution = resolutionFromMatches(selected, 'explicit_selection');
        if (selectedResolution) return selectedResolution;
    }

    const requestedType = normalizeType(type);
    const requestedLabel = toText(text || name);
    const exactMatches = atomes.filter((entry) => {
        const entryType = normalizeType(entry.type);
        const entryLabel = toText(entry.text || entry.name);
        const typeMatches = requestedType ? entryType === requestedType : utteranceMentionsType(utterance, entryType);
        const labelMatches = requestedLabel
            ? entryLabel.toLocaleLowerCase() === requestedLabel.toLocaleLowerCase()
            : !!entryLabel && toText(utterance).toLocaleLowerCase().includes(entryLabel.toLocaleLowerCase());
        return typeMatches && labelMatches;
    });
    const exactResolution = resolutionFromMatches(exactMatches, 'exact_type_and_text');
    if (exactResolution) return exactResolution;

    const normalizedLabel = normalizeSpeechText(requestedLabel);
    const normalizedMatches = atomes.filter((entry) => {
        const entryLabel = normalizeSpeechText(entry.text || entry.name);
        if (!entryLabel) return false;
        if (normalizedLabel) return entryLabel === normalizedLabel;
        return (` ${normalizedUtterance} `).includes(` ${entryLabel} `);
    });
    const normalizedResolution = resolutionFromMatches(normalizedMatches, 'normalized_unique');
    if (normalizedResolution) return normalizedResolution;

    const utteranceWords = normalizedUtterance.split(/\s+/).filter((word) => word.length >= 5);
    const typedAtomes = atomes.filter((entry) => utteranceMentionsType(utterance, entry.type));
    const candidates = (typedAtomes.length ? typedAtomes : atomes)
        .map((entry) => {
            const label = normalizeSpeechText(entry.text || entry.name);
            if (!label || label.includes(' ') || label.length < 5) return null;
            const distance = Math.min(...utteranceWords.map((word) => speechEditDistance(word, label)));
            return distance <= 2 && distance / Math.max(label.length, 1) <= 0.4 ? { entry, distance } : null;
        })
        .filter(Boolean);
    const bestDistance = Math.min(...candidates.map((candidate) => candidate.distance));
    const fuzzyMatches = candidates.filter((candidate) => candidate.distance === bestDistance).map((candidate) => candidate.entry);
    return resolutionFromMatches(fuzzyMatches, 'fuzzy_unique')
        || { ok: false, error: 'scene_target_not_found', reason: 'no_match', matches: [] };
};

export const resolveRelativeMoveCommand = ({ utterance = '', projectScene = null } = {}) => {
    const normalized = normalizeSpeechText(utterance).replace(/\btrois piscines?\b/g, 'trois cents pixels');
    const direction = Object.entries({ droite: [1, 0], right: [1, 0], gauche: [-1, 0], left: [-1, 0], bas: [0, 1], down: [0, 1], haut: [0, -1], up: [0, -1] })
        .find(([word]) => (` ${normalized} `).includes(` ${word} `));
    const movementRequested = /\b(deplace\w*|bouge\w*|decale\w*|move\w*)\b/.test(normalized);
    const explicitlyNegated = /\b(ne|ne pas|pas)\b.{0,24}\b(deplace\w*|bouge\w*|decale\w*|move\w*)\b/.test(normalized);
    const distance = resolvePixelDistance(normalized);
    if (!movementRequested || explicitlyNegated || !direction || !Number.isFinite(distance)) return { matched: false };
    const target = resolveProjectSceneTarget({ projectScene, utterance });
    if (!target.ok) return { matched: true, ...target };
    return {
        matched: true,
        ok: true,
        atome_id: target.atome_id,
        delta_x: direction[1][0] * distance,
        delta_y: direction[1][1] * distance,
        target_reason: target.reason
    };
};

export const groundRuntimeToolchain = ({ toolchain = [], utterance = '', projectScene = null } = {}) => {
    const grounded = [];
    for (const step of Array.isArray(toolchain) ? toolchain : []) {
        if (step?.source !== 'runtime_v2' || step?.tool_id !== 'ui.move' || step?.action !== 'move.relative') {
            grounded.push(step);
            continue;
        }
        const input = step.input && typeof step.input === 'object' ? step.input : {};
        const deltaX = Number(input.delta_x ?? input.deltaX);
        const deltaY = Number(input.delta_y ?? input.deltaY);
        if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
            return { ok: false, error: 'move_relative_delta_invalid', toolchain: [] };
        }
        const target = resolveProjectSceneTarget({
            projectScene,
            utterance,
            atomeId: input.atome_id || input.atomeId,
            type: input.atome_type || input.type,
            text: input.text,
            name: input.name
        });
        if (!target.ok) return { ...target, toolchain: [] };
        grounded.push({
            ...step,
            input: { ...input, atome_id: target.atome_id, delta_x: deltaX, delta_y: deltaY }
        });
    }
    return { ok: true, toolchain: grounded };
};
