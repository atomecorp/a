// Extracted from console_builder.js: console DOM construction (container/header/output/input).
// Pure builder — receives config/theme + action handlers as deps, returns the elements. No mutable state.
export const buildConsoleDom = (deps) => {
  const {
    consoleId, themeConfig, finalHeaderHeight, finalHeaderPadding, title, position, size, draggable,
    clearConsole, copyConsoleContent, hideConsole, executeCommand, handleInputKeydown
  } = deps;

  function createContainer() {
    const container = document.createElement('div');
    container.id = consoleId;
    container.className = 'hs-console';
    
    // Styles du container
    Object.assign(container.style, {
      position: 'fixed',
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: `${size.width}px`,
      height: `${size.height}px`,
      zIndex: '9999',
      display: 'none',
      flexDirection: 'column',
      ...themeConfig.css
    });

    return container;
  }

  function createHeader() {
    const header = document.createElement('div');
    header.className = 'hs-console-header';
    
    Object.assign(header.style, {
      padding: finalHeaderPadding,
      minHeight: `${finalHeaderHeight}px`,
      maxHeight: `${finalHeaderHeight}px`,
      height: `${finalHeaderHeight}px`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      cursor: draggable ? 'move' : 'default',
      userSelect: 'none',
      overflow: 'hidden',
      ...themeConfig.headerStyle
    });

    // Titre
    const titleEl = document.createElement('span');
    titleEl.textContent = title;
    titleEl.style.fontWeight = 'bold';
    titleEl.style.fontSize = `${Math.max(11, finalHeaderHeight * 0.5)}px`; // Adapter la taille du texte
    titleEl.style.lineHeight = '1';
    titleEl.style.overflow = 'hidden';
    titleEl.style.textOverflow = 'ellipsis';
    titleEl.style.whiteSpace = 'nowrap';

    // Boutons de contrôle
    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '4px';
    controls.style.alignItems = 'center';

    // Calculer la taille des boutons en fonction de la hauteur du header
    const buttonSize = Math.max(16, finalHeaderHeight - 8);
    
    // Bouton copy
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋';
    copyBtn.title = 'Copy console content';
    copyBtn.style.cssText = `
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      padding: 2px;
      border-radius: 2px;
      width: ${buttonSize}px;
      height: ${buttonSize}px;
      font-size: ${Math.max(10, buttonSize * 0.6)}px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    `;
    
    // Effets hover pour le bouton copy
    copyBtn.addEventListener('mouseenter', () => {
      copyBtn.style.backgroundColor = 'rgba(255,255,255,0.1)';
      copyBtn.style.transform = 'scale(1.05)';
    });
    copyBtn.addEventListener('mouseleave', () => {
      copyBtn.style.backgroundColor = 'transparent';
      copyBtn.style.transform = 'scale(1)';
    });
    copyBtn.onclick = copyConsoleContent;
    
    // Bouton clear
    const clearBtn = document.createElement('button');
    clearBtn.textContent = '🗑️';
    clearBtn.title = 'Clear console';
    clearBtn.style.cssText = `
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      padding: 2px;
      border-radius: 2px;
      width: ${buttonSize}px;
      height: ${buttonSize}px;
      font-size: ${Math.max(10, buttonSize * 0.6)}px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    `;
    
    // Effets hover pour le bouton clear
    clearBtn.addEventListener('mouseenter', () => {
      clearBtn.style.backgroundColor = 'rgba(255,0,0,0.1)';
      clearBtn.style.transform = 'scale(1.05)';
    });
    clearBtn.addEventListener('mouseleave', () => {
      clearBtn.style.backgroundColor = 'transparent';
      clearBtn.style.transform = 'scale(1)';
    });
    clearBtn.onclick = clearConsole;

    // Bouton close
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.title = 'Close console';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      padding: 2px;
      border-radius: 2px;
      width: ${buttonSize}px;
      height: ${buttonSize}px;
      font-size: ${Math.max(10, buttonSize * 0.7)}px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    `;
    
    // Effets hover pour le bouton close
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.backgroundColor = 'rgba(255,0,0,0.2)';
      closeBtn.style.transform = 'scale(1.05)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.backgroundColor = 'transparent';
      closeBtn.style.transform = 'scale(1)';
    });
    closeBtn.onclick = hideConsole;

    controls.appendChild(copyBtn);
    controls.appendChild(clearBtn);
    controls.appendChild(closeBtn);
    header.appendChild(titleEl);
    header.appendChild(controls);

    return header;
  }

  function createOutput() {
    const output = document.createElement('div');
    output.className = 'hs-console-output';
    
    Object.assign(output.style, {
      flex: '1',
      padding: '8px',
      overflowY: 'auto',
      fontSize: '13px',
      lineHeight: '1.4',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      ...themeConfig.outputStyle
    });

    return output;
  }

  function createInput() {
    const inputContainer = document.createElement('div');
    inputContainer.className = 'hs-console-input-container';
    
    Object.assign(inputContainer.style, {
      display: 'flex',
      padding: '8px',
      gap: '8px',
      alignItems: 'center',
      borderTop: `1px solid ${themeConfig.headerStyle.borderBottom || '#3c3c3c'}`
    });

    // Prompt
    const prompt = document.createElement('span');
    prompt.textContent = '>';
    prompt.style.color = '#569cd6';
    prompt.style.fontWeight = 'bold';

    // Input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'hs-console-input';
    input.placeholder = 'Enter JavaScript command...';
    
    Object.assign(input.style, {
      flex: '1',
      background: 'none',
      outline: 'none',
      fontFamily: 'inherit',
      fontSize: 'inherit',
      color: 'inherit',
      ...themeConfig.inputStyle
    });

    // Event listeners
    input.addEventListener('keydown', handleInputKeydown);
    input.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        executeCommand(input.value.trim());
        input.value = '';
      }
    });

    inputContainer.appendChild(prompt);
    inputContainer.appendChild(input);

    return inputContainer;
  }

  // === LOGIQUE MÉTIER ===

  return { container: createContainer(), header: createHeader(), output: createOutput(), input: createInput() };
};
