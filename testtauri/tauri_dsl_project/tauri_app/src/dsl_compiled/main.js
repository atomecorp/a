
// Generated from main.dsl by DSL compiler
console.log("DSL file processed: main.dsl");

// DOM manipulation to show it works
document.addEventListener('DOMContentLoaded', () => {
    console.log("DSL script running");
    const dslOutput = document.getElementById('dsl-output');
    if (dslOutput) {
        dslOutput.innerHTML += '<h3>DSL Compiler Test Successful!</h3>';
        dslOutput.innerHTML += '<div>Original DSL code:</div>';
        dslOutput.innerHTML += '<pre>' + `# Sample DSL File
# This demonstrates the basic syntax of our DSL language

object UIElement {
  hash properties

  define_method set(key, value) {
    this.properties.set(key, value)
  }

  define_method get(key) {
    return this.properties.get(key)
  }
}

a = UIElement.new()
a.set("color", "blue")
a.set("position", { x: 100, y: 50 })

b = UIElement.new()
b.set("color", "red")
b.set("position", { x: 200, y: 100 })

print(a.get("color"))  # would output: blue
` + '</pre>';
    } else {
        console.error("Could not find #dsl-output element");
    }
});