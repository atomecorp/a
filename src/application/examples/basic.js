
// // 1 - standard version
// const A = p => {
//   const el = document.createElement(p.markup || 'div');
//   const styles = [];
  
//   for (const [k, v] of Object.entries(p)) {
//     if (k === 'attach' || k === 'markup') continue;
    
//     if (k === 'id') el.id = v;
//     else if (k === 'text') el.textContent = v;
//     else if (k === 'backgroundcolor') styles.push(`background-color:${v}`);
//     else if (k in el.style) styles.push(`${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v}`);
//     else el.setAttribute(k, v);
//   }
  
//   // Une seule assignation CSS
//   if (styles.length) el.style.cssText = styles.join(';');
  
//   (p.attach === 'body' ? body : document.querySelector(p.attach) || body).appendChild(el);
//   return el;
// };

// // Test avec vos nouveaux attributs
// const html_container = A({
//   attach: 'body',
//   id: 'main_html_container',
//   position: 'absolute',
//   text: 'This is a main HTML container',
//   left: "56px",
//   top: "120px",
//   width: '333px',
//   height: '234px',
//   color: 'white',
//   backgroundcolor: 'rgba(255, 0, 255, 0.8)',
//   overflow: 'hidden',
//   filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))',
//   draggable: true
// });

// html_container.style.left = '356px';




// /// 2  version WebComponents

// class AElement extends HTMLElement {
//   connectedCallback() {
//     const styles = [];
    
//     for (const {name, value} of this.attributes) {
//       if (name === 'text') this.textContent = value;
//       else if (name === 'backgroundcolor') styles.push(`background-color:${value}`);
//       else if (name in this.style) styles.push(`${name.replace(/([A-Z])/g, '-$1').toLowerCase()}:${value}`);
//     }
    
//     if (styles.length) this.style.cssText = styles.join(';');
//   }
// }

// // Enregistrement du Web Component
// customElements.define('a-element', AElement);

// // Factory qui crée le Web Component
// const A = p => {
//   const el = document.createElement('a-element');
  
//   for (const [k, v] of Object.entries(p)) {
//     if (k === 'attach') continue;
//     el.setAttribute(k, v);
//   }
  
//   (p.attach === 'body' ? document.body : document.querySelector(p.attach) || document.body).appendChild(el);
//   return el;
// };

// // Usage - crée maintenant un VRAI Web Component
// const html_container = A({
//   attach: 'body',
//   id: 'main_html_container',
//   position: 'absolute',
//   text: 'This is a main HTML container',
//   left: "56px",
//   top: "120px",
//   width: '333px',
//   height: '234px',
//   color: 'white',
//   backgroundcolor: 'rgba(255, 0, 255, 0.8)',
//   overflow: 'hidden',
//   filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))',
//   draggable: true
// });

// console.log(html_container.tagName); // "A-ELEMENT" = Web Component
// html_container.style.left = '356px';




// // 3 version external function to convert custom syntax to standard syntax for Web Components

// function convertToWebComponentProps(props) {
//   const { attach, markup, ...rest } = props;
//   const converted = {};
  
//   for (const [key, value] of Object.entries(rest)) {
//     if (key === 'backgroundcolor' || key === 'backgroundColor') {
//       converted['background-color'] = value;
//     } else if (key in document.createElement('div').style) {
//       // Convertir camelCase → kebab-case
//       converted[key.replace(/([A-Z])/g, '-$1').toLowerCase()] = value;
//     } else {
//       converted[key] = value;
//     }
//   }
  
//   return { converted, attach };
// }

// // Web Component ultra-simple
// class AElement extends HTMLElement {
//   connectedCallback() {
//     const styles = [];
    
//     for (const {name, value} of this.attributes) {
//       if (name === 'text') {
//         this.textContent = value;
//       } else if (name.includes('-') || name in this.style) {
//         styles.push(`${name}:${value}`);
//       }
//     }
    
//     if (styles.length) this.style.cssText = styles.join(';');
//   }
// }

// customElements.define('a-element', AElement);

// // Factory utilisant le convertisseur
// const A = (props) => {
//   const { converted, attach } = convertToWebComponentProps(props);
//   const el = document.createElement('a-element');
  
//   for (const [key, value] of Object.entries(converted)) {
//     el.setAttribute(key, value);
//   }
  
//   (attach === 'body' ? document.body : document.querySelector(attach) || document.body).appendChild(el);
//   return el;
// };

// // Usage identique
// const html_container = A({
//   attach: 'body',
//   id: 'main_html_container',  
//   position: 'absolute',
//   text: 'This is a main HTML container',
//   left: "56px",
//   top: "120px",
//   width: '333px',
//   height: '234px',
//   color: 'white',
//   backgroundColor: 'rgba(255, 0, 255, 0.8)', // Marche avec les deux
//   backgroundcolor: 'rgba(255, 0, 255, 0.8)', // syntaxes
//   overflow: 'hidden',
//   filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))',
//   draggable: true
// });

// html_container.style.left = '356px';