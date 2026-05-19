/**
 * 🖥️ CONSOLE DEMO - Exemples d'utilisation du composant Console
 */

// Test de disponibilité immédiat
console.log('🔍 Test de chargement du module console...');
console.log('typeof window.Console:', typeof window.Console);
console.log('typeof Console:', typeof Console);

// === CONSOLE DE BASE ===
function createBasicConsole() {
  const console1 = Console({
    title: 'Debug Console',
    position: { x: 50, y: 50 },
    size: { width: 500, height: 350 },
    template: 'dark_theme'
  });
  
  console1.show();
  return console1;
}

// === CONSOLE AVEC COMMANDES PERSONNALISÉES ===
function createCustomConsole() {
  const console2 = Console({
    title: 'Custom Console',
    position: { x: 100, y: 100 },
    size: { width: 600, height: 400 },
    template: 'light_theme',
    
    // Commandes personnalisées
    commands: {
      'test()': () => 'Custom command executed!',
      'greet(name)': () => 'Usage: greet("yourname")',
      'time()': () => new Date().toLocaleString(),
      'random()': () => Math.random()
    },
    
    // Handler personnalisé pour les commandes
    onCommand: (command) => {
      // Traitement spécial pour certaines commandes
      if (command.startsWith('greet(')) {
        const match = command.match(/greet\(['"](.+)['"]\)/);
        if (match) {
          return `Hello, ${match[1]}! 👋`;
        }
        return 'Usage: greet("yourname")';
      }
      
      if (command === 'date') {
        return new Date().toDateString();
      }
      
      // Laisser l'exécution normale pour les autres commandes
      return undefined;
    },
    
    onClose: () => {
      console.log('Console fermée');
    }
  });
  
  console2.show();
  
  // Ajouter un message de bienvenue personnalisé
  setTimeout(() => {
    console2.addMessage({
      type: 'info',
      message: 'Console personnalisée prête! Essayez: test(), greet("nom"), time(), random()',
      timestamp: new Date().toLocaleTimeString()
    });
  }, 500);
  
  return console2;
}

// === CONSOLE STYLE TERMINAL ===
function createTerminalConsole() {
  const console3 = Console({
    title: 'Terminal Console',
    position: { x: 150, y: 150 },
    size: { width: 700, height: 450 },
    template: 'terminal_green',
    
    commands: {
      'ls()': () => 'index.html  style.css  script.js  README.md',
      'pwd()': () => '/Users/developer/project',
      'whoami()': () => 'developer',
      'uptime()': () => `System uptime: ${Math.floor(Math.random() * 100)} hours`,
      'ps()': () => 'PID  COMMAND\n1234  node server.js\n5678  browser\n9012  console'
    }
  });
  
  console3.show();
  
  // Simuler des logs système
  setTimeout(() => {
    console3.addMessage({
      type: 'info',
      message: 'System initialized...',
      timestamp: new Date().toLocaleTimeString()
    });
    
    setTimeout(() => {
      console3.addMessage({
        type: 'log',
        message: 'Ready for commands. Try: ls(), pwd(), whoami(), uptime(), ps()',
        timestamp: new Date().toLocaleTimeString()
      });
    }, 1000);
  }, 500);
  
  return console3;
}

// === CONSOLE MINIMALISTE ===
function createMinimalConsole() {
  const console4 = Console({
    title: 'Minimal',
    position: { x: 200, y: 200 },
    size: { width: 400, height: 300 },
    template: 'minimal'
  });
  
  console4.show();
  
  setTimeout(() => {
    console4.addMessage({
      type: 'info',
      message: 'Console minimaliste avec header ultra-fin',
      timestamp: new Date().toLocaleTimeString()
    });
  }, 500);
  
  return console4;
}

// === CONSOLE AVEC HEADER LARGE ===
function createLargeHeaderConsole() {
  const console5 = Console({
    title: 'Large Header Console',
    position: { x: 250, y: 100 },
    size: { width: 600, height: 400 },
    template: 'large_header'
  });
  
  console5.show();
  
  setTimeout(() => {
    console5.addMessage({
      type: 'info',
      message: 'Console avec header plus grand pour une meilleure lisibilité',
      timestamp: new Date().toLocaleTimeString()
    });
  }, 500);
  
  return console5;
}

// === CONSOLE AVEC HEADER PERSONNALISÉ ===
function createCustomHeaderConsole() {
  const console6 = Console({
    title: 'Custom Header Size',
    position: { x: 300, y: 150 },
    size: { width: 500, height: 350 },
    template: 'dark_theme',
    headerHeight: 30, // Header personnalisé de 30px
    headerPadding: '6px 10px'
  });
  
  console6.show();
  
  setTimeout(() => {
    console6.addMessage({
      type: 'info',
      message: 'Console avec taille de header personnalisée (30px)',
      timestamp: new Date().toLocaleTimeString()
    });
    
    console6.addMessage({
      type: 'log',
      message: 'Testez le nouveau bouton de copie 📋 dans la barre de titre!',
      timestamp: new Date().toLocaleTimeString()
    });
    
    console6.addMessage({
      type: 'warn',
      message: 'Vous pouvez aussi utiliser la commande copy() ou console.copyContent()',
      timestamp: new Date().toLocaleTimeString()
    });
    
    // Démonstration du changement dynamique
    setTimeout(() => {
      console6.addMessage({
        type: 'log',
        message: 'Changement de taille du header en cours...',
        timestamp: new Date().toLocaleTimeString()
      });
      
      setTimeout(() => {
        console6.setHeaderHeight(20);
        console6.addMessage({
          type: 'log',
          message: 'Header réduit à 20px! Notez que les boutons se sont adaptés.',
          timestamp: new Date().toLocaleTimeString()
        });
      }, 1000);
    }, 3000);
  }, 500);
  
  return console6;
}

// === CONSOLE DE TEST DE COPIE ===
function createCopyTestConsole() {
  const console7 = Console({
    title: 'Copy Test Console',
    position: { x: 350, y: 200 },
    size: { width: 550, height: 400 },
    template: 'light_theme',
    commands: {
      'generate_test_data()': () => {
        // Générer plusieurs types de messages pour tester la copie
        console7.addMessage({ type: 'log', message: 'Test log message', timestamp: new Date().toLocaleTimeString() });
        console7.addMessage({ type: 'error', message: 'Test error message', timestamp: new Date().toLocaleTimeString() });
        console7.addMessage({ type: 'warn', message: 'Test warning message', timestamp: new Date().toLocaleTimeString() });
        console7.addMessage({ type: 'info', message: 'Test info message', timestamp: new Date().toLocaleTimeString() });
        return 'Test data generated! Try copying with the 📋 button.';
      }
    }
  });
  
  console7.show();
  
  setTimeout(() => {
    console7.addMessage({
      type: 'info',
      message: 'Console de test pour la fonctionnalité de copie',
      timestamp: new Date().toLocaleTimeString()
    });
    
    console7.addMessage({
      type: 'log',
      message: 'Tapez generate_test_data() pour créer des données de test',
      timestamp: new Date().toLocaleTimeString()
    });
    
    console7.addMessage({
      type: 'log',
      message: 'Puis utilisez le bouton 📋 pour copier tout le contenu',
      timestamp: new Date().toLocaleTimeString()
    });
  }, 500);
  
  return console7;
}

// === GESTIONNAIRE GLOBAL DE CONSOLES ===
class ConsoleManager {
  constructor() {
    this.consoles = new Map();
    this.setupKeyboardShortcuts();
  }
  
  create(name, config) {
    if (this.consoles.has(name)) {
      console.warn(`Console "${name}" existe déjà`);
      return this.consoles.get(name);
    }
    
    const consoleInstance = Console(config);
    this.consoles.set(name, consoleInstance);
    return consoleInstance;
  }
  
  get(name) {
    return this.consoles.get(name);
  }
  
  show(name) {
    const console = this.consoles.get(name);
    if (console) {
      console.show();
    }
  }
  
  hide(name) {
    const console = this.consoles.get(name);
    if (console) {
      console.hide();
    }
  }
  
  hideAll() {
    this.consoles.forEach(console => console.hide());
  }
  
  destroy(name) {
    const console = this.consoles.get(name);
    if (console) {
      console.destroy();
      this.consoles.delete(name);
    }
  }
  
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // F12 pour basculer la console principale
      if (e.key === 'F12') {
        e.preventDefault();
        const mainConsole = this.consoles.get('main');
        if (mainConsole) {
          mainConsole.toggle();
        } else {
          this.create('main', {
            title: 'Main Console',
            position: { x: 100, y: 100 },
            template: 'dark_theme'
          }).show();
        }
      }
      
      // Ctrl+Shift+C pour la console de debug
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        const debugConsole = this.consoles.get('debug');
        if (debugConsole) {
          debugConsole.toggle();
        } else {
          this.create('debug', {
            title: 'Debug Console',
            position: { x: 150, y: 50 },
            template: 'light_theme',
            interceptConsole: true
          }).show();
        }
      }
      
      // Escape pour fermer toutes les consoles
      if (e.key === 'Escape') {
        this.hideAll();
      }
    });
  }
}

