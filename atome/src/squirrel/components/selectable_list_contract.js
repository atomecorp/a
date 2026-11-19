import { normalizeSelectPresentation } from './select_contract.js';

// `optional`: a list where nothing may be chosen yet (a palette's tools laid as a list before one is armed, R-236);
// otherwise a list always holds its chosen value.
const normalizeSelectableListPresentation = ({ options, value, disabled = false, optional = false } = {}) => {
    const presentation = normalizeSelectPresentation({ options, value, disabled });
    if (presentation.options.length < 2) {
        throw new Error('squirrel_selectable_list_options_minimum:2');
    }
    if (presentation.value == null && optional !== true) {
        throw new Error('squirrel_selectable_list_value_required');
    }
    const selected = presentation.options.find((option) => option.value === presentation.value);
    if (selected?.disabled === true) {
        throw new Error(`squirrel_selectable_list_selected_option_disabled:${presentation.value}`);
    }
    return Object.freeze(presentation);
};

export {
    normalizeSelectableListPresentation
};
