import { validateParams } from '../ai/agent_gateway_normalize.js';
import { LIBRARY_WORK_KINDS } from '../../shared/library_work_contract.js';

// One contract for runtime V2, AI discovery and direct MCP calls, like shopping:
// the Dashboard's « Livre » and « Livre audio » tiles call these same commands.
export const BOOKS_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'WORK_NOT_FOUND', 'NOT_DOWNLOADED', 'DOWNLOAD_FAILED',
    'DOWNLOAD_IN_PROGRESS', 'FORMAT_UNSUPPORTED', 'FILE_MISSING', 'FILE_CORRUPT', 'NOTHING_OPEN', 'IMPORT_CANCELLED',
    'PRESENTATION_UNAVAILABLE', 'COMMIT_FAILED']);

const kind = { type: 'string', enum: LIBRARY_WORK_KINDS };
const work = { type: 'string', minLength: 1, maxLength: 200 };
const definitions = {
    list: [{ kind }, [], 'List the free works offered and the books or audiobooks the user holds, with their download state.', false],
    download: [{ work_id: work }, ['work_id'], 'Download a free work offered by the library into the user\'s own files, for offline reading.', true],
    open: [{ work_id: work }, ['work_id'], 'Open a book or an audiobook on the presentation surface, where reading or listening stopped (downloading it first when needed).', true],
    import: [{ kind }, ['kind'], 'Import a book (EPUB or PDF without DRM) or an audiobook (MP3 files, one per chapter) chosen by the user.', true],
    page: [{ direction: { type: 'string', enum: ['next', 'previous'] }, fraction: { type: 'number', minimum: 0, maximum: 1 } }, [],
        'Turn the open book one page (or go to `fraction` of it), or move the open audiobook one chapter.', true],
    transport: [{ operation: { type: 'string', enum: ['play', 'pause', 'toggle', 'seek', 'skip'] }, seconds: { type: 'number' } }, ['operation'],
        'Play, pause, seek to `seconds` in the chapter, or skip by `seconds` (negative goes back) in the open audiobook.', true],
    close: [{}, [], 'Close the open book or audiobook; its position is kept.', true]
};
const workSchema = { type: 'object', required: ['id', 'kind', 'title', 'state'], properties: {
    id: { type: 'string' }, kind: { type: 'string' }, title: { type: 'string' }, author: { type: 'string' }, format: { type: 'string' },
    state: { type: 'string', enum: ['available', 'downloading', 'downloaded', 'error'] }, provider: { type: 'string' }, rights: { type: 'string' },
    source_url: { type: 'string' }, progress: { type: 'number' } } };
export const BOOKS_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `books.${action}`, action, description, persistent, capability: persistent ? 'books.write' : 'books.read',
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: BOOKS_ERRORS },
        work: workSchema, works: { type: 'array', items: workSchema } } }
})));
export const validateBooksInput = (action, input) => {
    const contract = BOOKS_COMMANDS.find(command => command.action === action);
    if (!contract || !validateParams(contract.input_schema, input).ok) return 'INVALID_ARGUMENT';
    return action === 'page' && !input.direction && input.fraction === undefined ? 'INVALID_ARGUMENT' : null;
};
export const booksError = error => (BOOKS_ERRORS.includes(error?.code || error?.message || error) ? (error?.code || error?.message || error) : 'COMMIT_FAILED');
