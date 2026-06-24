// Extracted from console_builder.js: console.* interceptor class + console visual templates (themes).
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

export { ConsoleInterceptor, consoleTemplates };
