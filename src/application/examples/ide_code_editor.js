/**
 * 📝 IDE Code Editor Example
 * 
 * Demonstrates usage of the EditorBuilder component
 * with multiple editors, drag & drop, and database sync.
 */

import { $, define } from '../../squirrel/squirrel.js';
import { EditorBuilder } from '../../squirrel/components/editor_builder.js';

// === MAIN DEMO ===

// Create a toolbar for editor management
const toolbar = $('div', {
    id: 'editor-toolbar',
    css: {
        position: 'fixed',
        top: '10px',
        left: '10px',
        display: 'flex',
        gap: '8px',
        zIndex: '9999',
        padding: '8px 12px',
        backgroundColor: 'rgba(30, 30, 30, 0.95)',
        borderRadius: '8px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
    }
});

// === TOOLBAR BUTTONS ===

// New JavaScript Editor
$('button', {
    text: '+ JavaScript',
    css: {
        padding: '8px 16px',
        backgroundColor: '#f7df1e',
        color: '#000',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '13px'
    },
    events: {
        click: () => {
            const offset = EditorBuilder.getAll().length * 30;
            EditorBuilder({
                language: 'javascript',
                fileName: `script_${Date.now()}.js`,
                position: { x: 150 + offset, y: 80 + offset },
                content: `// New JavaScript file
function hello(name) {
    console.log(\`Hello, \${name}!\`);
    return { greeting: 'Hello', name };
}

// Try it out
hello('World');
`,
                onChange: (content) => {
                    console.log('[JS Editor] Content changed, length:', content.length);
                },
                onValidate: (info) => {
                    console.log('[JS Editor] ✓ Validated and saved:', info.fileName);
                },
                onClose: (id) => {
                    console.log('[JS Editor] Closed:', id);
                    updateEditorCount();
                }
            });
            updateEditorCount();
        },
        mouseenter: (e) => { e.target.style.transform = 'scale(1.05)'; },
        mouseleave: (e) => { e.target.style.transform = 'scale(1)'; }
    },
    attach: toolbar
});

// New Ruby Editor
$('button', {
    text: '+ Ruby',
    css: {
        padding: '8px 16px',
        backgroundColor: '#cc342d',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '13px'
    },
    events: {
        click: () => {
            const offset = EditorBuilder.getAll().length * 30;
            EditorBuilder({
                language: 'ruby',
                fileName: `script_${Date.now()}.rb`,
                position: { x: 200 + offset, y: 120 + offset },
                content: `# New Ruby file
class Greeter
  def initialize(name)
    @name = name
  end

  def greet
    puts "Hello, #{@name}!"
  end
end

# Usage
greeter = Greeter.new("World")
greeter.greet
`,
                onChange: (content) => {
                    console.log('[Ruby Editor] Content changed, length:', content.length);
                },
                onValidate: (info) => {
                    console.log('[Ruby Editor] ✓ Validated and saved:', info.fileName);
                },
                onClose: (id) => {
                    console.log('[Ruby Editor] Closed:', id);
                    updateEditorCount();
                }
            });
            updateEditorCount();
        },
        mouseenter: (e) => { e.target.style.transform = 'scale(1.05)'; },
        mouseleave: (e) => { e.target.style.transform = 'scale(1)'; }
    },
    attach: toolbar
});

// Load from Database
$('button', {
    text: '📂 Load',
    css: {
        padding: '8px 16px',
        backgroundColor: '#3b82f6',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '13px'
    },
    events: {
        click: async () => {
            const files = await EditorBuilder.listFiles();
            if (files.length === 0) {
                alert('No saved files found. Create and validate a file first!');
                return;
            }

            // Simple file picker
            const fileNames = files.map(f => (f.properties?.fileName || f.data?.fileName || f.id));
            const selected = prompt(`Available files:\n${fileNames.join('\n')}\n\nEnter filename to load:`);

            if (selected) {
                const editor = await EditorBuilder.loadFile({ fileName: selected });
                if (editor) {
                    console.log('[Load] Loaded file:', selected);
                    updateEditorCount();
                } else {
                    alert('File not found: ' + selected);
                }
            }
        },
        mouseenter: (e) => { e.target.style.backgroundColor = '#2563eb'; },
        mouseleave: (e) => { e.target.style.backgroundColor = '#3b82f6'; }
    },
    attach: toolbar
});

// Close All
$('button', {
    text: '✕ Close All',
    css: {
        padding: '8px 16px',
        backgroundColor: '#ef4444',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '13px'
    },
    events: {
        click: () => {
            if (confirm('Close all editors?')) {
                EditorBuilder.closeAll();
                updateEditorCount();
            }
        },
        mouseenter: (e) => { e.target.style.backgroundColor = '#dc2626'; },
        mouseleave: (e) => { e.target.style.backgroundColor = '#ef4444'; }
    },
    attach: toolbar
});

