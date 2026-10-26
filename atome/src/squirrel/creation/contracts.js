import { validateParams } from '../ai/agent_gateway_normalize.js';

// Créer (the home's Texte, Dessin and Retouche, decisions of 25–26 Oct. 2026): one contract for
// runtime V2, AI discovery and direct MCP calls. Every action of its edits is one of these commands,
// run by eVe/domains/creation/creation_runtime.js on the creation's Atome through the same model
// owners and the same filing as the edit on screen (an edit open on that Atome takes the change).
// A creation is named by its `atome_id` (creation.list gives them); a text's ranges are character
// offsets of its text (`start` included, `end` excluded); a drawing's items are numbered in their
// order (back to front) and laid in the drawing's own pixels; a picture's erasing strokes are in
// the picture's 0..1 (their size a share of its width).
export const CREATION_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'NOT_FOUND', 'WRONG_KIND', 'PROJECT_UNAVAILABLE', 'SOURCE_NOT_FOUND',
    'PRESENTATION_UNAVAILABLE', 'EMPTY', 'SEND_FAILED', 'WRITE_FAILED']);
export const CREATION_KINDS = Object.freeze(['text', 'drawing', 'picture']);

const id = { type: 'string', minLength: 1, maxLength: 200 };
const offset = { type: 'integer', minimum: 0, maximum: 200000 };
const colour = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };
const point = { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number', minimum: -100000, maximum: 100000 } };
const indices = { type: 'array', minItems: 1, maxItems: 500, items: { type: 'integer', minimum: 0, maximum: 9999 } };
const target = { atome_id: id };
const range = { start: offset, end: offset };
const drawingItem = { type: 'object', additionalProperties: false, required: ['kind'], properties: {
    kind: { type: 'string', enum: ['brush', 'shape'] },
    brush: { type: 'string', enum: ['pen', 'felt', 'calli', 'pencil', 'marker'] },
    shape: { type: 'string', enum: ['line', 'arrow', 'rect', 'ellipse', 'star', 'polygon'] },
    points: { type: 'array', minItems: 2, maxItems: 2000, items: point }, from: point, to: point,
    stroke: colour, fill: colour, width: { type: 'number', minimum: 1, maximum: 80 } } };
const eraseStroke = { type: 'object', additionalProperties: false, required: ['points', 'size'], properties: {
    points: { type: 'array', minItems: 1, maxItems: 2000, items: point }, size: { type: 'number', minimum: 0.001, maximum: 400 },
    softness: { type: 'number', minimum: 0, maximum: 1 }, restore: { type: 'boolean' } } };
const adjustment = { type: 'integer', minimum: -100, maximum: 100 };

const definitions = {
    list: [{ kind: { type: 'string', enum: CREATION_KINDS }, project_id: id }, ['kind'],
        'List the user\'s creations of one kind (texts, drawings, pictures retouched) in the current project, newest last: atome_id and title.', false, 'read'],
    read: [target, ['atome_id'], 'Describe one creation: a text\'s words, paragraphs (style, alignment, list, indent, spacing, blocks) and page; a drawing\'s items (kind, brush or shape, style) and erasing; a picture\'s retouch, framing and erasing.', false, 'read'],
    open: [{ kind: { type: 'string', enum: CREATION_KINDS }, atome_id: id, view: { type: 'string', enum: ['edit', 'list'] } }, ['kind'],
        'Show Créer on the Dashboard (the user sees it): a creation\'s edit (`atome_id`; none: a new one), or its kind\'s list (`view: list`).', false, 'control'],
    new_text: [{ text: { type: 'string', minLength: 1, maxLength: 20000 }, project_id: id }, ['text'],
        'Make a new text (Créer › Texte) in the current project; line breaks start paragraphs. Returns its atome_id.', true, 'write'],
    new_drawing: [{ items: { type: 'array', minItems: 1, maxItems: 500, items: drawingItem }, project_id: id }, ['items'],
        'Make a new vector drawing (Créer › Dessin) from items: brush strokes (points) or shapes (from, to), each with an optional stroke, fill and width. Returns its atome_id.', true, 'write'],
    new_picture: [{ media_url: { type: 'string', minLength: 1, maxLength: 2000 }, file_name: { type: 'string', maxLength: 300 }, mime_type: { type: 'string', maxLength: 100 },
        project_id: id }, ['media_url'], 'Put a picture of the user\'s media library in the project to retouch it (Créer › Retouche). Returns its atome_id.', true, 'write'],
    write: [{ ...target, ...range, text: { type: 'string', maxLength: 20000 } }, ['atome_id', 'text'],
        'Write in a text: replace start..end with `text` (start = end inserts; no range: the whole text). Styles and paragraphs follow their words.', true, 'write'],
    style: [{ ...target, ...range, paragraph_style: { type: 'string', enum: ['title', 'subtitle', 'body', 'quote', 'note'] },
        bold: { type: 'boolean' }, italic: { type: 'boolean' }, underline: { type: 'boolean' }, strike: { type: 'boolean' }, color: colour,
        font_size: { type: 'integer', minimum: 8, maximum: 120 }, font_family: { type: 'string', minLength: 1, maxLength: 80 } }, ['atome_id'],
        'Style a text (Style): a paragraph style on the paragraphs of start..end, and bold, italic, underline, strike (true sets, false removes), colour, size, font on start..end. No range: the whole text.', true, 'write'],
    paragraph: [{ ...target, ...range, align: { type: 'string', enum: ['left', 'center', 'right', 'justify'] }, list: { type: 'string', enum: ['none', 'bullet', 'number', 'check'] },
        checked: { type: 'boolean' }, indent: { type: 'integer', minimum: 0, maximum: 6 }, line_spacing: { type: 'number', minimum: 1, maximum: 2.5 },
        space_after: { type: 'integer', minimum: 0, maximum: 40 } }, ['atome_id'],
        'Lay out a text\'s paragraphs (Para.) touched by start..end (no range: all): alignment, list (bullets, numbers, boxes to tick, none), a box ticked, indent steps, line spacing, space after.', true, 'write'],
    page: [{ ...target, format: { type: 'string', enum: ['screen', 'a4', 'square', 'story'] }, landscape: { type: 'boolean' }, margins: { type: 'integer', minimum: 0, maximum: 60 },
        columns: { type: 'integer', minimum: 1, maximum: 3 }, background: colour }, ['atome_id'],
        'Set a text\'s page (Page): its format (screen as tall as the text, A4, square, story), landscape (A4, story), margins, columns (paged formats), background colour.', true, 'write'],
    insert: [{ ...target, at: offset, block: { type: 'string', enum: ['rule', 'picture', 'drawing'] }, source_id: id }, ['atome_id', 'block'],
        'Insert in a text at `at` (none: at its end), on a paragraph of its own (Insér.): a rule, or a picture or drawing creation (`source_id`), kept linked to it.', true, 'write'],
    link: [{ ...target, ...range, url: { type: 'string', maxLength: 2000 } }, ['atome_id', 'start', 'end', 'url'],
        'Make start..end of a text lead to an address (Lien); an empty url takes the link off.', true, 'write'],
    draw: [{ ...target, items: { type: 'array', minItems: 1, maxItems: 500, items: drawingItem } }, ['atome_id', 'items'],
        'Add items to a drawing (Brosse, Formes), on top of the others.', true, 'write'],
    drawing_style: [{ ...target, items: indices, look: { type: 'string', enum: ['trait', 'plein', 'arrondi', 'ombre', 'neon', 'encre'] }, stroke: colour, fill: colour,
        width: { type: 'number', minimum: 1, maximum: 80 }, radius: { type: 'integer', minimum: 0, maximum: 60 }, shadow: { type: 'integer', minimum: 0, maximum: 100 }, glow: { type: 'boolean' } },
        ['atome_id'], 'Style a drawing\'s items (no items: all) (Style): a ready-made look (line, solid, rounded, shadow, neon, ink), then stroke and fill colours, width, corner radius, shadow, glow.', true, 'write'],
    arrange: [{ ...target, items: indices, action: { type: 'string', enum: ['remove', 'duplicate', 'front', 'back', 'group'] }, move: point,
        scale: { type: 'number', minimum: 0.1, maximum: 10 }, rotation: { type: 'number', minimum: -360, maximum: 360 } }, ['atome_id', 'items'],
        'Work on a drawing\'s items: remove, duplicate, bring to front, send to back, group them; move them by [dx, dy], scale or turn them (degrees) around their centre.', true, 'write'],
    erase: [{ ...target, strokes: { type: 'array', minItems: 1, maxItems: 200, items: eraseStroke }, clear: { type: 'boolean' } }, ['atome_id'],
        'Gomme on a drawing or a picture: add erasing strokes (restore: true paints the picture back), or clear all erasing. The original stays whole underneath.', true, 'write'],
    retouch: [{ ...target, auto: { type: 'boolean' }, brightness: adjustment, contrast: adjustment, shadows: adjustment, highlights: adjustment, saturation: adjustment,
        temperature: adjustment, sharpness: { type: 'integer', minimum: 0, maximum: 100 }, vignette: { type: 'integer', minimum: 0, maximum: 100 },
        look: { type: 'string', enum: ['none', 'vivid', 'soft', 'mono', 'sepia', 'warm', 'cool', 'film', 'night'] }, look_strength: { type: 'integer', minimum: 0, maximum: 100 },
        rounding: { type: 'integer', minimum: 0, maximum: 120 } }, ['atome_id'],
        'Retouch a picture (Ajust., Filtre, Coins): auto light, then each adjustment (-100..100; sharpness, vignette 0..100), a look and its strength, its corner rounding (0: square). Non-destructive.', true, 'write'],
    frame: [{ ...target, ratio: { type: 'string', enum: ['free', 'square', '4_3', '16_9', '9_16'] }, turn: { type: 'integer', minimum: 0, maximum: 3 }, mirror: { type: 'boolean' },
        straighten: { type: 'number', minimum: -45, maximum: 45 }, frame: { type: 'object', additionalProperties: false, required: ['x', 'y', 'width', 'height'], properties: {
            x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 }, width: { type: 'number', minimum: 0.02, maximum: 1 }, height: { type: 'number', minimum: 0.02, maximum: 1 } } } },
        ['atome_id'], 'Frame a picture (Cadre): a ratio (its frame centred), quarter turns, mirror, straighten in degrees, or the frame itself in the turned picture\'s 0..1.', true, 'write'],
    export: [target, ['atome_id'], 'The file a creation gives another app (Envoi): an A4 text as PDF, a square or story text as PNG, a screen text as plain text, a drawing as SVG, a picture as its file. Returns file_name, mime_type, size and data_url.', false, 'read'],
    send: [{ ...target, contact_ids: { type: 'array', minItems: 1, maxItems: 20, items: id } }, ['atome_id', 'contact_ids'],
        'Send a creation to people (Envoi), in each one\'s conversation (contacts.search gives their ids).', true, 'send']
};
const creationSchema = { type: 'object', properties: { atome_id: { type: 'string' }, kind: { type: 'string', enum: CREATION_KINDS }, title: { type: 'string' },
    project_id: { type: 'string' } } };
