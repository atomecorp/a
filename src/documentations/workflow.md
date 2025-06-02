# 🐿️ Squirrel Framework - Complete Workflow Architecture

## 📋 Overview
The Squirrel Framework processes hybrid `.sqh` files containing mixed Ruby and JavaScript code, transpiling Ruby to vanilla JavaScript with **zero overhead** and **strict performance equality** to native JavaScript.

## 🎯 Core Requirements
- ✅ **Zero overhead**: Generated JS must be identical in performance to hand-written vanilla JS
- ✅ **Mixed language support**: `.sqh` files contain Ruby + JavaScript code
- ✅ **Intelligent separation**: Automatic detection and separation of Ruby/JS code
- ✅ **WASM optimization**: Optional high-performance parsing with C++ WASM module
- ✅ **Fallback compatibility**: Regex-based transpiler when WASM unavailable

---

## 🔄 Complete Workflow

### Phase 1: File Loading & Initial Processing
```
index.html → squirrel_runner.js → fetch('./application/index.sqh')
```

**Files involved:**
- `index.html` - Entry point with script loading order
- `squirrel/squirrel_runner.js` - Main orchestrator
- `application/index.sqh` - **Hybrid Ruby/JS source file**

### Phase 2: Language Separation
```
Raw .sqh content → Acorn AST Parser → Separated Ruby/JS blocks
```

**Files involved:**
- `squirrel/parser/acorn.js` - JavaScript AST parser for JS validation
- `acorn_test.js` - Acorn-based JS/Ruby separator (uses AST parsing)
- `squirrel/squirrel_parser.js` - Pattern-based fallback separator

**Process:**
1. **Acorn separation**: Parse each code block with Acorn to validate JavaScript syntax
2. Blocks that parse successfully = **JavaScript** (keep as-is)
3. Blocks that fail parsing = **Ruby** (send to transpilation pipeline)
4. Mixed blocks = Split and process separately

### Phase 3: Ruby Transpilation Pipeline (Sequential Flow)

#### Step 3.1: Ruby Code Parsing
```
Ruby code blocks → prism.wasm → C++ parser → Ruby AST generation
```

**Files involved:**
- `squirrel/parser/prism.wasm` - Compiled C++ Ruby parser
- `squirrel/parser/prism.js` - WASM module loader

#### Step 3.2: AST Processing Chain (Sequential Pipeline)
```
Prism Ruby AST → prism-parser.js → squirrel_parser.js → hyper_squirrel.js → Vanilla JS
```

**Files involved:**
- `squirrel/parser/prism-parser.js` - SquirrelRubyParser wrapper class
- `squirrel/squirrel_parser.js` - AST processing and optimization
- `squirrel/hyper_squirrel.js` - Final Ruby→JS transpilation engine

**Detailed Process:**
1. **Prism parsing**: Ruby blocks sent to `prism.wasm` for AST generation
2. **prism-parser.js**: Wraps WASM output into structured AST objects
3. **squirrel_parser.js**: Processes Ruby AST, applies optimizations
4. **hyper_squirrel.js**: Converts processed AST to vanilla JavaScript
5. **Code replacement**: Original Ruby code replaced with transpiled JS

#### Step 3.3: Fallback Strategy (When WASM Unavailable)
```
Ruby code → hyper_squirrel.js → Direct pattern matching → Vanilla JS output
```

**Files involved:**
- `squirrel/hyper_squirrel.js` - Regex-based Ruby→JS transpiler (fallback mode)

### Phase 4: Code Combination & Execution
```
JS blocks + Transpiled Ruby → Pure JavaScript → eval() → DOM execution
```

**Files involved:**
- `squirrel/squirrel_runner.js` - Code execution orchestrator

**Final Process:**
1. **Code merging**: JavaScript blocks + transpiled Ruby blocks combined
2. **Execution**: Pure JavaScript executed by `squirrel_runner.js`
3. **DOM manipulation**: Framework functions interact with DOM

---

## 📁 File Structure & Responsibilities

### Core Framework Files
```
a/
├── a.js                    # Main A class with Proxy architecture
├── utils.js               # Framework utilities (puts, grab, wait, require)
├── particles/
│   ├── identity.js        # ID, position, color particles
│   └── dimension.js       # Width, height, sizing particles
```

