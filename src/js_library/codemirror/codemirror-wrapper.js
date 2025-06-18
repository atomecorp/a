/**
 * 📝 CODEMIRROR WRAPPER
 * Code editor integration for Squirrel Framework
 */

class CodeMirrorWrapper {
    constructor() {
        this.editors = new Map();
        this.themes = new Map();
        this.languages = new Map();
        this.initialized = false;
        
        // Don't initialize immediately, wait for CodeMirror to be loaded
        this.checkAndInit();
    }

    checkAndInit() {
        if (typeof CodeMirror !== 'undefined') {
            this.init();
        } else {
            // Check periodically for CodeMirror
            let attempts = 0;
            const checkInterval = setInterval(() => {
                attempts++;
                if (typeof CodeMirror !== 'undefined') {
                    clearInterval(checkInterval);
                    this.init();
                } else if (attempts > 50) { // 5 seconds max
                    clearInterval(checkInterval);
                    console.warn('📝 CodeMirror not found after 5 seconds. Wrapper not initialized.');
                }
            }, 100);
        }
    }

    init() {
        if (typeof CodeMirror === 'undefined') {
            console.warn('CodeMirror not loaded. Please load CodeMirror first.');
            return;
        }

        this.initialized = true;
        this.setupSquirrelIntegration();
        this.registerDefaultLanguages();
        this.registerDefaultThemes();
        
        console.log(`📝 CodeMirror Wrapper initialized with CodeMirror ${CodeMirror.version || 'unknown'}`);
    }

    /**
     * Setup Squirrel framework integration
     */
    setupSquirrelIntegration() {
        // Add CodeMirror methods to Squirrel's $ function
        if (typeof $ !== 'undefined') {
            $.codeEditor = this.createEditor.bind(this);
            $.getEditor = this.getEditor.bind(this);
        }

        // Add methods to A class instances
        if (typeof A !== 'undefined') {
            A.prototype.makeCodeEditor = function(options = {}) {
                return codeMirrorWrapper.createEditor(this.html_object, options);
            };
        }
    }

    /**
     * Register default programming languages
     */
    registerDefaultLanguages() {
        this.languages.set('javascript', {
            name: 'JavaScript',
            mode: 'javascript',
            extensions: ['.js', '.mjs'],
            keywords: ['function', 'var', 'let', 'const', 'if', 'else', 'for', 'while', 'return']
        });

        this.languages.set('css', {
            name: 'CSS',
            mode: 'css',
            extensions: ['.css'],
            keywords: ['color', 'background', 'margin', 'padding', 'display', 'position']
        });

        this.languages.set('html', {
            name: 'HTML',
            mode: 'xml',
            extensions: ['.html', '.htm'],
            keywords: ['div', 'span', 'p', 'h1', 'h2', 'h3', 'body', 'head', 'title']
        });

        this.languages.set('json', {
            name: 'JSON',
            mode: 'application/json',
            extensions: ['.json'],
            keywords: ['true', 'false', 'null']
        });

        this.languages.set('markdown', {
            name: 'Markdown',
            mode: 'markdown',
            extensions: ['.md', '.markdown'],
            keywords: ['#', '##', '###', '*', '-', '+', '`', '```']
        });
    }

    /**
     * Register default themes
     */
    registerDefaultThemes() {
        this.themes.set('default', {
            name: 'Default',
            className: 'cm-s-default'
        });

        this.themes.set('dark', {
            name: 'Dark',
            className: 'cm-s-dark',
            background: '#1a1a1a',
            color: '#f8f8f2'
        });

        this.themes.set('monokai', {
            name: 'Monokai',
            className: 'cm-s-monokai',
            background: '#272822',
            color: '#f8f8f2'
        });
    }

    /**
     * Create a code editor
     */
    createEditor(element, options = {}) {
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }

        if (!element) {
            throw new Error('Element not found for CodeMirror editor');
        }

