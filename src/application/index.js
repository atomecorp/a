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


// Slider 


// ...existing code...

function createSexySlider(options = {}) {
  const {
    attach = 'body',
    id = 'slider_' + Date.now(),
    x = 50,
    y = 50,
    width = 320,
    height = 60,
    min = 0,
    max = 100,
    value = 50,
    color = { red: 0.26, green: 0.52, blue: 0.96, alpha: 1 },
    label = '',
    onChange = () => {}
  } = options;

  let currentValue = value;
  const percentage = ((currentValue - min) / (max - min)) * 100;

  // Container principal avec design moderne
  const sliderContainer = new A({
    attach,
    id: id + '_container',
    markup: 'div',
    role: 'container',
    x,
    y,
    width,
    height,
    backgroundColor: { red: 1, green: 1, blue: 1, alpha: 0.95 },
    smooth: 20,
    padding: 20,
    shadow: [
      { blur: 20, x: 0, y: 10, color: { red: 0, green: 0, blue: 0, alpha: 0.1 }, invert: false },
      { blur: 1, x: 0, y: 1, color: { red: 1, green: 1, blue: 1, alpha: 0.8 }, invert: true }
    ],
    border: '1px solid rgba(230,230,230,0.8)',
    position: 'relative'
  });

  // Label stylé
  if (label) {
    new A({
      attach: '#' + id + '_container',
      id: id + '_label',
      markup: 'div',
      role: 'text',
      x: 0,
      y: 5,
      width: '70%',
      height: 18,
      text: label,
      fontSize: 14,
      fontWeight: '600',
      color: { red: 0.2, green: 0.2, blue: 0.3, alpha: 1 },
      position: 'absolute'
    });

    // Valeur en temps réel
    new A({
      attach: '#' + id + '_container',
      id: id + '_value_display',
      markup: 'div',
      role: 'text',
      x: '70%',
      y: 5,
      width: '30%',
      height: 18,
      text: Math.round(currentValue).toString(),
      fontSize: 16,
      fontWeight: 'bold',
      color: color,
      textAlign: 'right',
      position: 'absolute'
    });
  }

  // Track moderne avec dégradé
  const track = new A({
    attach: '#' + id + '_container',
    id: id + '_track',
    markup: 'div',
    role: 'shape',
    x: 0,
    y: 35,
    width: '100%',
    height: 8,
    backgroundColor: { red: 0.95, green: 0.95, blue: 0.96, alpha: 1 },
    smooth: 25,
    position: 'absolute',
    shadow: [
      { blur: 3, x: 0, y: 1, color: { red: 0, green: 0, blue: 0, alpha: 0.08 }, invert: true }
    ],
    cursor: 'pointer'
  });

  // Progress bar avec dégradé animé
  const progress = new A({
    attach: '#' + id + '_track',
    id: id + '_progress',
    markup: 'div',
    role: 'shape',
    x: 0,
    y: 0,
    width: percentage + '%',
    height: '100%',
    smooth: 25,
    position: 'absolute',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
  });

  // Appliquer le dégradé sur le progress
  const rgbColor = `${Math.round(color.red * 255)}, ${Math.round(color.green * 255)}, ${Math.round(color.blue * 255)}`;
  progress.element.style.background = `linear-gradient(90deg, 
    rgba(${rgbColor}, 0.7) 0%, 
    rgba(${rgbColor}, 1) 50%, 
    rgba(${rgbColor}, 0.9) 100%)`;
  progress.element.style.boxShadow = `0 0 10px rgba(${rgbColor}, 0.4)`;

  // Thumb ultra-moderne
  const thumb = new A({
    attach: '#' + id + '_container',
    id: id + '_thumb',
    markup: 'div',
    role: 'shape',
    x: (percentage / 100) * (width - 40) + 8,
    y: 27,
    width: 24,
    height: 24,
    backgroundColor: { red: 1, green: 1, blue: 1, alpha: 1 },
    smooth: '50%',
    position: 'absolute',
    cursor: 'grab',
    border: `3px solid rgba(${rgbColor}, 1)`,
    shadow: [
      { blur: 8, x: 0, y: 4, color: { red: 0, green: 0, blue: 0, alpha: 0.15 }, invert: false },
      { blur: 0, x: 0, y: 0, color: color, invert: false }
    ],
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    zIndex: 10
  });

  // Glow effect pour le thumb
  thumb.element.style.boxShadow = `
    0 4px 12px rgba(0,0,0,0.15), 
    0 0 0 4px rgba(${rgbColor}, 0.1),
    0 0 20px rgba(${rgbColor}, 0.3)
  `;

  let isDragging = false;

  // Fonction de mise à jour améliorée
  function updateValue(newValue) {
    currentValue = Math.max(min, Math.min(max, Math.round(newValue)));
    const newPercentage = ((currentValue - min) / (max - min)) * 100;
    
    // Animation fluide du thumb
    const newThumbX = (newPercentage / 100) * (width - 40) + 8;
    thumb.element.style.transform = `translateX(${newThumbX - thumb.x()}px)`;
    thumb.x(newThumbX);
    
    // Animation de la progress bar
    progress.element.style.width = newPercentage + '%';
    
    // Mise à jour de l'affichage de la valeur
    if (label) {
      const valueDisplay = document.getElementById(id + '_value_display');
      if (valueDisplay) {
        valueDisplay.textContent = currentValue.toString();
        // Animation de pulsation pour la valeur
        valueDisplay.style.transform = 'scale(1.1)';
        setTimeout(() => {
          valueDisplay.style.transform = 'scale(1)';
        }, 150);
      }
    }
    
    onChange(currentValue);
  }

  // Gestion des événements améliorée
  function handleInteraction(e) {
    const rect = track.element.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickPercentage = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    const newValue = min + (clickPercentage / 100) * (max - min);
    updateValue(newValue);
  }

  function handleMouseDown(e) {
    isDragging = true;
    thumb.element.style.cursor = 'grabbing';
    thumb.element.style.transform += ' scale(1.1)';
    thumb.element.style.boxShadow = `
      0 6px 16px rgba(0,0,0,0.2), 
      0 0 0 6px rgba(${rgbColor}, 0.15),
      0 0 30px rgba(${rgbColor}, 0.5)
    `;
    
    handleInteraction(e);
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    e.preventDefault();
  }

  function handleMouseMove(e) {
    if (isDragging) {
      handleInteraction(e);
    }
  }

  function handleMouseUp() {
    isDragging = false;
    thumb.element.style.cursor = 'grab';
    thumb.element.style.transform = thumb.element.style.transform.replace(' scale(1.1)', '');
    thumb.element.style.boxShadow = `
      0 4px 12px rgba(0,0,0,0.15), 
      0 0 0 4px rgba(${rgbColor}, 0.1),
      0 0 20px rgba(${rgbColor}, 0.3)
    `;
    
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  // Effets hover
  function handleContainerHover() {
    sliderContainer.element.style.transform = 'translateY(-2px)';
    sliderContainer.element.style.boxShadow = `
      0 25px 40px rgba(0,0,0,0.12),
      0 0 0 1px rgba(${rgbColor}, 0.1)
    `;
  }

  function handleContainerLeave() {
    if (!isDragging) {
      sliderContainer.element.style.transform = 'translateY(0px)';
      sliderContainer.element.style.boxShadow = `
        0 20px 30px rgba(0,0,0,0.1),
        0 1px 3px rgba(255,255,255,0.8) inset
      `;
    }
  }

  // Attacher tous les événements
  thumb.element.addEventListener('mousedown', handleMouseDown);
  track.element.addEventListener('click', handleInteraction);
  sliderContainer.element.addEventListener('mouseenter', handleContainerHover);
  sliderContainer.element.addEventListener('mouseleave', handleContainerLeave);

  // Animation d'entrée
  sliderContainer.element.style.opacity = '0';
  sliderContainer.element.style.transform = 'translateY(20px)';
  setTimeout(() => {
    sliderContainer.element.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
    sliderContainer.element.style.opacity = '1';
    sliderContainer.element.style.transform = 'translateY(0px)';
  }, 100);

  return {
    container: sliderContainer,
    getValue: () => currentValue,
    setValue: updateValue,
    destroy: () => sliderContainer.element.remove()
  };
}

// Exemples avec style amélioré
const volumeSlider = createSexySlider({
  attach: 'body',
  x: 50,
  y: 100,
  width: 320,
  height: 60,
  min: 0,
  max: 100,
  value: 75,
  label: '🔊 Volume',
  color: { red: 0.26, green: 0.52, blue: 0.96, alpha: 1 },
  onChange: (value) => {
    console.log('🔊 Volume:', value + '%');
  }
});

const brightnessSlider = createSexySlider({
  attach: 'body',
  x: 50,
  y: 200,
  width: 320,
  height: 60,
  min: 0,
  max: 100,
  value: 60,
  label: '☀️ Luminosité',
  color: { red: 1, green: 0.65, blue: 0.0, alpha: 1 },
  onChange: (value) => {
    console.log('☀️ Brightness:', value + '%');
  }
});

const temperatureSlider = createSexySlider({
  attach: 'body',
  x: 50,
  y: 300,
  width: 320,
  height: 60,
  min: 15,
  max: 30,
  value: 22,
  label: '🌡️ Température',
  color: { red: 0.2, green: 0.8, blue: 0.4, alpha: 1 },
  onChange: (value) => {
    console.log('🌡️ Temperature:', value + '°C');
  }
});