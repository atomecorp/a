// Import de la classe Slider paramétrée

// Create a new A instance with custom properties
const html_container = new A({
    attach: 'body',
    id: 'main_html_container',
    markup: 'span',
    role: 'container',
    x: 150,
    y: 50,
    width: 400,
    height: 300,
    color: 'orange',
    display: 'block',
    backgroundColor: 'orange',
    smooth: 10,
    shadow: [
        {blur: 3, x: 4, y: 8, color: {red: 0, green: 0, blue: 0, alpha: 0.6}, invert: true},
        {blur: 12, x: 0, y: 0, color: {red: 0, green: 0.5, blue: 0, alpha: 0.6}, invert: false}
    ],
    overflow: 'hidden',
    fasten: [] // will contain the IDs of children
});

puts(html_container)
puts(html_container.width)
puts(html_container.html_object)

setTimeout(() => {
    html_container.display('none')

    console.log("Delayed for 2 second.");
    html_container.width(800)
    // html_container.left('800px');
    html_container.html_object.style.left = '600px';
    puts ('----------')
    puts(html_container.particles );
    puts ('----------')

    const element = document.getElementById("main_html_container");

    // Change the left position (in pixels)
    let element2 = grab('main_html_container');
    console.log(html_container === element2)
    element2.height(12);
    element2.style.top = '290px'
    puts(">>> " + element2.style.top)
    html_container.style.left = "50px";
}, 2000);
wait(2000, () => {
    console.log("This message is displayed after a 2-second delay.");
});

const element = grab('main_html_container');

if (element) {
    console.log('Element found:', element);
    element.width(50); // Change the width of the element
    element.style.backgroundColor = 'blue'; // Change the background color
} else {
    console.error('Element not found');
}

puts ('Element ID:is ...');

// // Short alias for document
const d = document;

// Create and append an H1 and a div dynamically
const div = Object.assign(d.body, {
    append: Object.assign(d.createElement('h1'), {
        textContent: 'Page generated in pure JS',
        style: { textAlign: 'center' }
    })
}).appendChild(d.createElement('div'));

// Style the created div
Object.assign(div.style, {
    width: '200px', height: '200px', backgroundColor: 'red', color: 'white',
    display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer',
    margin: '50px auto', padding: '20px', textAlign: 'center', borderRadius: '10px',
    transition: 'background-color 0.3s'
});

div.textContent = 'Click me to change color';
div.onclick = () => div.style.backgroundColor = div.style.backgroundColor === 'red' ? 'green' : 'red';

// Create another container
const container2 = new A({
    attach: 'body',
    id: 'main_container2',
    markup: 'div',
    type: 'container',
    x: 50,
    y: 50,
    width: 400,
    height: 300,
    backgroundColor: '#f5f5f5',
    smooth: 10,
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
    overflow: 'hidden',
    fasten: [] // Will contain the IDs of children
});

// 2. Create a header inside the container
const header = new A({
    attach: '#main_container', // Attach to the main container
    id: 'header',
    markup: 'div',
    type: 'shape',
    x: 0,
    y: 0,
    width: '100%',
    height: 60,
    backgroundColor: '#4285f4',
    center: false,
    position: 'absolute',
    color: 'white',
    textAlign: 'center',
    lineHeight: '60px',
    fontWeight: 'bold',
    fontSize: 20,
    text: 'A Demo with Children'
});


