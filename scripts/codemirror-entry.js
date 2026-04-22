/**
 * CodeMirror Entry Point for Bundling
 * Exports all needed CodeMirror modules for the editor_builder component
 */

// View
export {
    EditorView,
    keymap,
    lineNumbers,
    highlightActiveLine,
    highlightActiveLineGutter,
    drawSelection,
    placeholder
} from '@codemirror/view';

// State
export {
    EditorState,
    Compartment,
    StateEffect,
    StateField
} from '@codemirror/state';

// Languages
export { javascript } from '@codemirror/lang-javascript';
export { StreamLanguage } from '@codemirror/language';
export { ruby } from '@codemirror/legacy-modes/mode/ruby';

// Theme
export { oneDark } from '@codemirror/theme-one-dark';

// Commands
export {
    defaultKeymap,
    history,
    historyKeymap,
    undo,
    redo,
    indentWithTab
} from '@codemirror/commands';

// Autocomplete
export {
    autocompletion,
    closeBrackets,
    closeBracketsKeymap,
    completionKeymap
} from '@codemirror/autocomplete';

// Search
export {
    searchKeymap,
    highlightSelectionMatches,
    search,
    openSearchPanel,
    closeSearchPanel
} from '@codemirror/search';

// Language support
export {
    syntaxHighlighting,
    defaultHighlightStyle,
    bracketMatching,
    indentOnInput,
    foldGutter,
    foldKeymap
} from '@codemirror/language';
