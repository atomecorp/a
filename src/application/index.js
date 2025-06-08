// Import de la classe Slider paramétrée
import Slider from '../a/components/Slider.js';

// // Create a new A instance with custom properties
// const html_container = new A({
//     attach: 'body',
//     id: 'main_html_container',
//     markup: 'span',
//     role: 'container',
//     x: 150,
//     y: 50,
//     width: 400,
//     height: 300,
//     color: 'orange',
//     display: 'block',
//     smooth: 10,
//     shadow: [
//         {blur: 3, x: 4, y: 8, color: {red: 0, green: 0, blue: 0, alpha: 0.6}, invert: true},
//         {blur: 12, x: 0, y: 0, color: {red: 0, green: 0.5, blue: 0, alpha: 0.6}, invert: false}
//     ],
//     overflow: 'hidden',
//     fasten: [] // will contain the IDs of children
// });

// puts(html_container)
// puts(html_container.width)
// puts(html_container.html_object)

// setTimeout(() => {
//     // html_container.display('none')

//     console.log("Delayed for 2 second.");
//     html_container.width(800)
//     // html_container.left('800px');
//     html_container.html_object.style.left = '600px';
//     puts ('----------')
//     puts(html_container.particles );
//     puts ('----------')

//     const element = document.getElementById("main_html_container");

//     // Change the left position (in pixels)
//     let element2 = grab('main_html_container');
//     console.log(html_container === element2)
//     element2.height(12);
//     element2.style.top = '290px'
//     puts(">>> " + element2.style.top)
//     html_container.style.left = "50px";
// }, 2000);
// wait(2000, () => {
//     console.log("This message is displayed after a 2-second delay.");
// });

// const element = grab('main_html_container');

// if (element) {
//     console.log('Element found:', element);
//     element.width(50); // Change the width of the element
//     element.style.backgroundColor = 'blue'; // Change the background color
// } else {
//     console.error('Element not found');
// }

// puts ('Element ID:is ...');

// // // Short alias for document
// const d = document;

// // Create and append an H1 and a div dynamically
// const div = Object.assign(d.body, {
//     append: Object.assign(d.createElement('h1'), {
//         textContent: 'Page generated in pure JS',
//         style: { textAlign: 'center' }
//     })
// }).appendChild(d.createElement('div'));

// // Style the created div
// Object.assign(div.style, {
//     width: '200px', height: '200px', backgroundColor: 'red', color: 'white',
//     display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer',
//     margin: '50px auto', padding: '20px', textAlign: 'center', borderRadius: '10px',
//     transition: 'background-color 0.3s'
// });

// div.textContent = 'Click me to change color';
// div.onclick = () => div.style.backgroundColor = div.style.backgroundColor === 'red' ? 'green' : 'red';

// // Create another container
// const container2 = new A({
//     attach: 'body',
//     id: 'main_container2',
//     markup: 'div',
//     type: 'container',
//     x: 50,
//     y: 50,
//     width: 400,
//     height: 300,
//     backgroundColor: '#f5f5f5',
//     smooth: 10,
//     boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
//     overflow: 'hidden',
//     fasten: [] // Will contain the IDs of children
// });

// // 2. Create a header inside the container
// const header = new A({
//     attach: '#main_container', // Attach to the main container
//     id: 'header',
//     markup: 'div',
//     type: 'shape',
//     x: 0,
//     y: 0,
//     width: '100%',
//     height: 60,
//     backgroundColor: '#4285f4',
//     center: false,
//     position: 'absolute',
//     color: 'white',
//     textAlign: 'center',
//     lineHeight: '60px',
//     fontWeight: 'bold',
//     fontSize: 20,
//     text: 'A Demo with Children'
// });


