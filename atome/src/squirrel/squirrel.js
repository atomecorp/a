// HyperSquirrel.js - Un framework minimaliste pour la création d'interfaces web

import { sanitizeSVG } from './apis/svg_utils.js';
import { reportRuntimeError } from './runtime_errors.js';

// Cache pour templates et conversions de styles
const createElement = (tag) => {
  // Use createElementNS for SVG elements to ensure proper namespace
  if (tag === 'svg') {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
  }
  return document.createElement(tag);
};
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

// Wrapper pour capturer les erreurs des handlers async et éviter les rejections non gérées
// (évite le reload de Tauri WebView sur unhandledrejection).
// L'erreur reste absorbée, mais elle est enregistrée : cf. runtime_errors.js.
const wrapAsyncHandler = (fn, eventName) => {
  return function (event) {
    try {
      const result = fn.call(this, event);
      if (result && typeof result.then === 'function') {
        result.catch(err => reportRuntimeError(err, `squirrel:handler:${eventName}`));
      }
      return result;
    } catch (err) {
      reportRuntimeError(err, `squirrel:handler:${eventName}`);
    }
  };
};

// Fonction utilitaire pour ajouter des classes (évite la duplication de code)
const addClasses = (element, classes) => {
  if (!classes) return;

  if (typeof classes === 'string') {
    // Éviter split si une seule classe
    if (classes.indexOf(' ') === -1) {
      element.classList.add(classes);
    } else {
      element.classList.add(...classes.split(' '));
    }
  } else if (Array.isArray(classes)) {
    element.classList.add(...classes);
  }
};

// === Application des propriétés (chemin unique création / mise à jour) ===
// Ces trois helpers étaient recopiés textuellement dans `$()` et dans
// `element.$()`, avec des divergences de sémantique entre les deux copies.

const applyCss = (element, css) => {
  if (css == null) return;
  if (typeof css === 'string') {
    element.style.cssText = css;
    return;
  }
  for (const key in css) {
    if (!Object.prototype.hasOwnProperty.call(css, key)) continue;
    const value = css[key];
    const kebabKey = toKebabCase(key);
    value == null
      ? element.style.removeProperty(kebabKey)
      : element.style.setProperty(kebabKey, value);
  }
};

const applyAttrs = (element, attrs) => {
  if (attrs == null) return;
  for (const key in attrs) {
    if (!Object.prototype.hasOwnProperty.call(attrs, key)) continue;
    const value = attrs[key];
    if (value == null) {
      element.removeAttribute(key);
    } else if (booleanAttributes.has(key)) {
      value ? element.setAttribute(key, '') : element.removeAttribute(key);
    } else {
      element.setAttribute(key, value);
    }
  }
};

const applyHandlers = (element, props) => {
  let listeners = eventRegistry.get(element);
  if (!listeners) {
    listeners = {};
    eventRegistry.set(element, listeners);
  }
  for (const key in props) {
    if (!isEventHandler(key) || typeof props[key] !== 'function') continue;
    const eventName = key.slice(2).toLowerCase();
    const wrappedHandler = wrapAsyncHandler(props[key], eventName);
    if (listeners[eventName]) element.removeEventListener(eventName, listeners[eventName]);
    element.addEventListener(eventName, wrappedHandler);
    listeners[eventName] = wrappedHandler;
  }
};

// `text` / `innerHTML` : `!= null` dans les DEUX chemins. L'ancien code testait la
// véracité à la création (`merged.text && …`), donc `{ text: 0 }` n'écrivait rien et
// `{ text: '' }` n'effaçait pas, alors que `element.$()` utilisait `in` — deux
// sémantiques pour le même composant.
const applyContent = (element, props) => {
  if (props.text != null) element.textContent = props.text;
  // `innerHTML` est du markup fourni par l'appelant (code applicatif du dépôt),
  // donc considéré de confiance. Tout contenu distant passe par `svgSrc`, qui est
  // sanitisé — cf. loadSvgSource ci-dessous.
  if (props.innerHTML != null) element.innerHTML = props.innerHTML;
};

// === SVG distant : cache partagé + sanitisation ===
// Politique `svgSrc` : la ressource est traitée comme non fiable. Le texte
// récupéré passe obligatoirement par `sanitizeSVG` avant injection ; une source
// de confiance qui a besoin de markup brut doit utiliser `innerHTML`.
const svgSourceCache = new Map(); // url -> Promise<string> (sanitisé)

