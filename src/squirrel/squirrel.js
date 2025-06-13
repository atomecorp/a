// HyperSquirrel.js - Un framework minimaliste pour la création d'interfaces web
// Cache pour templates et conversions de styles
const body = document.body;
const createElement = document.createElement.bind(document);
const templateRegistry = new Map();
const cssCache = new Map();

// Gestion des événements et mutations
const eventRegistry = new WeakMap(); // Écouteurs d'événements
const mutationRegistry = new WeakMap(); // Observateurs de mutations

// Conversion camelCase → kebab-case (avec cache)
const toKebabCase = (str) => {
  if (cssCache.has(str)) return cssCache.get(str);
  const result = str.replace(/([A-Z])/g, '-$1').toLowerCase();
  cssCache.set(str, result);
  return result;
};

// Détection des handlers d'événements
const isEventHandler = key => key.startsWith('on');

// Attributs booléens reconnus
const booleanAttributes = new Set([
  'draggable', 'hidden', 'spellcheck', 'contenteditable', 
  'disabled', 'checked', 'readonly'
]);

/**
 * Création et mise à jour d'éléments DOM
 * @param {string|Function} id - Identifiant du template ou fonction de création
 * @param {Object} props - Propriétés de configuration
 */
const $ = (id, props = {}) => {
  const config = templateRegistry.get(id) || {};
  const element = createElement(config.tag || 'div');
  
  // 🔧 FIX: Merge CSS intelligent
  const merged = { ...config, ...props };
  
  // CSS merge corrigé
  if (config.css || props.css) {
    if (typeof config.css === 'string' && typeof props.css === 'string') {
      merged.css = config.css + ';' + props.css;
    } else if (typeof config.css === 'object' && typeof props.css === 'object') {
      merged.css = { ...config.css, ...props.css };
    } else {
      merged.css = props.css || config.css;
    }
  }
  
  // 🔧 FIX: Attrs merge corrigé
  if (config.attrs || props.attrs) {
    merged.attrs = { ...(config.attrs || {}), ...(props.attrs || {}) };
  }
  
  // Marquage optionnel
  if (merged.mark) element.setAttribute('data-hyperfactory', 'true');
  
  // Attributs basiques
  merged.id && (element.id = merged.id);
  merged.text && (element.textContent = merged.text);
  
  // Classes via classList
  if (merged.class) {
    element.classList.add(...(
      typeof merged.class === 'string' 
        ? merged.class.split(' ') 
        : merged.class
    ));
  }
  
  // Attributs personnalisés
  if (merged.attrs) {
    for (const [key, value] of Object.entries(merged.attrs)) {
      if (value == null) {
        element.removeAttribute(key);
      } else if (booleanAttributes.has(key)) {
        value ? element.setAttribute(key, '') : element.removeAttribute(key);
      } else {
        element.setAttribute(key, value);
      }
    }
  }
  
  // Styles CSS
  if (merged.css) {
    if (typeof merged.css === 'string') {
      element.style.cssText = merged.css;
    } else {
      for (const [key, value] of Object.entries(merged.css)) {
        const kebabKey = toKebabCase(key);
        value == null 
          ? element.style.removeProperty(kebabKey)
          : element.style.setProperty(kebabKey, value);
      }
    }
  }
  
  // Événements avec addEventListener
  eventRegistry.set(element, {});
  for (const key in merged) {
    if (isEventHandler(key) && typeof merged[key] === 'function') {
      const eventName = key.slice(2).toLowerCase();
      const handler = merged[key];
      element.addEventListener(eventName, handler);
      eventRegistry.get(element)[eventName] = handler;
    }
  }
  
  // Enfants imbriqués
  if (merged.children) {
    merged.children.forEach(childConfig => {
      const child = $(childConfig.id, childConfig);
      element.appendChild(child);
    });
  }
  
  // Méthode de mise à jour
  element.$ = updateProps => {
    if ('text' in updateProps) element.textContent = updateProps.text;
    
    if (updateProps.class) {
      const classes = typeof updateProps.class === 'string' 
        ? updateProps.class.split(' ') 
        : updateProps.class;
      element.classList.add(...classes);
    }
    
    if (updateProps.css) {
      if (typeof updateProps.css === 'string') {
        element.style.cssText = updateProps.css;
      } else {
        for (const [key, value] of Object.entries(updateProps.css)) {
          const kebabKey = toKebabCase(key);
          value == null 
            ? element.style.removeProperty(kebabKey)
            : element.style.setProperty(kebabKey, value);
        }
      }
    }
    
    if (updateProps.attrs) {
      for (const [key, value] of Object.entries(updateProps.attrs)) {
        if (value == null) {
          element.removeAttribute(key);
        } else if (booleanAttributes.has(key)) {
          value ? element.setAttribute(key, '') : element.removeAttribute(key);
        } else {
          element.setAttribute(key, value);
        }
      }
    }
    
    // Mise à jour des événements
    const currentListeners = eventRegistry.get(element);
    for (const key in updateProps) {
      if (isEventHandler(key) && typeof updateProps[key] === 'function') {
        const eventName = key.slice(2).toLowerCase();
        const newHandler = updateProps[key];
        
        if (currentListeners[eventName]) {
          element.removeEventListener(eventName, currentListeners[eventName]);
        }
        
        element.addEventListener(eventName, newHandler);
        currentListeners[eventName] = newHandler;
      }
    }
    
    return element;
  };
  
  // Alias pour le style
  element._ = element.style;
  
  // Parent (support des sélecteurs)
  const parent = merged.parent || body;
  if (typeof parent === 'string') {
    const target = document.querySelector(parent);
    if (target) target.appendChild(element);
    else console.warn(`Parent selector "${parent}" not found`);
  } else {
    parent.appendChild(element);
  }
  
  // 🔧 FIX: Animation native intégrée
  element.animate = (keyframes, options = {}) => {
    const animation = element.animate(keyframes, {
      duration: options.duration || 300,
      easing: options.easing || 'ease',
      fill: 'forwards'
    });
    return animation.finished;
  };
  
  // 🔧 FIX: Cleanup des observers
  element.remove = () => {
    // Nettoyer les observers
    const observers = mutationRegistry.get(element);
    if (observers) {
      observers.forEach(observer => observer.disconnect());
      mutationRegistry.delete(element);
    }
    
    // Nettoyer les events
    const events = eventRegistry.get(element);
    if (events) {
      Object.entries(events).forEach(([eventName, handler]) => {
        element.removeEventListener(eventName, handler);
      });
      eventRegistry.delete(element);
    }
    
    element.parentNode?.removeChild(element);
  };
  
  return element;
};

