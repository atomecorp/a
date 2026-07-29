import { normalizeSelectPresentation } from './select_contract.js';

const normalizeSegmentedControlPresentation = ({ options, value, disabled = false } = {}) => {
    const presentation = normalizeSelectPresentation({ options, value, disabled });
    if (presentation.options.length < 2) {
        throw new Error('squirrel_segmented_control_options_minimum:2');
    }
    if (presentation.value == null) {
        throw new Error('squirrel_segmented_control_value_required');
    }
    return Object.freeze(presentation);
};

export {
    normalizeSegmentedControlPresentation
};
