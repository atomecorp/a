/**
 * 🖥️ CONSOLE COMPONENT - Interactive JavaScript Console
 * Composant Console interactif pour debugging et exécution de commandes JS
 */

import { $, define } from '../squirrel.js';

// === INTERCEPTEUR DE CONSOLE ===
class ConsoleInterceptor {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.originalMethods = {};
    this.intercepted = false;
  }

  intercept() {
    if (this.intercepted) return;
    
    const methods = ['log', 'error', 'warn', 'info', 'debug'];
    methods.forEach(method => {
      this.originalMethods[method] = console[method];
      console[method] = (...args) => {
        // Appeler la méthode originale
        this.originalMethods[method](...args);
        
        // Envoyer à notre console
        this.onMessage({
          type: method,
          message: args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
          ).join(' '),
          timestamp: new Date().toLocaleTimeString()
        });
      };
    });
    
    this.intercepted = true;
  }

  restore() {
    if (!this.intercepted) return;
    
    Object.keys(this.originalMethods).forEach(method => {
      console[method] = this.originalMethods[method];
    });
    
    this.intercepted = false;
  }
}

// === TEMPLATES DE CONSOLE ===
const consoleTemplates = {
  'dark_theme': {
    name: 'Dark Theme',
    description: 'Console avec thème sombre type IDE',
    headerHeight: 24,
    headerPadding: '4px 8px',
    css: {
      backgroundColor: '#1e1e1e',
      color: '#d4d4d4',
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: '13px',
      border: '1px solid #3c3c3c',
      borderRadius: '4px'
    },
    headerStyle: {
      backgroundColor: '#2d2d30',
      color: '#cccccc',
      borderBottom: '1px solid #3c3c3c'
    },
    outputStyle: {
      backgroundColor: '#1e1e1e',
      color: '#d4d4d4'
    },
    inputStyle: {
      backgroundColor: '#252526',
      color: '#d4d4d4',
      border: '1px solid #3c3c3c'
    }
  },
  
  'light_theme': {
    name: 'Light Theme',
    description: 'Console avec thème clair',
    headerHeight: 24,
    headerPadding: '4px 8px',
    css: {
      backgroundColor: '#ffffff',
      color: '#333333',
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: '13px',
      border: '1px solid #d1d5db',
      borderRadius: '4px'
    },
    headerStyle: {
      backgroundColor: '#f3f4f6',
      color: '#374151',
      borderBottom: '1px solid #d1d5db'
    },
    outputStyle: {
      backgroundColor: '#ffffff',
      color: '#333333'
    },
    inputStyle: {
      backgroundColor: '#f9fafb',
      color: '#333333',
      border: '1px solid #d1d5db'
    }
  },

  'terminal_green': {
    name: 'Terminal Green',
    description: 'Style terminal rétro vert',
    headerHeight: 20,
    headerPadding: '2px 6px',
    css: {
      backgroundColor: '#000000',
      color: '#00ff00',
      fontFamily: '"Courier New", monospace',
      fontSize: '14px',
      border: '2px solid #00ff00',
      borderRadius: '0px'
    },
    headerStyle: {
      backgroundColor: '#001100',
      color: '#00ff00',
      borderBottom: '1px solid #00ff00'
    },
    outputStyle: {
      backgroundColor: '#000000',
      color: '#00ff00'
    },
    inputStyle: {
      backgroundColor: '#001100',
      color: '#00ff00',
      border: '1px solid #00ff00'
    }
  },

  'minimal': {
    name: 'Minimal',
    description: 'Console minimaliste avec header ultra-fin',
    headerHeight: 18,
    headerPadding: '2px 6px',
    css: {
      backgroundColor: '#fafafa',
      color: '#333',
      fontFamily: 'Monaco, "Lucida Console", monospace',
      fontSize: '12px',
      border: '1px solid #e0e0e0',
      borderRadius: '2px'
    },
    headerStyle: {
      backgroundColor: '#eeeeee',
      color: '#666',
      borderBottom: '1px solid #ddd'
    },
    outputStyle: {
      backgroundColor: '#fafafa',
      color: '#333'
    },
    inputStyle: {
      backgroundColor: '#ffffff',
      color: '#333',
      border: '1px solid #ddd'
    }
  },

  'large_header': {
    name: 'Large Header',
    description: 'Console avec header plus grand pour plus de lisibilité',
    headerHeight: 36,
    headerPadding: '8px 12px',
    css: {
      backgroundColor: '#2a2a2a',
      color: '#ffffff',
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      border: '1px solid #555',
      borderRadius: '6px'
    },
    headerStyle: {
      backgroundColor: '#404040',
      color: '#ffffff',
      borderBottom: '1px solid #666'
    },
    outputStyle: {
      backgroundColor: '#2a2a2a',
      color: '#ffffff'
    },
    inputStyle: {
      backgroundColor: '#333333',
      color: '#ffffff',
      border: '1px solid #555'
    }
  }
};