export const CREATION_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `creation.${action}`, action, description, persistent, capability: `creation.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: CREATION_ERRORS },
        atome_id: { type: 'string' }, creations: { type: 'array', items: creationSchema }, creation: { type: 'object' },
        file_name: { type: 'string' }, mime_type: { type: 'string' }, size: { type: 'integer' }, data_url: { type: 'string' }, sent: { type: 'integer' } } }
})));
export const validateCreationInput = (action, input) => {
    const contract = CREATION_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const creationError = error => (CREATION_ERRORS.includes(error?.code || error?.message || error) ? (error?.code || error?.message || error) : 'WRITE_FAILED');
export const CREATION_ASSISTANT_INSTRUCTIONS = 'Créer (the user\'s own texts, drawings and pictures): « écris un texte … » calls creation.new_text; « mets le titre en gras », « centre ce paragraphe », « fais une liste à cocher », « passe en A4 » call creation.style, creation.paragraph, creation.page on the text (creation.read gives its words and their offsets); « ajoute une image / mon dessin / un trait » calls creation.insert, « mets un lien » creation.link. « dessine … » makes a drawing with creation.new_drawing (items in pixels), then creation.draw, creation.drawing_style, creation.arrange, creation.erase. « retouche la photo », « mets-la en noir et blanc », « recadre en carré » call creation.retouch and creation.frame. « montre-le » calls creation.open; « envoie-le à Marie » calls creation.send with the ids contacts.search gives; « exporte en PDF » creation.export. creation.list gives the atome_id of the user\'s creations; never invent one.';
