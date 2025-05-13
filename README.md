# Specification for a Hybrid Development System (DSL + Rust + JS)

## Objective

Create a development environment combining the flexibility of a simple, elegant, and practical scripting language, the performance of Rust, and the simplicity of a user interface built in JavaScript.

## Main Components

### 1. **DSL (Domain-Specific Language)**

* **Elegant scripting language**: Inspired by the simplicity and power of dynamic languages, offering advanced features such as:

  * **Simple hash tables**: Intuitive data collections.
  * **Dynamic methods**: Ability to define methods at runtime (`define_method`), check message responses (`respond_to?`), and inspect objects (`inspect`).
  * **Metaprogramming**: Modify the behavior of objects and classes dynamically.

### 2. **JavaScript Generation**

* **DSL Compilation**: Code written in the DSL is automatically translated into pure JavaScript for manipulating the user interface, ensuring maximum responsiveness.

### 3. **Rust Backend**

* **Heavy operations**: Complex operations and intensive computations are handled by Rust modules compiled to native code for optimal performance.
* **API Interface**: An API facilitates communication between the JavaScript frontend and the Rust backend for critical processing.

### 4. **Interoperability**

* **Smooth communication**: A high-performance mechanism exchanges data between JS (UI) and Rust (backend) with minimal latency.
* **Optional WebAssembly**: Possibility to use WebAssembly for Rust parts when needed, while limiting its use to avoid performance loss.

## Summary of Advantages

* **Performance**: Rust handles critical tasks, JavaScript manages the UI—resulting in high overall performance.
* **Flexibility**: The scripting language enables intuitive, powerful code with advanced metaprogramming capabilities.
* **Interoperability**: A performant bridge between frontend and backend leverages each technology’s strengths.

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
#[tauri::command]
pub fn process_data(data: HashMap<String, serde_json::Value>) -> String {
    let name = data.get("name").unwrap_or(&json!("unknown"));
    let age = data.get("age").unwrap_or(&json!(0));
    format!("Processed user {} aged {}", name, age)
}
```

<!-- This backend module can be imported and exposed via `tauri.conf.json` to allow communication from the DSL/frontend.-->

# JavaScript to Call Rust from DSL via Tauri

This file shows how the JavaScript generated from DSL can call Rust backend commands using Tauri’s `invoke` API.

```js
// Example JS call to Rust function `process_data`
async function callRustProcess() {
  const data = {
    name: "John",
    age: 42
  };

  try {
    const result = await window.__TAURI__.invoke("process_data", { data });
    console.log("Rust returned:", result);
  } catch (e) {
    console.error("Rust call failed:", e);
  }
}

// Trigger the call (example)
document.addEventListener("DOMContentLoaded", callRustProcess);
```

> This code assumes `process_data` is registered in your Tauri backend with the `#[tauri::command]` attribute and declared in `tauri.conf.json`.


---

This document serves as a guide for engineers or development teams to implement the full solution described.
