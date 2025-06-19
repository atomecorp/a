# 🐿️ Squirrel Framework

## 🎯 Overview

Modern hybrid framework combining the flexibility of an ES6 module system, audio processing capabilities with WaveSurfer.js, and Rust performance via Tauri.

## 🏗️ Architecture

### **Frontend (JavaScript + Audio)**
- **Squirrel Framework** - ES6 modular system with dynamic loading
- **WaveSurfer.js Integration** - Professional audio waveform visualization
- **WebComponent** -  WaveSurfer Module, Slider, Matrix,
- **Tauri Integration** - Native desktop application

### **Audio Features**
- **WaveSurfer Component** - Complete audio player with waveform display
- **Audio Controls** - Play, pause, stop, volume, mute, seek
- **Regions Support** - Audio editing with visual regions
- **Real-time Visualization** - Dynamic waveform rendering
- **Audio Processing** - EQ, effects, speed control

### **Backend (Rust)**
- **Axum Server** - High-performance API
- **Fastify Server** - Static file server
- **Tauri Runtime** - Native desktop integration

## 🚀 Quick Start

```bash
# Full development
./dev.sh

# Or step by step
npm install             # Install dependencies (includes WaveSurfer.js)
npm run start:server    # Fastify server
npm run tauri dev       # Tauri application
```

## 🎵 Audio Integration Examples

```bash
# Basic demos
http://localhost:9000/demo-wavesurfer.html        # Interactive demo
http://localhost:9000/audio-workstation.html     # Advanced workstation
http://localhost:9000/test-wavesurfer.html       # Integration tests
```

## 📁 Structure

```
src/
├── application/
│   ├── index.js        # Framework exports (includes WaveSurfer)
│   └── examples/
│       ├── wavesurfer.js    # 5 WaveSurfer examples
│       └── audio-workstation.js  # Advanced integration
├── a/
│   └── components/
│       ├── Module.js   # Draggable modules
│       ├── Slider.js   # Interactive sliders
│       ├── Matrix.js   # Grid components
│       └── WaveSurfer.js    # Audio waveform component ✨
├── assets/audios/      # Audio files for testing
└── index.html          # Main interface

demos:
├── demo-wavesurfer.html      # Interactive demonstration
├── audio-workstation.html    # Professional audio interface
└── test-wavesurfer.html      # Integration validation
```

* **Performance**: Rust handles critical tasks, JavaScript manages the UI—resulting in high overall performance.
* **Flexibility**: The scripting language enables intuitive, powerful code with advanced metaprogramming capabilities.
* **Interoperability**: A performant bridge between frontend and backend leverages each technology’s strengths.

## Minimal DSL Example (Editable Text Inline, Events, Metaprogramming)

```text
page = box(id: :main, width: :full, height: :full, attach: :body)

## 🎵 WaveSurfer Usage Examples

### Basic Audio Player
```javascript
import { WaveSurfer } from './src/application/index.js';

const player = new WaveSurfer({
    container: document.getElementById('waveform'),
    waveColor: '#4A90E2',
    progressColor: '#2ECC71',
    height: 80,
    showControls: true
});

await player.loadAudio('./audio/song.mp3');
player.play();
```

### Advanced Audio Workstation
```javascript
// Create multiple components working together
const wavePlayer = new WaveSurfer({...});
const volumeSlider = new Slider({...});
const eqModule = new Module({...});

// Connect components with callbacks
volumeSlider.callback = (value) => {
    wavePlayer.setVolume(value / 100);
};
```

### Audio Regions for Editing
```javascript
// Add regions for audio editing
const intro = player.addRegion({
    start: 0,
    end: 30,
    color: 'rgba(255, 255, 0, 0.3)',
    content: 'Intro'
});

// Loop a specific region
player.playRegion(intro);
```

* **Audio Performance**: WaveSurfer.js handles audio processing efficiently, while Squirrel manages the UI components.
* **Component Integration**: Audio components seamlessly integrate with existing Module, Slider, and Matrix components.
* **Real-time Visualization**: Dynamic waveform rendering with customizable styling and effects.

## Minimal DSL Example (Editable Text Inline, Events, Metaprogramming)

```text
page = box(id: :main, width: :full, height: :full, attach: :body)

