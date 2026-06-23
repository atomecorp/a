import { javascript, StreamLanguage, ruby } from '../../js/codemirror.bundle.js';

const editorTemplates = {
    'dark': {
        name: 'Dark Theme',
        containerStyle: {
            backgroundColor: '#1e1e1e',
            border: '1px solid #3c3c3c',
            borderRadius: '6px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
        },
        headerStyle: {
            backgroundColor: '#2d2d30',
            color: '#cccccc',
            borderBottom: '1px solid #3c3c3c'
        },
        statusStyle: {
            backgroundColor: '#007acc',
            color: '#ffffff'
        }
    },
    'light': {
        name: 'Light Theme',
        containerStyle: {
            backgroundColor: '#ffffff',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)'
        },
        headerStyle: {
            backgroundColor: '#f3f4f6',
            color: '#374151',
            borderBottom: '1px solid #d1d5db'
        },
        statusStyle: {
            backgroundColor: '#0ea5e9',
            color: '#ffffff'
        }
    }
};

// === LANGUAGE SUPPORT ===
const languageExtensions = {
    javascript: () => javascript(),
    js: () => javascript(),
    ruby: () => StreamLanguage.define(ruby),
    rb: () => StreamLanguage.define(ruby)
};

const languageLabels = {
    javascript: 'JavaScript',
    js: 'JavaScript',
    ruby: 'Ruby',
    rb: 'Ruby'
};

export { editorTemplates, languageExtensions, languageLabels };
