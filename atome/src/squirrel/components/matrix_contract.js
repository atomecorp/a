import { normalizeTablePresentation } from './table_contract.js';

// The matrix is the interactive counterpart of the passive table: same column
// geometry, plus row identity, selection and an optional virtualization window.
// Column widths are never resolved here — they are delegated to the table
// contract so a matrix, a sortable header and a passive table can never
// disagree on where a column starts for the same available width.

const textValue = (value, code) => {
    const normalized = String(value == null ? '' : value).trim();
    if (!normalized) throw new Error(code);
    return normalized;
};

const wholeNumber = (value, code, { min = 0 } = {}) => {
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized < min) throw new Error(code);
    return normalized;
};

// The table contract refuses an empty row set because a passive table with no
// rows is a composition mistake. A matrix legitimately renders an empty result,
// so it borrows the sortable header's probe-row trick to resolve columns
// without inventing data the caller does not have.
const probeRowFor = (columns) => {
    const cells = {};
    columns.forEach((column, index) => {
        const id = column && typeof column === 'object' ? column.id : column;
        cells[String(id == null ? index : id)] = '';
    });
    return { id: 'matrix_column_probe', cells };
};

const normalizeMatrixRow = (row, index, columns, selectedKeys) => {
    const source = row && typeof row === 'object' ? row : {};
    const id = textValue(source.id ?? `row_${index}`, `squirrel_matrix_row_id_required:${index}`);
    const cells = source.cells && typeof source.cells === 'object' ? source.cells : null;
    if (!cells) throw new Error(`squirrel_matrix_row_cells_required:${id}`);
    const values = columns.map((column) => {
        const cell = cells[column.id];
        if (cell === undefined) throw new Error(`squirrel_matrix_row_cell_missing:${id}:${column.id}`);
        return String(cell == null ? '' : cell);
    });
    if (source.selectable !== undefined && typeof source.selectable !== 'boolean') {
        throw new Error(`squirrel_matrix_row_selectable_invalid:${id}`);
    }
    return Object.freeze({
        id,
        values: Object.freeze(values),
        selectable: source.selectable !== false,
        selected: selectedKeys.has(id),
        // The payload rides along untouched so a consumer can recover the record
        // a row was built from without keeping a parallel index.
        payload: source.payload === undefined ? null : source.payload
    });
};

// The window describes which slice of a larger set the caller is currently
// handing over. It is the same shape the selectable list already uses, so a
// panel can drive a list and a matrix from one state object.
const normalizeMatrixWindow = (windowState, rowCount) => {
    if (windowState == null) return null;
    if (typeof windowState !== 'object') throw new Error('squirrel_matrix_window_invalid');
    const pageSize = wholeNumber(windowState.pageSize, 'squirrel_matrix_window_page_size_invalid', { min: 1 });
    const pageIndex = wholeNumber(windowState.pageIndex ?? 0, 'squirrel_matrix_window_page_index_invalid');
    const before = pageIndex * pageSize;
    const totalRaw = windowState.totalCount == null ? null : Number(windowState.totalCount);
    if (totalRaw != null && (!Number.isInteger(totalRaw) || totalRaw < 0)) {
        throw new Error('squirrel_matrix_window_total_invalid');
    }
    // With no known total, a `hasNext` page is worth one more page of scroll
    // room: enough for the viewport to reach the next page boundary and ask for
    // it, never enough to claim a size the caller has not confirmed.
    const provisional = before + rowCount + (windowState.hasNext === true ? pageSize : 0);
    return Object.freeze({
        pageIndex,
        pageSize,
        before,
        rowCount,
        totalCount: totalRaw,
        hasNext: windowState.hasNext === true,
        total: Math.max(before + rowCount, totalRaw == null ? provisional : totalRaw)
    });
};

const normalizeMatrixPresentation = ({
    columns,
    rows = [],
    header = true,
    width,
    selectedIds = [],
    windowState = null
} = {}) => {
    if (!Array.isArray(columns) || columns.length === 0) throw new Error('squirrel_matrix_columns_required');
    if (!Array.isArray(rows)) throw new Error('squirrel_matrix_rows_invalid');
    if (!Array.isArray(selectedIds)) throw new Error('squirrel_matrix_selected_ids_invalid');
    const geometry = normalizeTablePresentation({
        columns,
        rows: [probeRowFor(columns)],
        header,
        width
    });
    const selectedKeys = new Set(selectedIds.map((id) => String(id == null ? '' : id).trim()).filter(Boolean));
    const normalizedRows = rows.map((row, index) => normalizeMatrixRow(row, index, geometry.columns, selectedKeys));
    const ids = new Set();
    normalizedRows.forEach(({ id }) => {
        if (ids.has(id)) throw new Error(`squirrel_matrix_row_id_duplicate:${id}`);
        ids.add(id);
    });
    return Object.freeze({
        columns: geometry.columns,
        rows: Object.freeze(normalizedRows),
        header: header === true,
        width: geometry.width,
        window: normalizeMatrixWindow(windowState, normalizedRows.length)
    });
};

export {
    normalizeMatrixPresentation
};