const loadSvgSource = (url) => {
  const key = String(url);
  let pending = svgSourceCache.get(key);
  if (!pending) {
    pending = fetch(key)
      .then(response => response.text())
      .then(text => sanitizeSVG(text));
    // Un échec ne doit pas empoisonner le cache pour toujours.
    pending.catch(() => svgSourceCache.delete(key));
    svgSourceCache.set(key, pending);
  }
  return pending;
};

const applySvgSrc = (element, url) => {
  if (url == null) return;
  loadSvgSource(url)
    .then(svgContent => { element.innerHTML = svgContent; })
    .catch(error => reportRuntimeError(error, 'squirrel:svgSrc', { url: String(url) }));
};

// === Rattachement au parent : une seule file globale, un seul rAF ===
// L'ancien code planifiait jusqu'à 120 rAF *par élément*, et réarmait une
// nouvelle chaîne depuis `squirrel:ready` / `DOMContentLoaded` sans annuler la
// précédente : deux à trois chaînes concurrentes par élément orphelin.

const MAX_PARENT_ATTACH_FRAMES = 120;
const parentSelectorCache = new Map(); // selector -> Element
const pendingAttachments = new Set(); // { element, selector, attempts }
let pendingDrainHandle = null;
let readyListenersInstalled = false;

// `document.querySelector` était appelé à chaque `$()` — 1 000 éléments =
// 1 000 requêtes sur le sélecteur constant '#view'.
const SIMPLE_ID_SELECTOR = /^#[A-Za-z][A-Za-z0-9_-]*$/;

const resolveParentSelector = (selector) => {
  const cached = parentSelectorCache.get(selector);
  if (cached) {
    if (cached.isConnected) return cached;
    parentSelectorCache.delete(selector);
  }
  const found = SIMPLE_ID_SELECTOR.test(selector)
    ? document.getElementById(selector.slice(1))
    : document.querySelector(selector);
  if (found) parentSelectorCache.set(selector, found);
  return found;
};

const attachNow = (element, parent) => {
  if (typeof parent !== 'string') {
    parent.appendChild(element);
    return true;
  }
  const target = resolveParentSelector(parent);
  if (!target) return false;
  target.appendChild(element);
  return true;
};

const drainPendingAttachments = () => {
  pendingDrainHandle = null;
  for (const entry of Array.from(pendingAttachments)) {
    if (attachNow(entry.element, entry.selector)) {
      pendingAttachments.delete(entry);
      entry.element._parentAttachPending = false;
      continue;
    }
    entry.attempts += 1;
    if (entry.attempts >= MAX_PARENT_ATTACH_FRAMES) {
      pendingAttachments.delete(entry);
      entry.element._parentAttachPending = false;
      reportRuntimeError(
        new Error(`parent selector "${entry.selector}" never appeared`),
        'squirrel:parentAttach',
        { selector: entry.selector, attempts: entry.attempts }
      );
    }
  }
  if (pendingAttachments.size > 0) schedulePendingDrain();
};

const schedulePendingDrain = () => {
  if (pendingDrainHandle != null) return;
  pendingDrainHandle = requestAnimationFrame(drainPendingAttachments);
};

const onDocumentReady = () => {
  // Un parent peut apparaître au moment exact de ces événements : drainer tout de
  // suite au lieu d'attendre la frame suivante. La file est globale, donc rien
  // n'est réarmé en double.
  parentSelectorCache.clear();
  drainPendingAttachments();
};

const installReadyListeners = () => {
  if (readyListenersInstalled) return;
  readyListenersInstalled = true;
  window.addEventListener('squirrel:ready', onDocumentReady, true);
  document.addEventListener('DOMContentLoaded', onDocumentReady, true);
};

const queueParentAttachment = (element, selector) => {
  if (element._parentAttachPending) return;
  element._parentAttachPending = true;
  installReadyListeners();
  pendingAttachments.add({ element, selector, attempts: 0 });
  schedulePendingDrain();
};

// === Nettoyage récursif ===
// L'ancien `remove()` ne purgeait que l'élément lui-même : tous les enfants créés
// par `$()` gardaient leurs observers et leurs listeners sur un nœud détaché.

const purgeElementRegistries = (element) => {
  const observers = mutationRegistry.get(element);
  if (observers) {
    observers.forEach(observer => observer.disconnect());
    mutationRegistry.delete(element);
  }
  const events = eventRegistry.get(element);
  if (events) {
    for (const eventName in events) {
      if (Object.prototype.hasOwnProperty.call(events, eventName)) {
        element.removeEventListener(eventName, events[eventName]);
      }
    }
    eventRegistry.delete(element);
  }
};

const purgeSubtree = (element) => {
  purgeElementRegistries(element);
  if (typeof element.querySelectorAll !== 'function') return;
  const descendants = element.querySelectorAll('*');
  for (let i = 0; i < descendants.length; i += 1) purgeElementRegistries(descendants[i]);
};

