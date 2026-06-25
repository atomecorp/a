// Extracted from tool_slider_builder.js: the slider input/change/unit-change emitter trio.
// Pure — receives the DOM handles + callbacks + a live getUnit() accessor, no mutable state.
export const createSliderEmitters = ({
    onInput, onChange, onUnitChange, input, button, labelEl, valueButton, unitButton, getUnit
}) => {
    const emitInput = (value, source = 'slider.input') => {
        if (typeof onInput !== 'function') return;
        onInput(value, {
            input,
            button,
            labelEl,
            valueButton,
            unitButton,
            unit: getUnit(),
            source
        });
    };
    const emitChange = (value, source = 'slider.change') => {
        if (typeof onChange !== 'function') return;
        onChange(value, {
            input,
            button,
            labelEl,
            valueButton,
            unitButton,
            unit: getUnit(),
            source
        });
    };
    const emitUnitChange = (unit, source = 'slider.unit.change') => {
        if (typeof onUnitChange !== 'function') return;
        onUnitChange(unit, {
            input,
            button,
            labelEl,
            valueButton,
            unitButton,
            unit,
            source
        });
    };
    return { emitInput, emitChange, emitUnitChange };
};
