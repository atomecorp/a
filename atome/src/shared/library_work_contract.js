// Canonical private library work: one Atome per book or audiobook the user holds.
// Its files are the canonical file Atomes of the import pipeline (one per EPUB/PDF,
// one per audio chapter, in reading order); this record only gathers them with
// their provenance, the download state and where the reading or listening stopped.
export const LIBRARY_WORK_ATOME_TYPE = 'library_work';
export const LIBRARY_WORK_KINDS = Object.freeze(['book', 'audiobook']);
export const LIBRARY_WORK_FORMATS = Object.freeze(['epub', 'pdf', 'mp3']);
export const LIBRARY_WORK_PROVIDERS = Object.freeze(['gutenberg', 'librivox', 'import']);
export const LIBRARY_WORK_STATUSES = Object.freeze(['downloading', 'downloaded', 'error']);

const text = (maxLength) => ({ type: 'string', maxLength });
export const LIBRARY_WORK_FILE_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false, required: ['atome_id', 'file_name'], properties: {
    atome_id: text(200), file_name: text(400), media_url: text(2000), file_path: text(2000), owner_id: text(200),
    title: text(400), mime_type: text(200), size_bytes: { type: 'number', minimum: 0 }, duration_seconds: { type: 'number', minimum: 0 }
} });
// Where reading stopped: a PDF page, an EPUB anchor (spine item, block, character
// offset: it survives a reflow), or an audiobook chapter and time.
export const LIBRARY_WORK_POSITION_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false, properties: {
    page: { type: 'number', minimum: 0 }, spine: { type: 'number', minimum: 0 }, block: { type: 'number', minimum: 0 },
    offset: { type: 'number', minimum: 0 }, track: { type: 'number', minimum: 0 }, seconds: { type: 'number', minimum: 0 },
    fraction: { type: 'number', minimum: 0, maximum: 1 }, at: text(64)
} });
export const LIBRARY_WORK_TYPE = Object.freeze({ type: LIBRARY_WORK_ATOME_TYPE, kind: 'data_model', traits: ['data', 'editable'], schema: {
    work_kind: { type: 'string', enum: LIBRARY_WORK_KINDS }, format: { type: 'string', enum: LIBRARY_WORK_FORMATS },
    title: text(400), author: text(400), language: text(64),
    provider: { type: 'string', enum: LIBRARY_WORK_PROVIDERS }, source_id: text(200), source_url: text(2000), rights: text(1000),
    files: { type: 'array', maxItems: 500, items: LIBRARY_WORK_FILE_SCHEMA }, expected_files: { type: 'number', minimum: 0, maximum: 500 },
    status: { type: 'string', enum: LIBRARY_WORK_STATUSES }, error: text(200), position: LIBRARY_WORK_POSITION_SCHEMA,
    access: { type: 'string', enum: ['private'] }, visibility: { type: 'string', enum: ['private'] }
} });