/**
 * Définition d'un template réutilisable
 * @param {string} id - Identifiant du template
 * @param {Object} config - Configuration du template
 */
const define = (id, config) => {
  templateRegistry.set(id, config);
  return config;
};

/**
 * Batching optimisé avec requestAnimationFrame
 * @param  {...Function} ops - Opérations à exécuter
 */
const batch = (...ops) => {
  requestAnimationFrame(() => {
    ops.forEach(op => {
      try {
        op();
      } catch (error) {
        console.error('Batch operation failed:', error);
      }
    });
  });
};

// === 🧠 Observation des mutations DOM ===
/**
 * Surveiller les changements sur un élément
 * @param {Element} element - Élément à observer
 * @param {Function} callback - Callback sur mutation
 * @param {Object} options - Options de l'observateur
 */
const observeMutations = (element, callback, options = {}) => {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => callback(mutation));
  });
  
  observer.observe(element, {
    attributes: true,
    childList: true,
    subtree: true,
    ...options
  });
  
  // Stocker l'observateur pour le nettoyage
  if (!mutationRegistry.has(element)) mutationRegistry.set(element, []);
  mutationRegistry.get(element).push(observer);
};

export { $, define, batch, observeMutations };

// OU si vous préférez un export default
export default {
  $,
  define,
  batch,
  observeMutations
};

