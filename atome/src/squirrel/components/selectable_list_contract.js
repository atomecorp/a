import { normalizeSelectPresentation } from './select_contract.js';

// `optional`: a list where nothing may be chosen yet (a palette's tools laid as a list before one is armed, R-236; the
// presets a touch loads, R-366): one row is a list there; otherwise a list always holds its chosen value, among two at least.
const normalizeSelectableListPresentation = ({ options, value, disabled = false, optional = false } = {}) => {
    const presentation = normalizeSelectPresentation({ options, value, disabled });
    const minimum = optional === true ? 1 : 2;
    if (presentation.options.length < minimum) {
        throw new Error(`squirrel_selectable_list_options_minimum:${minimum}`);
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