        const editorId = options.id || `editor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Default configuration
        const config = {
            lineNumbers: true,
            mode: 'javascript',
            theme: 'default',
            autoCloseBrackets: true,
            matchBrackets: true,
            indentUnit: 2,
            tabSize: 2,
            lineWrapping: false,
            ...options
        };

        // Create CodeMirror instance
        const editor = CodeMirror(element, config);

        // Store editor reference
        this.editors.set(editorId, {
            instance: editor,
            element: element,
            config: config
        });

        // Add event listeners
        this.setupEditorEvents(editor, editorId);

        return {
            id: editorId,
            editor: editor,
            setValue: (value) => editor.setValue(value),
            getValue: () => editor.getValue(),
            setMode: (mode) => editor.setOption('mode', mode),
            setTheme: (theme) => editor.setOption('theme', theme),
            focus: () => editor.focus(),
            refresh: () => editor.refresh(),
            destroy: () => this.destroyEditor(editorId)
        };
    }

    /**
     * Setup editor events
     */
    setupEditorEvents(editor, editorId) {
        editor.on('change', (instance, changeObj) => {
            this.onEditorChange(editorId, instance, changeObj);
        });

        editor.on('cursorActivity', (instance) => {
            this.onCursorActivity(editorId, instance);
        });

        editor.on('focus', (instance) => {
            this.onEditorFocus(editorId, instance);
        });

        editor.on('blur', (instance) => {
            this.onEditorBlur(editorId, instance);
        });
    }

    /**
     * Event handlers
     */
    onEditorChange(editorId, instance, changeObj) {
        const editor = this.editors.get(editorId);
        if (editor && editor.config.onChange) {
            editor.config.onChange(instance.getValue(), changeObj);
        }
    }

    onCursorActivity(editorId, instance) {
        const editor = this.editors.get(editorId);
        if (editor && editor.config.onCursorActivity) {
            const cursor = instance.getCursor();
            editor.config.onCursorActivity(cursor);
        }
    }

    onEditorFocus(editorId, instance) {
        const editor = this.editors.get(editorId);
        if (editor && editor.config.onFocus) {
            editor.config.onFocus(instance);
        }
    }

    onEditorBlur(editorId, instance) {
        const editor = this.editors.get(editorId);
        if (editor && editor.config.onBlur) {
            editor.config.onBlur(instance);
        }
    }

    /**
     * Get editor by ID
     */
    getEditor(editorId) {
        return this.editors.get(editorId);
    }

    /**
     * Destroy editor
     */
    destroyEditor(editorId) {
        const editor = this.editors.get(editorId);
        if (editor) {
            editor.instance.toTextArea();
            this.editors.delete(editorId);
        }
    }

    /**
     * Create a simple code viewer (read-only)
     */
    createViewer(element, code, language = 'javascript') {
        return this.createEditor(element, {
            value: code,
            mode: language,
            readOnly: true,
            lineNumbers: true,
            theme: 'default'
        });
    }

    /**
     * Create a minimal editor
     */
    createMinimalEditor(element, options = {}) {
        return this.createEditor(element, {
            lineNumbers: false,
            mode: 'javascript',
            theme: 'default',
            scrollbarStyle: null,
            ...options
        });
    }

    /**
     * Get available languages
     */
    getLanguages() {
        return Array.from(this.languages.entries()).map(([key, value]) => ({
            key,
            name: value.name,
            mode: value.mode,
            extensions: value.extensions
        }));
    }

    /**
     * Get available themes
     */
    getThemes() {
        return Array.from(this.themes.entries()).map(([key, value]) => ({
            key,
            name: value.name,
            className: value.className
        }));
    }

    /**
     * Get editor info
     */
    getEditorInfo() {
        return {
            activeEditors: this.editors.size,
            availableLanguages: this.languages.size,
            availableThemes: this.themes.size,
            codeMirrorVersion: CodeMirror.version || 'Unknown'
        };
    }
}

// Create wrapper instance
const codeMirrorWrapper = new CodeMirrorWrapper();

// Export for ES6 modules
export default codeMirrorWrapper;

// Global access
window.codeMirrorWrapper = codeMirrorWrapper;
