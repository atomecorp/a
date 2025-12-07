let debugConsole = null;
let debugConsoleVisible = false;

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

shortcut('alt-c', openConsole);

window.openConsole = openConsole;