### Native Utilities
```
native/
└── utils.js               # Additional utilities and extensions
```

### Parser & Transpiler Stack
```
squirrel/
├── parser/
│   ├── prism.wasm         # C++ WASM Ruby parser (high-performance)
│   ├── prism.js           # WASM module loader
│   ├── prism-parser.js    # SquirrelRubyParser class wrapper
│   └── acorn.js           # JavaScript AST parser
├── squirrel_parser.js     # AST processing and optimization layer
├── hyper_squirrel.js      # Ruby→JS transpilation engine
└── squirrel_runner.js     # Main execution orchestrator
```

### Application Files
```
application/
├── index.sqh              # Main hybrid Ruby/JS application file
├── require_test.sqh       # Test module for require() functionality
└── *.sqh                  # Additional hybrid source files
```

### Debug & Testing
```
squirrel_tracer.js         # Execution flow tracer and debugger
acorn_test.js             # Acorn separation testing utilities
```

---

## 🔧 Detailed Processing Flow

### 1. Initialization Sequence
```javascript
// index.html loads scripts in order:
1. prism.wasm, prism.js, prism-parser.js    // WASM parser
2. native/utils.js, a/utils.js              // Utilities
3. a/a.js                                   // Core framework
4. particles/*.js                           // Framework extensions
5. squirrel_parser.js, hyper_squirrel.js   // Transpilers
6. squirrel_runner.js                       // Orchestrator (starts execution)
```

### 2. Complete File Processing Pipeline
```javascript
runSquirrelFile('./application/index.sqh')
  ↓
fetch(filename) → raw .sqh content
  ↓
Acorn language separation → JavaScript blocks + Ruby blocks
  ↓
JavaScript blocks (unchanged) + Ruby blocks → Transpilation Pipeline
  ↓
Ruby AST (prism.wasm) → prism-parser.js → squirrel_parser.js → hyper_squirrel.js
  ↓
Original Ruby code replaced with transpiled JavaScript
  ↓
Pure JavaScript code → eval() execution → DOM manipulation
```

### 3. Ruby Transpilation Chain (Detailed)

#### WASM Path (Preferred - High Performance):
```
Ruby code → prism.wasm → Ruby AST → prism-parser.js → squirrel_parser.js → hyper_squirrel.js → Vanilla JS
```

#### Fallback Path (Regex-based):
```
Ruby code → hyper_squirrel.js (direct pattern matching) → Vanilla JS
```

### 4. Transpilation Quality Guarantees

#### Ruby Input Example:
```ruby
container = A.new({
  width: 200,
  height: 100,
  color: 'red'
})

container.onclick do
  puts "Clicked!"
end

wait 3000 do
  container.color('blue')
end
```

#### Generated Vanilla JS Output:
```javascript
const container = new A({
  width: 200,
  height: 100,
  color: 'red'
});

container.onclick(() => {
  puts("Clicked!");
});

setTimeout(() => {
  container.color('blue');
}, 3000);
```

**Performance guarantee**: The generated JavaScript is identical in execution speed to hand-written vanilla JavaScript.

---

## 🎯 Key Architecture Decisions

### 1. **Zero-Overhead Transpilation**
- Ruby constructs map 1:1 to JavaScript equivalents
- No runtime interpretation or wrapper functions
- Generated code is pure vanilla JavaScript

### 2. **Intelligent Language Detection**
- Use Acorn AST parser to definitively identify valid JavaScript
- Only process non-JS code through Ruby transpilation pipeline
- Preserve existing JavaScript unchanged

### 3. **Sequential Transpilation Pipeline**
- **Step 1**: Acorn separates Ruby from JavaScript
- **Step 2**: Ruby → prism.wasm → AST generation
- **Step 3**: AST → prism-parser → squirrel_parser → hyper_squirrel
- **Step 4**: Ruby code replaced with transpiled JavaScript
- **Step 5**: Pure JavaScript executed by squirrel_runner

### 4. **Dual Transpilation Strategy**
- **Primary**: WASM C++ parser pipeline for maximum performance and accuracy
- **Fallback**: Direct regex-based transpilation for compatibility
- Automatic fallback when WASM unavailable

