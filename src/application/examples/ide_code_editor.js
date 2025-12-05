/**
 * 📝 IDE Code Editor Example
 * 
 * Demonstrates usage of the EditorBuilder component
 * with multiple editors, drag & drop, database sync, and code execution.
 * 
 * Features:
 * - Multi-window editors with unique IDs
 * - Drag & drop to reposition windows
 * - Resize from corner handle
 * - CodeMirror 6 with syntax highlighting
 * - JavaScript and Ruby language support
 * - Run code with ▶ button or Ctrl/Cmd+Enter
 * - Output panel shows console.log and results
 * - Auto-save to localStorage
 * - Database sync via UnifiedAtome API
 * 
 * Shortcuts:
 * - Alt+E: Open a new editor from anywhere
 * - Ctrl+Enter: Run code
 * - Ctrl+S: Save to localStorage
 * - Ctrl+Shift+S: Validate & save to database
 * - Ctrl+Z/Y: Undo/Redo
 */

import { $, define } from '../../squirrel/squirrel.js';
import { EditorBuilder } from '../../squirrel/components/editor_builder.js';

// === CREATE DEMO EDITORS ===

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

# Créer une box cliquable
box = Squirrel.create('div', 
  id: 'color-box',
  parent: 'view',
  css: {
    width: '200px',
    height: '200px',
    background_color: 'yellow',
    cursor: 'pointer',
    border_radius: '8px',
    transition: 'background-color 0.3s ease',
    position: 'absolute',
    top: '100px',
    left: '100px',
    z_index: '1000'
  }
)

# Liste de couleurs
colors = %w[red blue green purple orange yellow]
$index = 0

# Événement clic sur la box
box.on(:click) do
  $index = ($index + 1) % colors.length
  box.css[:background_color] = colors[$index]
  puts "Couleur: #{colors[$index]}"
end

# Créer un cercle draggable
circle = Squirrel.create('div',
  id: 'drag-circle',
  parent: 'view',
  css: {
    width: '80px',
    height: '80px',
    background_color: '#3b82f6',
    border_radius: '50%',
    position: 'absolute',
    top: '200px',
    left: '350px',
    z_index: '1001',
    box_shadow: '0 4px 12px rgba(0,0,0,0.3)'
  }
)

# Rendre le cercle draggable avec log de position
circle.make_draggable do |x, y|
  puts "Position: x=#{x}, y=#{y}"
end

puts "Box et cercle créés!"
puts "- Cliquez sur la box jaune pour changer sa couleur"
puts "- Glissez le cercle bleu pour voir sa position"
`,
    onValidate: (info) => {
        console.log('✓ Ruby file validated:', info);
    }
});

// === EXPORTS FOR CONSOLE ACCESS ===

window.EditorBuilder = EditorBuilder;
window.jsEditor = jsEditor;
window.rubyEditor = rubyEditor;

console.log(`
╔═══════════════════════════════════════════════════════════╗
║  📝 Code Editor Demo Loaded!                               ║
╠═══════════════════════════════════════════════════════════╣
║  Shortcuts:                                                ║
║  • Alt+E: Open new editor                                  ║
║  • Ctrl+Enter: Run code                                    ║
║  • Ctrl+S: Save locally                                    ║
║  • Ctrl+Shift+S: Save to database                          ║
║  • Ctrl+Z/Y: Undo/Redo                                     ║
║                                                           ║
║  Available in console:                                     ║
║  • jsEditor.getContent() / rubyEditor.getContent()         ║
║  • jsEditor.run() / rubyEditor.run()                       ║
╚═══════════════════════════════════════════════════════════╝
`);
