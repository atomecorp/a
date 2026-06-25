/**
 * 🖥️ CONSOLE COMPONENT - Interactive JavaScript Console
 * Composant Console interactif pour debugging et exécution de commandes JS
 */

import { $, define } from '../squirrel.js';
import { ConsoleInterceptor, consoleTemplates } from './console_builder_base.js';

// === INTERCEPTEUR DE CONSOLE ===
import { buildConsoleDom } from './console_builder_dom.js';
import { makeConsoleInteractions } from './console_builder_interactions.js';
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
          fallbackCopy(textToCopy);
        });
      } else {
        // Fallback pour les navigateurs plus anciens
        fallbackCopy(textToCopy);
      }
    } catch (error) {
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
  const { container, header, output, input } = buildConsoleDom({
    consoleId, themeConfig, finalHeaderHeight, finalHeaderPadding, title, position, size, draggable,
    clearConsole, copyConsoleContent, hideConsole, executeCommand, handleInputKeydown
  });

  container.appendChild(header);
  container.appendChild(output);
  container.appendChild(input);

  const attachPoint = document.querySelector(attach);
  if (attachPoint) {
    attachPoint.appendChild(container);
  } else {
    document.body.appendChild(container);
  }

  makeConsoleInteractions({ container, header, position, size, draggable, resizable });

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
