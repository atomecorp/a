const requiredText = (value, name) => {
    const normalized = String(value || '').trim();
    if (!normalized) throw new Error(`squirrel_selection_summary_${name}_required`);
    return normalized;
};

const normalizeSelectionSummaryPresentation = ({ title, summary, count } = {}) => {
    const normalizedCount = Number(count);
    if (!Number.isInteger(normalizedCount) || normalizedCount < 0) {
        throw new Error('squirrel_selection_summary_count_nonnegative_integer_required');
    }
    return Object.freeze({
        title: requiredText(title, 'title'),
        summary: requiredText(summary, 'summary'),
        count: normalizedCount
    });
};

export {
    normalizeSelectionSummaryPresentation
};
