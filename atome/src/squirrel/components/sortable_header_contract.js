import { normalizeTablePresentation } from './table_contract.js';

const SORT_DIRECTIONS = new Set(['asc', 'desc']);

// The sortable header reuses the passive table column geometry so a sorted
// header and the rows beneath it can never resolve different column widths.
// Only the sort state and the per-column sortability are added here; the
// caller owns the sort value exactly as it owns a Select value.
const normalizeSortableHeaderPresentation = ({
    columns,
    width,
    sortKey = null,
    sortDirection = 'asc',
    disabled = false
} = {}) => {
    if (!Array.isArray(columns) || columns.length === 0) {
        throw new Error('squirrel_sortable_header_columns_required');
    }
    // One synthetic row keeps the shared width resolver honest without asking
    // callers for data the header does not display.
    const probeRow = { id: 'sortable_header_probe', cells: {} };
    columns.forEach((column, index) => {
        const id = column && typeof column === 'object' ? column.id : column;
        probeRow.cells[String(id == null ? index : id)] = '';
    });
    const presentation = normalizeTablePresentation({
        columns,
        rows: [probeRow],
        header: true,
        width
    });

    const sortable = columns.map((column, index) => {
        const source = column && typeof column === 'object' ? column : {};
        if (source.sortable === undefined) return true;
        if (typeof source.sortable !== 'boolean') {
            throw new Error(`squirrel_sortable_header_column_sortable_invalid:${index}`);
        }
        return source.sortable;
    });

    const normalizedKey = sortKey == null ? null : String(sortKey).trim();
    if (normalizedKey === '') throw new Error('squirrel_sortable_header_sort_key_empty');
    if (normalizedKey != null) {
        const target = presentation.columns.findIndex((column) => column.id === normalizedKey);
        if (target < 0) throw new Error(`squirrel_sortable_header_sort_key_unknown:${normalizedKey}`);
        if (!sortable[target]) {
            throw new Error(`squirrel_sortable_header_sort_key_not_sortable:${normalizedKey}`);
        }
    }

    const direction = String(sortDirection == null ? '' : sortDirection).trim();
    if (!SORT_DIRECTIONS.has(direction)) {
        throw new Error(`squirrel_sortable_header_sort_direction_unsupported:${direction || 'empty'}`);
    }

    const projected = presentation.columns.map((column, index) => Object.freeze({
        id: column.id,
        label: column.label,
        align: column.align,
        width: column.width,
        offset: column.offset,
        sortable: sortable[index],
        active: normalizedKey != null && column.id === normalizedKey
    }));

    return Object.freeze({
        columns: Object.freeze(projected),
        width: presentation.width,
        sortKey: normalizedKey,
        sortDirection: direction,
        disabled: disabled === true
    });
};

// Direction toggling is a presentation rule, not a product rule: every consumer
// must flip the same way so two panels cannot disagree on what a second click
// means. Activating a new column starts from its caller-provided default.
const nextSortState = ({ sortKey = null, sortDirection = 'asc' } = {}, columnId, defaultDirection = 'asc') => {
    const target = String(columnId == null ? '' : columnId).trim();
    if (!target) throw new Error('squirrel_sortable_header_toggle_column_required');
    const fallback = String(defaultDirection == null ? '' : defaultDirection).trim();
    if (!SORT_DIRECTIONS.has(fallback)) {
        throw new Error(`squirrel_sortable_header_default_direction_unsupported:${fallback || 'empty'}`);
    }
    if (sortKey !== target) return Object.freeze({ sortKey: target, sortDirection: fallback });
    const current = String(sortDirection == null ? '' : sortDirection).trim();
    if (!SORT_DIRECTIONS.has(current)) {
        throw new Error(`squirrel_sortable_header_sort_direction_unsupported:${current || 'empty'}`);
    }
    return Object.freeze({ sortKey: target, sortDirection: current === 'asc' ? 'desc' : 'asc' });
};

export {
    normalizeSortableHeaderPresentation,
    nextSortState
};
