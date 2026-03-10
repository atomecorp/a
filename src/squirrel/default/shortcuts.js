let debugConsole = null;
let debugConsoleVisible = false;
let codeEditor = null;
let codeEditorCounter = 0;

function createBasicConsole() {
  if (!debugConsole) {
    debugConsole = Console({
      title: 'Debug Console',
      position: { x: 50, y: 50 },
      size: { width: 500, height: 350 },
      template: 'dark_theme'
    });
  }
  return debugConsole;
}

function createNewCodeEditor() {
  // Dynamic import to avoid circular dependencies
  import('../components/editor_builder.js').then(({ EditorBuilder }) => {
    codeEditorCounter++;
    const offset = codeEditorCounter * 30;

    EditorBuilder({
      language: 'javascript',
      fileName: `untitled_${codeEditorCounter}.js`,
      position: { x: 100 + offset, y: 60 + offset },
      size: { width: 650, height: 450 },
      content: `// New file\n\n`,
      onClose: () => {
        console.log('[Shortcut] Editor closed');
      }
    });
  }).catch(err => {
    console.error('[Shortcut] Failed to load EditorBuilder:', err);
  });
}

const openConsole = function atest(key) {
  const consoleInstance = createBasicConsole();

  if (!debugConsoleVisible) {
    consoleInstance.show?.();
    debugConsoleVisible = true;
    return;
  }

  consoleInstance.hide?.();
  debugConsoleVisible = false;
};

const openEditor = function openCodeEditor(key) {
  createNewCodeEditor();
};

const triggerPlayMediaShortcut = function triggerPlayMediaShortcut(key, event) {
  if (typeof window.__eveRunPlayMediaShortcut !== 'function') return;
  try {
    window.__eveRunPlayMediaShortcut(event);
  } catch (error) {
    console.error('[Shortcut] Failed to trigger Play Media shortcut:', error);
  }
};

shortcut('alt-t', openConsole);
shortcut('alt-e', openEditor);
shortcut('space', triggerPlayMediaShortcut);

window.openConsole = openConsole;
window.openEditor = openEditor;
window.triggerPlayMediaShortcut = triggerPlayMediaShortcut;