// 3. Create main content with children using the children property
const content = new A({
    attach: '#main_container',
    id: 'content',
    markup: 'div',
    type: 'content',
    x: 0,
    y: 60,
    width: '100%',
    height: 240,
    padding: 15,
    position: 'relative',
    children: [
        // Child 1: Red box
        {
            id: 'red_box',
            markup: 'div',
            type: 'shape',
            x: 20,
            y: 20,
            width: 100,
            height: 100,
            backgroundColor: 'red',
            smooth: 15,
            events: {
                click: (e) => {
                    console.log('Red box clicked!');
                }
            }
        },
        // Child 2: Blue box
        {
            id: 'blue_box',
            markup: 'div',
            type: 'shape',
            x: 150,
            y: 20,
            width: 100,
            height: 100,
            backgroundColor: 'blue',
            smooth: 15,
            color: 'white',
            textAlign: 'center',
            lineHeight: '100px',
            text: 'Blue'
        },
        // Child 3: Green circle
        {
            id: 'green_circle',
            markup: 'div',
            type: 'shape',
            x: 280,
            y: 20,
            width: 100,
            height: 100,
            backgroundColor: 'green',
            smooth: '50%', // Perfect circle
            color: 'white',
            textAlign: 'center',
            lineHeight: '100px',
            text: 'Circle'
        }
    ],
    fasten: [] // Will be auto-filled with child IDs
});

const container = new A({
    attach: 'body',
    id: 'main_html_container',
    markup: 'span',
    role: 'container',
    x: 550,
    y: 50,
    width: 400,
    height: 300,
    color: 'orange',
    backgroundColor: 'orange',
    display: 'block',
    smooth: 10,
    shadow: [
        {blur: 3, x: 4, y: 8, color: {red: 0, green: 0, blue: 0, alpha: 0.6}, invert: true},
        {blur: 12, x: 0, y: 0, color: {red: 0, green: 0.5, blue: 0, alpha: 0.6}, invert: false}
    ],
    overflow: 'hidden',
    fasten: [] // will contain the IDs of children
});

setTimeout(() => {
    // Show the main container after 2 seconds
    container.display('block');
container.style.width = '800px';
 container.style.left = '800px';
}, 3000);







// Simple example of using fasten property
const simpleExample = new A({
    attach: 'body',
    id: 'parent_box',
    markup: 'div',
    type: 'container',
    x: 500,
    y: 50,
    width: 200,
    height: 200,
    backgroundColor: '#333',
    smooth: 10,
    // Directly define IDs of children to attach
    fasten: ['child_box1', 'child_box2']
});

// Create corresponding children
const child1 = new A({
    attach: '#parent_box',
    id: 'child_box1',
    markup: 'div',
    type: 'shape',
    x: 20,
    y: 20,
    width: 80,
    height: 80,
    backgroundColor: 'yellow',
    smooth: 10
});

// Safe DOM access if needed
const resultElement = document.getElementById("resultat")
if (resultElement) {
    resultElement.textContent = `Result is: ${resultat}`
}

/// pure js syntax
setTimeout(() => {
    console.log("Processing completed after delay")
}, 3000)

function addition(a, b) {
    return a + b;
}

// Example usage
const resultat_o = addition(3, 6);
console.log("second result is :", resultat_o); // Logs: Result: 8

// // Export for ES6 modules
export default {};




const html_container2 = new A({
    attach: 'body',
    id: 'main_html_container',
    markup: 'span',
    role: 'container',
    x: 150,
    y: 50,
    width: 400,
    height: 300,
    color: 'orange',
    display: 'block',
    smooth: 10,
    shadow: [
        {blur: 3, x: 4, y: 8, color: {red: 0, green: 0, blue: 0, alpha: 0.6}, invert: true},
        {blur: 12, x: 0, y: 0, color: {red: 0, green: 0.5, blue: 0, alpha: 0.6}, invert: false}
    ],
    overflow: 'hidden',
    fasten: [] // will contain the IDs of children
});

// 
// 
// 
// Create a new A instance with custom properties
new A({
  attach: 'body',
  id: 'view',
  markup: 'div',
  role: 'container',
  text: 'Hello World',
  fontSize: 20,
  fontWeight: 'bold',
  textAlign: 'center',
  backgroundColor: 'red',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  unit: {
    width: '%',
    height: '%',
  },
  color: { red: 0.15, green: 0.15, blue: 0.15, alpha: 1 },
  display: 'block',
  overflow: 'hidden',
});