note = text(id: :note,
			content: "✎ Edit me inline",
			editable: true,         # maps to contenteditable
			draggable: true,
			left: 88,
			top: 88,
			style: { font_size: 20, color: :blue })

note.on(:key_down) do |e|
  puts "Key: #{e[:key]}"
end

note.define_method(:highlight) do
  self[:color] = :red
end

note.instance_var_write(:saved_text, "Initial value")

puts note.instance_var_read(:saved_text)        # -> "Initial value"
puts note.respond_to?(:highlight)               # -> true
puts note.inspect                               # -> full DSL object dump

# Call to a Rust backend function for a heavy computation
data = { name: "John", age: 42 }
result = rust(:process_data, data)
puts "Rust response: \#{result}"

```

# Rust Parser and Backend for DSL

This file contains the minimal Rust code to:

* Parse a simple DSL object
* Convert it into JavaScript
* Handle a backend method `process_data` exposed to Tauri frontend

---

## Node Parser and JS Generator

```rust
use serde_json::json;
use std::collections::HashMap;

// Simulate a simple node structure for UI elements
#[derive(Debug)]
struct Node {
    id: String,
    element_type: String,
    properties: HashMap<String, serde_json::Value>,
}

impl Node {
    fn new(id: &str, element_type: &str) -> Self {
        Node {
            id: id.to_string(),
            element_type: element_type.to_string(),
            properties: HashMap::new(),
        }
    }

    fn set(&mut self, key: &str, value: serde_json::Value) {
        self.properties.insert(key.to_string(), value);
    }

    fn to_js(&self) -> String {
        let props = serde_json::to_string(&self.properties).unwrap();
        format!("createNode('{}', '{}', {});", self.id, self.element_type, props)
    }
}

// DSL instruction handler (simplified)
pub fn parse_dsl() -> Vec<String> {
    let mut node = Node::new("note", "text");
    node.set("content", json!("✎ Edit me inline"));
    node.set("editable", json!(true));
    node.set("draggable", json!(true));
    node.set("left", json!(88));
    node.set("top", json!(88));
    node.set("style", json!({ "font_size": 20, "color": "blue" }));
    vec![node.to_js()]
}
```

---

## Backend Method for Heavy Processing

```rust
pub fn process_data(data: HashMap<String, serde_json::Value>) -> String {
    let name = data.get("name").unwrap_or(&json!("unknown"));
    let age = data.get("age").unwrap_or(&json!(0));
    format!("Processed user {} aged {}", name, age)
}
```

<!-- This backend module can be imported and exposed via `tauri.conf.json` to allow communication from the DSL/frontend.-->

# JavaScript Output from DSL Parser (Full UI Interaction)

This file contains the full JavaScript auto-generated by the DSL-to-JS Rust parser.
It includes:

* Creation of a `div` for text with `contenteditable`
* Drag and drop
* Keyboard event capture
* Dynamic style application
* A simulated `.highlight()` method

```js
// dsl_generated.js — Auto-generated from DSL parser in Rust

function createNode(id, type, props) {
  const el = document.createElement(type === "text" ? "div" : type);
  el.id = id;

  if (props.content) el.textContent = props.content;
  if (props.editable) el.contentEditable = true;

  el.style.position = "absolute";
  if (props.left !== undefined) el.style.left = props.left + "px";
  if (props.top !== undefined) el.style.top = props.top + "px";

  if (props.style) {
    Object.entries(props.style).forEach(([key, value]) => {
      const cssKey = key.replace(/_/g, "-");
      el.style[cssKey] = typeof value === "number" ? value + "px" : value;
    });
  }

  if (props.draggable) {
    el.draggable = true;
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", id);
    });
  }

  // Add keyboard interaction capture
  el.addEventListener("keydown", (e) => {
    console.log("Key pressed:", e.key);
    if (e.key === "r") el.style.color = "red"; // test behavior
  });

  // Optional: highlight method (simulate DSL-defined method)
  el.highlight = () => {
    el.style.color = "red";
  };

  document.body.appendChild(el);
  return el;
}

// DSL output simulated from Rust
createNode("note", "text", {
  content: "✎ Edit me inline",
  editable: true,
  draggable: true,
  left: 88,
  top: 88,
  style: {
    font_size: 20,
    color: "blue"
  }
});
```

You can embed this file into an HTML file to test behavior directly in the browser.


---

This document serves as a guide for engineers or development teams to implement the full solution described.