/**
 * Vider un conteneur géré par `$()` en passant par le nettoyage.
 * `container.innerHTML = ''` détache les enfants sans jamais déconnecter leurs
 * observers ni retirer leurs listeners : les registres fuient.
 * @param {Element} element - conteneur à vider
 */
const clearChildren = (element) => {
  if (!element) return;
  let child = element.firstElementChild;
  while (child) {
    purgeSubtree(child);
    child = child.nextElementSibling;
  }
  element.replaceChildren();
};

/**
 * Création et mise à jour d'éléments DOM
 * @param {string|Function} id - Identifiant du template ou fonction de création
 * @param {Object} props - Propriétés de configuration
 */
const $ = (id, props = {}) => {
  const config = templateRegistry.get(id) || {};
  const element = createElement(config.tag || props.tag || id || 'div');

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
  if (merged.id != null) element.id = merged.id;
  applyContent(element, merged);
  applySvgSrc(element, merged.svgSrc);

  // Classes via classList (optimisé)
  addClasses(element, merged.class);

  applyAttrs(element, merged.attrs);
  applyCss(element, merged.css);
  eventRegistry.set(element, {});
  applyHandlers(element, merged);

  // Enfants imbriqués : un seul appendChild sur l'élément, pas un par enfant.
  if (merged.children) {
    const fragment = document.createDocumentFragment();
    merged.children.forEach(childConfig => {
      // Le parent est déjà connu : ne pas laisser l'enfant chercher '#view'.
      const child = $(childConfig.id, { ...childConfig, parent: fragment });
      if (child.parentNode !== fragment) fragment.appendChild(child);
    });
    element.appendChild(fragment);
  }

  // Méthode de mise à jour
  element.$ = updateProps => {
    applyContent(element, updateProps);
    applySvgSrc(element, updateProps.svgSrc);
    if (updateProps.class) addClasses(element, updateProps.class);
    applyCss(element, updateProps.css);
    applyAttrs(element, updateProps.attrs);
    applyHandlers(element, updateProps);
    return element;
  };

  // Alias pour le style
  element._ = element.style;

  // Parent (support des sélecteurs)
  const parent = merged.parent || '#view';

  const ensureParentAttachment = () => {
    if (attachNow(element, parent)) {
      element._parentAttachPending = false;
      return;
    }
    queueParentAttachment(element, parent);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureParentAttachment, { once: true, capture: true });
  } else {
    ensureParentAttachment();
  }

  // `animate` reste l'API native : elle retourne un `Animation`, et tout le code
  // (y compris une bibliothèque tierce) attend `.cancel()`, `.pause()`, `onfinish`.
  // La variante « promesse » vit sous un autre nom.
  /**
   * Anime l'élément et retourne la promesse de fin.
   * @param {Object[]} keyframes
   * @param {Object} [options] - options WAAPI, toutes propagées
   * @returns {Promise} résolue à la fin de l'animation
   */
  element.animateTo = (keyframes, options = {}) => {
    const animation = element.animate(keyframes, { duration: 300, easing: 'ease', fill: 'forwards', ...options });
    return animation.finished;
  };

  // 🔧 FIX: Cleanup des observers, récursif sur le sous-arbre
  element.remove = () => {
    purgeSubtree(element);
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
        reportRuntimeError(error, 'squirrel:batch');
      }
    });
  });
};

// === 🧠 Observation des mutations DOM ===
/**
 * Surveiller les changements sur un élément.
 * Défauts minimaux : `childList` seul. `subtree` et `attributes` coûtent une
 * notification par mutation d'attribut de n'importe quel descendant : ils
 * doivent être demandés explicitement.
 * @param {Element} element - Élément à observer
 * @param {Function} callback - Callback sur mutation
 * @param {Object} options - Options de l'observateur
 * @returns {Function} déconnexion de cet observateur précis
 */
const observeMutations = (element, callback, options = {}) => {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => callback(mutation));
  });

  observer.observe(element, { childList: true, ...options });

  // Stocker l'observateur pour le nettoyage
  if (!mutationRegistry.has(element)) mutationRegistry.set(element, []);
  const observers = mutationRegistry.get(element);
  observers.push(observer);

  return () => {
    observer.disconnect();
    const index = observers.indexOf(observer);
    if (index !== -1) observers.splice(index, 1);
  };
};

export { $, define, batch, observeMutations, clearChildren };

// OU si vous préférez un export default
export default {
  $,
  define,
  batch,
  observeMutations,
  clearChildren
};
