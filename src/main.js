// // // const d = document;
// // //
// // //
// // // const div = Object.assign(d.body, {
// // //   append: Object.assign(d.createElement('h1'), {
// // //     textContent: 'Page générée en JS pur',
// // //     style: { textAlign: 'center' }
// // //   })
// // // }).appendChild(d.createElement('div'));
// // //
// // // Object.assign(div.style, {
// // //   width: '200px', height: '200px', backgroundColor: 'red', color: 'white',
// // //   display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer',
// // //   margin: '50px auto', padding: '20px', textAlign: 'center', borderRadius: '10px',
// // //   transition: 'background-color 0.3s'
// // // });
// // //
// // // div.textContent = 'Click me to change color';
// // // div.onclick = () => div.style.backgroundColor = div.style.backgroundColor === 'red' ? 'green' : 'red';
// //
// //
// //
// // //////
// //
// // document.addEventListener('DOMContentLoaded', () => {
// // // Création d'un hash Ruby-like
// //   const user = AJS.Hash();
// //   user['name'] = 'Jean';
// //   user['age'] = 30;
// //   user['ville'] = 'Clermont-Ferrand';
// //
// //   console.log(user.inspect()); // Affiche: {name: "Jean", age: 30, ville: "Clermont-Ferrand"}
// //
// // // Utilisation de define_method
// //   const person = {};
// //   AJS.extend(person);
// //
// //   person.define_method('sayHello', function() {
// //     console.log(`Bonjour, je m'appelle ${this.name}!`);
// //     return this;
// //   });
// //
// //   person.name = 'Marie';
// //   person.sayHello(); // Affiche: Bonjour, je m'appelle Marie!
// //
// // // Utilisation des méthodes de Hash
// //   user.each((key, value) => {
// //     console.log(`${key}: ${value}`);
// //   });
// //
// //   const selectedUser = user.select((key, value) => {
// //     return key === 'name' || key === 'ville';
// //   });
// //   console.log(selectedUser.inspect()); // Affiche: {name: "Jean", ville: "Clermont-Ferrand"}
// // });
// //
// //
// //
// //
// // //////////////
// // // Exemple d'utilisation :
// // // const exempleJson = {
// // //   nom: 'Alice',
// // //   age: 30,
// // //   profession: 'Ingénieure',
// // // };
// // //
// // // const iterator = new A(exempleJson);
// // //
// // // // Méthode forEach :
// // // iterator.forEach((key, value) => {
// // //   console.log(`${key} : ${value}`);
// // // });
// // //
// // // // Syntaxe for...of :
// // // for (const key of iterator) {
// // //   console.log(`${key} => ${iterator.getValue(key)}`);
// // // }
// //
// //
// // ///////////////////////
// //
// //
// // /////////////////////////
// // // Exemple avancé avec gestion des enfants et fasten
// // // 1. Création d'un conteneur principal
// // const container = new A({
// //   attach: 'body',
// //   id: 'main_container',
// //   markup: 'div',
// //   type: 'container',
// //   x: 50,
// //   y: 50,
// //   width: 400,
// //   height: 300,
// //   backgroundColor: '#f5f5f5',
// //   smooth: 10,
// //   boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
// //   overflow: 'hidden',
// //   fasten: [] // Contiendra les IDs des enfants
// // });
// //
// // // 2. Création d'un en-tête dans le conteneur
// // const header = new A({
// //   attach: '#main_container', // Attache au conteneur principal
// //   id: 'header',
// //   markup: 'div',
// //   type: 'shape',
// //   x: 0,
// //   y: 0,
// //   width: '100%',
// //   height: 60,
// //   backgroundColor: '#4285f4',
// //   center: false,
// //   position: 'absolute',
// //   color: 'white',
// //   textAlign: 'center',
// //   lineHeight: '60px',
// //   fontWeight: 'bold',
// //   fontSize: 20,
// //   text: 'Démo A avec Enfants'
// // });
// //
// // // Mise à jour de fasten pour le conteneur
// // container._fastened.push('header');
// // container.element.dataset.fasten = container._fastened.join(',');
// //
// // // 3. Création du contenu principal avec des enfants à l'aide de la propriété children
// // const content = new A({
// //   attach: '#main_container',
// //   id: 'content',
// //   markup: 'div',
// //   type: 'content',
// //   x: 0,
// //   y: 60,
// //   width: '100%',
// //   height: 240,
// //   padding: 15,
// //   position: 'relative',
// //   children: [
// //     // Enfant 1: Boîte rouge
// //     {
// //       id: 'red_box',
// //       markup: 'div',
// //       type: 'shape',
// //       x: 20,
// //       y: 20,
// //       width: 100,
// //       height: 100,
// //       backgroundColor: 'red',
// //       smooth: 15,
// //       events: {
// //         click: (e) => {
// //           console.log('Boîte rouge cliquée!');
// //         }
// //       }
// //     },
// //     // Enfant 2: Boîte bleue
// //     {
// //       id: 'blue_box',
// //       markup: 'div',
// //       type: 'shape',
// //       x: 150,
// //       y: 20,
// //       width: 100,
// //       height: 100,
// //       backgroundColor: 'blue',
// //       smooth: 15,
// //       color: 'white',
// //       textAlign: 'center',
// //       lineHeight: '100px',
// //       text: 'Bleu'
// //     },
// //     // Enfant 3: Cercle vert
// //     {
// //       id: 'green_circle',
// //       markup: 'div',
// //       type: 'shape',
// //       x: 280,
// //       y: 20,
// //       width: 100,
// //       height: 100,
// //       backgroundColor: 'green',
// //       smooth: '50%', // Cercle parfait
// //       color: 'white',
// //       textAlign: 'center',
// //       lineHeight: '100px',
// //       text: 'Cercle'
// //     }
// //   ],
// //   fasten: [] // Sera automatiquement rempli par les IDs des enfants
// // });
// //
// // // Mise à jour de fasten pour le conteneur principal
// // container._fastened.push('content');
// // container.element.dataset.fasten = container._fastened.join(',');
// //
// // // 4. Créer et ajouter dynamiquement un nouvel enfant au contenu
// // const infoButton = content.addChild({
// //   id: 'info_button',
// //   markup: 'div',
// //   type: 'button',
// //   x: 140,
// //   y: 150,
// //   width: 120,
// //   height: 40,
// //   backgroundColor: '#ffa000',
// //   smooth: 20,
// //   textAlign: 'center',
// //   lineHeight: '40px',
// //   color: 'white',
// //   fontWeight: 'bold',
// //   text: 'Info',
// //   cursor: 'pointer',
// //   events: {
// //     click: () => {
// //       // Récupérer tous les enfants du content
// //       const children = content.getFastened();
// //       console.log(`Il y a ${children.length} enfants dans le contenu`);
// //     }
// //   }
// // });
// //
// // // Vérification du résultat
// // console.log('Container fasten:', container._fastened); // Devrait afficher ['header', 'content']
// // console.log('Content fasten:', content._fastened);    // Devrait afficher ['red_box', 'blue_box', 'green_circle', 'info_button']
// //
// // // 5. Exemple d'animation sur un élément avec mise à jour de fasten
// // const greenCircle = A.getById('green_circle');
// // if (greenCircle) {
// //   greenCircle.element.addEventListener('click', function() {
// //     const popup = new A({
// //       attach: '#content',
// //       id: 'popup',
// //       markup: 'div',
// //       type: 'popup',
// //       x: 80,
// //       y: 80,
// //       width: 0,
// //       height: 0,
// //       backgroundColor: 'rgba(0,0,0,0.7)',
// //       smooth: 10,
// //       color: 'white',
// //       textAlign: 'center',
// //       lineHeight: '140px',
// //       opacity: 0,
// //       text: 'Animation en cours !',
// //       zIndex: 100,
// //       animate: {
// //         duration: 0.5,
// //         easing: 'ease-out',
// //         properties: {
// //           width: 240,
// //           height: 140,
// //           opacity: 1
// //         }
// //       },
// //       events: {
// //         click: function() {
// //           // Animation de sortie
// //           this.style.transition = 'all 0.3s ease-in';
// //           this.style.opacity = '0';
// //           this.style.transform = 'scale(0.5)';
// //           setTimeout(() => {
// //             this.parentNode.removeChild(this);
// //             // Mise à jour de fasten
// //             content._fastened = content._fastened.filter(id => id !== 'popup');
// //             content.element.dataset.fasten = content._fastened.join(',');
// //           }, 300);
// //         }
// //       }
// //     });
// //
// //     // Mise à jour de fasten pour le content
// //     content._fastened.push('popup');
// //     content.element.dataset.fasten = content._fastened.join(',');
// //   });
// // }
// //
// // // Exemple simple d'utilisation de la propriété fasten
// // const simpleExample = new A({
// //   attach: 'body',
// //   id: 'parent_box',
// //   markup: 'div',
// //   type: 'container',
// //   x: 500,
// //   y: 50,
// //   width: 200,
// //   height: 200,
// //   backgroundColor: '#333',
// //   smooth: 10,
// //   // Définir directement les IDs des enfants à attacher
// //   fasten: ['child_box1', 'child_box2']
// // });
// //
// // // Création des enfants correspondants
// // const child1 = new A({
// //   attach: '#parent_box',
// //   id: 'child_box1',
// //   markup: 'div',
// //   type: 'shape',
// //   x: 20,
// //   y: 20,
// //   width: 80,
// //   height: 80,
// //   backgroundColor: 'yellow',
// //   smooth: 10
// // });
// //
// // const child2 = new /*
//  * Classe Atome ultra-optimisée pour traiter dynamiquement n'importe quelle propriété d'un objet JSON
//  * - Crée une <div> ou tout autre élément HTML spécifié
//  * - Applique attributs, styles et handlers personnalisés
//  * - Gestion des enfants et relations parent-enfant
//  * - Ouverte à toutes les propriétés JS
//  */
// const A = (() => {
//     // Stockage global des instances A par ID pour les références
//     const atomeRegistry = {};
//
//     // Style de base pour réinitialiser les valeurs par défaut
//     const baseStyles = {
//         margin: '0',
//         padding: '0',
//         boxSizing: 'border-box',
//         display: 'block',
//         position: 'absolute', // Par défaut en position absolue
//         lineHeight: 'normal',
//         fontSize: 'inherit',
//         fontWeight: 'inherit',
//         color: 'inherit',
//         background: 'transparent'
//     };
//
//     // Handlers prédéfinis pour certaines clés
//     const handlers = {
//         id: (el, v, _, __, instance) => {
//             el.id = v;
//             // Enregistrer l'instance dans le registre global pour références ultérieures
//             if (v) {
//                 atomeRegistry[v] = instance;
//             }
//         },
//         class: (el, v) => {
//             const cls = Array.isArray(v) ? v.join(' ') : v;
//             el.className = cls;
//         },
//         markup: (el, v, instance) => {
//             // Si markup est spécifié, on crée un nouvel élément du type demandé
//             if (v && typeof v === 'string') {
//                 const newEl = document.createElement(v);
//                 // Copier les attributs et styles de l'ancien élément
//                 Array.from(el.attributes).forEach(attr => {
//                     newEl.setAttribute(attr.name, attr.value);
//                 });
//                 newEl.style.cssText = el.style.cssText;
//                 // Remplacer l'élément dans l'instance
//                 instance.element = newEl;
//                 return newEl; // Important : retourner le nouvel élément
//             }
//             return el;
//         },
//         type: (el, v) => { el.dataset.type = v; },
//         renderers: (el, v) => {
//             if (Array.isArray(v)) v.forEach(r => el.classList.add(`renderer-${r}`));
//         },
//         apply: (el, v) => {
//             if (Array.isArray(v)) v.forEach(fn => {
//                 if (typeof el[fn] === 'function') el[fn]();
//             });
//         },
//         attach: (el, v) => {
//             let parent;
//             if (typeof v === 'string') {
//                 parent = document.querySelector(v) || document.body;
//             } else if (v instanceof HTMLElement) {
//                 parent = v;
//             } else parent = document.body;
//             parent.appendChild(el);
//         },
//         center: (el, v) => {
//             if (v) {
//                 // Centrer horizontalement tout en respectant la position absolue
//                 el.style.left = '50%';
//                 el.style.transform = 'translateX(-50%)';
//                 // Si on veut aussi centrer verticalement
//                 // el.style.top = '50%';
//                 // el.style.transform = 'translate(-50%, -50%)';
//             }
//         },
//         smooth: (el, v) => {
//             if (typeof v === 'number') {
//                 el.style.borderRadius = `${v}px`;
//             } else if (typeof v === 'string') {
//                 el.style.borderRadius = v;
//             }
//         },
//         unit: (el, v, _, data) => {
//             // Ne fait rien directement, mais sera utilisé par d'autres handlers
//         },
//         innerHTML: (el, v) => {
//             el.innerHTML = v;
//         },
//         text: (el, v) => {
//             el.textContent = v;
//         },
//         // Contrôle si les styles par défaut doivent être appliqués
//         reset: (el, v) => {
//             // Si reset est false, ne pas appliquer les styles de base
//             if (v === false) return;
//
//             // Appliquer les styles de base pour réinitialiser les défauts du navigateur
//             for (const [key, value] of Object.entries(baseStyles)) {
//                 el.style[key] = value;
//             }
//         },
//         // Pour permettre de définir une position relative plutôt qu'absolue
//         position: (el, v) => {
//             el.style.position = v;
//         },
//         // Gestion des origines
//         origin: (el, v) => {
//             if (!v || typeof v !== 'object') return;
//
//             // On stocke l'origine dans les données de l'élément pour référence
//             el.dataset.origin = JSON.stringify(v);
//
//             // Application des ajustements de position si nécessaire
//             // Note: ceci serait mieux géré avec un système complet de positionnement
//         },
//         // Gestion du débordement
//         overflow: (el, v) => {
//             el.style.overflow = v;
//         },
//         // Gestion des objets fastened (rattachés)
//         fasten: (el, v, _, __, instance) => {
//             if (Array.isArray(v)) {
//                 el.dataset.fasten = v.join(',');
//                 // Stocker les IDs des enfants dans l'instance
//                 instance._fastened = v;
//             }
//         },
//         // NOUVEAU - Gestion des éléments enfants
//         children: (el, v, _, __, instance) => {
//             if (!Array.isArray(v) || v.length === 0) return;
//
//             // Tableau pour stocker les IDs des enfants créés
//             const childrenIds = [];
//
//             // Créer chaque enfant et l'attacher à cet élément
//             v.forEach(childConfig => {
//                 // S'assurer que l'enfant est attaché à cet élément
//                 const childAtome = new A({
//                     ...childConfig,
//                     attach: el // Attache l'enfant à cet élément
//                 });
//
//                 // Si l'enfant a un ID, l'ajouter à la liste des enfants
//                 if (childConfig.id) {
//                     childrenIds.push(childConfig.id);
//                 }
//             });
//
//             // Si des enfants ont été créés avec des IDs, les ajouter à fasten
//             if (childrenIds.length > 0) {
//                 // Si fasten existe déjà, fusionner les tableaux
//                 if (instance._fastened && Array.isArray(instance._fastened)) {
//                     instance._fastened = [...new Set([...instance._fastened, ...childrenIds])];
//                     el.dataset.fasten = instance._fastened.join(',');
//                 } else {
//                     instance._fastened = childrenIds;
//                     el.dataset.fasten = childrenIds.join(',');
//                 }
//             }
//         },
//         // NOUVEAU - Gestion des événements
//         events: (el, v) => {
//             if (v && typeof v === 'object') {
//                 for (const [event, handler] of Object.entries(v)) {
//                     if (typeof handler === 'function') {
//                         el.addEventListener(event, handler);
//                     }
//                 }
//             }
//         },
//         // NOUVEAU - Gestion des animations
//         animate: (el, v) => {
//             if (v && typeof v === 'object') {
//                 // Définir les propriétés de transition
//                 const duration = v.duration || 0.3;
//                 const easing = v.easing || 'ease';
//                 const delay = v.delay || 0;
//
//                 el.style.transition = `all ${duration}s ${easing} ${delay}s`;
//
//                 // Appliquer les propriétés après un délai pour permettre à la transition de fonctionner
//                 if (v.properties && typeof v.properties === 'object') {
//                     setTimeout(() => {
//                         for (const [prop, value] of Object.entries(v.properties)) {
//                             el.style[prop] = typeof value === 'number' ? `${value}px` : value;
//                         }
//                     }, 10); // Petit délai pour s'assurer que la transition est activée
//                 }
//             }
//         }
//     };
//
//     // Gestion des propriétés dimensionnelles avec unités
//     const dimensionProps = ['x', 'y', 'width', 'height'];
//     dimensionProps.forEach(prop => {
//         handlers[prop] = (el, value, key, data) => {
//             if (value === undefined || value === null) return;
//
//             // Détermination de l'unité
//             let unit = 'px'; // Unité par défaut
//
//             if (data.unit && data.unit[prop]) {
//                 unit = data.unit[prop];
//             }
//
//             // Mappage des propriétés x/y vers left/top
//             const cssProp = prop === 'x' ? 'left' :
//                 prop === 'y' ? 'top' : prop;
//
//             // Application de la propriété avec son unité
//             el.style[cssProp] = `${value}${unit}`;
//         };
//     });
//
//     // Handler par défaut pour toutes les autres clés
//     function defaultHandler(el, value, key) {
//         if (typeof value === 'number' || typeof value === 'string') {
//             // styles en px si nombre
//             el.style[key] = typeof value === 'number' ? `${value}px` : value;
//         } else if (typeof value === 'boolean') {
//             el.dataset[key] = value;
//         } else if (Array.isArray(value)) {
//             el.dataset[key] = value.join(',');
//         } else if (value instanceof HTMLElement) {
//             el.appendChild(value);
//         } else if (value && typeof value === 'object') {
//             el.dataset[key] = JSON.stringify(value);
//         }
//     }
//
//     return class A {
//         constructor(jsonObject) {
//             if (!jsonObject || typeof jsonObject !== 'object' || Array.isArray(jsonObject)) {
//                 throw new TypeError('Objet JSON invalide (non-null, objet attendu).');
//             }
//             this._data = jsonObject;
//             this.element = document.createElement('div');
//             this._fastened = []; // Liste des éléments rattachés (enfants)
//
//             // Par défaut, appliquer le reset des styles
//             if (this._data.reset !== false) {
//                 for (const [key, value] of Object.entries(baseStyles)) {
//                     this.element.style[key] = value;
//                 }
//             }
//
//             this._process();
//
//             // Intégration automatique si attach est fourni
//             if (this._data.attach && !this.element.parentNode) {
//                 let parent;
//                 const v = this._data.attach;
//                 if (typeof v === 'string') {
//                     parent = document.querySelector(v) || document.body;
//                 } else if (v instanceof HTMLElement) {
//                     parent = v;
//                 } else parent = document.body;
//                 parent.appendChild(this.element);
//             }
//         }
//
//         _process() {
//             let el = this.element;
//             const data = this._data;
//             const fnHandlers = handlers;
//             const fallback = defaultHandler;
//
//             // Traiter markup en premier s'il existe
//             if (data.markup && fnHandlers.markup) {
//                 el = fnHandlers.markup(el, data.markup, this);
//             }
//
//             // Traiter les propriétés height et width prioritairement pour éviter le problème de height: 0
//             if (data.height !== undefined) {
//                 el.style.height = typeof data.height === 'number' ? `${data.height}px` : data.height;
//             }
//             if (data.width !== undefined) {
//                 el.style.width = typeof data.width === 'number' ? `${data.width}px` : data.width;
//             }
//
//             // Traiter l'ID en premier pour l'enregistrement
//             if (data.id && fnHandlers.id) {
//                 fnHandlers.id(el, data.id, 'id', data, this);
//             }
//
//             // Boucle pour toutes les autres propriétés
//             for (const [key, value] of Object.entries(data)) {
//                 if (key === 'markup' || key === 'height' || key === 'width' || key === 'id') continue; // Déjà traités
//                 const fn = fnHandlers[key] || fallback;
//                 fn(el, value, key, data, this);
//             }
//
//             // S'assurer que la position est correctement définie
//             if (!el.style.position && (data.x !== undefined || data.y !== undefined)) {
//                 el.style.position = 'absolute';
//             }
//         }
//
//         // Récupère l'élément créé
//         getElement() {
//             return this.element;
//         }
//
//         // NOUVEAU - Méthodes pour gérer les relations parent-enfant
//
//         // Obtenir tous les éléments rattachés (enfants)
//         getFastened() {
//             return this._fastened.map(id => atomeRegistry[id]).filter(Boolean);
//         }
//
//         // Ajouter un élément enfant
//         addChild(childConfig) {
//             // Si childConfig est déjà un A
//             if (childConfig instanceof A) {
//                 this.element.appendChild(childConfig.getElement());
//                 if (childConfig._data.id) {
//                     this._fastened.push(childConfig._data.id);
//                     this.element.dataset.fasten = this._fastened.join(',');
//                 }
//                 return childConfig;
//             }
//
//             // Sinon, créer un nouvel A à partir de la config
//             const child = new A({
//                 ...childConfig,
//                 attach: this.element
//             });
//
//             // Si l'enfant a un ID, l'ajouter à la liste des enfants
//             if (childConfig.id) {
//                 this._fastened.push(childConfig.id);
//                 this.element.dataset.fasten = this._fastened.join(',');
//             }
//
//             return child;
//         }
//
//         // Supprimer un enfant par ID
//         removeChild(childId) {
//             const child = atomeRegistry[childId];
//             if (child && child.getElement().parentNode === this.element) {
//                 this.element.removeChild(child.getElement());
//                 this._fastened = this._fastened.filter(id => id !== childId);
//                 this.element.dataset.fasten = this._fastened.join(',');
//                 return true;
//             }
//             return false;
//         }
//
//         // Méthode statique pour obtenir une instance A par ID
//         static getById(id) {
//             return atomeRegistry[id];
//         }
//     };
// })();
//
// // Export pour l'utilisation comme module
// window.A = A;
// export default A;({
// //   attach: '#parent_box',
// //   id: 'child_box2',
// //   markup: 'div',
// //   type: 'shape',
// //   x: 110,
// //   y: 20,
// //   width: 80,
// //   height: 80,
// //   backgroundColor: 'orange',
// //   smooth: 10
// // });
// //
// // // Pour vérifier que tout fonctionne
// // console.log('Parent fasten:', simpleExample._fastened); // Devrait afficher ['child_box1', 'child_box2']
// // console.log('Parent fasten dataset:', simpleExample.element.dataset.fasten); // Devrait afficher "child_box1,child_box2"
// //
const container = new A({
  attach: 'body',
  id: 'main_container',
  markup: 'span',
  role: 'container',
  x: 150,
  y: 50,
  width: 400,
  height: 300,
  // backgroundColor: 'blue',
  color: 'blue',
  display: 'block',
  smooth: 10,
      shadow: [{blur: 3, x: 4, y: 8, color: {red: 0, green: 0, blue: 0, alpha: 0.6},invert: true},
        {blur: 12, x: 0, y: 0, color: {red: 0, green: 0.5, blue: 0, alpha: 0.6},invert: false}],
  overflow: 'hidden',
  fasten: [] // Contiendra les IDs des enfants
});

