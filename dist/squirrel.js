(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.Squirrel = factory());
})(this, (function () { 'use strict';

  // HyperSquirrel.js - Un framework minimaliste pour la création d'interfaces web

  // Cache pour templates et conversions de styles
  const createElement = (tag) => document.createElement(tag);
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
    merged.id && (element.id = merged.id);
    merged.text && (element.textContent = merged.text);
    
    // Classes via classList (optimisé)
    addClasses(element, merged.class);
    
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
        for (const key in merged.css) {
          if (merged.css.hasOwnProperty(key)) {
            const value = merged.css[key];
            const kebabKey = toKebabCase(key);
            value == null 
              ? element.style.removeProperty(kebabKey)
              : element.style.setProperty(kebabKey, value);
          }
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
        addClasses(element, updateProps.class);
      }
      
      if (updateProps.css) {
        if (typeof updateProps.css === 'string') {
          element.style.cssText = updateProps.css;
        } else {
          for (const key in updateProps.css) {
            if (updateProps.css.hasOwnProperty(key)) {
              const value = updateProps.css[key];
              const kebabKey = toKebabCase(key);
              value == null 
                ? element.style.removeProperty(kebabKey)
                : element.style.setProperty(kebabKey, value);
            }
          }
        }
      }
      
      if (updateProps.attrs) {
        for (const key in updateProps.attrs) {
          if (updateProps.attrs.hasOwnProperty(key)) {
            const value = updateProps.attrs[key];
            if (value == null) {
              element.removeAttribute(key);
            } else if (booleanAttributes.has(key)) {
              value ? element.setAttribute(key, '') : element.removeAttribute(key);
            } else {
              element.setAttribute(key, value);
            }
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
    const parent = merged.parent || '#view';  // ← Votre changement
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
        for (const eventName in events) {
          if (events.hasOwnProperty(eventName)) {
            element.removeEventListener(eventName, events[eventName]);
          }
        }
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

  // OU si vous préférez un export default
  var Squirrel = {
    $,
    define,
    batch,
    observeMutations
  };

  /**
   * Composant Slider skinnable avec HyperSquirrel
   * Chaque élément du slider est entièrement customisable
   * Support pour sliders horizontaux, verticaux et circulaires
   */


  // === DÉFINITION DES TEMPLATES DE BASE ===

  // Template pour le conteneur principal du slider
  define('slider-container', {
    tag: 'div',
    class: 'hs-slider',
    css: {
      position: 'relative',
      display: 'inline-block',
      userSelect: 'none',
      touchAction: 'none'
    }
  });

  // Template pour la piste du slider
  define('slider-track', {
    tag: 'div',
    class: 'hs-slider-track',
    css: {
      position: 'absolute',
      backgroundColor: '#e0e0e0',
      borderRadius: '4px',
      overflow: 'hidden',
      zIndex: '1',
      boxSizing: 'border-box'  // Ajout important
    }
  });

  // Template pour la partie progression du slider
  define('slider-progression', {
    tag: 'div',
    class: 'hs-slider-progression',
    css: {
      position: 'absolute',
      backgroundColor: '#007bff',
      borderRadius: '0',
      zIndex: '2',
    }
  });

  // Template pour le handle/thumb du slider
  define('slider-handle', {
    tag: 'div',
    class: 'hs-slider-handle',
    css: {
      position: 'absolute',
      backgroundColor: '#fff',
      border: '2px solid #007bff',
      borderRadius: '50%',
      cursor: 'pointer',
      zIndex: '20',  // Augmenté pour être sûr qu'il est au-dessus
      boxShadow: '0 4px 8px rgba(0,0,0,0.15)'
    }
  });

  // Template pour le label/valeur du slider
  define('slider-label', {
    tag: 'div',
    class: 'hs-slider-label',
    css: {
      position: 'absolute',
      fontSize: '12px',
      fontFamily: 'system-ui, sans-serif',
      color: '#666',
      whiteSpace: 'nowrap'
    }
  });

  // Template pour les graduations
  define('slider-tick', {
    tag: 'div',
    class: 'hs-slider-tick',
    css: {
      position: 'absolute',
      backgroundColor: '#ccc',
      pointerEvents: 'none'
    }
  });

  // === STYLES PRÉDÉFINIS ===

  const sliderVariants = {
    horizontal: {
      container: { width: '200px', height: '20px' },
      track: { width: '100%', height: '4px', top: '50%', transform: 'translateY(-50%)' },
      progression: { height: '100%', left: '0', top: '0', borderTopLeftRadius: '4px', borderBottomLeftRadius: '4px' },
      handle: { width: '16px', height: '16px', top: '50%' },
      label: { top: '25px', transform: 'translateX(-50%)' }
    },
    vertical: {
      container: { width: '20px', height: '200px' },
      track: { width: '4px', height: '100%', left: '50%', transform: 'translateX(-50%)' },
      progression: { width: '100%', bottom: '0', left: '0', borderBottomLeftRadius: '4px', borderBottomRightRadius: '4px' },
      handle: { width: '16px', height: '16px', left: '50%' },
      label: { left: '25px', transform: 'translateY(-50%)' }
    },
    circular: {
      container: { width: '120px', height: '120px' },
      track: { width: '100%', height: '100%', borderRadius: '50%', border: '4px solid #e0e0e0' },
      progression: { display: 'none' }, // Progression géré différemment pour circulaire (SVG)
      handle: { width: '20px', height: '20px' },
      label: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    }
  };

  const sliderSizes = {
    sm: { scale: 0.8 },
    md: { scale: 1 }, // default
    lg: { scale: 1.2 },
    xl: { scale: 1.5 }
  };

  // === COMPOSANT SLIDER PRINCIPAL ===

  /**
   * Crée un slider entièrement skinnable
   * @param {Object} config - Configuration du slider
   * @param {string} config.type - Type de slider (horizontal, vertical, circular)
   * @param {number} config.min - Valeur minimum (défaut: 0)
   * @param {number} config.max - Valeur maximum (défaut: 100)
   * @param {number} config.value - Valeur initiale (défaut: 50)
   * @param {number} config.step - Pas de progression (défaut: 1)
   * @param {Function} config.onChange - Handler de changement de valeur
   * @param {Function} config.onInput - Handler d'input continu
   * @param {Object} config.skin - Styles personnalisés pour chaque partie
   * @param {string} config.id - ID personnalisé (sinon auto-généré)
   * @param {boolean} config.disabled - Slider désactivé
   * @param {boolean} config.showLabel - Afficher la valeur (défaut: true)
   * @param {boolean} config.showTicks - Afficher les graduations
   * @param {Array} config.ticks - Positions des graduations
   * @param {number} config.radius - Rayon personnalisé pour slider circulaire
   * @param {number} config.handleOffset - Décalage du handle (en %) : positif = extérieur, négatif = intérieur
   */
  const createSlider = (config = {}) => {
    const {
      type = 'horizontal',
      min = 0,
      max = 100,
      value = 50,
      step = 1,
      onChange,
      onInput,
      skin = {},
      id,
      disabled = false,
      showLabel = true,
      showTicks = false,
      ticks = [],
      size = 'md',
      radius,  // Ajout du paramètre radius
      handleOffset = 0,  // Nouveau paramètre pour ajuster la position du handle
      // Nouveaux paramètres pour zone de drag limitée
      dragMin = null,  // Zone de drag minimum (null = utilise min)
      dragMax = null,  // Zone de drag maximum (null = utilise max)
      ...otherProps
    } = config;

    // Génération d'ID unique si non fourni
    const sliderId = id || `slider_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // Validation des valeurs
    const currentValue = Math.max(min, Math.min(max, value));
    const isCircular = type === 'circular';

    // Styles de base selon type et taille
    let containerStyles = { ...sliderVariants[type]?.container || {}, ...sliderSizes[size] || {} };
    let trackStyles = { ...sliderVariants[type]?.track || {} };
    let progressionStyles = { ...sliderVariants[type]?.progression || {} };
    let handleStyles = { ...sliderVariants[type]?.handle || {} };
    let labelStyles = { ...sliderVariants[type]?.label || {} };

    // Si un radius est fourni pour un slider circulaire, l'utiliser
    if (isCircular && radius) {
      const diameter = radius * 2;
      containerStyles.width = `${diameter}px`;
      containerStyles.height = `${diameter}px`;
    }

    // Application des styles personnalisés
    if (skin.container) containerStyles = { ...containerStyles, ...skin.container };
    if (skin.track) trackStyles = { ...trackStyles, ...skin.track };
    if (skin.progression) progressionStyles = { ...progressionStyles, ...skin.progression };
    if (skin.handle) handleStyles = { ...handleStyles, ...skin.handle };
    if (skin.label) labelStyles = { ...labelStyles, ...skin.label };

    // Styles pour état disabled
    if (disabled) {
      containerStyles.opacity = '0.6';
      containerStyles.pointerEvents = 'none';
    }

    // Création du conteneur principal
    const container = $('slider-container', {
      id: sliderId,
      css: containerStyles,
      ...otherProps
    });

    // Création de la piste
    const track = $('slider-track', {
      id: `${sliderId}_track`,
      css: trackStyles
    });

    // Pour un slider circulaire, s'assurer que le track remplit le conteneur
    if (isCircular) {
      track.$({
        css: {
          width: '100%',
          height: '100%',
          top: '0',
          left: '0'
        }
      });
    }

    // Création de la progression
    let progression;
    if (!isCircular) {
      progression = $('slider-progression', {
        id: `${sliderId}_progression`,
        css: progressionStyles
      });
      track.appendChild(progression);
    }

    // Création du handle
    const handle = $('slider-handle', {
      id: `${sliderId}_handle`,
      css: handleStyles
    });

    // Création du label si demandé
    let label;
    if (showLabel) {
      label = $('slider-label', {
        id: `${sliderId}_label`,
        text: currentValue.toString(),
        css: labelStyles
      });
    }

    // Création des graduations si demandées
    if (showTicks && ticks.length > 0) {
      ticks.forEach((tickValue, index) => {
        const tickPosition = ((tickValue - min) / (max - min)) * 100;
        const tick = $('slider-tick', {
          id: `${sliderId}_tick_${index}`,
          css: {
            ...skin.tick || {},
            ...(type === 'horizontal' ? {
              left: `${tickPosition}%`,
              top: '12px',
              width: '2px',
              height: '6px'
            } : {
              top: `${100 - tickPosition}%`,
              left: '12px',
              width: '6px',
              height: '2px'
            })
          }
        });
        container.appendChild(tick);
      });
    }

    // Assemblage des éléments
    container.appendChild(track);
    if (!isCircular && progression) track.appendChild(progression);
    container.appendChild(handle);  // Handle toujours au niveau du conteneur
    if (label) container.appendChild(label);

    // Variables de state
    let isDragging = false;
    let currentVal = currentValue;
    let currentHandleOffset = handleOffset;  // Stocker l'offset actuel

    // Fonction de mise à jour de position
    const updatePosition = (newValue) => {
      const clampedValue = Math.max(min, Math.min(max, newValue));
      
      if (isCircular) {
        // POSITION DU HANDLE : Toujours basée sur la plage totale (min-max)
        const handlePercentage = ((clampedValue - min) / (max - min)) * 100;
        
        // PROGRESSION : Basée sur la zone de drag si définie
        let progressionPercentage = 0;
        if (dragMin !== null || dragMax !== null) {
          // Zone de drag définie : progression selon la zone de drag
          if (clampedValue >= effectiveDragMin && clampedValue <= effectiveDragMax) {
            progressionPercentage = ((clampedValue - effectiveDragMin) / (effectiveDragMax - effectiveDragMin)) * 100;
          } else if (clampedValue > effectiveDragMax) {
            progressionPercentage = 100;
          }
          // Si clampedValue < effectiveDragMin, progressionPercentage reste 0
        } else {
          // Pas de zone de drag : progression suit le handle
          progressionPercentage = handlePercentage;
        }
        
        // Slider circulaire : position sur le cercle (handle)
        // Convertir le pourcentage en angle (0-360°)
        const handleAngleInDegrees = (handlePercentage / 100) * 360;
        
        // Convertir en radians et ajuster pour commencer en haut (-90°)
        const handleAngleInRadians = ((handleAngleInDegrees - 90) * Math.PI) / 180;
        
        // Obtenir la largeur du border pour calculer le bon rayon
        const trackStyle = window.getComputedStyle(track);
        const borderWidth = parseFloat(trackStyle.borderWidth) || parseFloat(trackStyle.borderTopWidth) || 6;
        
        // Calculer le rayon pour que le handle soit SUR le track
        // Le track a un border, on veut que le handle soit au milieu de ce border
        // Si le conteneur fait 100%, le track intérieur fait 100% - 2*borderWidth
        // Le milieu du border est donc à (100% - borderWidth) / 2
        const borderPercent = (borderWidth / container.offsetWidth) * 100;
        
        // Appliquer l'offset personnalisé
        // handleOffset positif = vers l'extérieur, négatif = vers l'intérieur
        const radiusPercent = 50 - borderPercent + currentHandleOffset;
        
        const x = 50 + radiusPercent * Math.cos(handleAngleInRadians);
        const y = 50 + radiusPercent * Math.sin(handleAngleInRadians);
        
        handle.$({
          css: {
            left: `${x}%`,
            top: `${y}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: '15'  // S'assurer que le handle est au-dessus du track
          }
        });
        
        // Mise à jour du stroke pour l'effet circulaire
        if (track.querySelector('svg')) {
          const progressCircle = track.querySelector('.progress-circle');
          if (progressCircle) {
            const svgRadius = 42; // Radius dans le viewBox SVG
            const circumference = 2 * Math.PI * svgRadius;
            
            if (dragMin !== null || dragMax !== null) {
              // Zone de drag limitée : arc qui grandit depuis dragMin
              const dragRangePercent = (effectiveDragMax - effectiveDragMin) / (max - min);
              const maxDragArcLength = circumference * dragRangePercent;
              const progressArcLength = (progressionPercentage / 100) * maxDragArcLength;
              
              // Décaler le cercle pour que l'arc commence à dragMin
              const dragStartPercent = (effectiveDragMin - min) / (max - min);
              const startAngleOffset = circumference * dragStartPercent;
              
              // L'arc commence à dragMin et grandit selon la progression
              progressCircle.style.strokeDasharray = `${progressArcLength} ${circumference - progressArcLength}`;
              progressCircle.style.strokeDashoffset = -startAngleOffset;
            } else {
              // Pas de zone de drag : comportement normal
              const offset = circumference - (progressionPercentage / 100) * circumference;
              progressCircle.style.strokeDasharray = circumference;
              progressCircle.style.strokeDashoffset = offset;
            }
          }
        } else {
          // Créer le SVG pour l'effet circulaire si pas encore fait
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('viewBox', '0 0 100 100');
          svg.style.cssText = `
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          transform: rotate(-90deg);
          pointer-events: none;
          z-index: 2;
        `;
          
          // Cercle de fond (fixe)
          const svgRadius = 42;
          const circumference = 2 * Math.PI * svgRadius;
          const backgroundCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          backgroundCircle.style.cssText = `
          fill: none;
          stroke: #e0e0e0;
          stroke-width: 6;
          opacity: 0.3;
        `;
          backgroundCircle.setAttribute('cx', '50');
          backgroundCircle.setAttribute('cy', '50');
          backgroundCircle.setAttribute('r', svgRadius.toString());
          
          // Cercle de progression - différent selon zone de drag
          const circularProgressionStyles = skin.progression || {};
          const progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          progressCircle.classList.add('progress-circle');
          
          if (dragMin !== null || dragMax !== null) {
            // Zone de drag limitée : arc qui grandit depuis dragMin
            const dragRangePercent = (effectiveDragMax - effectiveDragMin) / (max - min);
            const maxDragArcLength = circumference * dragRangePercent;
            const progressArcLength = (progressionPercentage / 100) * maxDragArcLength;
            
            // Décaler le cercle pour que l'arc commence à dragMin
            const dragStartPercent = (effectiveDragMin - min) / (max - min);
            const startAngleOffset = circumference * dragStartPercent;
            
            progressCircle.style.cssText = `
            fill: none;
            stroke: ${circularProgressionStyles.stroke || progressionStyles.backgroundColor || '#007bff'};
            stroke-width: ${circularProgressionStyles.strokeWidth || '6'};
            stroke-dasharray: ${progressArcLength} ${circumference - progressArcLength};
            stroke-dashoffset: ${-startAngleOffset};
            stroke-linecap: ${circularProgressionStyles.strokeLinecap || 'butt'};
            opacity: ${circularProgressionStyles.opacity || '1'};
          `;
          } else {
            // Pas de zone de drag : comportement normal (cercle complet)
            progressCircle.style.cssText = `
            fill: none;
            stroke: ${circularProgressionStyles.stroke || progressionStyles.backgroundColor || '#007bff'};
            stroke-width: ${circularProgressionStyles.strokeWidth || '6'};
            stroke-dasharray: ${circumference};
            stroke-dashoffset: ${circumference - (progressionPercentage / 100) * circumference};
            stroke-linecap: ${circularProgressionStyles.strokeLinecap || 'butt'};
            opacity: ${circularProgressionStyles.opacity || '1'};
          `;
          }
          
          progressCircle.setAttribute('cx', '50');
          progressCircle.setAttribute('cy', '50');
          progressCircle.setAttribute('r', svgRadius.toString());
          
          svg.appendChild(backgroundCircle);
          svg.appendChild(progressCircle);
          track.appendChild(svg);
        }
        
      } else {
        // Sliders horizontaux et verticaux - utiliser la plage totale
        const handlePercentage = ((clampedValue - min) / (max - min)) * 100;
        
        if (type === 'vertical') {
          // Slider vertical
          handle.$({
            css: {
              top: `${100 - handlePercentage}%`,
              transform: 'translate(-50%, -50%)'
            }
          });
          
          if (progression) {
            progression.$({
              css: {
                height: `${handlePercentage}%`
              }
            });
          }
          
        } else {
          // Slider horizontal (défaut)
          handle.$({
            css: {
              left: `${handlePercentage}%`,
              transform: 'translate(-50%, -50%)'
            }
          });
          
          if (progression) {
            progression.$({
              css: {
                width: `${handlePercentage}%`
              }
            });
          }
        }
      }
      
      // Mise à jour du label
      if (label) {
        label.$({ text: Math.round(clampedValue).toString() });
      }
      
      currentVal = clampedValue;
    };

    // Fonction de calcul de valeur depuis position
    const getValueFromPosition = (clientX, clientY) => {
      if (isCircular) {
        // Utiliser getBoundingClientRect pour obtenir la position absolue
        const containerRect = container.getBoundingClientRect();
        
        // Centre du conteneur en coordonnées absolues
        const centerX = containerRect.left + containerRect.width / 2;
        const centerY = containerRect.top + containerRect.height / 2;
        
        // Vecteur du centre vers la souris
        const deltaX = clientX - centerX;
        const deltaY = clientY - centerY;
        
        // Calcul de l'angle en utilisant atan2
        // atan2(y, x) retourne l'angle en radians entre -PI et PI
        // avec 0 pointant vers la droite (3h sur une horloge)
        let angleRadians = Math.atan2(deltaY, deltaX);
        
        // Convertir en degrés
        let angleDegrees = angleRadians * (180 / Math.PI);
        
        // Ajuster pour que 0° soit en haut (12h) au lieu de droite (3h)
        // On ajoute 90° pour faire la rotation
        angleDegrees = angleDegrees + 90;
        
        // Normaliser entre 0 et 360
        if (angleDegrees < 0) {
          angleDegrees += 360;
        }
        
        // Convertir l'angle en pourcentage (0-1)
        const percentage = angleDegrees / 360;
        
        // Convertir en valeur selon min/max
        const value = min + percentage * (max - min);
        
        // Pour les sliders circulaires, appliquer les limites de drag
        if (isCircular) {
          return Math.max(effectiveDragMin, Math.min(effectiveDragMax, value));
        }
        
        return value;
        
      } else if (type === 'vertical') {
        // Slider vertical - utiliser le rect du track
        const rect = track.getBoundingClientRect();
        const relativeY = clientY - rect.top;
        const percentage = 1 - (relativeY / rect.height);
        return min + Math.max(0, Math.min(1, percentage)) * (max - min);
        
      } else {
        // Slider horizontal - utiliser le rect du track
        const rect = track.getBoundingClientRect();
        const relativeX = clientX - rect.left;
        const percentage = relativeX / rect.width;
        return min + Math.max(0, Math.min(1, percentage)) * (max - min);
      }
    };

    // Calcul des zones de drag effectives
    const effectiveDragMin = dragMin !== null ? dragMin : min;
    const effectiveDragMax = dragMax !== null ? dragMax : max;
    
    // Validation des zones de drag
    if (effectiveDragMin < min) {
      console.warn(`dragMin (${effectiveDragMin}) ne peut pas être inférieur à min (${min})`);
    }
    if (effectiveDragMax > max) {
      console.warn(`dragMax (${effectiveDragMax}) ne peut pas être supérieur à max (${max})`);
    }

    // Gestionnaires d'événements
    const handleMouseDown = (e) => {
      if (disabled) return;
      
      isDragging = true;
      const newValue = getValueFromPosition(e.clientX, e.clientY);
      const steppedValue = Math.round(newValue / step) * step;
      
      updatePosition(steppedValue);
      
      if (onInput) onInput(currentVal);
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      e.preventDefault();
    };

    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      const newValue = getValueFromPosition(e.clientX, e.clientY);
      const steppedValue = Math.round(newValue / step) * step;
      
      updatePosition(steppedValue);
      
      if (onInput) onInput(currentVal);
      
      e.preventDefault();
    };

    const handleMouseUp = () => {
      if (!isDragging) return;
      
      isDragging = false;
      
      if (onChange) onChange(currentVal);
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    // Support tactile
    const handleTouchStart = (e) => {
      if (disabled) return;
      
      const touch = e.touches[0];
      handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => e.preventDefault() });
    };

    const handleTouchMove = (e) => {
      if (!isDragging) return;
      
      const touch = e.touches[0];
      handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => e.preventDefault() });
    };

    const handleTouchEnd = () => {
      handleMouseUp();
    };

    // Ajout des événements
    handle.addEventListener('mousedown', handleMouseDown);
    track.addEventListener('mousedown', handleMouseDown);
    
    handle.addEventListener('touchstart', handleTouchStart, { passive: false });
    track.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    // Position initiale
    updatePosition(currentValue);

    // Méthodes utilitaires spécifiques au slider
    container.setValue = (newValue) => {
      updatePosition(newValue);
      if (onChange) onChange(currentVal);
      return container;
    };

    container.getValue = () => currentVal;

    container.setRange = (newMin, newMax) => {
      min = newMin;
      max = newMax;
      updatePosition(currentVal);
      return container;
    };

    container.setDisabled = (isDisabled) => {
      disabled = isDisabled;
      container.$({
        css: {
          opacity: isDisabled ? '0.6' : '1',
          pointerEvents: isDisabled ? 'none' : 'auto'
        }
      });
      return container;
    };

    container.setHandleOffset = (offset) => {
      if (isCircular) {
        currentHandleOffset = offset;
        updatePosition(currentVal);
      }
      return container;
    };

    container.getHandleOffset = () => currentHandleOffset;

    return container;
  };

  /**
   * 🔴 Badge Component - Test de l'auto-discovery
   * Composant simple pour tester que le système détecte et expose automatiquement
   * les nouveaux composants sans intervention manuelle.
   */

  // Template pour le badge
  define('badge-element', {
    tag: 'span',
    class: 'hs-badge',
    css: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '4px 8px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 'bold',
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    }
  });

  /**
   * Crée un badge
   */
  const createBadge = (config = {}) => {
    const {
      text = 'Badge',
      variant = 'primary',
      css = {},
      onclick,
      ...otherProps
    } = config;

    // Couleurs par défaut selon le variant
    const variants = {
      primary: { backgroundColor: '#007bff', color: 'white' },
      success: { backgroundColor: '#28a745', color: 'white' },
      warning: { backgroundColor: '#ffc107', color: '#212529' },
      danger: { backgroundColor: '#dc3545', color: 'white' },
      info: { backgroundColor: '#17a2b8', color: 'white' },
      light: { backgroundColor: '#f8f9fa', color: '#212529', border: '1px solid #dee2e6' },
      dark: { backgroundColor: '#343a40', color: 'white' }
    };

    // Appliquer le style du variant
    const variantStyles = variants[variant] || variants.primary;

    // Créer le badge
    const badge = $('badge-element', {
      text,
      css: { 
        ...variantStyles,
        ...css,
        cursor: onclick ? 'pointer' : 'default'
      },
      onclick: onclick || null,
      ...otherProps
    });

    return badge;
  };

  /**
   * Composant Button skinnable avec HyperSquirrel
   * Chaque élément du bouton est entièrement customisable
   */

  // === DÉFINITION DES TEMPLATES DE BASE ===

  // Template pour le conteneur principal du bouton
  define('button-container', {
    tag: 'button',
    class: 'hs-button',
    text: 'hello',
    css: {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '8px 16px',
      border: '1px solid #ccc',
      borderRadius: '4px',
      backgroundColor: '#f8f9fa',
      color: '#333',
      fontSize: '14px',
      fontFamily: 'system-ui, sans-serif',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      outline: 'none'
    },
    attrs: {
      type: 'button'
    }
  });

  // Template pour l'icône du bouton
  define('button-icon', {
    tag: 'span',
    class: 'hs-button-icon',
    css: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: '6px',
      fontSize: '16px'
    }
  });

  // Template pour le texte du bouton
  define('button-text', {
    tag: 'span',
    class: 'hs-button-text',
    css: {
      fontSize: 'inherit',
      fontWeight: '400',
      lineHeight: '1'
    }
  });

  // Template pour le badge/compteur
  define('button-badge', {
    tag: 'span',
    class: 'hs-button-badge',
    css: {
      position: 'absolute',
      top: '-6px',
      right: '-6px',
      minWidth: '18px',
      height: '18px',
      padding: '0 4px',
      borderRadius: '9px',
      backgroundColor: '#dc3545',
      color: 'white',
      fontSize: '11px',
      fontWeight: 'bold',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  });

  // === VARIANTES DE STYLES PRÉDÉFINIES ===

  const buttonStyles = {
    primary: {
      backgroundColor: '#007bff',
      color: 'white',
      borderColor: '#007bff'
    },
    secondary: {
      backgroundColor: '#6c757d',
      color: 'white',
      borderColor: '#6c757d'
    },
    success: {
      backgroundColor: '#28a745',
      color: 'white',
      borderColor: '#28a745'
    },
    danger: {
      backgroundColor: '#dc3545',
      color: 'white',
      borderColor: '#dc3545'
    },
    warning: {
      backgroundColor: '#ffc107',
      color: '#212529',
      borderColor: '#ffc107'
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: '2px'
    },
    ghost: {
      backgroundColor: 'transparent',
      border: 'none',
      boxShadow: 'none'
    }
  };

  const buttonSizes = {
    xs: { padding: '4px 8px', fontSize: '11px' },
    sm: { padding: '6px 12px', fontSize: '12px' },
    md: { padding: '8px 16px', fontSize: '14px' }, // default
    lg: { padding: '12px 24px', fontSize: '16px' },
    xl: { padding: '16px 32px', fontSize: '18px' }
  };

  // === COMPOSANT BUTTON PRINCIPAL ===

  /**
   * Crée un bouton entièrement skinnable
   * @param {Object} config - Configuration du bouton
   * @param {string} config.text - Texte du bouton
   * @param {string} config.icon - Icône (HTML ou emoji)
   * @param {string|number} config.badge - Badge/compteur
   * @param {string} config.variant - Style prédéfini (primary, secondary, etc.)
   * @param {string} config.size - Taille (xs, sm, md, lg, xl)
   * @param {Function} config.onClick - Handler de clic
   * @param {Object} config.skin - Styles personnalisés pour chaque partie
   * @param {string} config.id - ID personnalisé (sinon auto-généré)
   * @param {boolean} config.disabled - Bouton désactivé
   */
  const createButton = (config = {}) => {
    const {
      text = 'Button',
      icon,
      badge,
      variant = 'default',
      size = 'md',
      onClick,
      skin = {},
      id,
      disabled = false,
      ...otherProps
    } = config;

    // Génération d'ID unique si non fourni
    const buttonId = id || `btn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // Styles de base selon variant et size
    let containerStyles = { ...buttonStyles[variant] || {}, ...buttonSizes[size] || {} };
    
    // Application des styles personnalisés
    if (skin.container) {
      containerStyles = { ...containerStyles, ...skin.container };
    }

    // Styles pour état disabled
    if (disabled) {
      containerStyles.opacity = '0.6';
      containerStyles.cursor = 'not-allowed';
      containerStyles.pointerEvents = 'none';
    }

    // Création du conteneur principal
    const button = $('button-container', {
      id: buttonId,
      css: containerStyles,
      attrs: { disabled },
      onClick: disabled ? undefined : onClick,
      ...otherProps
    });

    // Ajout de l'icône si présente
    if (icon) {
      const iconElement = $('button-icon', {
        id: `${buttonId}_icon`,
        text: icon,
        css: skin.icon || {}
      });
      
      // Ajustement de la marge si pas de texte
      if (!text) {
        iconElement.$({ css: { marginRight: '0' } });
      }
      
      button.appendChild(iconElement);
    }

    // Ajout du texte si présent
    if (text) {
      const textElement = $('button-text', {
        id: `${buttonId}_text`,
        text,
        css: skin.text || {}
      });
      button.appendChild(textElement);
    }

    // Ajout du badge si présent
    if (badge !== undefined) {
      const badgeElement = $('button-badge', {
        id: `${buttonId}_badge`,
        text: badge.toString(),
        css: skin.badge || {}
      });
      button.appendChild(badgeElement);
    }

    // Méthodes utilitaires spécifiques au bouton
    button.updateText = (newText) => {
      const textEl = button.querySelector('.hs-button-text');
      if (textEl) textEl.textContent = newText;
      return button;
    };

    button.updateBadge = (newBadge) => {
      const badgeEl = button.querySelector('.hs-button-badge');
      if (badgeEl) {
        badgeEl.textContent = newBadge.toString();
      } else if (newBadge !== undefined) {
        // Créer le badge s'il n'existe pas
        const badgeElement = $('button-badge', {
          id: `${buttonId}_badge_new`,
          text: newBadge.toString(),
          css: skin.badge || {}
        });
        button.appendChild(badgeElement);
      }
      return button;
    };

    button.setVariant = (newVariant) => {
      const variantStyles = buttonStyles[newVariant] || {};
      button.$({ css: variantStyles });
      return button;
    };

    button.setDisabled = (isDisabled) => {
      button.disabled = isDisabled;
      button.$({ 
        css: { 
          opacity: isDisabled ? '0.6' : '1',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          pointerEvents: isDisabled ? 'none' : 'auto'
        }
      });
      return button;
    };

    return button;
  };

  // === FONCTION UTILITAIRE DE DRAG ===

  /**
   * Fonction de drag ultra-performante avec transform
   * @param {HTMLElement} element - L'élément à rendre draggable
   * @param {Object} options - Options de configuration
   */
  function makeDraggable(element, options = {}) {
    const {
      onDragStart = () => {},
      onDragMove = () => {},
      onDragEnd = () => {},
      cursor = 'move',
      constrainToParent = false,
      bounds = null,
      rotationFactor = 0,
      scaleFactor = 0
    } = options;

    // Configuration CSS de base
    element.style.cursor = cursor;
    element.style.userSelect = 'none';

    // Variables pour stocker la translation
    let currentX = 0;
    let currentY = 0;

    const onMouseDown = (e) => {
      let isDragging = true;
      let lastX = e.clientX;
      let lastY = e.clientY;

      // Changer le curseur
      const originalCursor = element.style.cursor;
      element.style.cursor = cursor === 'grab' ? 'grabbing' : cursor;

      onDragStart(element, lastX, lastY, currentX, currentY);

      const onMouseMove = (e) => {
        if (!isDragging) return;

        const deltaX = e.clientX - lastX;
        const deltaY = e.clientY - lastY;

        currentX += deltaX;
        currentY += deltaY;

        // Construire le transform avec les effets demandés
        let transformParts = [`translate(${currentX}px, ${currentY}px)`];

        // Ajouter rotation si demandée
        if (rotationFactor > 0) {
          const totalDeltaX = currentX;
          const totalDeltaY = currentY;
          if (Math.abs(totalDeltaX) > 5 || Math.abs(totalDeltaY) > 5) {
            const rotation = Math.atan2(totalDeltaY, totalDeltaX) * (180 / Math.PI) * rotationFactor;
            transformParts.push(`rotate(${rotation}deg)`);
          }
        }

        // Ajouter scale si demandé
        if (scaleFactor > 0) {
          const distance = Math.sqrt(currentX * currentX + currentY * currentY);
          const scale = 1 + (distance * scaleFactor * 0.001);
          transformParts.push(`scale(${Math.min(scale, 1.5)})`); // Max scale 1.5
        }

        // Appliquer la transformation
        element.style.transform = transformParts.join(' ');

        // Callback de mouvement (peut modifier le transform)
        onDragMove(element, currentX, currentY, deltaX, deltaY);

        // Mettre à jour les positions de référence
        lastX = e.clientX;
        lastY = e.clientY;

        e.preventDefault();
      };

      const onMouseUp = (e) => {
        isDragging = false;
        element.style.cursor = originalCursor;

        onDragEnd(element, currentX, currentY, currentX, currentY);

        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('mouseleave', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.addEventListener('mouseleave', onMouseUp);

      e.preventDefault();
    };

    element.addEventListener('mousedown', onMouseDown);

    return () => {
      element.removeEventListener('mousedown', onMouseDown);
      element.style.cursor = '';
      element.style.userSelect = '';
      element.style.transform = '';
    };
  }

  // === TEMPLATES POUR DRAGGABLE ===

  // Template pour un élément draggable basique
  define('draggable-box', {
    tag: 'div',
    class: 'hs-draggable',
    css: {
      position: 'absolute',
      width: '100px',
      height: '100px',
      backgroundColor: '#3498db',
      border: '2px solid #2980b9',
      borderRadius: '8px',
      cursor: 'grab',
      userSelect: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontWeight: 'bold',
      transition: 'box-shadow 0.2s ease'
    }
  });

  // Template pour un handle de drag
  define('drag-handle', {
    tag: 'div',
    class: 'hs-drag-handle',
    css: {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      height: '30px',
      backgroundColor: 'rgba(0,0,0,0.1)',
      borderRadius: '8px 8px 0 0',
      cursor: 'grab',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  });

  // Template pour une drop zone
  define('drop-zone', {
    tag: 'div',
    class: 'hs-drop-zone',
    css: {
      position: 'relative',
      minHeight: '100px',
      border: '2px dashed #bdc3c7',
      borderRadius: '8px',
      backgroundColor: '#ecf0f1',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#7f8c8d',
      fontSize: '14px',
      transition: 'all 0.3s ease',
      margin: '10px'
    }
  });

  // Styles pour les états des drop zones
  define('drop-zone-active', {
    css: {
      borderColor: '#3498db',
      backgroundColor: '#ebf3fd',
      color: '#2980b9'
    }
  });

  define('drop-zone-hover', {
    css: {
      borderColor: '#27ae60',
      backgroundColor: '#e8f5e8',
      color: '#27ae60',
      transform: 'scale(1.02)'
    }
  });

  define('drop-zone-reject', {
    css: {
      borderColor: '#e74c3c',
      backgroundColor: '#fdf2f2',
      color: '#c0392b'
    }
  });

  // === BUILDER PRINCIPAL ===

  /**
   * Créer un élément draggable avec template et options
   * @param {string} template - Template à utiliser
   * @param {Object} config - Configuration du draggable
   */
  function draggable(template = 'draggable-box', config = {}) {
    const {
      // Options de création
      content = 'Drag me!',
      css = {},
      attrs = {},
      parent = null,
      
      // Options de drag
      cursor = 'grab',
      rotationFactor = 0,
      scaleFactor = 0,
      constrainToParent = false,
      bounds = null,
      
      // Callbacks
      onDragStart = () => {},
      onDragMove = () => {},
      onDragEnd = () => {},
      
      // Options d'apparence
      dragActiveClass = 'dragging',
      dragHoverShadow = '0 8px 16px rgba(0,0,0,0.2)'
    } = config;

    // Créer l'élément avec le template
    const element = $(template, {
      content,
      css,
      attrs,
      parent
    });

    // Rendre l'élément draggable
    const destroyDrag = makeDraggable(element, {
      cursor,
      rotationFactor,
      scaleFactor,
      constrainToParent,
      bounds,
      onDragStart: (el, x, y, currentX, currentY) => {
        if (dragActiveClass) el.classList.add(dragActiveClass);
        if (dragHoverShadow) el.style.boxShadow = dragHoverShadow;
        onDragStart(el, x, y, currentX, currentY);
      },
      onDragMove: (el, currentX, currentY, deltaX, deltaY) => {
        onDragMove(el, currentX, currentY, deltaX, deltaY);
      },
      onDragEnd: (el, endX, endY, totalX, totalY) => {
        if (dragActiveClass) el.classList.remove(dragActiveClass);
        if (dragHoverShadow) el.style.boxShadow = '';
        onDragEnd(el, endX, endY, totalX, totalY);
      }
    });

    // Attacher la fonction de destruction à l'élément
    element.destroyDraggable = destroyDrag;

    return element;
  }

  /**
   * 🎯 LIST COMPONENT - VERSION 2.0 MATERIAL DESIGN
   * Composant List avec styles Material Design et personnalisation complète
   */

  class List {
    constructor(options = {}) {
      // console.log('🏗️ Création du composant List avec options:', options);
      
      // Configuration par défaut Material Design
      this.config = {
        id: options.id || `list-${Date.now()}`,
        items: options.items || [],
        position: { x: 0, y: 0, ...options.position },
        size: { width: 300, height: 400, ...options.size },
        
        // Espacement ultra-personnalisable
        spacing: { 
          vertical: options.spacing?.vertical ?? 4,        // Espace entre les éléments
          horizontal: options.spacing?.horizontal ?? 0,    // Marge horizontale
          itemPadding: options.spacing?.itemPadding ?? 16, // Padding interne des éléments
          marginTop: options.spacing?.marginTop ?? 0,      // Marge avant chaque élément
          marginBottom: options.spacing?.marginBottom ?? 0, // Marge après chaque élément
          ...options.spacing 
        },
        
        attach: options.attach || 'body',
        
        // Configuration Material Design des éléments
        itemStyle: {
          fontSize: options.itemStyle?.fontSize ?? '14px',
          fontWeight: options.itemStyle?.fontWeight ?? '400',
          lineHeight: options.itemStyle?.lineHeight ?? '1.4',
          textColor: options.itemStyle?.textColor ?? '#212121',
          backgroundColor: options.itemStyle?.backgroundColor ?? '#ffffff',
          borderRadius: options.itemStyle?.borderRadius ?? '8px',
          ...options.itemStyle
        },
        
        states: {
          hover: {
            backgroundColor: '#f5f5f5',
            boxShadow: '0 2px 4px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.24)',
            transform: 'translateY(-1px)',
            ...options.states?.hover
          },
          selected: {
            backgroundColor: '#1976d2',
            color: '#ffffff',
            boxShadow: '0 4px 8px rgba(25,118,210,0.3)',
            transform: 'translateY(-1px)',
            ...options.states?.selected
          },
          ...options.states
        },
        
        containerStyle: options.containerStyle || {},
        
        // Options Material Design
        selectable: options.selectable !== false,
        multiSelect: options.multiSelect || false,
        elevation: options.elevation ?? 2,
        rippleEffect: options.rippleEffect !== false,
        
        // Debug
        debug: options.debug || false
      };

      // Stockage interne
      this.itemsMap = new Map();
      this.itemStates = new Map();
      this.itemElements = new Map();
      this.selectedItems = new Set();

      // Callbacks
      this.callbacks = {
        onItemClick: options.onItemClick || null,
        onItemSelect: options.onItemSelect || null,
        onItemHover: options.onItemHover || null,
        onItemLeave: options.onItemLeave || null
      };

      // État interne
      this.container = null;
      this.isInitialized = false;

      // Initialisation
      this.init();
    }

    // ========================================
    // 🏗️ INITIALISATION
    // ========================================

    init() {
      try {
  // console.log(`🚀 Initialisation de la liste "${this.config.id}"...`);
        this.createContainer();
        this.createItems();
        this.setupEventListeners();
        this.isInitialized = true;

        if (this.config.debug) {
  // console.log(`✅ List "${this.config.id}" initialisée avec succès`);
  // console.log(`📝 ${this.config.items.length} éléments créés`);
        }
      } catch (error) {
        console.error(`❌ Erreur lors de l'initialisation de List "${this.config.id}":`, error);
      }
    }

    createContainer() {
      const attachPoint = typeof this.config.attach === 'string' 
        ? document.querySelector(this.config.attach) 
        : this.config.attach;

      if (!attachPoint) {
        throw new Error(`Point d'attachement "${this.config.attach}" non trouvé`);
      }

      this.container = document.createElement('div');
      this.container.id = this.config.id;
      this.container.className = 'list-container';
      
      this.applyContainerStyles();
      attachPoint.appendChild(this.container);
      
  // console.log(`📦 Container créé et attaché à "${this.config.attach}"`);
  // console.log(`🔍 Container dans le DOM:`, this.container);
  // console.log(`📐 Dimensions:`, this.container.style.width, 'x', this.container.style.height);
  // console.log(`📍 Position:`, this.container.style.left, this.container.style.top);
    }

    applyContainerStyles() {
      const elevation = this.getElevationShadow(this.config.elevation);
      
      const defaultStyles = {
        position: 'absolute',
        left: `${this.config.position.x}px`,
        top: `${this.config.position.y}px`,
        width: `${this.config.size.width}px`,
        height: `${this.config.size.height}px`,
        overflow: 'auto',
        background: '#ffffff',
        borderRadius: '12px',
        padding: '8px',
        boxShadow: elevation,
        border: 'none',
        fontFamily: 'Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      };

      const finalStyles = { ...defaultStyles, ...this.config.containerStyle };
      Object.assign(this.container.style, finalStyles);
    }

    getElevationShadow(level) {
      const shadows = {
        0: 'none',
        1: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
        2: '0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23)',
        3: '0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23)',
        4: '0 14px 28px rgba(0,0,0,0.25), 0 10px 10px rgba(0,0,0,0.22)',
        5: '0 19px 38px rgba(0,0,0,0.30), 0 15px 12px rgba(0,0,0,0.22)'
      };
      return shadows[level] || shadows[2];
    }

    createItems() {
  // console.log(`📋 Création de ${this.config.items.length} éléments...`);
      this.config.items.forEach((itemData, index) => {
        const itemElement = this.createItem(itemData, index);
        this.container.appendChild(itemElement);
      });
    }

    createItem(itemData, index) {
      const itemElement = document.createElement('div');
      const itemId = itemData.id || `item-${index}`;
      
      itemElement.id = itemId;
      itemElement.className = 'list-item';
      itemElement.textContent = itemData.content || itemData.text || `Élément ${index + 1}`;
      
      // Stockage des données
      this.itemsMap.set(itemId, itemData);
      this.itemElements.set(itemId, itemElement);
      this.itemStates.set(itemId, 'default');
      
      // Application des styles Material Design
      this.applyItemStyles(itemElement, itemData);
      
      return itemElement;
    }

    applyItemStyles(element, itemData) {
      // Styles Material Design avec paramètres personnalisables
      const defaultStyles = {
        // Espacement ultra-personnalisable
        padding: `${this.config.spacing.itemPadding}px`,
        marginTop: `${this.config.spacing.marginTop}px`,
        marginBottom: `${this.config.spacing.vertical}px`,
        marginLeft: `${this.config.spacing.horizontal}px`,
        marginRight: `${this.config.spacing.horizontal}px`,
        
        // Texte personnalisable
        fontSize: this.config.itemStyle.fontSize,
        fontWeight: this.config.itemStyle.fontWeight,
        lineHeight: this.config.itemStyle.lineHeight,
        color: this.config.itemStyle.textColor,
        fontFamily: 'inherit',
        
        // Style Material Design
        background: this.config.itemStyle.backgroundColor,
        borderRadius: this.config.itemStyle.borderRadius,
        border: 'none',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
        
        // Interactions
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)',
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none'
      };

      // Fusion avec styles personnalisés
      const componentStyles = this.config.itemStyle.default || {};
      const itemSpecificStyles = itemData.style || {};
      const finalStyles = { ...defaultStyles, ...componentStyles, ...itemSpecificStyles };
      
      Object.assign(element.style, finalStyles);
      
      // Ajouter l'effet ripple si activé
      if (this.config.rippleEffect) {
        this.addRippleEffect(element);
      }
    }

    addRippleEffect(element) {
      element.addEventListener('click', (e) => {
        const ripple = document.createElement('span');
        const rect = element.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        
        ripple.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        background: rgba(255, 255, 255, 0.6);
        border-radius: 50%;
        transform: scale(0);
        animation: ripple 0.6s linear;
        pointer-events: none;
        z-index: 1;
      `;
        
        // Ajouter l'animation CSS si elle n'existe pas
        if (!document.getElementById('ripple-styles')) {
          const style = document.createElement('style');
          style.id = 'ripple-styles';
          style.textContent = `
          @keyframes ripple {
            to {
              transform: scale(4);
              opacity: 0;
            }
          }
        `;
          document.head.appendChild(style);
        }
        
        element.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
      });
    }

    setupEventListeners() {
      this.container.addEventListener('click', (e) => {
        const itemElement = e.target.closest('.list-item');
        if (itemElement) {
          this.handleItemClick(itemElement, e);
        }
      });

      this.container.addEventListener('mouseover', (e) => {
        const itemElement = e.target.closest('.list-item');
        if (itemElement) {
          this.handleItemHover(itemElement);
        }
      });

      this.container.addEventListener('mouseout', (e) => {
        const itemElement = e.target.closest('.list-item');
        if (itemElement) {
          this.handleItemLeave(itemElement);
        }
      });
    }

    // ========================================
    // 🎭 GESTION DES ÉVÉNEMENTS
    // ========================================

    handleItemClick(element, event) {
      const itemId = element.id;
      const itemData = this.itemsMap.get(itemId);
      const index = Array.from(this.itemElements.values()).indexOf(element);

      if (this.config.selectable) {
        this.toggleSelection(itemId);
      }

      if (this.callbacks.onItemClick) {
        this.callbacks.onItemClick(itemData, index, event);
      }
    }

    handleItemHover(element) {
      const itemId = element.id;
      this.applyState(itemId, 'hover');

      if (this.callbacks.onItemHover) {
        const itemData = this.itemsMap.get(itemId);
        this.callbacks.onItemHover(itemData);
      }
    }

    handleItemLeave(element) {
      const itemId = element.id;
      const currentState = this.itemStates.get(itemId);
      
      if (currentState === 'hover') {
        const isSelected = this.selectedItems.has(itemId);
        this.applyState(itemId, isSelected ? 'selected' : 'default');
      }

      if (this.callbacks.onItemLeave) {
        const itemData = this.itemsMap.get(itemId);
        this.callbacks.onItemLeave(itemData);
      }
    }

    // ========================================
    // 🎨 GESTION DES ÉTATS
    // ========================================

    applyState(itemId, stateName) {
      const element = this.itemElements.get(itemId);
      if (!element) return;

      const stateStyles = this.config.states[stateName] || {};
      
      if (stateName === 'default') {
        const itemData = this.itemsMap.get(itemId);
        this.applyItemStyles(element, itemData);
      } else {
        Object.assign(element.style, stateStyles);
      }

      this.itemStates.set(itemId, stateName);
    }

    toggleSelection(itemId) {
      const isSelected = this.selectedItems.has(itemId);

      if (!this.config.multiSelect && !isSelected) {
        this.selectedItems.forEach(selectedId => {
          this.selectedItems.delete(selectedId);
          this.applyState(selectedId, 'default');
        });
      }

      if (isSelected) {
        this.selectedItems.delete(itemId);
        this.applyState(itemId, 'default');
      } else {
        this.selectedItems.add(itemId);
        this.applyState(itemId, 'selected');
      }

      if (this.callbacks.onItemSelect) {
        const itemData = this.itemsMap.get(itemId);
        this.callbacks.onItemSelect(itemData, !isSelected);
      }
    }

    // ========================================
    // 🔧 API PUBLIQUE
    // ========================================

    addItem(itemData) {
      const index = this.config.items.length;
      this.config.items.push(itemData);
      
      const itemElement = this.createItem(itemData, index);
      this.container.appendChild(itemElement);
      
      return itemData.id || `item-${index}`;
    }

    removeItem(itemId) {
      const element = this.itemElements.get(itemId);
      if (element) {
        element.remove();
        this.itemElements.delete(itemId);
        this.itemsMap.delete(itemId);
        this.itemStates.delete(itemId);
        this.selectedItems.delete(itemId);
      }
    }

    getSelectedItems() {
      return Array.from(this.selectedItems).map(id => this.itemsMap.get(id));
    }

    clearSelection() {
      this.selectedItems.forEach(itemId => {
        this.applyState(itemId, 'default');
      });
      this.selectedItems.clear();
    }

    // Nouvelle méthode pour mettre à jour les styles d'espacement
    updateSpacing(newSpacing) {
      this.config.spacing = { ...this.config.spacing, ...newSpacing };
      // Réappliquer les styles à tous les éléments
      this.itemElements.forEach((element, itemId) => {
        const itemData = this.itemsMap.get(itemId);
        this.applyItemStyles(element, itemData);
      });
    }

    // Nouvelle méthode pour mettre à jour les styles de texte
    updateTextStyle(newTextStyle) {
      this.config.itemStyle = { ...this.config.itemStyle, ...newTextStyle };
      // Réappliquer les styles à tous les éléments
      this.itemElements.forEach((element, itemId) => {
        const itemData = this.itemsMap.get(itemId);
        this.applyItemStyles(element, itemData);
      });
    }

    destroy() {
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
      
      this.itemsMap.clear();
      this.itemElements.clear();
      this.itemStates.clear();
      this.selectedItems.clear();
      
      this.isInitialized = false;
    }
  }

  // === FONCTION DE CRÉATION PRINCIPALE ===
  function createList(options = {}) {
    const list = new List(options);
    list.init();
    return list.container;
  }

  /**
   * 🎯 MATRIX COMPONENT - VERSION 2.0 COMPLÈTE
   * Composant Matrix avec gestion d'état granulaire et customisation complète des cellules
   */

  class Matrix {
    constructor(options = {}) {
      // Configuration par défaut
      this.config = {
        id: options.id || `matrix-${Date.now()}`,
        grid: { x: 4, y: 4, ...options.grid },
        size: { width: 400, height: 400, ...options.size },
        position: { x: 0, y: 0, ...options.position },
        spacing: { horizontal: 8, vertical: 8, external: 16, ...options.spacing },
        attach: options.attach || 'body',
        
        // Configuration des cellules
        cells: options.cells || {},
        states: options.states || {},
        containerStyle: options.containerStyle || {},
        
        // Options avancées
        debug: options.debug || false,
        responsive: options.responsive !== false,
        autoResize: options.autoResize !== false,
        maintainAspectRatio: options.maintainAspectRatio || false
      };

      // Stockage interne
      this.cellsMap = new Map();           // Map des cellules avec leurs données
      this.cellStates = new Map();         // États par cellule
      this.cellElements = new Map();       // Éléments DOM par cellule
      this.selectedCells = new Set();      // Cellules sélectionnées

      // Callbacks
      this.callbacks = {
        onCellClick: options.onCellClick || null,
        onCellDoubleClick: options.onCellDoubleClick || null,
        onCellLongClick: options.onCellLongClick || null,
        onCellHover: options.onCellHover || null,
        onCellLeave: options.onCellLeave || null,
        onCellStateChange: options.onCellStateChange || null,
        onSelectionChange: options.onSelectionChange || null,
        onResize: options.onResize || null
      };

      // État interne
      this.container = null;
      this.longClickTimer = null;
      this.resizeObserver = null;
      this.isInitialized = false;

      // Initialisation
      this.init();
    }

    // ========================================
    // 🏗️ INITIALISATION
    // ========================================

    init() {
      try {
        this.createContainer();
        this.createCells();
        this.setupEventListeners();
        this.setupResizeObserver();
        this.applyInitialStates();
        this.isInitialized = true;

        if (this.config.debug) {
  // console.log(`✅ Matrix "${this.config.id}" initialisée avec succès`);
  // console.log(`📊 ${this.config.grid.x}×${this.config.grid.y} = ${this.getTotalCells()} cellules`);
        }
      } catch (error) {
        console.error(`❌ Erreur lors de l'initialisation de Matrix "${this.config.id}":`, error);
      }
    }

    createContainer() {
      // Attachement au DOM
      const attachPoint = typeof this.config.attach === 'string' 
        ? document.querySelector(this.config.attach) 
        : this.config.attach;

      if (!attachPoint) {
        throw new Error(`Point d'attachement "${this.config.attach}" non trouvé`);
      }

      // Création du container principal
      this.container = document.createElement('div');
      this.container.id = this.config.id;
      this.container.className = 'matrix-container';
      
      // Application des styles
      this.applyContainerStyles();
      
      attachPoint.appendChild(this.container);
    }

    applyContainerStyles() {
      const defaultStyles = {
        position: 'absolute',
        left: `${this.config.position.x}px`,
        top: `${this.config.position.y}px`,
        display: 'grid',
        gridTemplateColumns: `repeat(${this.config.grid.x}, 1fr)`,
        gridTemplateRows: `repeat(${this.config.grid.y}, 1fr)`,
        gap: `${this.config.spacing.vertical}px ${this.config.spacing.horizontal}px`,
        background: '#f8f9fa',
        borderRadius: '12px',
        border: '1px solid #dee2e6',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        userSelect: 'none',
        boxSizing: 'border-box'
      };

      // Gestion du redimensionnement automatique
      if (this.config.autoResize) {
        // Mode responsive : s'adapte au parent
        Object.assign(defaultStyles, {
          position: 'relative',
          left: 'auto',
          top: 'auto',
          width: '100%',
          height: '100%',
          padding: `${this.config.spacing.external}px`
        });
      } else {
        // Mode taille fixe
        Object.assign(defaultStyles, {
          width: `${this.config.size.width}px`,
          height: `${this.config.size.height}px`,
          padding: `${this.config.spacing.external}px`
        });
      }

      // Fusion avec les styles personnalisés
      const finalStyles = { ...defaultStyles, ...this.config.containerStyle };
      Object.assign(this.container.style, finalStyles);
    }

    createCells() {
      for (let y = 0; y < this.config.grid.y; y++) {
        for (let x = 0; x < this.config.grid.x; x++) {
          this.createCell(x, y);
        }
      }
    }

    createCell(x, y) {
      const cellKey = `${x},${y}`;
      const cellConfig = this.config.cells[cellKey] || {};
      const defaultConfig = this.config.cells.default || {};
      
      // ID de la cellule (personnalisé ou auto-généré)
      const cellId = cellConfig.id || `${this.config.id}-cell-${x}-${y}`;

      // Création de l'élément DOM
      const cellElement = document.createElement('div');
      cellElement.id = cellId;
      cellElement.className = 'matrix-cell';
      cellElement.tabIndex = 0;
      cellElement.setAttribute('data-x', x);
      cellElement.setAttribute('data-y', y);
      cellElement.setAttribute('data-cell-id', cellId);
      cellElement.setAttribute('role', 'button');
      cellElement.setAttribute('aria-label', `Cellule ${x}, ${y}`);

      // Contenu de la cellule
      const content = cellConfig.content || defaultConfig.content || '';
      cellElement.textContent = content;

      // Styles par défaut des cellules
      const defaultCellStyles = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ffffff',
        border: '1px solid #dee2e6',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: '500',
        minHeight: '40px',
        transition: 'all 0.2s ease',
        userSelect: 'none'
      };

      // Application des styles (défaut + personnalisés)
      const cellStyles = { 
        ...defaultCellStyles, 
        ...defaultConfig.style, 
        ...cellConfig.style 
      };
      Object.assign(cellElement.style, cellStyles);

      // Stockage des données de la cellule
      this.cellsMap.set(cellKey, {
        id: cellId,
        x, y,
        content,
        element: cellElement,
        config: cellConfig
      });

      // Stockage de l'élément DOM
      this.cellElements.set(cellKey, cellElement);

      // Initialisation des états
      const initialStates = new Set(['normal']);
      if (cellConfig.states) {
        cellConfig.states.forEach(state => initialStates.add(state));
      }
      this.cellStates.set(cellKey, initialStates);

      // Debug mode
      if (this.config.debug) {
        cellElement.setAttribute('title', `Cellule (${x}, ${y}) - ID: ${cellId}`);
      }

      this.container.appendChild(cellElement);
    }

    applyInitialStates() {
      // Application des styles d'états initiaux
      this.cellStates.forEach((states, cellKey) => {
        states.forEach(stateName => {
          if (stateName !== 'normal' && this.config.states[stateName]) {
            const [x, y] = cellKey.split(',').map(Number);
            this.applyCellStateStyle(x, y, stateName);
          }
        });
      });
    }

    // ========================================
    // 🎯 GESTION DES ÉVÉNEMENTS
    // ========================================

    setupEventListeners() {
      // Event delegation sur le container
      this.container.addEventListener('click', this.handleCellClick.bind(this));
      this.container.addEventListener('dblclick', this.handleCellDoubleClick.bind(this));
      this.container.addEventListener('mousedown', this.handleCellMouseDown.bind(this));
      this.container.addEventListener('mouseup', this.handleCellMouseUp.bind(this));
      this.container.addEventListener('mouseenter', this.handleCellHover.bind(this), true);
      this.container.addEventListener('mouseleave', this.handleCellLeave.bind(this), true);
      this.container.addEventListener('keydown', this.handleCellKeyDown.bind(this));
    }

    handleCellClick(event) {
      const cellData = this.getCellFromEvent(event);
      if (!cellData) return;

      const { x, y, id, element } = cellData;

      // Callback
      if (this.callbacks.onCellClick) {
        this.callbacks.onCellClick(element, x, y, id, event);
      }
    }

    handleCellDoubleClick(event) {
      const cellData = this.getCellFromEvent(event);
      if (!cellData) return;

      const { x, y, id, element } = cellData;

      // Callback
      if (this.callbacks.onCellDoubleClick) {
        this.callbacks.onCellDoubleClick(element, x, y, id, event);
      }
    }

    handleCellMouseDown(event) {
      const cellData = this.getCellFromEvent(event);
      if (!cellData) return;

      const { x, y, id, element } = cellData;

      // Démarrage du timer pour long click
      this.longClickTimer = setTimeout(() => {
        if (this.callbacks.onCellLongClick) {
          this.callbacks.onCellLongClick(element, x, y, id, event);
        }
      }, 500);
    }

    handleCellMouseUp(event) {
      // Annulation du long click
      if (this.longClickTimer) {
        clearTimeout(this.longClickTimer);
        this.longClickTimer = null;
      }
    }

    handleCellHover(event) {
      const cellData = this.getCellFromEvent(event);
      if (!cellData || !event.target.classList.contains('matrix-cell')) return;

      const { x, y, id, element } = cellData;

      // Application du style hover s'il est défini
      if (this.config.states.hover) {
        this.applyStylesToElement(element, this.config.states.hover, true);
      }

      // Callback
      if (this.callbacks.onCellHover) {
        this.callbacks.onCellHover(element, x, y, id, event);
      }
    }

    handleCellLeave(event) {
      const cellData = this.getCellFromEvent(event);
      if (!cellData || !event.target.classList.contains('matrix-cell')) return;

      const { x, y, id, element } = cellData;

      // Suppression du style hover et réapplication des styles d'états
      this.reapplyCellStyles(x, y);

      // Callback
      if (this.callbacks.onCellLeave) {
        this.callbacks.onCellLeave(element, x, y, id, event);
      }
    }

    handleCellKeyDown(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.handleCellClick(event);
      }
    }

    getCellFromEvent(event) {
      const cellElement = event.target.closest('.matrix-cell');
      if (!cellElement) return null;

      const x = parseInt(cellElement.getAttribute('data-x'));
      const y = parseInt(cellElement.getAttribute('data-y'));
      const id = cellElement.getAttribute('data-cell-id');
      const cellKey = `${x},${y}`;
      const cellData = this.cellsMap.get(cellKey);

      return { x, y, id, element: cellElement, cellData };
    }

    // ========================================
    // 🗂️ GESTION D'ÉTAT DES CELLULES
    // ========================================

    getCellState(x, y) {
      const cellKey = `${x},${y}`;
      const states = this.cellStates.get(cellKey);
      if (!states || states.size === 0) return null;
      
      // Retourne l'état principal (le dernier ajouté qui n'est pas 'normal')
      const statesArray = Array.from(states);
      return statesArray.find(state => state !== 'normal') || 'normal';
    }

    getCellStates(x, y) {
      const cellKey = `${x},${y}`;
      const states = this.cellStates.get(cellKey);
      return states ? Array.from(states) : [];
    }

    hasCellState(x, y, stateName) {
      const cellKey = `${x},${y}`;
      const states = this.cellStates.get(cellKey);
      return states ? states.has(stateName) : false;
    }

    setCellState(x, y, stateName, active = true) {
      const cellKey = `${x},${y}`;
      const states = this.cellStates.get(cellKey) || new Set();
      const cell = this.cellsMap.get(cellKey);

      if (!cell) return;

      const wasActive = states.has(stateName);

      if (active && !wasActive) {
        states.add(stateName);
        this.applyCellStateStyle(x, y, stateName);
      } else if (!active && wasActive) {
        states.delete(stateName);
        this.removeCellStateStyle(x, y, stateName);
      }

      this.cellStates.set(cellKey, states);

      // Gestion de la sélection
      if (stateName === 'selected') {
        if (active) {
          this.selectedCells.add(cellKey);
        } else {
          this.selectedCells.delete(cellKey);
        }
        this.triggerSelectionChange();
      }

      // Callback
      if (this.callbacks.onCellStateChange && wasActive !== active) {
        this.callbacks.onCellStateChange(cell.element, x, y, stateName, active);
      }
    }

    addCellState(x, y, stateName) {
      this.setCellState(x, y, stateName, true);
    }

    removeCellState(x, y, stateName) {
      this.setCellState(x, y, stateName, false);
    }

    toggleCellState(x, y, stateName) {
      const hasState = this.hasCellState(x, y, stateName);
      this.setCellState(x, y, stateName, !hasState);
      return !hasState;
    }

    clearCellStates(x, y) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      
      if (!cell) return;

      // Retour au style par défaut
      this.resetCellStyle(x, y);
      
      // Réinitialisation avec état normal uniquement
      this.cellStates.set(cellKey, new Set(['normal']));
      
      // Suppression de la sélection
      this.selectedCells.delete(cellKey);
      this.triggerSelectionChange();
    }

    applyCellStateStyle(x, y, stateName) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      const stateStyle = this.config.states[stateName];

      if (cell && stateStyle) {
        // Application des styles avec priorité !important pour éviter les conflits
        this.applyStylesToElement(cell.element, stateStyle, true);
      }
    }

    removeCellStateStyle(x, y, stateName) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      
      if (!cell) return;

      // Suppression spécifique des propriétés CSS de cet état
      const stateStyle = this.config.states[stateName];
      if (stateStyle) {
        Object.keys(stateStyle).forEach(property => {
          const cssProp = property.replace(/([A-Z])/g, '-$1').toLowerCase();
          cell.element.style.removeProperty(cssProp);
        });
      }

      // Réapplication des styles d'états restants
      this.reapplyCellStyles(x, y);
    }

    reapplyCellStyles(x, y) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      const states = this.cellStates.get(cellKey);

      if (!cell || !states) return;

      // Reset et réapplication des styles de base
      this.resetCellStyle(x, y);

      // Réapplication des styles d'états actifs avec priorité !important
      states.forEach(stateName => {
        if (stateName !== 'normal' && this.config.states[stateName]) {
          this.applyStylesToElement(cell.element, this.config.states[stateName], true);
        }
      });
    }

    // ========================================
    // 📐 MÉTHODES DE REDIMENSIONNEMENT
    // ========================================

    /**
     * Force un redimensionnement manuel de la matrice
     * @param {number} width - Nouvelle largeur (optionnel)
     * @param {number} height - Nouvelle hauteur (optionnel)
     */
    resize(width, height) {
      if (width !== undefined && height !== undefined) {
        this.config.size.width = width;
        this.config.size.height = height;
        
        if (!this.config.autoResize) {
          this.container.style.width = `${width}px`;
          this.container.style.height = `${height}px`;
        }
      }
      
      this.updateCellSizes();
      
      if (this.config.debug) ;
    }

    /**
     * Active ou désactive le redimensionnement automatique
     * @param {boolean} enabled - Activer ou désactiver
     */
    setAutoResize(enabled) {
      const wasEnabled = this.config.autoResize;
      this.config.autoResize = enabled;

      if (enabled && !wasEnabled) {
        // Activation du redimensionnement automatique
        this.applyContainerStyles();
        this.setupResizeObserver();
      } else if (!enabled && wasEnabled) {
        // Désactivation du redimensionnement automatique
        this.disconnectResizeObserver();
        this.applyContainerStyles();
      }
    }

    /**
     * Déconnecte le ResizeObserver
     */
    disconnectResizeObserver() {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
    }

    /**
     * S'adapte à un élément parent spécifique
     * @param {HTMLElement|string} parentElement - Élément parent ou sélecteur
     */
    fitToParent(parentElement) {
      const parent = typeof parentElement === 'string' 
        ? document.querySelector(parentElement) 
        : parentElement;

      if (!parent) {
        console.error('❌ Élément parent non trouvé');
        return;
      }

      // Déplacement vers le nouveau parent
      parent.appendChild(this.container);
      
      // Activation du redimensionnement automatique
      this.setAutoResize(true);
      
      // Force une mise à jour immédiate
      const rect = parent.getBoundingClientRect();
      this.handleResize({ contentRect: rect });
    }

    /**
     * Ajuste automatiquement la taille des cellules en fonction de leur contenu
     * @param {Object} options - Options d'ajustement
     */
    autoSizeCells(options = {}) {
      const { 
        minWidth = 40, 
        minHeight = 40, 
        padding = 8,
        fontSize = null 
      } = options;

      this.cellsMap.forEach((cell, cellKey) => {
        const element = cell.element;
        const content = element.textContent || '';
        
        if (content.length > 0) {
          // Créer un élément temporaire pour mesurer le texte
          const measureEl = document.createElement('div');
          measureEl.style.cssText = `
          position: absolute;
          top: -9999px;
          left: -9999px;
          visibility: hidden;
          white-space: nowrap;
          font-family: ${element.style.fontFamily || 'inherit'};
          font-size: ${fontSize || element.style.fontSize || '14px'};
          font-weight: ${element.style.fontWeight || 'inherit'};
        `;
          measureEl.textContent = content;
          document.body.appendChild(measureEl);
          
          const textWidth = measureEl.offsetWidth;
          const textHeight = measureEl.offsetHeight;
          
          document.body.removeChild(measureEl);
          
          // Appliquer les nouvelles dimensions
          const newWidth = Math.max(textWidth + padding * 2, minWidth);
          const newHeight = Math.max(textHeight + padding * 2, minHeight);
          
          element.style.width = `${newWidth}px`;
          element.style.height = `${newHeight}px`;
        }
      });
      
      if (this.config.debug) ;
    }

    /**
     * Redimensionne la grille pour s'adapter au contenu
     * @param {Object} options - Options de redimensionnement
     */
    fitToContent(options = {}) {
      this.autoSizeCells(options);
      
      // Recalcul de la taille du container
      let maxWidth = 0;
      let maxHeight = 0;
      
      this.cellsMap.forEach((cell) => {
        const rect = cell.element.getBoundingClientRect();
        maxWidth = Math.max(maxWidth, rect.width);
        maxHeight = Math.max(maxHeight, rect.height);
      });
      
      const totalWidth = (maxWidth * this.config.grid.x) + 
                        (this.config.spacing.horizontal * (this.config.grid.x - 1)) + 
                        (this.config.spacing.external * 2);
                        
      const totalHeight = (maxHeight * this.config.grid.y) + 
                         (this.config.spacing.vertical * (this.config.grid.y - 1)) + 
                         (this.config.spacing.external * 2);
      
      this.resize(totalWidth, totalHeight);
    }

    setupResizeObserver() {
      if (!this.config.autoResize || !window.ResizeObserver) return;

      // Observer pour détecter les changements de taille du parent
      this.resizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
          this.handleResize(entry);
        }
      });

      // Observer le parent du container
      const parent = this.container.parentElement;
      if (parent) {
        this.resizeObserver.observe(parent);
      }
    }

    handleResize(entry) {
      if (!this.config.autoResize) return;

      const { width, height } = entry.contentRect;
      
      if (this.config.debug) ;

      // Mise à jour de la configuration interne
      this.config.size.width = width;
      this.config.size.height = height;

      // Redimensionnement des cellules si nécessaire
      this.updateCellSizes();

      // Callback de redimensionnement si défini
      if (this.callbacks.onResize) {
        this.callbacks.onResize(width, height);
      }
    }

    updateCellSizes() {
      if (!this.config.autoResize) return;

      // Les cellules se redimensionnent automatiquement grâce au CSS Grid
      // Mais on peut ajuster certaines propriétés si nécessaire
      
      const containerRect = this.container.getBoundingClientRect();
      const availableWidth = containerRect.width - (2 * this.config.spacing.external);
      const availableHeight = containerRect.height - (2 * this.config.spacing.external);
      
      const cellWidth = (availableWidth - (this.config.spacing.horizontal * (this.config.grid.x - 1))) / this.config.grid.x;
      const cellHeight = (availableHeight - (this.config.spacing.vertical * (this.config.grid.y - 1))) / this.config.grid.y;

      // Maintien du ratio d'aspect si demandé
      if (this.config.maintainAspectRatio) {
        const minSize = Math.min(cellWidth, cellHeight);
        this.cellsMap.forEach((cell) => {
          cell.element.style.width = `${minSize}px`;
          cell.element.style.height = `${minSize}px`;
        });
      }

      if (this.config.debug) ;
    }
    // ========================================
    // 🎨 UTILITAIRES DE STYLES
    // ========================================

    /**
     * Applique un objet de styles à un élément avec gestion automatique camelCase/kebab-case
     * @param {HTMLElement} element - Élément DOM
     * @param {Object} styles - Objet de styles
     * @param {boolean} important - Utiliser !important
     */
    applyStylesToElement(element, styles, important = false) {
      Object.entries(styles).forEach(([property, value]) => {
        if (typeof value === 'string' || typeof value === 'number') {
          const cssProp = property.replace(/([A-Z])/g, '-$1').toLowerCase();
          element.style.setProperty(cssProp, String(value), important ? 'important' : '');
        }
      });
    }

    /**
     * Convertit un nom de propriété camelCase en kebab-case
     * @param {string} camelCase - Propriété en camelCase
     * @returns {string} Propriété en kebab-case
     */
    camelToKebab(camelCase) {
      return camelCase.replace(/([A-Z])/g, '-$1').toLowerCase();
    }

    // ========================================
    // 🔍 INTERROGATION GLOBALE
    // ========================================

    getCellsByState(stateName) {
      const result = [];
      
      this.cellStates.forEach((states, cellKey) => {
        if (states.has(stateName)) {
          const [x, y] = cellKey.split(',').map(Number);
          const cell = this.cellsMap.get(cellKey);
          result.push({ x, y, id: cell.id, element: cell.element });
        }
      });

      return result;
    }

    getCellsWithAnyState(stateNames) {
      const result = [];
      
      this.cellStates.forEach((states, cellKey) => {
        const hasAnyState = stateNames.some(stateName => states.has(stateName));
        if (hasAnyState) {
          const [x, y] = cellKey.split(',').map(Number);
          const cell = this.cellsMap.get(cellKey);
          result.push({ 
            x, y, 
            id: cell.id, 
            element: cell.element, 
            states: Array.from(states) 
          });
        }
      });

      return result;
    }

    getCellsWithAllStates(stateNames) {
      const result = [];
      
      this.cellStates.forEach((states, cellKey) => {
        const hasAllStates = stateNames.every(stateName => states.has(stateName));
        if (hasAllStates) {
          const [x, y] = cellKey.split(',').map(Number);
          const cell = this.cellsMap.get(cellKey);
          result.push({ 
            x, y, 
            id: cell.id, 
            element: cell.element, 
            states: Array.from(states) 
          });
        }
      });

      return result;
    }

    getStateCount(stateName) {
      let count = 0;
      this.cellStates.forEach(states => {
        if (states.has(stateName)) count++;
      });
      return count;
    }

    getAllStates() {
      const allStates = new Set();
      this.cellStates.forEach(states => {
        states.forEach(state => allStates.add(state));
      });
      return Array.from(allStates);
    }

    getStateDistribution() {
      const distribution = {};
      this.cellStates.forEach(states => {
        states.forEach(state => {
          distribution[state] = (distribution[state] || 0) + 1;
        });
      });
      return distribution;
    }

    // ========================================
    // 🔍 RECHERCHE AVANCÉE
    // ========================================

    findCells(criteria) {
      const result = [];
      
      this.cellsMap.forEach((cell, cellKey) => {
        const [x, y] = cellKey.split(',').map(Number);
        let matches = true;

        // Vérification des critères
        if (criteria.state && !this.hasCellState(x, y, criteria.state)) {
          matches = false;
        }
        
        if (criteria.hasContent !== undefined) {
          const hasContent = cell.content && cell.content.trim().length > 0;
          if (criteria.hasContent !== hasContent) {
            matches = false;
          }
        }
        
        if (criteria.position) {
          if (criteria.position.x) {
            if (criteria.position.x.min !== undefined && x < criteria.position.x.min) matches = false;
            if (criteria.position.x.max !== undefined && x > criteria.position.x.max) matches = false;
          }
          if (criteria.position.y) {
            if (criteria.position.y.min !== undefined && y < criteria.position.y.min) matches = false;
            if (criteria.position.y.max !== undefined && y > criteria.position.y.max) matches = false;
          }
        }

        if (matches) {
          result.push({ 
            x, y, 
            id: cell.id, 
            element: cell.element,
            content: cell.content,
            states: this.getCellStates(x, y)
          });
        }
      });

      return result;
    }

    getCellsInRange(x1, y1, x2, y2) {
      const result = [];
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const cellKey = `${x},${y}`;
          const cell = this.cellsMap.get(cellKey);
          if (cell) {
            result.push({ 
              x, y, 
              id: cell.id, 
              element: cell.element 
            });
          }
        }
      }

      return result;
    }

    getCellsInRow(rowIndex) {
      const result = [];
      for (let x = 0; x < this.config.grid.x; x++) {
        const cellKey = `${x},${rowIndex}`;
        const cell = this.cellsMap.get(cellKey);
        if (cell) {
          result.push({ 
            x, 
            y: rowIndex, 
            id: cell.id, 
            element: cell.element 
          });
        }
      }
      return result;
    }

    getCellsInColumn(columnIndex) {
      const result = [];
      for (let y = 0; y < this.config.grid.y; y++) {
        const cellKey = `${columnIndex},${y}`;
        const cell = this.cellsMap.get(cellKey);
        if (cell) {
          result.push({ 
            x: columnIndex, 
            y, 
            id: cell.id, 
            element: cell.element 
          });
        }
      }
      return result;
    }

    compareCellStates(x1, y1, x2, y2) {
      const states1 = new Set(this.getCellStates(x1, y1));
      const states2 = new Set(this.getCellStates(x2, y2));
      
      const same = [...states1].every(state => states2.has(state)) && 
                   [...states2].every(state => states1.has(state));
      
      const common = [...states1].filter(state => states2.has(state));
      const different1 = [...states1].filter(state => !states2.has(state));
      const different2 = [...states2].filter(state => !states1.has(state));
      
      return { same, common, different1, different2 };
    }

    findSimilarCells(x, y) {
      const referenceStates = new Set(this.getCellStates(x, y));
      const result = [];
      
      this.cellStates.forEach((states, cellKey) => {
        const [cellX, cellY] = cellKey.split(',').map(Number);
        
        // Skip la cellule de référence
        if (cellX === x && cellY === y) return;
        
        // Vérifier si les états sont identiques
        const same = states.size === referenceStates.size && 
                     [...states].every(state => referenceStates.has(state));
        
        if (same) {
          const cell = this.cellsMap.get(cellKey);
          result.push({ 
            x: cellX, 
            y: cellY, 
            id: cell.id, 
            element: cell.element 
          });
        }
      });
      
      return result;
    }

    groupCellsByState() {
      const groups = {};
      
      this.cellStates.forEach((states, cellKey) => {
        const [x, y] = cellKey.split(',').map(Number);
        const cell = this.cellsMap.get(cellKey);
        
        states.forEach(stateName => {
          if (!groups[stateName]) {
            groups[stateName] = [];
          }
          groups[stateName].push({ 
            x, y, 
            id: cell.id, 
            element: cell.element 
          });
        });
      });
      
      return groups;
    }

    // ========================================
    // 📝 GESTION DU CONTENU ET STYLES
    // ========================================

    getCellId(x, y) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      return cell ? cell.id : null;
    }

    getCellContent(x, y) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      return cell ? cell.content : null;
    }

    setCellContent(x, y, content) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      
      if (cell) {
        cell.content = content;
        cell.element.textContent = content;
      }
    }

    getCellStyle(x, y) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      return cell ? cell.element.style : null;
    }

    setCellStyle(x, y, styles) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      
      if (cell) {
        Object.assign(cell.element.style, styles);
      }
    }

    resetCellStyle(x, y) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      
      if (cell) {
        // Récupération des styles de base
        const cellConfig = cell.config;
        const defaultConfig = this.config.cells.default || {};
        
        const defaultCellStyles = {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#ffffff',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500',
          minHeight: '40px',
          transition: 'all 0.2s ease',
          userSelect: 'none'
        };

        const baseStyles = { 
          ...defaultCellStyles, 
          ...defaultConfig.style, 
          ...cellConfig.style 
        };

        // Reset complet du style
        cell.element.removeAttribute('style');
        
        // Réapplication des styles de base avec priorité normale
        this.applyStylesToElement(cell.element, baseStyles, false);
      }
    }

    // ========================================
    // 🎯 GESTION DE LA SÉLECTION
    // ========================================

    getSelectedCells() {
      const result = [];
      this.selectedCells.forEach(cellKey => {
        const [x, y] = cellKey.split(',').map(Number);
        const cell = this.cellsMap.get(cellKey);
        result.push({ 
          x, y, 
          id: cell.id, 
          element: cell.element 
        });
      });
      return result;
    }

    clearSelection() {
      const selectedCoords = Array.from(this.selectedCells);
      selectedCoords.forEach(cellKey => {
        const [x, y] = cellKey.split(',').map(Number);
        this.removeCellState(x, y, 'selected');
      });
    }

    triggerSelectionChange() {
      if (this.callbacks.onSelectionChange) {
        this.callbacks.onSelectionChange(this.getSelectedCells());
      }
    }

    // ========================================
    // 📊 UTILITAIRES ET STATISTIQUES
    // ========================================

    getTotalCells() {
      return this.config.grid.x * this.config.grid.y;
    }

    getCell(x, y) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      return cell ? cell.element : null;
    }

    getCellData(x, y) {
      const cellKey = `${x},${y}`;
      return this.cellsMap.get(cellKey);
    }

    // ========================================
    // 🧹 NETTOYAGE
    // ========================================

    destroy() {
      try {
        // Nettoyage des timers
        if (this.longClickTimer) {
          clearTimeout(this.longClickTimer);
          this.longClickTimer = null;
        }

        // Nettoyage du ResizeObserver
        this.disconnectResizeObserver();

        // Suppression des event listeners
        if (this.container) {
          this.container.removeEventListener('click', this.handleCellClick);
          this.container.removeEventListener('dblclick', this.handleCellDoubleClick);
          this.container.removeEventListener('mousedown', this.handleCellMouseDown);
          this.container.removeEventListener('mouseup', this.handleCellMouseUp);
          this.container.removeEventListener('mouseenter', this.handleCellHover);
          this.container.removeEventListener('mouseleave', this.handleCellLeave);
          this.container.removeEventListener('keydown', this.handleCellKeyDown);

          // Suppression du DOM
          if (this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
          }
        }

        // Nettoyage des Maps
        this.cellsMap.clear();
        this.cellStates.clear();
        this.cellElements.clear();
        this.selectedCells.clear();

        // Reset des callbacks
        this.callbacks = {};

  // console.log(`✅ Matrix "${this.config.id}" détruite avec succès`);
      } catch (error) {
        console.error(`❌ Erreur lors de la destruction de Matrix "${this.config.id}":`, error);
      }
    }
  }

  // ========================================
  // 🌟 EXPORT DU MODULE
  // ========================================

  // Factory functions pour usage simplifié
  function createMatrix(options) {
    return new Matrix(options);
  }

  /**
   * 🍽️ MENU COMPONENT - VERSION 2.0 FUNCTIONAL
   * Composant Menu ultra-flexible avec pattern fonctionnel pour bundling CDN
   */

  // === FONCTION PRINCIPALE DE CRÉATION ===
  function createMenu(options = {}) {
    // Configuration par défaut
    const config = {
      id: options.id || `menu-${Date.now()}`,
      position: { x: 0, y: 0, ...options.position },
      size: { width: 'auto', height: 'auto', ...options.size },
      attach: options.attach || 'body',
      
      // Layout & Behavior
      layout: {
        direction: 'horizontal', // horizontal, vertical, grid
        wrap: false,
        justify: 'flex-start', // flex-start, center, flex-end, space-between, space-around
        align: 'center', // flex-start, center, flex-end, stretch
        gap: '8px',
        ...options.layout
      },
      
      // Contenu du menu
      content: options.content || [],
      
      // Styles avec contrôle CSS complet
      style: {
        display: 'flex',
        position: 'relative',
        backgroundColor: '#ffffff',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        padding: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        ...options.style
      },
      
      // Comportement responsive
      responsive: {
        enabled: options.responsive?.enabled ?? true,
        breakpoints: {
          mobile: { maxWidth: '768px', ...options.responsive?.breakpoints?.mobile },
          tablet: { maxWidth: '1024px', ...options.responsive?.breakpoints?.tablet },
          ...options.responsive?.breakpoints
        },
        ...options.responsive
      },
      
      // Callbacks
      callbacks: {
        onItemClick: options.callbacks?.onItemClick || options.onItemClick || null,
        onItemHover: options.callbacks?.onItemHover || options.onItemHover || null,
        onDropdownOpen: options.callbacks?.onDropdownOpen || options.onDropdownOpen || null,
        onDropdownClose: options.callbacks?.onDropdownClose || options.onDropdownClose || null,
        ...options.callbacks
      },
      
      // Debug
      debug: options.debug || false
    };

    // ========================================
    // 🏗️ FONCTIONS DE CONSTRUCTION DU MENU
    // ========================================

    function createContainer() {
      // Créer le container principal
      const container = document.createElement('nav');
      container.id = config.id;
      container.className = 'professional-menu';

      // Point d'attachement
      const attachPoint = document.querySelector(config.attach);
      if (!attachPoint) {
        console.error(`❌ Point d'attachement "${config.attach}" introuvable`);
        return null;
      }

      // Appliquer les styles du container
      applyContainerStyles(container);
      attachPoint.appendChild(container);
      
      if (config.debug) {
        console.log(`📦 Container menu créé et attaché à "${config.attach}"`);
      }
      
      return container;
    }

    function applyContainerStyles(container) {
      // Styles de position si spécifiés
      const positionStyles = {};
      if (config.position.x !== undefined || config.position.y !== undefined) {
        positionStyles.position = 'absolute';
        if (config.position.x !== undefined) positionStyles.left = `${config.position.x}px`;
        if (config.position.y !== undefined) positionStyles.top = `${config.position.y}px`;
      }

      // Styles de taille
      const sizeStyles = {};
      if (config.size.width !== 'auto') sizeStyles.width = typeof config.size.width === 'string' ? config.size.width : `${config.size.width}px`;
      if (config.size.height !== 'auto') sizeStyles.height = typeof config.size.height === 'string' ? config.size.height : `${config.size.height}px`;
      if (config.size.maxWidth) sizeStyles.maxWidth = typeof config.size.maxWidth === 'string' ? config.size.maxWidth : `${config.size.maxWidth}px`;
      if (config.size.minHeight) sizeStyles.minHeight = typeof config.size.minHeight === 'string' ? config.size.minHeight : `${config.size.minHeight}px`;

      // Styles de layout
      const layoutStyles = {
        flexDirection: config.layout.direction === 'vertical' ? 'column' : 'row',
        flexWrap: config.layout.wrap ? 'wrap' : 'nowrap',
        justifyContent: config.layout.justify,
        alignItems: config.layout.align,
        gap: config.layout.gap
      };

      // Combiner tous les styles
      const allStyles = {
        ...config.style,
        ...positionStyles,
        ...sizeStyles,
        ...layoutStyles
      };

      Object.assign(container.style, allStyles);
    }

    function createMenu(container) {
      // Parcourir le contenu et créer les éléments
      config.content.forEach((contentItem, index) => {
        const element = createContentElement(contentItem, index);
        if (element) {
          container.appendChild(element);
        }
      });
    }

    function createContentElement(contentItem, index) {
      switch (contentItem.type) {
        case 'item':
          return createMenuItem(contentItem, index);
        case 'group':
          return createMenuGroup(contentItem, index);
        case 'separator':
          return createSeparator(contentItem, index);
        default:
          // Si pas de type spécifié, on assume que c'est un item
          return createMenuItem({ ...contentItem}, index);
      }
    }

    function createMenuItem(itemData, index) {
      const item = document.createElement(itemData.href ? 'a' : 'div');
      item.id = itemData.id || `menu-item-${index}`;
      item.className = 'menu-item';
      item.setAttribute('data-menu-id', itemData.id || `menu-item-${index}`);

      // Contenu de l'item
      if (itemData.content) {
        if (itemData.content.text) {
          item.textContent = itemData.content.text;
        } else if (itemData.content.html) {
          item.innerHTML = itemData.content.html;
        }
      }

      // Href pour les liens
      if (itemData.href && item.tagName === 'A') {
        item.href = itemData.href;
      }

      // Styles de base pour les items
      const baseItemStyles = {
        display: 'flex',
        alignItems: 'center',
        padding: '8px 16px',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        textDecoration: 'none',
        color: '#333333',
        fontSize: '14px',
        fontWeight: '400',
        userSelect: 'none'
      };

      // Appliquer les styles de l'item
      const itemStyles = { ...baseItemStyles, ...itemData.style };
      Object.assign(item.style, itemStyles);

      // Event listeners pour les interactions
      setupItemEventListeners(item, itemData);

      // Créer le dropdown si présent
      if (itemData.dropdown) {
        createDropdown(item, itemData.dropdown);
      }

      return item;
    }

    function createMenuGroup(groupData, index) {
      const group = document.createElement('div');
      group.id = groupData.id || `menu-group-${index}`;
      group.className = 'menu-group';

      // Styles du groupe
      const groupStyles = {
        display: 'flex',
        alignItems: 'center',
        gap: groupData.layout?.gap || '8px',
        ...groupData.style
      };

      if (groupData.layout?.direction === 'vertical') {
        groupStyles.flexDirection = 'column';
      }

      Object.assign(group.style, groupStyles);

      // Créer les items du groupe
      if (groupData.items) {
        groupData.items.forEach((item, itemIndex) => {
          const element = createContentElement(item, itemIndex);
          if (element) {
            group.appendChild(element);
          }
        });
      }

      return group;
    }

    function createSeparator(separatorData, index) {
      const separator = document.createElement('div');
      separator.id = separatorData.id || `menu-separator-${index}`;
      separator.className = 'menu-separator';

      const separatorStyles = {
        borderTop: '1px solid #e0e0e0',
        margin: '4px 0',
        ...separatorData.style
      };

      Object.assign(separator.style, separatorStyles);
      return separator;
    }

    function createDropdown(parentItem, dropdownData) {
      const dropdown = document.createElement('div');
      dropdown.id = `${parentItem.id}-dropdown`;
      dropdown.className = 'menu-dropdown';

      // Styles du dropdown
      const dropdownStyles = {
        position: 'absolute',
        top: '100%',
        left: '0',
        minWidth: '200px',
        backgroundColor: '#ffffff',
        border: '1px solid #e0e0e0',
        borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: '4px',
        zIndex: '1000',
        opacity: '0',
        visibility: 'hidden',
        transform: 'translateY(-10px)',
        transition: 'all 0.3s ease',
        ...dropdownData.style
      };

      Object.assign(dropdown.style, dropdownStyles);

      // Créer les items du dropdown
      if (dropdownData.items) {
        dropdownData.items.forEach((item, itemIndex) => {
          const element = createContentElement(item, itemIndex);
          if (element) {
            dropdown.appendChild(element);
          }
        });
      }

      // Ajouter le dropdown au DOM
      document.body.appendChild(dropdown);

      // Positionner le dropdown par rapport au parent
      setupDropdownPositioning(parentItem, dropdown, dropdownData);

      return dropdown;
    }

    function setupDropdownPositioning(parentItem, dropdown, dropdownData) {
      const updatePosition = () => {
        const rect = parentItem.getBoundingClientRect();
        const offset = dropdownData.offset || { x: 0, y: 4 };
        
        dropdown.style.position = 'fixed';
        dropdown.style.left = `${rect.left + offset.x}px`;
        dropdown.style.top = `${rect.bottom + offset.y}px`;
      };

      // Position initiale
      updatePosition();

      // Reposition on scroll/resize
      window.addEventListener('scroll', updatePosition);
      window.addEventListener('resize', updatePosition);
    }

    function setupItemEventListeners(item, itemData) {
      // Click handler
      item.addEventListener('click', (event) => {
        event.preventDefault();
        
        // Dropdown toggle
        const dropdown = document.getElementById(`${item.id}-dropdown`);
        if (dropdown) {
          toggleDropdown(dropdown);
        }
        
        // Callback
        if (config.callbacks.onItemClick) {
          config.callbacks.onItemClick(itemData.id || item.id, event);
        }
      });

      // Hover handlers
      item.addEventListener('mouseenter', (event) => {
        applyHoverState(item, itemData);
        
        if (config.callbacks.onItemHover) {
          config.callbacks.onItemHover(itemData.id || item.id, event);
        }
      });

      item.addEventListener('mouseleave', (event) => {
        removeHoverState(item, itemData);
      });
    }

    function applyHoverState(item, itemData) {
      if (itemData.states?.hover) {
        Object.assign(item.style, itemData.states.hover);
      } else {
        // Default hover state
        item.style.backgroundColor = '#f8f9fa';
        item.style.transform = 'translateY(-1px)';
      }
    }

    function removeHoverState(item, itemData) {
      // Reset to original styles
      if (itemData.states?.hover) {
        Object.keys(itemData.states.hover).forEach(prop => {
          item.style[prop] = '';
        });
      } else {
        item.style.backgroundColor = '';
        item.style.transform = '';
      }
      
      // Reapply original styles
      if (itemData.style) {
        Object.assign(item.style, itemData.style);
      }
    }

    function toggleDropdown(dropdown) {
      const isVisible = dropdown.style.opacity === '1';
      
      if (isVisible) {
        // Fermer
        dropdown.style.opacity = '0';
        dropdown.style.visibility = 'hidden';
        dropdown.style.transform = 'translateY(-10px)';
      } else {
        // Ouvrir
        dropdown.style.opacity = '1';
        dropdown.style.visibility = 'visible';
        dropdown.style.transform = 'translateY(0)';
      }
    }

    function setupResponsive(container) {
      if (!config.responsive.enabled) return;

      const handleResize = () => {
        const width = window.innerWidth;
        const breakpoints = config.responsive.breakpoints;
        
        // Check mobile breakpoint
        if (breakpoints.mobile && width <= breakpoints.mobile.maxWidth) {
          applyResponsiveStyles(container, 'mobile');
        }
        // Check tablet breakpoint
        else if (breakpoints.tablet && width <= breakpoints.tablet.maxWidth) {
          applyResponsiveStyles(container, 'tablet');
        }
        // Desktop
        else {
          applyResponsiveStyles(container, 'desktop');
        }
      };

      window.addEventListener('resize', handleResize);
      handleResize(); // Initial check
    }

    function applyResponsiveStyles(container, breakpoint) {
      const responsiveConfig = config.responsive.breakpoints[breakpoint];
      
      if (responsiveConfig) {
        // Apply responsive styles
        if (responsiveConfig.style) {
          Object.assign(container.style, responsiveConfig.style);
        }
        
        // Handle hamburger menu
        if (responsiveConfig.showHamburger) {
          const hamburger = container.querySelector('#hamburger-icon');
          const navLinks = container.querySelector('#nav-links');
          
          if (hamburger) hamburger.style.display = 'flex';
          if (navLinks) navLinks.style.display = 'none';
        } else {
          const hamburger = container.querySelector('#hamburger-icon');
          const navLinks = container.querySelector('#nav-links');
          
          if (hamburger) hamburger.style.display = 'none';
          if (navLinks) navLinks.style.display = 'flex';
        }
      }
    }

    // ========================================
    // 🚀 CRÉATION ET RETOUR DU MENU
    // ========================================

    // Créer le container
    const container = createContainer();
    if (!container) return null;

    // Créer le contenu du menu
    createMenu(container);

    // Setup responsive
    setupResponsive(container);

    // Setup outside click to close dropdowns
    document.addEventListener('click', (event) => {
      if (!container.contains(event.target)) {
        // Close all dropdowns
        const dropdowns = document.querySelectorAll('.menu-dropdown');
        dropdowns.forEach(dropdown => {
          if (dropdown.style.opacity === '1') {
            toggleDropdown(dropdown);
          }
        });
      }
    });

    if (config.debug) {
      console.log(`✅ Menu "${config.id}" créé avec succès`);
    }

    // Retourner l'élément DOM du container
    return container;
  }

  /**
   * 🌱 MINIMAL TEMPLATE - BASE ULTRA-SIMPLE
   * Template minimaliste pour créer rapidement de nouveaux composants
   * Architecture: Zero dependency, functional, clean
   */

  // === FONCTION PRINCIPALE ===
  function createMinimal(options = {}) {
    // Configuration simple
    const config = {
      content: options.content || 'Minimal Component',
      style: options.style || {},
      onClick: options.onClick || null
    };

    // Créer l'élément
    const element = document.createElement('div');
    element.className = 'hs-minimal';
    
    // Ajouter le contenu
    element.textContent = config.content;
    
    // Styles par défaut + personnalisés
    const defaultStyle = {
      padding: '12px',
      margin: '8px',
      backgroundColor: '#f0f0f0',
      border: '1px solid #ccc',
      borderRadius: '4px',
      fontFamily: 'system-ui, sans-serif'
    };
    
    Object.assign(element.style, defaultStyle, config.style);
    
    // Event listener si fourni
    if (config.onClick) {
      element.addEventListener('click', config.onClick);
      element.style.cursor = 'pointer';
    }
    
    // Attacher au DOM
    document.body.appendChild(element);
    
    return element;
  }

  /**
   * 📊 TABLE COMPONENT - VERSION 2.0 FUNCTIONAL
   * Composant Table suivant le pattern fonctionnel de button_builder.js
   */


  // === DÉFINITION DES TEMPLATES DE BASE ===

  // Template pour le conteneur principal de la table
  define('table-container', {
    tag: 'div',
    class: 'hs-table',
    css: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      border: '1px solid #dee2e6',
      borderRadius: '6px',
      backgroundColor: '#ffffff',
      overflow: 'hidden',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px'
    }
  });

  // Template pour l'en-tête de la table
  define('table-header', {
    tag: 'div',
    class: 'hs-table-header',
    css: {
      display: 'flex',
      flexShrink: 0,
      borderBottom: '2px solid #dee2e6',
      backgroundColor: '#343a40'
    }
  });

  // Template pour une cellule d'en-tête
  define('table-header-cell', {
    tag: 'div',
    class: 'hs-table-header-cell',
    css: {
      padding: '12px',
      backgroundColor: '#343a40',
      color: '#ffffff',
      fontWeight: '600',
      fontSize: '14px',
      borderRight: '1px solid #495057',
      cursor: 'pointer',
      userSelect: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  });

  // Template pour le corps de la table
  define('table-body', {
    tag: 'div',
    class: 'hs-table-body',
    css: {
      flex: 1,
      overflowY: 'auto',
      overflowX: 'hidden'
    }
  });

  // Template pour une ligne
  define('table-row', {
    tag: 'div',
    class: 'hs-table-row',
    css: {
      display: 'flex',
      borderBottom: '1px solid #dee2e6',
      backgroundColor: '#ffffff',
      transition: 'all 0.2s ease'
    }
  });

  // Template pour une cellule
  define('table-cell', {
    tag: 'div',
    class: 'hs-table-cell',
    css: {
      padding: '8px 12px',
      borderRight: '1px solid #dee2e6',
      backgroundColor: '#ffffff',
      color: '#212529',
      fontSize: '13px',
      display: 'flex',
      alignItems: 'center'
    }
  });

  // === STYLES PRÉDÉFINIS ===

  const tableStyles = {
    default: {
      headerStyle: {
        backgroundColor: '#343a40',
        color: '#ffffff'
      },
      cellStyle: {
        backgroundColor: '#ffffff',
        color: '#212529'
      },
      alternateRowStyle: {
        backgroundColor: '#f8f9fa'
      }
    },
    modern: {
      headerStyle: {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: '#ffffff'
      },
      cellStyle: {
        backgroundColor: '#ffffff',
        color: '#2c3e50'
      },
      alternateRowStyle: {
        backgroundColor: '#f8f9fa'
      }
    },
    minimal: {
      headerStyle: {
        backgroundColor: '#f8f9fa',
        color: '#495057',
        borderBottom: '2px solid #dee2e6'
      },
      cellStyle: {
        backgroundColor: '#ffffff',
        color: '#212529',
        border: 'none',
        borderBottom: '1px solid #f1f3f4'
      },
      alternateRowStyle: {
        backgroundColor: '#fbfbfb'
      }
    }
  };

  // === COMPOSANT TABLE PRINCIPAL ===

  /**
   * Crée une table entièrement skinnable
   * @param {Object} config - Configuration de la table
   * @param {string} config.id - ID personnalisé
   * @param {Array} config.columns - Colonnes de la table
   * @param {Array} config.rows - Données des lignes
   * @param {Object} config.styling - Styles personnalisés
   * @param {Object} config.options - Options fonctionnelles
   * @param {Object} config.skin - Styles personnalisés pour chaque partie
   */
  const createTable = (config = {}) => {
    const {
      id,
      columns = [],
      rows = [],
      styling = {},
      options = {},
      skin = {},
      onCellClick,
      onSort,
      onRowSelect,
      position,
      size,
      attach,
      variant = 'default',
      ...otherProps
    } = config;

    // Génération d'ID unique si non fourni
    const tableId = id || `table_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // Configuration par défaut fusionnée avec les styles de variante
    const defaultStyling = {
      rowHeight: 40,
      ...tableStyles[variant] || tableStyles.default,
      ...styling
    };

    // État interne de la table
    const tableState = {
      cellsMap: new Map(),
      rowsMap: new Map(),
      selectedRows: new Set(),
      sortConfig: { column: null, direction: 'asc' },
      columns: [...columns],
      rows: [...rows]
    };

    // Styles du conteneur principal
    let containerStyles = {
      width: size?.width ? `${size.width}px` : '800px',
      height: size?.height ? `${size.height}px` : '600px'
    };

    if (position) {
      containerStyles = {
        ...containerStyles,
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`
      };
    }

    // Application des styles personnalisés
    if (skin.container) {
      containerStyles = { ...containerStyles, ...skin.container };
    }

    // Création du conteneur principal
    const table = $('table-container', {
      id: tableId,
      css: containerStyles,
      ...otherProps
    });

    // Création de l'en-tête
    const header = $('table-header', {
      id: `${tableId}_header`,
      css: skin.header || {}
    });

    // Création des cellules d'en-tête
    tableState.columns.forEach((column, index) => {
      const headerCell = $('table-header-cell', {
        id: `${tableId}_header_${column.id}`,
        text: column.header || column.id,
        css: {
          width: column.width ? `${column.width}px` : 'auto',
          flex: column.width ? 'none' : '1',
          ...defaultStyling.headerStyle,
          ...column.style,
          ...(skin.headerCell || {})
        },
        onclick: () => {
          if (options.sortable !== false && column.sortable !== false) {
            handleSort(column.id);
          }
        }
      });

      // Ajouter indicateur de tri si nécessaire
      if (options.sortable !== false && column.sortable !== false) {
        const sortIndicator = document.createElement('span');
        sortIndicator.style.marginLeft = '8px';
        sortIndicator.style.opacity = '0.5';
        sortIndicator.textContent = '⇅';
        headerCell.appendChild(sortIndicator);
      }

      header.appendChild(headerCell);
    });

    // Création du corps de la table
    const body = $('table-body', {
      id: `${tableId}_body`,
      css: skin.body || {}
    });

    // Fonction pour créer une ligne
    const createRow = (rowData, rowIndex) => {
      const row = $('table-row', {
        id: `${tableId}_row_${rowData.id || rowIndex}`,
        css: {
          height: `${defaultStyling.rowHeight}px`,
          ...(rowIndex % 2 === 1 ? defaultStyling.alternateRowStyle : {}),
          ...(skin.row || {})
        }
      });

      // États interactifs
      if (options.selectable !== false) {
        row.style.cursor = 'pointer';
        
        row.addEventListener('mouseenter', () => {
          if (!tableState.selectedRows.has(rowData.id)) {
            Object.assign(row.style, defaultStyling.states?.hover || {
              backgroundColor: '#e9ecef'
            });
          }
        });

        row.addEventListener('mouseleave', () => {
          if (!tableState.selectedRows.has(rowData.id)) {
            Object.assign(row.style, rowIndex % 2 === 1 ? 
              defaultStyling.alternateRowStyle : 
              { backgroundColor: '#ffffff' }
            );
          }
        });

        row.addEventListener('click', () => {
          handleRowSelect(rowData.id, row);
        });
      }

      // Création des cellules
      tableState.columns.forEach((column, colIndex) => {
        const cellData = rowData.cells?.[column.id] || { content: '', style: {} };
        
        const cell = $('table-cell', {
          id: `${tableId}_cell_${rowData.id}_${column.id}`,
          text: cellData.content || '',
          css: {
            width: column.width ? `${column.width}px` : 'auto',
            flex: column.width ? 'none' : '1',
            ...defaultStyling.cellStyle,
            ...column.style,
            ...cellData.style,
            ...(skin.cell || {})
          },
          onclick: (event) => {
            event.stopPropagation();
            if (onCellClick) {
              onCellClick(cellData, rowIndex, colIndex);
            }
          }
        });

        tableState.cellsMap.set(`${rowData.id}_${column.id}`, {
          element: cell,
          data: cellData,
          rowId: rowData.id,
          columnId: column.id
        });

        row.appendChild(cell);
      });

      tableState.rowsMap.set(rowData.id, {
        element: row,
        data: rowData,
        index: rowIndex
      });

      return row;
    };

    // Fonction de gestion du tri
    const handleSort = (columnId) => {
      const currentDirection = tableState.sortConfig.column === columnId ? 
        tableState.sortConfig.direction : 'asc';
      const newDirection = currentDirection === 'asc' ? 'desc' : 'asc';
      
      tableState.sortConfig = { column: columnId, direction: newDirection };

      // Trier les données
      tableState.rows.sort((a, b) => {
        const aValue = a.cells?.[columnId]?.content || '';
        const bValue = b.cells?.[columnId]?.content || '';
        
        const comparison = String(aValue).localeCompare(String(bValue), undefined, { numeric: true });
        return newDirection === 'asc' ? comparison : -comparison;
      });

      // Rafraîchir l'affichage
      table.refresh();

      // Callback
      if (onSort) {
        onSort(columnId, newDirection);
      }

      // Mettre à jour les indicateurs de tri
      header.querySelectorAll('.hs-table-header-cell span').forEach(indicator => {
        indicator.textContent = '⇅';
        indicator.style.opacity = '0.5';
      });

      const activeHeader = header.querySelector(`#${tableId}_header_${columnId} span`);
      if (activeHeader) {
        activeHeader.textContent = newDirection === 'asc' ? '↑' : '↓';
        activeHeader.style.opacity = '1';
      }
    };

    // Fonction de gestion de la sélection de ligne
    const handleRowSelect = (rowId, rowElement) => {
      if (options.multiSelect) {
        if (tableState.selectedRows.has(rowId)) {
          tableState.selectedRows.delete(rowId);
          Object.assign(rowElement.style, { backgroundColor: '#ffffff' });
        } else {
          tableState.selectedRows.add(rowId);
          Object.assign(rowElement.style, defaultStyling.states?.selected || {
            backgroundColor: '#007bff',
            color: '#ffffff'
          });
        }
      } else {
        // Désélectionner toutes les autres lignes
        tableState.selectedRows.forEach(selectedId => {
          const selectedRow = tableState.rowsMap.get(selectedId);
          if (selectedRow) {
            Object.assign(selectedRow.element.style, { backgroundColor: '#ffffff' });
          }
        });
        tableState.selectedRows.clear();

        // Sélectionner la ligne actuelle
        tableState.selectedRows.add(rowId);
        Object.assign(rowElement.style, defaultStyling.states?.selected || {
          backgroundColor: '#007bff',
          color: '#ffffff'
        });
      }

      if (onRowSelect) {
        onRowSelect(rowId, Array.from(tableState.selectedRows));
      }
    };

    // Fonction pour rafraîchir la table
    table.refresh = () => {
      // Vider le corps
      body.innerHTML = '';
      
      // Recréer les lignes
      tableState.rows.forEach((rowData, index) => {
        const row = createRow(rowData, index);
        body.appendChild(row);
      });
    };

    // Méthodes utilitaires de la table
    table.addRow = (rowData) => {
      tableState.rows.push(rowData);
      const row = createRow(rowData, tableState.rows.length - 1);
      body.appendChild(row);
      return table;
    };

    table.removeRow = (rowId) => {
      const index = tableState.rows.findIndex(row => row.id === rowId);
      if (index !== -1) {
        tableState.rows.splice(index, 1);
        tableState.rowsMap.delete(rowId);
        tableState.selectedRows.delete(rowId);
        table.refresh();
      }
      return table;
    };

    table.updateCell = (rowId, columnId, newData) => {
      const cellKey = `${rowId}_${columnId}`;
      const cell = tableState.cellsMap.get(cellKey);
      if (cell) {
        cell.data = { ...cell.data, ...newData };
        cell.element.textContent = newData.content || '';
        if (newData.style) {
          Object.assign(cell.element.style, newData.style);
        }
      }
      return table;
    };

    table.getSelectedRows = () => {
      return Array.from(tableState.selectedRows);
    };

    table.clearSelection = () => {
      tableState.selectedRows.forEach(rowId => {
        const row = tableState.rowsMap.get(rowId);
        if (row) {
          Object.assign(row.element.style, { backgroundColor: '#ffffff' });
        }
      });
      tableState.selectedRows.clear();
      return table;
    };

    table.sort = (columnId, direction = 'asc') => {
      tableState.sortConfig = { column: columnId, direction };
      handleSort(columnId);
      return table;
    };

    table.getData = () => {
      return {
        columns: tableState.columns,
        rows: tableState.rows,
        selected: Array.from(tableState.selectedRows)
      };
    };

    // Assemblage de la structure
    table.appendChild(header);
    table.appendChild(body);

    // Création initiale des lignes
    table.refresh();

    // Attachement au DOM si spécifié
    if (attach) {
      const parentElement = typeof attach === 'string' ? 
        document.querySelector(attach) : attach;
      if (parentElement) {
        parentElement.appendChild(table);
      }
    }

    return table;
  };

  /**
   * 📋 TEMPLATE COMPONENT - ARCHITECTURE DE RÉFÉRENCE
   * Composant template avec l'architecture clean pour créer de nouveaux composants
   * Architecture: Zero dependency, functional, bundle-friendly
   */

  // === FONCTION PRINCIPALE DE CRÉATION ===
  function createTemplate(options = {}) {
    // Configuration par défaut
    const config = {
      id: options.id || `template-${Date.now()}`,
      position: { x: 0, y: 0, ...options.position },
      size: { width: 'auto', height: 'auto', ...options.size },
      attach: options.attach || 'body',
      
      // Contenu du composant
      content: options.content || 'Template Component',
      
      // Styles avec contrôle CSS complet
      style: {
        display: 'block',
        position: 'relative',
        backgroundColor: '#f5f5f5',
        border: '2px solid #ddd',
        borderRadius: '8px',
        padding: '16px',
        margin: '8px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px',
        color: '#333',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        transition: 'all 0.3s ease',
        ...options.style
      },
      
      // Comportement
      behavior: {
        clickable: options.behavior?.clickable ?? true,
        hoverable: options.behavior?.hoverable ?? true,
        draggable: options.behavior?.draggable ?? false,
        ...options.behavior
      },
      
      // Callbacks
      onClick: options.onClick || null,
      onHover: options.onHover || null,
      onMount: options.onMount || null,
      onDestroy: options.onDestroy || null,
      
      // Debug
      debug: options.debug || false
    };

    // === FONCTION INTERNE DE CRÉATION DU CONTAINER ===
    function createContainer() {
      // Déterminer le point d'attachement
      let attachPoint;
      if (typeof config.attach === 'string') {
        attachPoint = document.querySelector(config.attach);
        if (!attachPoint && config.attach === 'body') {
          attachPoint = document.body;
        }
      } else {
        attachPoint = config.attach; // Assume que c'est déjà un élément DOM
      }

      if (!attachPoint) {
        console.warn(`⚠️ Point d'attachement "${config.attach}" non trouvé, utilisation de body`);
        attachPoint = document.body;
      }

      // Créer le container principal
      const container = document.createElement('div');
      container.id = config.id;
      container.className = 'hs-template';
      
      // Ajouter le contenu
      if (typeof config.content === 'string') {
        container.textContent = config.content;
      } else if (config.content instanceof HTMLElement) {
        container.appendChild(config.content);
      } else if (Array.isArray(config.content)) {
        config.content.forEach(item => {
          if (typeof item === 'string') {
            const textNode = document.createTextNode(item);
            container.appendChild(textNode);
          } else if (item instanceof HTMLElement) {
            container.appendChild(item);
          }
        });
      }

      // Appliquer les styles du container
      applyContainerStyles(container);
      
      // Attacher au DOM
      attachPoint.appendChild(container);
      
      if (config.debug) {
        console.log(`📦 Template component créé et attaché à "${config.attach}"`);
      }

      return container;
    }

    // === FONCTION D'APPLICATION DES STYLES ===
    function applyContainerStyles(container) {
      // Styles de position si spécifiés
      const positionStyles = {};
      if (config.position.x !== undefined || config.position.y !== undefined) {
        positionStyles.position = 'absolute';
        if (config.position.x !== undefined) positionStyles.left = `${config.position.x}px`;
        if (config.position.y !== undefined) positionStyles.top = `${config.position.y}px`;
      }

      // Styles de taille si spécifiés
      const sizeStyles = {};
      if (config.size.width !== 'auto') sizeStyles.width = typeof config.size.width === 'number' ? `${config.size.width}px` : config.size.width;
      if (config.size.height !== 'auto') sizeStyles.height = typeof config.size.height === 'number' ? `${config.size.height}px` : config.size.height;

      // Appliquer tous les styles
      const finalStyles = { ...config.style, ...positionStyles, ...sizeStyles };
      Object.assign(container.style, finalStyles);
    }

    // === FONCTION DE SETUP DES EVENT LISTENERS ===
    function setupEventListeners(container) {
      // Click handler
      if (config.behavior.clickable && config.onClick) {
        container.addEventListener('click', (event) => {
          config.onClick(container, event);
        });
        container.style.cursor = 'pointer';
      }

      // Hover handlers
      if (config.behavior.hoverable) {
        container.addEventListener('mouseenter', (event) => {
          container.style.transform = 'translateY(-2px)';
          container.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          
          if (config.onHover) {
            config.onHover(container, event, 'enter');
          }
        });

        container.addEventListener('mouseleave', (event) => {
          container.style.transform = 'translateY(0)';
          container.style.boxShadow = config.style.boxShadow || '0 2px 4px rgba(0,0,0,0.1)';
          
          if (config.onHover) {
            config.onHover(container, event, 'leave');
          }
        });
      }

      // Draggable (optionnel, implémentation basique)
      if (config.behavior.draggable) {
        container.draggable = true;
        container.addEventListener('dragstart', (event) => {
          event.dataTransfer.setData('text/plain', container.id);
          container.style.opacity = '0.7';
        });
        
        container.addEventListener('dragend', () => {
          container.style.opacity = '1';
        });
      }
    }

    // === CRÉATION ET ASSEMBLAGE FINAL ===
    const container = createContainer();
    setupEventListeners(container);

    // Callback onMount
    if (config.onMount) {
      config.onMount(container);
    }

    // === MÉTHODES PUBLIQUES DU COMPOSANT ===
    
    // Méthode pour mettre à jour le contenu
    container.updateContent = function(newContent) {
      if (typeof newContent === 'string') {
        this.textContent = newContent;
      } else if (newContent instanceof HTMLElement) {
        this.innerHTML = '';
        this.appendChild(newContent);
      }
      return this;
    };

    // Méthode pour mettre à jour les styles
    container.updateStyle = function(newStyles) {
      Object.assign(this.style, newStyles);
      return this;
    };

    // Méthode pour détruire le composant
    container.destroy = function() {
      if (config.onDestroy) {
        config.onDestroy(this);
      }
      if (this.parentNode) {
        this.parentNode.removeChild(this);
      }
    };

    // Méthode pour obtenir la configuration
    container.getConfig = function() {
      return { ...config };
    };

    return container;
  }

  /**
   * Composant Tooltip simple pour tester la découverte automatique
   */

  // Template pour le tooltip
  define('tooltip-container', {
    tag: 'div',
    class: 'hs-tooltip',
    css: {
      position: 'absolute',
      backgroundColor: '#333',
      color: 'white',
      padding: '8px 12px',
      borderRadius: '4px',
      fontSize: '14px',
      zIndex: '9999',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.2s ease'
    }
  });

  /**
   * Crée un tooltip
   */
  const createTooltip = (config = {}) => {
    const {
      text = 'Tooltip',
      target,
      position = 'top',
      css = {},
      ...otherProps
    } = config;

    // Créer le tooltip
    const tooltip = $('tooltip-container', {
      text,
      css: { ...css },
      ...otherProps
    });

    // Si une cible est spécifiée, ajouter les événements
    if (target) {
      target.addEventListener('mouseenter', () => {
        tooltip.style.opacity = '1';
        document.body.appendChild(tooltip);
        
        // Positionner le tooltip
        const rect = target.getBoundingClientRect();
        tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
        tooltip.style.top = rect.top - tooltip.offsetHeight - 8 + 'px';
      });
      
      target.addEventListener('mouseleave', () => {
        tooltip.style.opacity = '0';
        setTimeout(() => {
          if (tooltip.parentNode) {
            tooltip.parentNode.removeChild(tooltip);
          }
        }, 200);
      });
    }

    return tooltip;
  };

  /**
   * Composant Unit Builder avec HyperSquirrel
   * Créer des blocs graphiques draggables connectables entre eux
   */

  // === GESTIONNAIRE GLOBAL DES UNITS ===
  class UnitManager {
    constructor() {
      this.units = new Map();
      this.connections = new Map();
      this.selectedUnits = new Set();
      this.dragState = null;
      this.connectionMode = false;
      this.firstConnector = null;
      this.nextUnitId = 1;
      this.nextConnectorId = 1;
      this.nextConnectionId = 1;
      
      // État pour le drag de connecteurs
      this.connectorDragState = {
        isDragging: false,
        sourceConnector: null,
        dragLine: null
      };
      
      this.setupGlobalListeners();
    }

    setupGlobalListeners() {
      // Désélectionner tout au clic sur le fond
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.unit-container') && !e.target.closest('.unit-connector')) {
          this.deselectAll();
        }
      });
    }

    generateUnitId() {
      return `unit_${this.nextUnitId++}`;
    }

    generateConnectorId() {
      return `connector_${this.nextConnectorId++}`;
    }

    generateConnectionId() {
      return `connection_${this.nextConnectionId++}`;
    }

    registerUnit(unit) {
      this.units.set(unit.id, unit);
    }

    unregisterUnit(unitId) {
      // Supprimer toutes les connexions liées à ce unit
      this.removeAllConnectionsForUnit(unitId);
      this.units.delete(unitId);
      this.selectedUnits.delete(unitId);
    }

    removeAllConnectionsForUnit(unitId) {
      const connectionsToRemove = [];
      this.connections.forEach((connection, connectionId) => {
        if (connection.fromUnit === unitId || connection.toUnit === unitId) {
          connectionsToRemove.push(connectionId);
        }
      });
      connectionsToRemove.forEach(id => this.removeConnection(id));
    }

    selectUnit(unitId) {
      this.selectedUnits.add(unitId);
      const unit = this.units.get(unitId);
      if (unit) {
        unit.element.classList.add('unit-selected');
      }
    }

    deselectUnit(unitId) {
      this.selectedUnits.delete(unitId);
      const unit = this.units.get(unitId);
      if (unit) {
        unit.element.classList.remove('unit-selected');
      }
    }

    deselectAll() {
      this.selectedUnits.forEach(unitId => this.deselectUnit(unitId));
    }

    getSelectedUnits() {
      return Array.from(this.selectedUnits);
    }

    createConnection(fromUnitId, fromConnectorId, toUnitId, toConnectorId) {
      const connectionId = this.generateConnectionId();
      const connection = {
        id: connectionId,
        fromUnit: fromUnitId,
        fromConnector: fromConnectorId,
        toUnit: toUnitId,
        toConnector: toConnectorId
      };
      
      this.connections.set(connectionId, connection);
      this.renderConnection(connection);
      return connectionId;
    }

    removeConnection(connectionId) {
      const connection = this.connections.get(connectionId);
      if (connection) {
        const connectionElement = document.querySelector(`[data-connection-id="${connectionId}"]`);
        if (connectionElement) {
          connectionElement.remove();
        }
        this.connections.delete(connectionId);
      }
    }

    renderConnection(connection) {
      const fromUnit = this.units.get(connection.fromUnit);
      const toUnit = this.units.get(connection.toUnit);
      
      if (!fromUnit || !toUnit) return;

      const fromConnector = fromUnit.element.querySelector(`[data-connector-id="${connection.fromConnector}"]`);
      const toConnector = toUnit.element.querySelector(`[data-connector-id="${connection.toConnector}"]`);
      
      if (!fromConnector || !toConnector) return;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('data-connection-id', connection.id);
      line.classList.add('unit-connection-line');
      
      this.updateConnectionPosition(line, fromConnector, toConnector);
      
      // Ajouter la ligne au SVG container (créé s'il n'existe pas)
      let svg = document.querySelector('.unit-connections-svg');
      if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('unit-connections-svg');
        svg.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 50;
      `;
        document.body.appendChild(svg);
      }
      
      svg.appendChild(line);
    }

    updateConnectionPosition(line, fromConnector, toConnector) {
      const fromRect = fromConnector.getBoundingClientRect();
      const toRect = toConnector.getBoundingClientRect();
      
      const fromX = fromRect.left + fromRect.width / 2;
      const fromY = fromRect.top + fromRect.height / 2;
      const toX = toRect.left + toRect.width / 2;
      const toY = toRect.top + toRect.height / 2;
      
      line.setAttribute('x1', fromX);
      line.setAttribute('y1', fromY);
      line.setAttribute('x2', toX);
      line.setAttribute('y2', toY);
      line.setAttribute('stroke', '#666');
      line.setAttribute('stroke-width', '2');
    }

    updateAllConnections() {
      this.connections.forEach(connection => {
        const line = document.querySelector(`[data-connection-id="${connection.id}"]`);
        if (line) {
          const fromUnit = this.units.get(connection.fromUnit);
          const toUnit = this.units.get(connection.toUnit);
          
          if (fromUnit && toUnit) {
            const fromConnector = fromUnit.element.querySelector(`[data-connector-id="${connection.fromConnector}"]`);
            const toConnector = toUnit.element.querySelector(`[data-connector-id="${connection.toConnector}"]`);
            
            if (fromConnector && toConnector) {
              this.updateConnectionPosition(line, fromConnector, toConnector);
            }
          }
        }
      });
    }

    getAllConnections() {
      return Array.from(this.connections.values());
    }

    handleConnectorClick(unitId, connectorId, connectorType) {
      if (!this.firstConnector) {
        // Premier connecteur sélectionné
        this.firstConnector = { unitId, connectorId, connectorType };
        this.highlightConnector(unitId, connectorId, true);
      } else {
        // Deuxième connecteur sélectionné
        const { unitId: firstUnitId, connectorId: firstConnectorId, connectorType: firstType } = this.firstConnector;
        
        // Vérifier que ce ne sont pas les mêmes connecteurs
        if (firstUnitId !== unitId || firstConnectorId !== connectorId) {
          // Vérifier qu'un est input et l'autre output
          if ((firstType === 'input' && connectorType === 'output') || 
              (firstType === 'output' && connectorType === 'input')) {
            
            // Déterminer fromUnit/fromConnector et toUnit/toConnector
            let fromUnitId, fromConnectorId, toUnitId, toConnectorId;
            if (firstType === 'output') {
              fromUnitId = firstUnitId;
              fromConnectorId = firstConnectorId;
              toUnitId = unitId;
              toConnectorId = connectorId;
            } else {
              fromUnitId = unitId;
              fromConnectorId = connectorId;
              toUnitId = firstUnitId;
              toConnectorId = firstConnectorId;
            }
            
            // Vérifier s'il existe déjà une connexion entre ces connecteurs
            const existingConnection = Array.from(this.connections.values()).find(conn =>
              conn.fromUnit === fromUnitId && 
              conn.fromConnector === fromConnectorId &&
              conn.toUnit === toUnitId && 
              conn.toConnector === toConnectorId
            );
            
            if (existingConnection) {
              // Déconnecter
              this.removeConnection(existingConnection.id);
            } else {
              // Connecter
              this.createConnection(fromUnitId, fromConnectorId, toUnitId, toConnectorId);
            }
          }
        }
        
        // Reset de la sélection
        this.highlightConnector(firstUnitId, firstConnectorId, false);
        this.firstConnector = null;
      }
    }

    highlightConnector(unitId, connectorId, highlight) {
      const unit = this.units.get(unitId);
      if (unit) {
        const connector = unit.element.querySelector(`[data-connector-id="${connectorId}"]`);
        if (connector) {
          if (highlight) {
            connector.classList.add('connector-selected');
          } else {
            connector.classList.remove('connector-selected');
          }
        }
      }
    }

    // === MÉTHODES POUR LE DRAG DE CONNECTEURS ===

    startConnectorDrag(unitId, connectorId, connectorType, event) {
      event.preventDefault();
      event.stopPropagation();
      
      this.connectorDragState.isDragging = true;
      this.connectorDragState.sourceConnector = { unitId, connectorId, connectorType };
      
      // Créer une ligne temporaire pour visualiser la connexion
      this.createDragLine(event);
      
      // Ajouter les listeners globaux
      document.addEventListener('mousemove', this.handleConnectorDragMove.bind(this));
      document.addEventListener('mouseup', this.handleConnectorDragEnd.bind(this));
    }

    createDragLine(event) {
      // Obtenir ou créer le SVG container
      let svg = document.querySelector('.unit-connections-svg');
      if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('unit-connections-svg');
        svg.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 50;
      `;
        document.body.appendChild(svg);
      }
      
      // Créer la ligne temporaire
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.classList.add('unit-drag-line');
      line.setAttribute('stroke', '#007bff');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '5,5');
      line.setAttribute('opacity', '0.8');
      
      const sourceConnector = this.getConnectorElement(
        this.connectorDragState.sourceConnector.unitId, 
        this.connectorDragState.sourceConnector.connectorId
      );
      
      if (sourceConnector) {
        const rect = sourceConnector.getBoundingClientRect();
        const startX = rect.left + rect.width / 2;
        const startY = rect.top + rect.height / 2;
        
        line.setAttribute('x1', startX);
        line.setAttribute('y1', startY);
        line.setAttribute('x2', event.clientX);
        line.setAttribute('y2', event.clientY);
      }
      
      svg.appendChild(line);
      this.connectorDragState.dragLine = line;
    }

    handleConnectorDragMove(event) {
      if (!this.connectorDragState.isDragging || !this.connectorDragState.dragLine) return;
      
      // Mettre à jour la position de fin de la ligne
      this.connectorDragState.dragLine.setAttribute('x2', event.clientX);
      this.connectorDragState.dragLine.setAttribute('y2', event.clientY);
      
      // Highlight du connecteur cible potentiel
      const targetElement = document.elementFromPoint(event.clientX, event.clientY);
      if (targetElement && targetElement.classList.contains('unit-connector')) {
        targetElement.getAttribute('data-connector-id');
        const targetConnectorType = targetElement.getAttribute('data-connector-type');
        targetElement.closest('.unit-container').getAttribute('data-unit-id');
        
        // Vérifier si c'est un connecteur valide pour la connexion
        const sourceType = this.connectorDragState.sourceConnector.connectorType;
        if ((sourceType === 'output' && targetConnectorType === 'input') ||
            (sourceType === 'input' && targetConnectorType === 'output')) {
          targetElement.classList.add('connector-drag-hover');
        }
      }
      
      // Supprimer les anciens highlights
      document.querySelectorAll('.connector-drag-hover').forEach(el => {
        if (!el.contains(targetElement)) {
          el.classList.remove('connector-drag-hover');
        }
      });
    }

    handleConnectorDragEnd(event) {
      if (!this.connectorDragState.isDragging) return;
      
      // Supprimer la ligne temporaire
      if (this.connectorDragState.dragLine) {
        this.connectorDragState.dragLine.remove();
      }
      
      // Trouver le connecteur cible
      const targetElement = document.elementFromPoint(event.clientX, event.clientY);
      if (targetElement && targetElement.classList.contains('unit-connector')) {
        const targetConnectorId = targetElement.getAttribute('data-connector-id');
        const targetConnectorType = targetElement.getAttribute('data-connector-type');
        const targetUnitId = targetElement.closest('.unit-container').getAttribute('data-unit-id');
        
        const source = this.connectorDragState.sourceConnector;
        
        // Vérifier si c'est une connexion valide
        if ((source.connectorType === 'output' && targetConnectorType === 'input') ||
            (source.connectorType === 'input' && targetConnectorType === 'output')) {
          
          // Déterminer fromUnit/fromConnector et toUnit/toConnector
          let fromUnitId, fromConnectorId, toUnitId, toConnectorId;
          if (source.connectorType === 'output') {
            fromUnitId = source.unitId;
            fromConnectorId = source.connectorId;
            toUnitId = targetUnitId;
            toConnectorId = targetConnectorId;
          } else {
            fromUnitId = targetUnitId;
            fromConnectorId = targetConnectorId;
            toUnitId = source.unitId;
            toConnectorId = source.connectorId;
          }
          
          // Vérifier s'il existe déjà une connexion
          const existingConnection = Array.from(this.connections.values()).find(conn =>
            conn.fromUnit === fromUnitId && 
            conn.fromConnector === fromConnectorId &&
            conn.toUnit === toUnitId && 
            conn.toConnector === toConnectorId
          );
          
          if (existingConnection) {
            // Déconnecter
            this.removeConnection(existingConnection.id);
          } else {
            // Connecter
            this.createConnection(fromUnitId, fromConnectorId, toUnitId, toConnectorId);
          }
        }
      }
      
      // Nettoyer
      document.querySelectorAll('.connector-drag-hover').forEach(el => {
        el.classList.remove('connector-drag-hover');
      });
      
      document.removeEventListener('mousemove', this.handleConnectorDragMove.bind(this));
      document.removeEventListener('mouseup', this.handleConnectorDragEnd.bind(this));
      
      this.connectorDragState.isDragging = false;
      this.connectorDragState.sourceConnector = null;
      this.connectorDragState.dragLine = null;
    }

    getConnectorElement(unitId, connectorId) {
      const unit = this.units.get(unitId);
      if (unit) {
        return unit.element.querySelector(`[data-connector-id="${connectorId}"]`);
      }
      return null;
    }
  }

  // Instance globale du gestionnaire
  const unitManager = new UnitManager();

  // === DÉFINITION DES TEMPLATES ===

  // Template pour le conteneur principal du unit
  define('unit-container', {
    tag: 'div',
    class: 'unit-container',
    css: {
      position: 'absolute',
      minWidth: '120px',
      minHeight: '80px',
      backgroundColor: '#f8f9fa',
      border: '2px solid #ddd',
      borderRadius: '8px',
      cursor: 'move',
      userSelect: 'none',
      overflow: 'visible',
      zIndex: '100'
    }
  });

  // Template pour l'en-tête du unit
  define('unit-header', {
    tag: 'div',
    class: 'unit-header',
    css: {
      backgroundColor: '#e9ecef',
      borderBottom: '1px solid #ddd',
      borderRadius: '6px 6px 0 0',
      padding: '8px 12px',
      fontWeight: 'bold',
      fontSize: '14px',
      color: '#333',
      cursor: 'move'
    }
  });

  // Template pour le nom éditable
  define('unit-name', {
    tag: 'span',
    class: 'unit-name',
    css: {
      display: 'block',
      outline: 'none',
      backgroundColor: 'transparent',
      border: 'none'
    }
  });

  // Template pour le corps du unit
  define('unit-body', {
    tag: 'div',
    class: 'unit-body',
    css: {
      padding: '8px 12px', // Réduire le padding vertical
      minHeight: '32px', // Réduire la hauteur minimale
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative'
    }
  });

  // Template pour l'icône
  define('unit-icon', {
    tag: 'img',
    class: 'unit-icon',
    attrs: { draggable: 'false' },
    css: {
      maxWidth: '32px',
      maxHeight: '32px',
      objectFit: 'contain',
      pointerEvents: 'none'
    }
  });

  // Template pour les connecteurs
  define('unit-connector', {
    tag: 'div',
    class: 'unit-connector',
    css: {
      zIndex: '2',
      position: 'absolute',
      width: '12px',
      height: '12px',
      backgroundColor: '#007bff',
      borderRadius: '50%',
      cursor: 'pointer',
      border: '2px solid #fff',
      boxShadow: '0 0 0 1px #007bff'
    }
  });

  // Template pour les connecteurs d'entrée
  define('unit-connector-input', {
    tag: 'div',
    class: 'unit-connector unit-connector-input',
    css: {
      position: 'absolute',
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      cursor: 'pointer',
      border: '2px solid #fff',
      left: '-8px',
      backgroundColor: '#28a745',
      boxShadow: '0 0 0 1px #28a745'
    }
  });

  // Template pour les connecteurs de sortie
  define('unit-connector-output', {
    tag: 'div',
    class: 'unit-connector unit-connector-output',
    css: {
      position: 'absolute',
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      cursor: 'pointer',
      border: '2px solid #fff',
      right: '-8px',
      backgroundColor: '#dc3545',
      boxShadow: '0 0 0 1px #dc3545'
    }
  });

  // === CSS GLOBAL ===
  const unitStyles = `
  .unit-selected {
    border-color: #007bff !important;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25) !important;
  }
  
  .unit-name[contenteditable="true"] {
    background-color: rgba(255, 255, 255, 0.9) !important;
    border: none !important;
    border-radius: 3px !important;
    padding: 0 !important;
    outline: none !important;
    box-shadow: inset 0 0 0 1px rgba(0, 123, 255, 0.3) !important;
  }
  
  .connector-selected {
    transform: scale(1.3) !important;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.4) !important;
  }
  
  .unit-connector:hover {
    transform: scale(1.2);
  }
  
  .connector-drag-hover {
    transform: scale(1.4) !important;
    box-shadow: 0 0 0 4px rgba(40, 167, 69, 0.6) !important;
  }
  
  .unit-icon.animated {
    animation: iconPulse 0.3s ease;
  }
  
  @keyframes iconPulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); }
  }
`;

  // Injecter les styles
  if (!document.querySelector('#unit-styles')) {
    const style = document.createElement('style');
    style.id = 'unit-styles';
    style.textContent = unitStyles;
    document.head.appendChild(style);
  }

  // === CLASSE UNIT ===
  class Unit {
    constructor(options = {}) {
      const {
        id = unitManager.generateUnitId(),
        name = 'Unit',
        position = { x: 100, y: 100 },
        inputs = [],
        outputs = [],
        icon = null,
        iconSrc = null,
        backgroundColor = null
      } = options;

      this.id = id;
      this.name = name;
      this.position = position;
      this.inputs = [];
      this.outputs = [];
      this.isDragging = false;
      this.dragOffset = { x: 0, y: 0 };
      this.isEditingName = false;
      this.backgroundColor = backgroundColor;

      this.createElement();
      this.setupDragging();
      this.setupSelection();
      this.setupNameEditing();
      this.setPosition(position.x, position.y);
      
      // Appliquer la couleur de fond si fournie
      if (backgroundColor) {
        this.setBackgroundColor(backgroundColor);
      }
      
      // Ajouter au DOM d'abord
      unitManager.registerUnit(this);
      document.body.appendChild(this.element);
      
      // Puis ajouter les connecteurs
      inputs.forEach(input => this.addInput(input));
      outputs.forEach(output => this.addOutput(output));
      
      // Ajuster la hauteur initiale du module
      this.adjustModuleHeight();
      
      // Ajouter l'icône si fournie
      if (icon || iconSrc) {
        this.setIcon(icon || iconSrc);
      }
    }

    createElement() {
      this.element = $('unit-container', {
        attrs: { 'data-unit-id': this.id }
      });

      this.header = $('unit-header');
      this.nameElement = $('unit-name', { text: this.name });
      this.body = $('unit-body');

      this.header.appendChild(this.nameElement);
      this.element.appendChild(this.header);
      this.element.appendChild(this.body);
    }

    setupDragging() {
      let startX, startY, startPosX, startPosY;

      const handleMouseDown = (e) => {
        if (this.isEditingName) return;
        
        this.isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startPosX = this.position.x;
        startPosY = this.position.y;
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        e.preventDefault();
      };

      const handleMouseMove = (e) => {
        if (!this.isDragging) return;
        
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        this.setPosition(startPosX + deltaX, startPosY + deltaY);
        unitManager.updateAllConnections();
      };

      const handleMouseUp = () => {
        this.isDragging = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      this.header.addEventListener('mousedown', handleMouseDown);
    }

    setupSelection() {
      this.element.addEventListener('click', (e) => {
        e.stopPropagation();
        
        if (e.ctrlKey || e.metaKey) {
          // Multi-sélection
          if (unitManager.selectedUnits.has(this.id)) {
            unitManager.deselectUnit(this.id);
          } else {
            unitManager.selectUnit(this.id);
          }
        } else {
          // Sélection simple
          unitManager.deselectAll();
          unitManager.selectUnit(this.id);
        }
      });
    }

    setupNameEditing() {
      this.nameElement.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.startNameEditing();
      });
    }

    startNameEditing() {
      this.isEditingName = true;
      this.nameElement.contentEditable = true;
      this.nameElement.focus();
      
      // Sélectionner tout le texte
      const range = document.createRange();
      range.selectNodeContents(this.nameElement);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);

      const finishEditing = () => {
        this.isEditingName = false;
        this.nameElement.contentEditable = false;
        this.name = this.nameElement.textContent.trim() || 'Unit';
        this.nameElement.textContent = this.name;
      };

      this.nameElement.addEventListener('blur', finishEditing, { once: true });
      this.nameElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.nameElement.blur();
        }
      });
    }

    setPosition(x, y) {
      this.position.x = x;
      this.position.y = y;
      this.element.style.left = `${x}px`;
      this.element.style.top = `${y}px`;
    }

    setBackgroundColor(color) {
      this.backgroundColor = color;
      if (this.element) {
        this.element.style.backgroundColor = color;
      }
    }

    setIcon(iconData) {
      // Supprimer l'ancienne icône
      const oldIcon = this.body.querySelector('.unit-icon');
      if (oldIcon) {
        oldIcon.remove();
      }

      if (!iconData) return;

      const icon = $('unit-icon');
      
      // Désactiver le drag par défaut sur l'image
      icon.draggable = false;
      
      if (iconData.startsWith('data:')) {
        // Base64
        icon.src = iconData;
      } else {
        // URL/Path
        icon.src = iconData;
      }

      this.body.appendChild(icon);
      this.iconElement = icon;
    }

    animateIcon() {
      if (this.iconElement) {
        this.iconElement.classList.add('animated');
        setTimeout(() => {
          this.iconElement.classList.remove('animated');
        }, 300);
      }
    }

    addInput(options = {}) {
      const {
        id = unitManager.generateConnectorId(),
        name = `Input ${this.inputs.length + 1}`,
        color = '#28a745'
      } = options;

      const connector = $('unit-connector-input', {
        attrs: { 
          'data-connector-id': id,
          'data-connector-type': 'input',
          'title': name
        }
      });

      if (color) {
        connector.style.backgroundColor = color;
        connector.style.boxShadow = `0 0 0 1px ${color}`;
      }

      // Positionner le connecteur
      const inputIndex = this.inputs.length;
      const spacing = 20;
      const headerHeight = 35; // Hauteur du header
      const bodyPaddingTop = 8; // Padding top du body
      const connectorRadius = 6; // Moitié de la taille d'un connecteur (12px/2)
      const startY = headerHeight + bodyPaddingTop + connectorRadius; // Position sous le début du body + marge
      connector.style.top = `${startY + inputIndex * spacing}px`;

      connector.addEventListener('click', (e) => {
        e.stopPropagation();
        unitManager.handleConnectorClick(this.id, id, 'input');
      });

      // Ajouter les event listeners pour le drag
      connector.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        unitManager.startConnectorDrag(this.id, id, 'input', e);
      });

      this.element.appendChild(connector);
      this.inputs.push({ id, name, color, element: connector });
      
      // Ajuster la hauteur du module après ajout
      this.adjustModuleHeight();
      
      return id;
    }

    addOutput(options = {}) {
      const {
        id = unitManager.generateConnectorId(),
        name = `Output ${this.outputs.length + 1}`,
        color = '#dc3545'
      } = options;

      const connector = $('unit-connector-output', {
        attrs: { 
          'data-connector-id': id,
          'data-connector-type': 'output',
          'title': name
        }
      });

      if (color) {
        connector.style.backgroundColor = color;
        connector.style.boxShadow = `0 0 0 1px ${color}`;
      }

      // Positionner le connecteur
      const outputIndex = this.outputs.length;
      const spacing = 20;
      const headerHeight = 35; // Hauteur du header
      const bodyPaddingTop = 8; // Padding top du body
      const connectorRadius = 6; // Moitié de la taille d'un connecteur (12px/2)
      const startY = headerHeight + bodyPaddingTop + connectorRadius; // Position sous le début du body + marge
      connector.style.top = `${startY + outputIndex * spacing}px`;

      connector.addEventListener('click', (e) => {
        e.stopPropagation();
        unitManager.handleConnectorClick(this.id, id, 'output');
      });

      // Ajouter les event listeners pour le drag
      connector.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        unitManager.startConnectorDrag(this.id, id, 'output', e);
      });

      this.element.appendChild(connector);
      this.outputs.push({ id, name, color, element: connector });
      
      // Ajuster la hauteur du module après ajout
      this.adjustModuleHeight();
      
      return id;
    }

    removeInput(connectorId) {
      const inputIndex = this.inputs.findIndex(input => input.id === connectorId);
      if (inputIndex !== -1) {
        const input = this.inputs[inputIndex];
        input.element.remove();
        this.inputs.splice(inputIndex, 1);
        
        // Repositionner les connecteurs restants
        this.repositionInputs();
      }
    }

    removeOutput(connectorId) {
      const outputIndex = this.outputs.findIndex(output => output.id === connectorId);
      if (outputIndex !== -1) {
        const output = this.outputs[outputIndex];
        output.element.remove();
        this.outputs.splice(outputIndex, 1);
        
        // Repositionner les connecteurs restants
        this.repositionOutputs();
      }
    }

    repositionInputs() {
      const spacing = 20;
      const headerHeight = 35; // Hauteur du header
      const bodyPaddingTop = 8; // Padding top du body
      const connectorRadius = 6; // Moitié de la taille d'un connecteur (12px/2)
      const startY = headerHeight + bodyPaddingTop + connectorRadius; // Position sous le début du body + marge
      this.inputs.forEach((input, index) => {
        input.element.style.top = `${startY + index * spacing}px`;
      });
      
      // Ajuster la hauteur du module après repositionnement
      this.adjustModuleHeight();
    }

    repositionOutputs() {
      const spacing = 20;
      const headerHeight = 35; // Hauteur du header
      const bodyPaddingTop = 8; // Padding top du body
      const connectorRadius = 6; // Moitié de la taille d'un connecteur (12px/2)
      const startY = headerHeight + bodyPaddingTop + connectorRadius; // Position sous le début du body + marge
      this.outputs.forEach((output, index) => {
        output.element.style.top = `${startY + index * spacing}px`;
      });
      
      // Ajuster la hauteur du module après repositionnement
      this.adjustModuleHeight();
    }

    // Nouvelle méthode pour ajuster automatiquement la hauteur du module
    adjustModuleHeight() {
      const connectorSpacing = 20;
      const headerHeight = 35; // Hauteur réduite du header
      const bodyPadding = 16; // Padding réduit top + bottom du body
      const minBodyHeight = 32; // Hauteur minimale réduite du body
      const extraMargin = 8; // Marge réduite pour l'esthétique
      
      // Calculer le nombre maximum de connecteurs sur un côté
      const maxConnectors = Math.max(this.inputs.length, this.outputs.length);
      
      if (maxConnectors === 0) {
        // Pas de connecteurs, utiliser une hauteur minimale réduite
        this.element.style.height = 'auto';
        this.element.style.minHeight = '60px';
        return;
      }
      
      // Calculer la hauteur nécessaire pour tous les connecteurs
      const connectorsHeight = Math.max(1, maxConnectors) * connectorSpacing; // Supprimer le +10 pour startY
      const requiredBodyHeight = Math.max(minBodyHeight, connectorsHeight);
      const totalHeight = headerHeight + requiredBodyHeight + bodyPadding + extraMargin;
      
      // Appliquer la nouvelle hauteur
      this.element.style.height = `${totalHeight}px`;
      this.element.style.minHeight = `${totalHeight}px`;
      
      // Optionnel: Log pour debug
      console.log(`📏 Unit ${this.name}: ${maxConnectors} connecteurs max → hauteur ${totalHeight}px`);
    }

    select() {
      unitManager.selectUnit(this.id);
    }

    deselect() {
      unitManager.deselectUnit(this.id);
    }

    rename(newName) {
      this.name = newName;
      this.nameElement.textContent = newName;
    }

    destroy() {
      unitManager.unregisterUnit(this.id);
      this.element.remove();
    }

    // Events
    onClick() {
      this.animateIcon();
    }

    onLongClick() {
      this.animateIcon();
    }
  }

  // === FONCTIONS UTILITAIRES DE L'API ===

  function createUnit(options) {
    return new Unit(options);
  }

  // Point d'entrée du bundle CDN

  // Ajout du composant Slider dans Squirrel.components pour accès via le CDN
  Squirrel.components = {
    Slider: createSlider,
    Badge: createBadge,
    Button: createButton,
    Draggable: draggable,
    List: createList,
    Matrix: createMatrix,
    Menu: createMenu,
    Minimal: createMinimal,
    Table: createTable,
    Template: createTemplate,
    Tooltip: createTooltip,
    Unit: createUnit
  };

  // Expose $ globalement et initialise le conteneur + event ready
  if (typeof window !== 'undefined') {
    window.$ = Squirrel.$;
    if (!document.getElementById('view')) {
      const view = document.createElement('div');
      view.id = 'view';
      document.body.appendChild(view);
    }
    // Déclenche l'événement squirrel:ready de façon asynchrone pour garantir la capture
    setTimeout(() => {
      window.squirrelReady = true;
      window.dispatchEvent(new Event('squirrel:ready'));
    }, 0);
  }

  return Squirrel;

}));
//# sourceMappingURL=squirrel.js.map