### 5. **Modular Particle System**
- Framework functionality split into particles
- Each particle handles specific DOM properties/behaviors
- Extensible architecture for new features

### 6. **Smart Execution Orchestration**
- Dependency checking and loading
- Error handling and retry logic
- Debug tracing and performance monitoring

---

## 🚀 Performance Characteristics

### Generated Code Performance
- **Memory overhead**: 0% (no runtime wrappers)
- **Execution speed**: 100% of vanilla JavaScript performance
- **Bundle size**: Minimal (only transpiled code, no runtime)

### Transpilation Performance
- **WASM pipeline**: ~10-50x faster than regex transpilation
- **Regex fallback**: Sufficient for development and small projects
- **Caching**: Transpiled results cached for repeated use

### Framework Overhead
- **A class**: Minimal proxy overhead only for Ruby-style property access
- **Particles**: Zero overhead when not used
- **Utilities**: Standard JavaScript function calls

---

## 🔍 Debug & Monitoring Tools

### Runtime Debugging
- `squirrel_tracer.js` - Complete execution flow tracing
- `acorn_test.js` - Language separation testing
- Console debug panels with real-time status

### Performance Monitoring
- Transpilation time measurement
- Code execution profiling
- Memory usage tracking
- Error reporting and stack traces

---

## 📝 File Format Specification

### .sqh File Format - Complete Examples

The `.sqh` (Squirrel Hybrid) format supports extensive Ruby and JavaScript mixing:

#### Complete Ruby Section Example:
```ruby
# Ruby-style imports and requires
require 'utils'
require 'components/button'

# Ruby method definitions
def calculate_area(width, height)
  width * height
end

def create_gradient(start_color, end_color)
  "linear-gradient(45deg, #{start_color}, #{end_color})"
end

def setup_event_handlers(element, options = {})
  element.onclick do |event|
    puts "Element clicked at #{event.clientX}, #{event.clientY}"
    event.preventDefault if options[:prevent_default]
  end
  
  element.onmouseover do
    element.backgroundColor(options[:hover_color] || 'lightblue')
  end
  
  element.onmouseout do
    element.backgroundColor(options[:default_color] || 'white')
  end
end

# Ruby A.new syntax with complex configurations
main_container = A.new({
  id: 'main_container',
  width: 800,
  height: 600,
  backgroundColor: create_gradient('#ff6b6b', '#4ecdc4'),
  position: 'relative',
  attach: 'body'
})

# Ruby-style button creation
button = A.new({
  markup: 'button',
  text: 'Click Me!',
  width: 150,
  height: 50,
  x: 325,
  y: 275,
  backgroundColor: '#3498db',
  color: 'white',
  smooth: 8,
  attach: main_container
})

# Ruby block with parameters and complex logic
setup_event_handlers(button, {
  hover_color: '#2980b9',
  default_color: '#3498db',
  prevent_default: true
})

# Ruby-style animation with blocks
button.animate(:width, 200, 500) do |animation|
  puts "Animation started"
  
  animation.onComplete do
    puts "Animation finished"
    button.text('Expanded!')
  end
end

# Ruby each loops and iteration
colors = ['red', 'green', 'blue', 'yellow', 'purple']
positions = [[100, 100], [200, 150], [300, 200], [400, 250], [500, 300]]

colors.each_with_index do |color, index|
  x, y = positions[index]
  
  dot = A.new({
    width: 30,
    height: 30,
    backgroundColor: color,
    smooth: 15,
    x: x,
    y: y,
    attach: main_container
  })
  
  # Ruby wait blocks with closures
  wait (index * 500) do
    dot.animate(:scale, 1.5, 300) do
      dot.animate(:scale, 1.0, 300)
    end
  end
  
  # Ruby-style method chaining
  dot.onclick do
    puts "Clicked #{color} dot"
    grab('main_container').backgroundColor(color)
  end
end

# Ruby hash/object manipulation
user_data = {
  name: 'John Doe',
  age: 30,
  preferences: {
    theme: 'dark',
    language: 'en'
  }
}

# Ruby string interpolation
info_panel = A.new({
  markup: 'div',
  html: "
    <h2>User: #{user_data[:name]}</h2>
    <p>Age: #{user_data[:age]}</p>
    <p>Theme: #{user_data[:preferences][:theme]}</p>
  ",
  width: 300,
  height: 200,
  x: 50,
  y: 50,
  backgroundColor: 'rgba(255, 255, 255, 0.9)',
  attach: main_container
})

# Ruby conditional blocks
if user_data[:age] >= 18
  adult_features = A.new({
    text: 'Adult Content Available',
    backgroundColor: 'green',
    attach: info_panel
  })
else
  restricted_notice = A.new({
    text: 'Restricted Access',
    backgroundColor: 'orange',
    attach: info_panel
  })
end

# Ruby class-like method definitions with self
def self.create_modal(title, content)
  modal = A.new({
    width: 400,
    height: 300,
    backgroundColor: 'white',
    shadow: [{blur: 20, color: {red: 0, green: 0, blue: 0, alpha: 0.5}}],
    x: 200,
    y: 150,
    attach: 'body'
  })
  
  header = A.new({
    text: title,
    height: 50,
    backgroundColor: '#34495e',
    color: 'white',
    attach: modal
  })
  
  body = A.new({
    html: content,
    height: 200,
    padding: 20,
    attach: modal
  })
  
  close_btn = A.new({
    markup: 'button',
    text: '×',
    width: 30,
    height: 30,
    x: 370,
    y: 10,
    attach: modal
  })
  
  close_btn.onclick do
    modal.remove
  end
  
  modal
end

# Ruby-style form handling
form_data = {}

input_field = A.new({
  markup: 'input',
  attrType: 'text',
  attrPlaceholder: 'Enter your name',
  width: 200,
  height: 40,
  attach: main_container
})

input_field.oninput do |event|
  form_data[:name] = event.target.value
  puts "Name updated: #{form_data[:name]}"
end

submit_btn = A.new({
  markup: 'button',
  text: 'Submit',
  attach: main_container
})

submit_btn.onclick do
  if form_data[:name] && form_data[:name].length > 0
    create_modal('Success', "Hello #{form_data[:name]}!")
  else
    create_modal('Error', 'Please enter your name')
  end
end
```