// // 3. Create main content with children using the children property
// const content = new A({
//     attach: '#main_container',
//     id: 'content',
//     markup: 'div',
//     type: 'content',
//     x: 0,
//     y: 60,
//     width: '100%',
//     height: 240,
//     padding: 15,
//     position: 'relative',
//     children: [
//         // Child 1: Red box
//         {
//             id: 'red_box',
//             markup: 'div',
//             type: 'shape',
//             x: 20,
//             y: 20,
//             width: 100,
//             height: 100,
//             backgroundColor: 'red',
//             smooth: 15,
//             events: {
//                 click: (e) => {
//                     console.log('Red box clicked!');
//                 }
//             }
//         },
//         // Child 2: Blue box
//         {
//             id: 'blue_box',
//             markup: 'div',
//             type: 'shape',
//             x: 150,
//             y: 20,
//             width: 100,
//             height: 100,
//             backgroundColor: 'blue',
//             smooth: 15,
//             color: 'white',
//             textAlign: 'center',
//             lineHeight: '100px',
//             text: 'Blue'
//         },
//         // Child 3: Green circle
//         {
//             id: 'green_circle',
//             markup: 'div',
//             type: 'shape',
//             x: 280,
//             y: 20,
//             width: 100,
//             height: 100,
//             backgroundColor: 'green',
//             smooth: '50%', // Perfect circle
//             color: 'white',
//             textAlign: 'center',
//             lineHeight: '100px',
//             text: 'Circle'
//         }
//     ],
//     fasten: [] // Will be auto-filled with child IDs
// });

// const container = new A({
//     attach: 'body',
//     id: 'main_html_container',
//     markup: 'span',
//     role: 'container',
//     x: 550,
//     y: 50,
//     width: 400,
//     height: 300,
//     color: 'orange',
//     display: 'block',
//     smooth: 10,
//     shadow: [
//         {blur: 3, x: 4, y: 8, color: {red: 0, green: 0, blue: 0, alpha: 0.6}, invert: true},
//         {blur: 12, x: 0, y: 0, color: {red: 0, green: 0.5, blue: 0, alpha: 0.6}, invert: false}
//     ],
//     overflow: 'hidden',
//     fasten: [] // will contain the IDs of children
// });




// // Update fasten list for the container
// container._fastened.push('header');
// container.element.dataset.fasten = container._fastened.join(',');

// // Update fasten for the main container
// container._fastened.push('content');
// container.element.dataset.fasten = container._fastened.join(',');

// // 4. Dynamically create and add a new child to content
// const infoButton = content.addChild({
//     id: 'info_button',
//     markup: 'div',
//     type: 'button',
//     x: 140,
//     y: 150,
//     width: 120,
//     height: 40,
//     backgroundColor: '#ffa000',
//     smooth: 20,
//     textAlign: 'center',
//     lineHeight: '40px',
//     color: 'white',
//     fontWeight: 'bold',
//     text: 'Info',
//     cursor: 'pointer',
//     events: {
//         click: () => {
//             // Get all children of content
//             const children = content.getFastened();
//             console.log(`There are ${children.length} children in content`);
//         }
//     }
// });

// // 5. Example of animation on an element with fasten update
// const greenCircle = A.getById('green_circle');
// if (greenCircle) {
//     greenCircle.element.addEventListener('click', function () {
//         const popup = new A({
//             attach: '#content',
//             id: 'popup',
//             markup: 'div',
//             type: 'popup',
//             x: 80,
//             y: 80,
//             width: 0,
//             height: 0,
//             backgroundColor: 'rgba(0,0,0,0.7)',
//             smooth: 10,
//             color: 'white',
//             textAlign: 'center',
//             lineHeight: '140px',
//             opacity: 0,
//             text: 'Animation in progress!',
//             zIndex: 100,
//             animate: {
//                 duration: 0.5,
//                 easing: 'ease-out',
//                 properties: {
//                     width: 240,
//                     height: 140,
//                     opacity: 1
//                 }
//             },
//             events: {
//                 click: function () {
//                     // Exit animation
//                     this.style.transition = 'all 0.3s ease-in';
//                     this.style.opacity = '0';
//                     this.style.transform = 'scale(0.5)';
//                     setTimeout(() => {
//                         this.parentNode.removeChild(this);
//                         // Update fasten
//                         content._fastened = content._fastened.filter(id => id !== 'popup');
//                         content.element.dataset.fasten = content._fastened.join(',');
//                     }, 300);
//                 }
//             }
//         });