// Editor count display
const countDisplay = $('span', {
    id: 'editor-count',
    text: 'Editors: 0',
    css: {
        padding: '8px 12px',
        color: '#9ca3af',
        fontSize: '13px'
    },
    attach: toolbar
});

function updateEditorCount() {
    const count = EditorBuilder.getAll().length;
    countDisplay.textContent = `Editors: ${count}`;
}

// === INFO PANEL ===

$('div', {
    id: 'info-panel',
    css: {
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        padding: '16px 20px',
        backgroundColor: 'rgba(30, 30, 30, 0.95)',
        color: '#d4d4d4',
        borderRadius: '8px',
        fontSize: '13px',
        lineHeight: '1.6',
        maxWidth: '350px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        zIndex: '9997'
    },
    html: `
    <div style="font-weight: bold; margin-bottom: 8px; color: #fff;">📝 Code Editor Demo</div>
    <div style="color: #9ca3af;">
      <div>🖱️ <strong>Drag</strong> header to move</div>
      <div>↘️ <strong>Resize</strong> from bottom-right corner</div>
      <div>📄 <strong>Drop</strong> text files to load</div>
      <div>💾 <strong>Auto-save</strong> on every keystroke</div>
      <div>✓ <strong>Ctrl+Shift+S</strong> to save to database</div>
      <div>↶↷ <strong>Ctrl+Z/Y</strong> for undo/redo</div>
      <div>🎨 Switch language with dropdown</div>
    </div>
    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #3c3c3c; color: #6b7280;">
      Tip: Use <strong>Alt+E</strong> shortcut to open a new editor from anywhere!
    </div>
  `
});

// === CREATE INITIAL EDITORS ===

// JavaScript example
const jsEditor = EditorBuilder({
    id: 'demo-js-editor',
    language: 'javascript',
    fileName: 'example.js',
    position: { x: 400, y: 60 },
    size: { width: 600, height: 350 },
    content: `/**
 * Example JavaScript Code
 * Edit this and watch auto-save in action!
 */

class Calculator {
  constructor() {
    this.result = 0;
  }

  add(n) {
    this.result += n;
    return this;
  }

  subtract(n) {
    this.result -= n;
    return this;
  }

  multiply(n) {
    this.result *= n;
    return this;
  }

  getResult() {
    return this.result;
  }
}

// Chain operations
const calc = new Calculator();
const result = calc.add(10).multiply(2).subtract(5).getResult();
console.log('Result:', result); // 15
`,
    onValidate: (info) => {
        console.log('✓ JavaScript file validated:', info);
    }
});

// Ruby example
const rubyEditor = EditorBuilder({
    id: 'demo-ruby-editor',
    language: 'ruby',
    fileName: 'example.rb',
    position: { x: 450, y: 430 },
    size: { width: 600, height: 300 },
    content: `# Example Ruby Code
# Try editing and see the syntax highlighting!

module Enumerable
  def sum_values
    reduce(0) { |acc, val| acc + val }
  end
end

class Account
  attr_reader :name, :balance

  def initialize(name, balance = 0)
    @name = name
    @balance = balance
  end

  def deposit(amount)
    @balance += amount
    self
  end

  def withdraw(amount)
    raise "Insufficient funds" if amount > @balance
    @balance -= amount
    self
  end

  def to_s
    "#{@name}: $#{@balance}"
  end
end

# Usage
account = Account.new("Savings", 100)
account.deposit(50).withdraw(25)
puts account
`,
    onValidate: (info) => {
        console.log('✓ Ruby file validated:', info);
    }
});

// Update initial count
updateEditorCount();

// === EXPORTS FOR CONSOLE ACCESS ===

window.EditorBuilder = EditorBuilder;
window.jsEditor = jsEditor;
window.rubyEditor = rubyEditor;

console.log(`
╔═══════════════════════════════════════════════════════════╗
║  📝 Code Editor Demo Loaded!                               ║
╠═══════════════════════════════════════════════════════════╣
║  Available in console:                                     ║
║  • EditorBuilder - Create new editors                      ║
║  • jsEditor - JavaScript editor instance                   ║
║  • rubyEditor - Ruby editor instance                       ║
║                                                           ║
║  Try: EditorBuilder({ language: 'javascript' })            ║
║       jsEditor.getContent()                                ║
║       EditorBuilder.getAll()                               ║
╚═══════════════════════════════════════════════════════════╝
`);