#### JavaScript Section Example:
```javascript
// JavaScript ES6+ with framework integration
const jsContainer = new A({
  id: 'js_container',
  width: 600,
  height: 400,
  backgroundColor: '#2c3e50',
  position: 'absolute',
  top: 50,
  left: 850,
  attach: 'body'
});

// JavaScript class definition
class ComponentManager {
  constructor() {
    this.components = new Map();
    this.eventListeners = new Set();
  }
  
  createComponent(type, config) {
    const component = new A({
      ...config,
      attach: jsContainer
    });
    
    this.components.set(config.id, component);
    return component;
  }
  
  async loadData(url) {
    try {
      const response = await fetch(url);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to load data:', error);
      return null;
    }
  }
  
  setupChart(data) {
    const chart = this.createComponent('chart', {
      id: 'data_chart',
      width: 500,
      height: 300,
      backgroundColor: 'white'
    });
    
    data.forEach((point, index) => {
      const bar = new A({
        width: 30,
        height: point.value * 2,
        backgroundColor: `hsl(${index * 30}, 70%, 50%)`,
        x: index * 40 + 50,
        y: 250 - (point.value * 2),
        attach: chart.getElement()
      });
      
      bar.onclick(() => {
        console.log(`Bar ${index}: ${point.value}`);
        this.showTooltip(point, bar);
      });
    });
  }
  
  showTooltip(data, element) {
    const tooltip = new A({
      text: `Value: ${data.value}`,
      backgroundColor: 'rgba(0,0,0,0.8)',
      color: 'white',
      padding: 10,
      attach: jsContainer.getElement()
    });
    
    setTimeout(() => tooltip.getElement().remove(), 3000);
  }
}

// JavaScript async/await usage
async function initializeApp() {
  const manager = new ComponentManager();
  
  const sampleData = [
    {label: 'Jan', value: 45},
    {label: 'Feb', value: 67},
    {label: 'Mar', value: 89},
    {label: 'Apr', value: 23},
    {label: 'May', value: 76}
  ];
  
  manager.setupChart(sampleData);
  
  // JavaScript Promise handling
  Promise.all([
    manager.loadData('/api/users'),
    manager.loadData('/api/stats')
  ]).then(([users, stats]) => {
    console.log('All data loaded:', {users, stats});
  });
}

// JavaScript event delegation
jsContainer.getElement().addEventListener('click', (event) => {
  if (event.target.classList.contains('interactive')) {
    console.log('Interactive element clicked');
  }
});

// JavaScript module pattern
const Utils = (() => {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };
  
  const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };
  
  return {formatCurrency, debounce};
})();

// Initialize the JavaScript section
initializeApp();
```