//         // Update fasten list for content
//         content._fastened.push('popup');
//         content.element.dataset.fasten = content._fastened.join(',');
//     });
// }

// // Simple example of using fasten property
// const simpleExample = new A({
//     attach: 'body',
//     id: 'parent_box',
//     markup: 'div',
//     type: 'container',
//     x: 500,
//     y: 50,
//     width: 200,
//     height: 200,
//     backgroundColor: '#333',
//     smooth: 10,
//     // Directly define IDs of children to attach
//     fasten: ['child_box1', 'child_box2']
// });

// // Create corresponding children
// const child1 = new A({
//     attach: '#parent_box',
//     id: 'child_box1',
//     markup: 'div',
//     type: 'shape',
//     x: 20,
//     y: 20,
//     width: 80,
//     height: 80,
//     backgroundColor: 'yellow',
//     smooth: 10
// });

// // Safe DOM access if needed
// const resultElement = document.getElementById("resultat")
// if (resultElement) {
//     resultElement.textContent = `Result is: ${resultat}`
// }

// /// pure js syntax
// setTimeout(() => {
//     console.log("Processing completed after delay")
// }, 3000)

// function addition(a, b) {
//     return a + b;
// }

// // Example usage
// const resultat_o = addition(3, 6);
// console.log("second result is :", resultat_o); // Logs: Result: 8

// // Export for ES6 modules
// export default {};




// const html_container = new A({
//     attach: 'body',
//     id: 'main_html_container',
//     markup: 'span',
//     role: 'container',
//     x: 150,
//     y: 50,
//     width: 400,
//     height: 300,
//     color: 'orange',
//     display: 'block',
//     smooth: 10,
//     shadow: [
//         {blur: 3, x: 4, y: 8, color: {red: 0, green: 0, blue: 0, alpha: 0.6}, invert: true},
//         {blur: 12, x: 0, y: 0, color: {red: 0, green: 0.5, blue: 0, alpha: 0.6}, invert: false}
//     ],
//     overflow: 'hidden',
//     fasten: [] // will contain the IDs of children
// });




// // Create a new A instance with custom properties
// new A({
//   attach: 'body',
//   id: 'view',
//   markup: 'div',
//   role: 'container',
//   text: 'Hello World',
//   fontSize: 20,
//   fontWeight: 'bold',
//   textAlign: 'center',
//   backgroundColor: 'red',
//   x: 0,
//   y: 0,
//   width: 100,
//   height: 100,
//   unit: {
//     width: '%',
//     height: '%',
//   },
//   color: { red: 0.15, green: 0.15, blue: 0.15, alpha: 1 },
//   display: 'block',
//   overflow: 'hidden',
// });


// Exemple 1: Slider horizontal classique
const volumeSlider = new Slider({
    attach: 'body',
    id: 'volume_slider',
    orientation: 'horizontal',
    x: 50,
    y: 100,
    width: 400,
    height: 120,
    trackWidth: 360,
    value: 30,
    callbacks: {
        onChange: (value) => console.log(`Volume: ${value}%`),
        onStart: () => console.log('Volume adjustment started'),
        onEnd: () => console.log('Volume adjustment ended')
    }
});

// Exemple 2: Slider vertical avec variation de couleurs
const brightnessSlider = new Slider({
    attach: 'body',
    id: 'brightness_slider',
    orientation: 'vertical',
    x: 500,
    y: 100,
    width: 80,
    height: 300,
    trackWidth: 200,
    trackHeight: 8,
    value: 70,
    colors: {
        container: '#ffffff',
        track: '#dee2e6',
        text: '#424242'
    },
    variation: [
        { color: '#0099ff', position: { x: '0%' } },    // Froid (bleu)
        { color: '#00ff99', position: { x: '30%' } },   // Frais (vert)
        { color: '#ffff00', position: { x: '60%' } },   // Tiède (jaune)
        { color: '#ff6600', position: { x: '80%' } },   // Chaud (orange)
        { color: '#ff0000', position: { x: '100%' } }   // Très chaud (rouge)
    ],
    callbacks: {
        onChange: (value) => console.log(`Brightness: ${value}%`)
    }
});

