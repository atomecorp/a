import { normalizeSelectPresentation } from './select_contract.js';

const normalizeSelectableListPresentation = ({ options, value, disabled = false } = {}) => {
    const presentation = normalizeSelectPresentation({ options, value, disabled });
    if (presentation.options.length < 2) {
        throw new Error('squirrel_selectable_list_options_minimum:2');
    }
    if (presentation.value == null) {
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