// === FONCTION PRINCIPALE DE CRÉATION ===
const createConsole = (config = {}) => {
  const {
    id,
    title = 'JavaScript Console',
    position = { x: 100, y: 100 },
    size = { width: 600, height: 400 },
    attach = 'body',
    template = 'dark_theme',
    draggable = true,
    resizable = true,
    interceptConsole = true,
    headerHeight = 24, // Nouvelle option pour contrôler la hauteur du header
    headerPadding = '4px 8px', // Nouvelle option pour le padding du header
    commands = {},
    onCommand,
    onClose,
    ...otherProps
  } = config;

  // Génération d'ID unique
  const consoleId = id || `console_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  
  // Appliquer le template
  const themeConfig = consoleTemplates[template] || consoleTemplates.dark_theme;
  
  // Fusionner les valeurs du template avec la config utilisateur
  const finalHeaderHeight = headerHeight !== 24 ? headerHeight : (themeConfig.headerHeight || 24);
  const finalHeaderPadding = headerPadding !== '4px 8px' ? headerPadding : (themeConfig.headerPadding || '4px 8px');
  
  // État interne
  let isVisible = false;
  let history = [];
  let historyIndex = -1;
  let consoleOutput = [];
  
  // Intercepteur de console
  const interceptor = new ConsoleInterceptor((message) => {
    addOutput(message);
  });

  // === CRÉATION DES ÉLÉMENTS ===
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
  function addOutput(message) {
    const outputEl = container.querySelector('.hs-console-output');
    if (!outputEl) return;

    const messageEl = document.createElement('div');
    messageEl.className = `hs-console-message hs-console-${message.type || 'log'}`;
    
    // Style selon le type
    const typeColors = {
      error: '#f87171',
      warn: '#fbbf24',
      info: '#60a5fa',
      debug: '#a78bfa',
      log: 'inherit'
    };
    
    messageEl.style.color = typeColors[message.type] || typeColors.log;
    messageEl.style.marginBottom = '4px';
    
    // Timestamp si disponible
    const timestamp = message.timestamp ? `[${message.timestamp}] ` : '';
    messageEl.textContent = `${timestamp}${message.message}`;
    
    outputEl.appendChild(messageEl);
    outputEl.scrollTop = outputEl.scrollHeight;
    
    // Ajouter à l'historique
    consoleOutput.push(message);
  }

  function executeCommand(command) {
    if (!command) return;
    
    // Ajouter à l'historique
    history.push(command);
    historyIndex = history.length;
    
    // Afficher la commande
    addOutput({
      type: 'command',
      message: `> ${command}`,
      timestamp: new Date().toLocaleTimeString()
    });
    
    try {
      // Commandes spéciales
      if (commands[command]) {
        const result = commands[command]();
        if (result !== undefined) {
          addOutput({
            type: 'result',
            message: String(result),
            timestamp: new Date().toLocaleTimeString()
          });
        }
        return;
      }
      
      // Callback personnalisé
      if (onCommand) {
        const result = onCommand(command);
        if (result !== undefined) {
          addOutput({
            type: 'result',
            message: String(result),
            timestamp: new Date().toLocaleTimeString()
          });
        }
        return;
      }
      
      // Exécution JavaScript standard
      const result = eval(command);
      if (result !== undefined) {
        addOutput({
          type: 'result',
          message: typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result),
          timestamp: new Date().toLocaleTimeString()
        });
      }
    } catch (error) {
      addOutput({
        type: 'error',
        message: error.message,
        timestamp: new Date().toLocaleTimeString()
      });
    }
  }

  function handleInputKeydown(e) {
    const input = e.target;
    
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        if (historyIndex > 0) {
          historyIndex--;
          input.value = history[historyIndex];
        }
        break;
        
      case 'ArrowDown':
        e.preventDefault();
        if (historyIndex < history.length - 1) {
          historyIndex++;
          input.value = history[historyIndex];
        } else {
          historyIndex = history.length;
          input.value = '';
        }
        break;
        
      case 'Tab':
        e.preventDefault();
        // Auto-complétion basique
        const words = ['console', 'document', 'window', 'setTimeout', 'setInterval'];
        const currentWord = input.value.split(' ').pop();
        const matches = words.filter(word => word.startsWith(currentWord));
        if (matches.length === 1) {
          const parts = input.value.split(' ');
          parts[parts.length - 1] = matches[0];
          input.value = parts.join(' ');
        }
        break;
    }
  }

  function clearConsole() {
    const outputEl = container.querySelector('.hs-console-output');
    if (outputEl) {
      outputEl.innerHTML = '';
      consoleOutput = [];
    }
  }

  function copyConsoleContent() {
    try {
      // Créer le texte à copier à partir de consoleOutput
      const textToCopy = consoleOutput.map(msg => {
        const timestamp = msg.timestamp ? `[${msg.timestamp}] ` : '';
        const typePrefix = msg.type !== 'log' ? `${msg.type.toUpperCase()}: ` : '';
        return `${timestamp}${typePrefix}${msg.message}`;
      }).join('\n');
      
      // Copier dans le clipboard
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(() => {
          // Feedback visuel
          showCopyFeedback(true);
        }).catch(err => {
          console.error('Erreur lors de la copie:', err);
          fallbackCopy(textToCopy);
        });
      } else {
        // Fallback pour les navigateurs plus anciens
        fallbackCopy(textToCopy);
      }
    } catch (error) {
      console.error('Erreur lors de la copie du contenu:', error);
      showCopyFeedback(false);
    }
  }

  function fallbackCopy(text) {
    try {
      // Créer un textarea temporaire
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.style.top = '-999999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      
      // Exécuter la commande de copie
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      
      showCopyFeedback(successful);
    } catch (err) {
      console.error('Fallback copy failed:', err);
      showCopyFeedback(false);
    }
  }

  function showCopyFeedback(success) {
    const copyBtn = container.querySelector('button[title="Copy console content"]');
    if (copyBtn) {
      const originalText = copyBtn.textContent;
      copyBtn.textContent = success ? '✅' : '❌';
      copyBtn.style.transform = 'scale(1.1)';
      
      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.style.transform = 'scale(1)';
      }, 1000);
    }
    
    // Ajouter un message dans la console
    addOutput({
      type: success ? 'info' : 'error',
      message: success ? 'Console content copied to clipboard' : 'Failed to copy console content',
      timestamp: new Date().toLocaleTimeString()
    });
  }

  function showConsole() {
    if (isVisible) return;
    
    container.style.display = 'flex';
    isVisible = true;
    
    // Focus sur l'input
    const input = container.querySelector('.hs-console-input');
    if (input) {
      setTimeout(() => input.focus(), 100);
    }
    
    // Intercepter console si demandé
    if (interceptConsole) {
      interceptor.intercept();
    }
    
    // Message de bienvenue
    addOutput({
      type: 'info',
      message: 'Console JavaScript ready. Type help() for available commands.',
      timestamp: new Date().toLocaleTimeString()
    });
  }

  function hideConsole() {
    if (!isVisible) return;
    
    container.style.display = 'none';
    isVisible = false;
    
    // Restaurer console
    interceptor.restore();
    
    // Callback onClose
    if (onClose) {
      onClose();
    }
  }

  function toggleConsole() {
    if (isVisible) {
      hideConsole();
    } else {
      showConsole();
    }
  }

  // === FONCTIONNALITÉS AVANCÉES ===
  function makeDraggable() {
    if (!draggable) return;
    
    const header = container.querySelector('.hs-console-header');
    let isDragging = false;
    let currentX = position.x;
    let currentY = position.y;
    let initialX = 0;
    let initialY = 0;
    let xOffset = position.x;
    let yOffset = position.y;

    // Support souris ET touch pour iOS
    header.addEventListener('mousedown', dragStart);
    header.addEventListener('touchstart', dragStart, { passive: false });
    document.addEventListener('mousemove', dragMove);
    document.addEventListener('touchmove', dragMove, { passive: false });
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('touchend', dragEnd);

    function dragStart(e) {
      // Gérer à la fois mouse et touch events
      const clientX = e.clientX || (e.touches && e.touches[0].clientX);
      const clientY = e.clientY || (e.touches && e.touches[0].clientY);
      
      initialX = clientX - xOffset;
      initialY = clientY - yOffset;
      isDragging = true;
      header.style.cursor = 'grabbing';
      
      // Empêcher le scroll sur mobile
      if (e.type === 'touchstart') {
        e.preventDefault();
      }
    }

    function dragMove(e) {
      if (!isDragging) return;
      
      e.preventDefault();
      
      // Gérer à la fois mouse et touch events
      const clientX = e.clientX || (e.touches && e.touches[0].clientX);
      const clientY = e.clientY || (e.touches && e.touches[0].clientY);
      
      currentX = clientX - initialX;
      currentY = clientY - initialY;
      
      // Empêcher que la console sorte par le haut (garder au moins la barre de titre visible)
      const minY = 0;
      const maxX = window.innerWidth - 100; // Garder au moins 100px visibles
      const maxY = window.innerHeight - 50; // Garder au moins 50px visibles
      
      // Contraindre les positions
      currentX = Math.max(-size.width + 100, Math.min(maxX, currentX));
      currentY = Math.max(minY, Math.min(maxY, currentY));
      
      xOffset = currentX;
      yOffset = currentY;
      
      container.style.left = `${currentX}px`;
      container.style.top = `${currentY}px`;
    }

    function dragEnd() {
      isDragging = false;
      header.style.cursor = 'move';
    }
  }

  function makeResizable() {
    if (!resizable) return;
    
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'hs-console-resize-handle';
    resizeHandle.style.cssText = `
      position: absolute;
      bottom: 0;
      right: 0;
      width: 15px;
      height: 15px;
      cursor: se-resize;
      background: linear-gradient(-45deg, transparent 40%, #666 40%, #666 60%, transparent 60%);
    `;
    
    container.appendChild(resizeHandle);
    
    let isResizing = false;
    let startX, startY, startWidth, startHeight;
    
    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = parseInt(document.defaultView.getComputedStyle(container).width, 10);
      startHeight = parseInt(document.defaultView.getComputedStyle(container).height, 10);
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      
      const width = startWidth + e.clientX - startX;
      const height = startHeight + e.clientY - startY;
      
      container.style.width = `${Math.max(300, width)}px`;
      container.style.height = `${Math.max(200, height)}px`;
    });
    
    document.addEventListener('mouseup', () => {
      isResizing = false;
    });
  }

  // === CONSTRUCTION ET ASSEMBLAGE ===
  const container = createContainer();
  const header = createHeader();
  const output = createOutput();
  const input = createInput();

  container.appendChild(header);
  container.appendChild(output);
  container.appendChild(input);

  // Attacher au DOM
  const attachPoint = document.querySelector(attach);
  if (attachPoint) {
    attachPoint.appendChild(container);
  } else {
    document.body.appendChild(container);
  }

  // Activer les fonctionnalités
  makeDraggable();
  makeResizable();

  // Commandes par défaut
  const defaultCommands = {
    'help()': () => {
      return `Available commands:
- clear() - Clear console
- help() - Show this help
- copy() - Copy console content
- history() - Show command history
- version() - Show console version`;
    },
    'clear()': () => {
      clearConsole();
      return '';
    },
    'copy()': () => {
      copyConsoleContent();
      return '';
    },
    'history()': () => {
      return history.length > 0 ? history.join('\n') : 'No command history';
    },
    'version()': () => {
      return 'Squirrel Console v1.0.0';
    }
  };

  // Fusionner avec les commandes personnalisées
  Object.assign(defaultCommands, commands);
  
  // === API PUBLIQUE ===
  const api = {
    show: showConsole,
    hide: hideConsole,
    toggle: toggleConsole,
    clear: clearConsole,
    isVisible: () => isVisible,
    addMessage: addOutput,
    getHistory: () => [...history],
    getOutput: () => [...consoleOutput],
    addCommand: (name, func) => {
      defaultCommands[name] = func;
    },
    removeCommand: (name) => {
      delete defaultCommands[name];
    },
    setPosition: (x, y) => {
      container.style.left = `${x}px`;
      container.style.top = `${y}px`;
    },
    setSize: (width, height) => {
      container.style.width = `${width}px`;
      container.style.height = `${height}px`;
    },
    center: () => {
      const x = (window.innerWidth - size.width) / 2;
      const y = (window.innerHeight - size.height) / 2;
      container.style.left = `${Math.max(0, x)}px`;
      container.style.top = `${Math.max(0, y)}px`;
    },
    bringToFront: () => {
      container.style.zIndex = '10000';
    },
    setHeaderHeight: (height) => {
      const header = container.querySelector('.hs-console-header');
      if (header) {
        header.style.height = `${height}px`;
        header.style.minHeight = `${height}px`;
        header.style.maxHeight = `${height}px`;
        
        // Ajuster tous les boutons
        const buttons = header.querySelectorAll('button');
        const buttonSize = Math.max(16, height - 8);
        buttons.forEach((btn, index) => {
          btn.style.width = `${buttonSize}px`;
          btn.style.height = `${buttonSize}px`;
          // Différentes tailles de police selon le type de bouton
          if (btn.title.includes('Copy')) {
            btn.style.fontSize = `${Math.max(10, buttonSize * 0.6)}px`;
          } else if (btn.title.includes('Clear')) {
            btn.style.fontSize = `${Math.max(10, buttonSize * 0.6)}px`;
          } else if (btn.title.includes('Close')) {
            btn.style.fontSize = `${Math.max(10, buttonSize * 0.7)}px`;
          }
        });
        
        // Ajuster le titre
        const title = header.querySelector('span');
        if (title) {
          title.style.fontSize = `${Math.max(11, height * 0.5)}px`;
        }
      }
    },
    setHeaderPadding: (padding) => {
      const header = container.querySelector('.hs-console-header');
      if (header) {
        header.style.padding = padding;
      }
    },
    copyContent: copyConsoleContent,
    destroy: () => {
      interceptor.restore();
      container.remove();
    },
    container,
    element: container // Alias pour compatibilité
  };

  // Remplacer les commandes par les commandes fusionnées
  Object.keys(defaultCommands).forEach(cmd => {
    commands[cmd] = defaultCommands[cmd];
  });

  return api;
};

// === MÉTHODES STATIQUES ===
createConsole.templates = consoleTemplates;

createConsole.getTemplateList = () => {
  return Object.keys(consoleTemplates).map(key => ({
    key,
    ...consoleTemplates[key]
  }));
};

createConsole.addTemplate = (name, template) => {
  consoleTemplates[name] = template;
  return createConsole;
};

// === EXPORTS ===
export { createConsole };

// Alias pour compatibilité
const Console = createConsole;
Console.templates = createConsole.templates;
Console.getTemplateList = createConsole.getTemplateList;
Console.addTemplate = createConsole.addTemplate;

export { Console };
export default createConsole;