// === DEMO INTERACTIVE ===
function setupConsoleDemo() {
  const manager = new ConsoleManager();
  
  // Créer des boutons de demo
  const demoContainer = document.createElement('div');
  demoContainer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 15px;
    background: rgba(0,0,0,0.8);
    border-radius: 8px;
    color: white;
    font-family: monospace;
  `;
  
  const title = document.createElement('div');
  title.textContent = '🖥️ Console Demo';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '10px';
  demoContainer.appendChild(title);
  
  // Boutons
  const buttons = [
    { text: 'Basic Console', action: () => createBasicConsole() },
    { text: 'Custom Console', action: () => createCustomConsole() },
    { text: 'Terminal Console', action: () => createTerminalConsole() },
    { text: 'Minimal Console', action: () => createMinimalConsole() },
    { text: 'Large Header', action: () => createLargeHeaderConsole() },
    { text: 'Copy Test', action: () => createCopyTestConsole() },
    { text: 'Hide All', action: () => manager.hideAll() }
  ];
  
  buttons.forEach(btn => {
    const button = document.createElement('button');
    button.textContent = btn.text;
    button.style.cssText = `
      padding: 8px 12px;
      background: #333;
      color: white;
      border: 1px solid #555;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
    `;
    button.onmouseover = () => button.style.background = '#444';
    button.onmouseout = () => button.style.background = '#333';
    button.onclick = btn.action;
    demoContainer.appendChild(button);
  });
  
  // Info raccourcis
  const shortcuts = document.createElement('div');
  shortcuts.innerHTML = `
    <small>
      <strong>Raccourcis:</strong><br>
      F12: Console principale<br>
      Ctrl+Shift+C: Debug<br>
      Escape: Fermer tout
    </small>
  `;
  shortcuts.style.marginTop = '10px';
  shortcuts.style.opacity = '0.8';
  demoContainer.appendChild(shortcuts);
  
  document.body.appendChild(demoContainer);
  
  return manager;
}

// === AUTO-DEMO ===
function startAutoDemo() {
  console.log('🖥️ Console Demo chargé!');
  
  // Fonction pour vérifier et créer la console
  const tryCreateConsole = () => {
    console.log('🔍 Vérification de Console:', typeof window.Console);
    
    if (typeof window.Console === 'function') {
      console.log('✅ Console est disponible, création d\'une console de test...');
      
      try {
        const testConsole = window.Console({
          title: 'Test Console',
          position: { x: 100, y: 100 },
          size: { width: 500, height: 400 },
          template: 'dark_theme'
        });
        
        testConsole.show();
        console.log('✅ Console de test créée et affichée');
        
        // Ajouter un message de test
        setTimeout(() => {
          testConsole.addMessage({
            type: 'info',
            message: 'Console de test fonctionnelle! Tapez help() pour commencer.',
            timestamp: new Date().toLocaleTimeString()
          });
        }, 500);
        
        return true; // Succès
        
      } catch (error) {
        console.error('❌ Erreur lors de la création de la console:', error);
        return false;
      }
    } else {
      console.log('⏳ Console pas encore disponible, nouvel essai dans 1s...');
      return false;
    }
  };

  // Essayer plusieurs fois avec délai
  let attempts = 0;
  const maxAttempts = 10;
  
  const intervalId = setInterval(() => {
    attempts++;
    
    if (tryCreateConsole()) {
      clearInterval(intervalId);
      
      // Créer l'interface de demo après succès
      setTimeout(() => {
        setupConsoleDemo();
      }, 1000);
      
    } else if (attempts >= maxAttempts) {
      console.error('❌ Impossible de charger Console après', maxAttempts, 'tentatives');
      clearInterval(intervalId);
    }
  }, 1000);
}

// === EXPORTS POUR USAGE GLOBAL ===
window.createBasicConsole = createBasicConsole;
window.createCustomConsole = createCustomConsole;
window.createTerminalConsole = createTerminalConsole;
window.createMinimalConsole = createMinimalConsole;
window.createLargeHeaderConsole = createLargeHeaderConsole;
window.createCustomHeaderConsole = createCustomHeaderConsole;
window.createCopyTestConsole = createCopyTestConsole;
window.setupConsoleDemo = setupConsoleDemo;
window.ConsoleManager = ConsoleManager;

// === API SIMPLE POUR TEST ===
window.testConsole = () => {
  console.log('🧪 Test manuel de Console...');
  
  if (typeof window.Console === 'function') {
    const testConsole = window.Console({
      title: 'Test Manuel',
      position: { x: 200, y: 200 },
      size: { width: 600, height: 400 },
      template: 'dark_theme'
    });
    
    testConsole.show();
    console.log('✅ Console de test manuel créée');
    return testConsole;
  } else {
    console.error('❌ window.Console n\'est pas disponible');
    console.log('Disponible:', Object.keys(window).filter(k => k.includes('Console')));
    return null;
  }
};

// === RACCOURCI GLOBAL ===
window.openConsole = () => {
  if (typeof window.Console === 'function') {
    const console = window.Console({
      title: 'JavaScript Console',
      position: { x: 100, y: 100 },
      template: 'dark_theme'
    });
    console.show();
    return console;
  }
  return null;
};

// Auto-start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startAutoDemo);
} else {
  startAutoDemo();
}