#### Mixed Ruby/JavaScript in Same Block:
```sqh
// This demonstrates seamless mixing within the same file

# Ruby variable definitions
ruby_config = {
  theme: 'dark',
  animations: true,
  debug: false
}

# Ruby method using JavaScript-style syntax when beneficial
def optimize_performance
  # Ruby logic
  elements = grab_all('.heavy-element')
  
  elements.each do |element|
    element.willChange('transform')
  end
end

// JavaScript taking advantage of Ruby-defined variables
const mixedComponent = new A({
  // Ruby variables accessible in JS context
  theme: ruby_config.theme,
  width: 400,
  height: 300,
  attach: 'body'
});

# Ruby continuing after JavaScript
mixedComponent.setup_ruby_events do |component|
  component.onclick do |event|
    puts "Ruby event handler in mixed context"
    
    # Call JavaScript function from Ruby
    Utils.debounce(lambda do
      optimize_performance
    end, 300).call
  end
end

// JavaScript accessing Ruby methods
if (typeof optimize_performance === 'function') {
  optimize_performance();
}
```

#### Expected Transpiled Output:
```javascript
// All Ruby code becomes vanilla JavaScript with zero overhead

// Ruby methods become JavaScript functions
function calculate_area(width, height) {
  return width * height;
}

function create_gradient(start_color, end_color) {
  return `linear-gradient(45deg, ${start_color}, ${end_color})`;
}

function setup_event_handlers(element, options = {}) {
  element.onclick((event) => {
    puts(`Element clicked at ${event.clientX}, ${event.clientY}`);
    if (options.prevent_default) event.preventDefault();
  });
  
  element.onmouseover(() => {
    element.backgroundColor(options.hover_color || 'lightblue');
  });
  
  element.onmouseout(() => {
    element.backgroundColor(options.default_color || 'white');
  });
}

// Ruby A.new becomes JavaScript new A
const main_container = new A({
  id: 'main_container',
  width: 800,
  height: 600,
  backgroundColor: create_gradient('#ff6b6b', '#4ecdc4'),
  position: 'relative',
  attach: 'body'
});

// Ruby blocks become JavaScript arrow functions
colors.forEach((color, index) => {
  const [x, y] = positions[index];
  
  const dot = new A({
    width: 30,
    height: 30,
    backgroundColor: color,
    smooth: 15,
    x: x,
    y: y,
    attach: main_container
  });
  
  // Ruby wait becomes JavaScript setTimeout
  setTimeout(() => {
    dot.animate('scale', 1.5, 300, () => {
      dot.animate('scale', 1.0, 300);
    });
  }, index * 500);
});

// JavaScript sections remain completely unchanged
const jsContainer = new A({
  id: 'js_container',
  width: 600,
  height: 400,
  backgroundColor: '#2c3e50',
  position: 'absolute',
  top: 50,
  left: 850,
  attach: 'body'
});
```

**Key Features Demonstrated:**
- 🔥 Ruby methods → JavaScript functions (zero overhead)
- 🔥 Ruby blocks → JavaScript arrow functions  
- 🔥 A.new → new A (1:1 mapping)
- 🔥 Ruby iteration → JavaScript forEach/map
- 🔥 String interpolation → Template literals
- 🔥 Ruby conditionals → JavaScript conditionals
- 🔥 Mixed language variables and function calls
- 🔥 JavaScript code remains completely untouched

Mixed Ruby/JavaScript in the same file is automatically detected and processed appropriately, ensuring optimal performance for both languages.