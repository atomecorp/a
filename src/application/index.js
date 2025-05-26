// Create a new A instance with custom properties
const container = new A({
    attach: 'body',
    id: 'main_container',
    markup: 'span',
    role: 'container',
    x: 150,
    y: 50,
    width: 400,
    contenteditable: true,
    text: 'Hello, this is a container with custom properties!',
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

// Option A : Via la particle auto-générée
container.attrContenteditable(true);

// Option B : Ajoutez attr() à grab dans utils.js
// grab("main_container").element.setAttribute("contenteditable", "true");

// Option C : Direct DOM
// document.getElementById("main_container").contentEditable = true;

//
// puts(container)
// puts(container.width)
// puts(container.element)
//
// setTimeout(() => {
//   container.display('888px')
//
//   console.log("Delayed for 2 second.");
//   container.width(800)
//   const element = document.getElementById("main_container");
//
//   // Change the left position (in pixels)
//   let element2 = grab('main_container');
//   console.log(container === element2)
//   element2.height(12);
//   element2.style.top = '290px'
//   // puts(">>> " + element2.style.top)
//   container.style.left = "50px";
// }, 2000);
//
// // Short alias for document
// const d = document;
//
// // Create and append an H1 and a div dynamically
// const div = Object.assign(d.body, {
//   append: Object.assign(d.createElement('h1'), {
//     textContent: 'Page generated in pure JS',
//     style: { textAlign: 'center' }
//   })
// }).appendChild(d.createElement('div'));
//
// // Style the created div
// Object.assign(div.style, {
//   width: '200px', height: '200px', backgroundColor: 'red', color: 'white',
//   display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer',
//   margin: '50px auto', padding: '20px', textAlign: 'center', borderRadius: '10px',
//   transition: 'background-color 0.3s'
// });
//
// div.textContent = 'Click me to change color';
// div.onclick = () => div.style.backgroundColor = div.style.backgroundColor === 'red' ? 'green' : 'red';
//
// // Create another container
// const container2 = new A({
//   attach: 'body',
//   id: 'main_container2',
//   markup: 'div',
//   type: 'container',
//   x: 50,
//   y: 50,
//   width: 400,
//   height: 300,
//   backgroundColor: '#f5f5f5',
//   smooth: 10,
//   boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
//   overflow: 'hidden',
//   fasten: [] // Will contain the IDs of children
// });
//
// // 2. Create a header inside the container
// const header = new A({
//   attach: '#main_container', // Attach to the main container
//   id: 'header',
//   markup: 'div',
//   type: 'shape',
//   x: 0,
//   y: 0,
//   width: '100%',
//   height: 60,
//   backgroundColor: '#4285f4',
//   center: false,
//   position: 'absolute',
//   color: 'white',
//   textAlign: 'center',
//   lineHeight: '60px',
//   fontWeight: 'bold',
//   fontSize: 20,
//   text: 'A Demo with Children'
// });
//
// // Update fasten list for the container
// container._fastened.push('header');
// container.element.dataset.fasten = container._fastened.join(',');
//
// // 3. Create main content with children using the children property
// const content = new A({
//   attach: '#main_container',
//   id: 'content',
//   markup: 'div',
//   type: 'content',
//   x: 0,
//   y: 60,
//   width: '100%',
//   height: 240,
//   padding: 15,
//   position: 'relative',
//   children: [
//     // Child 1: Red box
//     {
//       id: 'red_box',
//       markup: 'div',
//       type: 'shape',
//       x: 20,
//       y: 20,
//       width: 100,
//       height: 100,
//       backgroundColor: 'red',
//       smooth: 15,
//       events: {
//         click: (e) => {
//           console.log('Red box clicked!');
//         }
//       }
//     },
//     // Child 2: Blue box
//     {
//       id: 'blue_box',
//       markup: 'div',
//       type: 'shape',
//       x: 150,
//       y: 20,
//       width: 100,
//       height: 100,
//       backgroundColor: 'blue',
//       smooth: 15,
//       color: 'white',
//       textAlign: 'center',
//       lineHeight: '100px',
//       text: 'Blue'
//     },
//     // Child 3: Green circle
//     {
//       id: 'green_circle',
//       markup: 'div',
//       type: 'shape',
//       x: 280,
//       y: 20,
//       width: 100,
//       height: 100,
//       backgroundColor: 'green',
//       smooth: '50%', // Perfect circle
//       color: 'white',
//       textAlign: 'center',
//       lineHeight: '100px',
//       text: 'Circle'
//     }
//   ],
//   fasten: [] // Will be auto-filled with child IDs
// });
//
// // Update fasten for the main container
// container._fastened.push('content');
// container.element.dataset.fasten = container._fastened.join(',');
//
// // 4. Dynamically create and add a new child to content
// const infoButton = content.addChild({
//   id: 'info_button',
//   markup: 'div',
//   type: 'button',
//   x: 140,
//   y: 150,
//   width: 120,
//   height: 40,
//   backgroundColor: '#ffa000',
//   smooth: 20,
//   textAlign: 'center',
//   lineHeight: '40px',
//   color: 'white',
//   fontWeight: 'bold',
//   text: 'Info',
//   cursor: 'pointer',
//   events: {
//     click: () => {
//       // Get all children of content
//       const children = content.getFastened();
//       console.log(`There are ${children.length} children in content`);
//     }
//   }
// });
//
// // 5. Example of animation on an element with fasten update
// const greenCircle = A.getById('green_circle');
// if (greenCircle) {
//   greenCircle.element.addEventListener('click', function () {
//     const popup = new A({
//       attach: '#content',
//       id: 'popup',
//       markup: 'div',
//       type: 'popup',
//       x: 80,
//       y: 80,
//       width: 0,
//       height: 0,
//       backgroundColor: 'rgba(0,0,0,0.7)',
//       smooth: 10,
//       color: 'white',
//       textAlign: 'center',
//       lineHeight: '140px',
//       opacity: 0,
//       text: 'Animation in progress!',
//       zIndex: 100,
//       animate: {
//         duration: 0.5,
//         easing: 'ease-out',
//         properties: {
//           width: 240,
//           height: 140,
//           opacity: 1
//         }
//       },
//       events: {
//         click: function () {
//           // Exit animation
//           this.style.transition = 'all 0.3s ease-in';
//           this.style.opacity = '0';
//           this.style.transform = 'scale(0.5)';
//           setTimeout(() => {
//             this.parentNode.removeChild(this);
//             // Update fasten
//             content._fastened = content._fastened.filter(id => id !== 'popup');
//             content.element.dataset.fasten = content._fastened.join(',');
//           }, 300);
//         }
//       }
//     });
//
//     // Update fasten list for content
//     content._fastened.push('popup');
//     content.element.dataset.fasten = content._fastened.join(',');
//   });
// }
//
// // Simple example of using fasten property
// const simpleExample = new A({
//   attach: 'body',
//   id: 'parent_box',
//   markup: 'div',
//   type: 'container',
//   x: 500,
//   y: 50,
//   width: 200,
//   height: 200,
//   backgroundColor: '#333',
//   smooth: 10,
//   // Directly define IDs of children to attach
//   fasten: ['child_box1', 'child_box2']
// });
//
// // Create corresponding children
// const child1 = new A({
//   attach: '#parent_box',
//   id: 'child_box1',
//   markup: 'div',
//   type: 'shape',
//   x: 20,
//   y: 20,
//   width: 80,
//   height: 80,
//   backgroundColor: 'yellow',
//   smooth: 10
// });
//
// // Safe DOM access if needed
// const resultElement = document.getElementById("resultat")
// if (resultElement) {
//   resultElement.textContent = `Result is: ${resultat}`
// }
//
// /// pure js syntax
// setTimeout(() => {
//   console.log("Processing completed after delay")
// }, 3000)
//
// function addition(a, b) {
//   return a + b;
// }
//
// // Example usage
// const resultat_o = addition(3, 6);
// console.log("second result is :", resultat_o); // Logs: Result: 8