puts(container)
puts(container.width)
puts(container.element)
setTimeout(() => {
  console.log("Delayed for 2 second.");
  container.width(800)
  puts("====> "+container.width())
  // const element = document.getElementById("main_container");

// Changer la position left (en pixels)
//   element.style.left = "0px";
  let element = grab('main_container');
  console.log(container === element)
  element.height(12);
  element.style.top='290px'
 puts (">>> "+ element.style.top)
 container.style.left = "50px";
}, 2000);

// puts(container._data.id)
// puts(container._data)
// puts(container.element)
// puts( '-----')
// puts(container)
// puts(container.get('id'))

// Auto

// (function() {
//   // Injection CSS
//   const css = document.createElement('style');
//   css.textContent = `.d{display:flex;flex-wrap:wrap;gap:var(--g,10px)}.g{width:100px;height:100px;background:#f0f0f0;border:1px solid #ccc}`;
//   document.head.appendChild(css);
//
//   // Création UI
//   const b = document.createElement('button');
//   b.textContent = 'Générer une div';
//   const c = document.createElement('div');
//   c.className = 'd';
//
//   b.onclick = () => c.appendChild(Object.assign(document.createElement('div'), {className: 'g'}));
//
//   // Ajout au DOM
//   document.body.append(b, c);
//
//   // Export des fonctions utiles
//   window.setDivGap = v => c.style.setProperty('--g', `${v}px`);
// })();








