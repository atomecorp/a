const textValue = (value, code) => {
    const normalized = String(value == null ? '' : value).trim();
    if (!normalized) throw new Error(code);
    return normalized;
};

const positiveNumber = (value, code) => {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized <= 0) throw new Error(code);
    return normalized;
};

const normalizeTableColumn = (column, index) => {
    const source = column && typeof column === 'object' ? column : { id: column, label: column };
    const id = textValue(source.id, `squirrel_table_column_id_required:${index}`);
    const label = textValue(source.label ?? id, `squirrel_table_column_label_required:${id}`);
    const align = source.align == null ? 'left' : textValue(source.align, `squirrel_table_column_align_required:${id}`);
    if (align !== 'left' && align !== 'right') throw new Error(`squirrel_table_column_align_unsupported:${id}:${align}`);
    const fixed = source.widthPx == null ? null : positiveNumber(source.widthPx, `squirrel_table_column_width_invalid:${id}`);
    const flex = fixed != null
        ? 0
        : source.flex == null ? 1 : positiveNumber(source.flex, `squirrel_table_column_flex_invalid:${id}`);
    return { id, label, align, widthPx: fixed, flex };
};

// Column widths are resolved here, not in a renderer: every renderer consuming
// this contract must lay a table out identically for the same available width.
const resolveColumnWidths = (columns, width) => {
    const fixedWidths = columns.map((column) => (column.flex > 0 ? 0 : Math.round(column.widthPx)));
    const fixedTotal = fixedWidths.reduce((total, value) => total + value, 0);
    if (fixedTotal > width) throw new Error(`squirrel_table_fixed_columns_exceed_width:${fixedTotal}:${width}`);
    const flexTotal = columns.reduce((total, column) => total + column.flex, 0);
    const flexible = columns.filter((column) => column.flex > 0);
    if (!flexible.length) return fixedWidths;
    const available = width - fixedTotal;
    let distributed = 0;
    const lastFlexibleIndex = columns.lastIndexOf(flexible[flexible.length - 1]);
    return columns.map((column, index) => {
        if (column.flex <= 0) return fixedWidths[index];
        // The last flexible column absorbs the rounding remainder so the row
        // total always equals the table width and no rule drifts off the edge.
        if (index === lastFlexibleIndex) return available - distributed;
        const resolved = Math.round((available * column.flex) / flexTotal);
        distributed += resolved;
        return resolved;
    });
};

const normalizeTableRow = (row, index, columns) => {
    const source = row && typeof row === 'object' ? row : {};
    const id = textValue(source.id ?? `row_${index}`, `squirrel_table_row_id_required:${index}`);
    const cells = source.cells && typeof source.cells === 'object' ? source.cells : null;
    if (!cells) throw new Error(`squirrel_table_row_cells_required:${id}`);
    const values = columns.map((column) => {
        const cell = cells[column.id];
        if (cell === undefined) throw new Error(`squirrel_table_row_cell_missing:${id}:${column.id}`);
        return String(cell == null ? '' : cell);
    });
    return Object.freeze({ id, values: Object.freeze(values) });
};

const normalizeTablePresentation = ({ columns, rows, header = true, width } = {}) => {
    if (!Array.isArray(columns) || columns.length === 0) throw new Error('squirrel_table_columns_required');
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('squirrel_table_rows_required');
    const resolvedWidth = positiveNumber(width, 'squirrel_table_width_required');
    const normalizedColumns = columns.map(normalizeTableColumn);
    const ids = new Set();
    normalizedColumns.forEach(({ id }) => {
        if (ids.has(id)) throw new Error(`squirrel_table_column_id_duplicate:${id}`);
        ids.add(id);
    });
    const widths = resolveColumnWidths(normalizedColumns, resolvedWidth);
    let offset = 0;
    const projectedColumns = normalizedColumns.map((column, index) => {
        const columnWidth = widths[index];
        if (columnWidth <= 0) throw new Error(`squirrel_table_column_width_collapsed:${column.id}`);
        const projected = Object.freeze({
            id: column.id,
            label: column.label,
            align: column.align,
            width: columnWidth,
            offset
        });
        offset += columnWidth;
        return projected;
    });
    return Object.freeze({
        columns: Object.freeze(projectedColumns),
        rows: Object.freeze(rows.map((row, index) => normalizeTableRow(row, index, projectedColumns))),
        header: header === true,
        width: resolvedWidth
    });
};

export {
    normalizeTablePresentation
};