// Exemple 3: Slider de température avec variation de couleurs
const tempSlider = new Slider({
    attach: 'body',
    id: 'temperature_slider',
    orientation: 'horizontal',
    x: 50,
    y: 300,
    width: 350,
    height: 100,
    trackWidth: 300,
    trackHeight: 12,
    value: 21,
    min: -10,
    max: 40,
    step: 0.5,
    theme: 'material',
    variation: [
        { color: 'red', position: { x: '0%' } },    // Froid (bleu)
        { color: 'yellow', position: { x: '30%' } },   // Frais (vert)
        { color: 'green', position: { x: '60%' } },   // Tiède (jaune)
        { color: 'black', position: { x: '80%' } },   // Chaud (orange)
        { color: 'white', position: { x: '100%' } }   // Très chaud (rouge)
    ],
    callbacks: {
        onChange: (value) => {
            console.log(`Temperature: ${value}°C`);
        }
    }
});

// Exemple 4: Slider de volume avec design flat
const bassSlider = new Slider({
    attach: 'body',
    id: 'bass_slider',
    orientation: 'horizontal',
    x: 50,
    y: 450,
    width: 250,
    height: 80,
    trackWidth: 200,
    trackHeight: 4,
    thumbSize: 20,
    value: 50,
    min: 0,
    max: 100,
    step: 5,
    theme: 'flat',
    colors: {
        container: '#2c3e50',
        track: '#34495e',
        progress: '#e74c3c',
        thumb: '#c0392b',
        text: '#ecf0f1'
    },
    animations: {
        enabled: true,
        duration: 0.3,
        easing: 'ease-out'
    }
});

console.log('🎚️ Sliders paramétriques créés avec succès!');

// Exemple 5: Slider avec variation de couleurs avancée
const radialSlider = new Slider({
    attach: 'body',
    id: 'radial_gradient_slider',
    orientation: 'horizontal',
    x: 350,
    y: 450,
    width: 300,
    height: 100,
    trackWidth: 250,
    trackHeight: 10,
    thumbSize: 26,
    value: 60,
    min: 0,
    max: 100,
    step: 2,
    theme: 'material',
    colors: {
        container: '#ffffff',
        track: '#f0f0f0',
        text: '#424242'
    },
    variation: [
        { color: '#6200ea', position: { x: '0%' } },
        { color: '#3700b3', position: { x: '50%' } },
        { color: '#03dac6', position: { x: '100%' } }
    ],
    animations: {
        enabled: true,
        duration: 0.15,
        easing: 'cubic-bezier(0.4, 0.0, 0.2, 1)'
    },
    callbacks: {
        onChange: (value) => {
            console.log(`🌀 Radial Effect: ${value}%`);
        },
        onStart: () => console.log('🎯 Radial adjustment started'),
        onEnd: () => console.log('✅ Radial adjustment completed')
    }
});

// Test de mise à jour programmée des valeurs
setTimeout(() => {
    console.log('📊 Test de mise à jour programmée des sliders...');
    
    // Changer la valeur du volume
    if (volumeSlider.setValue) {
        volumeSlider.setValue(85);
        console.log('🔊 Volume mis à jour à 85%');
    }
    
    // Changer la température
    if (tempSlider.setValue) {
        tempSlider.setValue(25);
        console.log('🌡️ Température mise à jour à 25°C');
    }
    
    // Tester l'effet radial
    if (radialSlider.setValue) {
        radialSlider.setValue(90);
        console.log('🌀 Effet radial mis à jour à 90%');
    }
    
}, 3000);

console.log('🎚️ Sliders paramétriques créés avec succès!');
console.log('📋 Types de sliders disponibles:');
console.log('   - Slider horizontal classique (Volume)');
console.log('   - Slider vertical avec gradient (Brightness)'); 
console.log('   - Slider avec gradient complexe (Temperature)');
console.log('   - Slider avec thème flat (Bass)');
console.log('   - Slider avec gradient radial (Radial Effect)');

// ...existing code...

