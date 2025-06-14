import { $, define } from '../squirrel.js';

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

// === SYSTÈME DE PRESETS ===
const sliderPresets = {
  materialHorizontal: (config = {}) => {
    const baseSkin = {
      container: {
        width: '250px',
        height: '24px',
        padding: '12px 0'
      },
      track: {
        width: '100%',
        height: '4px',
        top: '10px',
        backgroundColor: '#e0e0e0',
        borderRadius: '2px'
      },
      progression: {
        height: '100%',
        backgroundColor: '#1976d2',
        borderRadius: '2px'
      },
      handle: {
        width: '20px',
        height: '20px',
        top: '-8px',
        backgroundColor: '#1976d2',
        border: 'none',
        boxShadow: '0 3px 6px rgba(25, 118, 210, 0.3)'
      },
      label: {
        top: '30px',
        fontSize: '14px',
        fontWeight: '500',
        color: '#1976d2'
      }
    };
    return {
      ...config,
      type: 'horizontal',
      skin: {
        ...baseSkin,
        ...(config.skin || {})
      }
    };
  },

  materialVertical: (config = {}) => {
    const baseSkin = {
      container: {
        width: '24px',
        height: '250px',
        padding: '0 12px'
      },
      track: {
        width: '4px',
        height: '100%',
        left: '10px',
        backgroundColor: '#e0e0e0',
        borderRadius: '2px'
      },
      progression: {
        width: '100%',
        backgroundColor: '#1976d2',
        borderRadius: '2px'
      },
      handle: {
        width: '20px',
        height: '20px',
        left: '-8px',
        backgroundColor: '#1976d2',
        border: 'none',
        boxShadow: '0 3px 6px rgba(25, 118, 210, 0.3)'
      },
      label: {
        left: '30px',
        fontSize: '14px',
        fontWeight: '500',
        color: '#1976d2'
      }
    };
    return {
      ...config,
      type: 'vertical',
      skin: {
        ...baseSkin,
        ...(config.skin || {})
      }
    };
  },

  materialCircular: (config = {}) => {
    const baseSkin = {
      container: {
        width: '140px',
        height: '140px',
        padding: '10px'
      },
      track: {
        width: '100%',
        height: '100%',
        borderRadius: '50%',
        border: '6px solid #e0e0e0',
        backgroundColor: 'transparent'
      },
      handle: {
        width: '24px',
        height: '24px',
        backgroundColor: '#1976d2',
        border: '3px solid #fff',
        boxShadow: '0 4px 8px rgba(25, 118, 210, 0.3)'
      },
      label: {
        fontSize: '18px',
        fontWeight: 'bold',
        color: '#1976d2'
      }
    };
    return {
      ...config,
      type: 'circular',
      skin: {
        ...baseSkin,
        ...(config.skin || {})
      }
    };
  }
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
    const percentage = ((clampedValue - min) / (max - min)) * 100;
    
    if (isCircular) {
      // Slider circulaire : position sur le cercle
      // Convertir le pourcentage en angle (0-360°)
      const angleInDegrees = (percentage / 100) * 360;
      
      // Convertir en radians et ajuster pour commencer en haut (-90°)
      const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
      
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
      
      const x = 50 + radiusPercent * Math.cos(angleInRadians);
      const y = 50 + radiusPercent * Math.sin(angleInRadians);
      
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
          // Pour que la progression commence en haut et suive le handle
          const offset = circumference - (percentage / 100) * circumference;
          progressCircle.style.strokeDashoffset = offset;
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
        
        // Cercle de progression
        const circularProgressionStyles = skin.progression || {};
        const progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        progressCircle.classList.add('progress-circle');
        progressCircle.style.cssText = `
          fill: none;
          stroke: ${circularProgressionStyles.stroke || progressionStyles.backgroundColor || '#007bff'};
          stroke-width: ${circularProgressionStyles.strokeWidth || '6'};
          stroke-dasharray: ${circumference};
          stroke-dashoffset: ${circumference - (percentage / 100) * circumference};
          stroke-linecap: ${circularProgressionStyles.strokeLinecap || 'butt'};
          opacity: ${circularProgressionStyles.opacity || '1'};
        `;
        progressCircle.setAttribute('cx', '50');
        progressCircle.setAttribute('cy', '50');
        progressCircle.setAttribute('r', svgRadius.toString());
        
        svg.appendChild(backgroundCircle);
        svg.appendChild(progressCircle);
        track.appendChild(svg);
      }
      
    } else if (type === 'vertical') {
      // Slider vertical
      handle.$({
        css: {
          top: `${100 - percentage}%`,
          transform: 'translate(-50%, -50%)'
        }
      });
      
      if (progression) {
        progression.$({
          css: {
            height: `${percentage}%`
          }
        });
      }
      
    } else {
      // Slider horizontal (défaut)
      handle.$({
        css: {
          left: `${percentage}%`,
          transform: 'translate(-50%, -50%)'
        }
      });
      
      if (progression) {
        progression.$({
          css: {
            width: `${percentage}%`
          }
        });
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

// === FACTORY FUNCTIONS POUR VARIANTES COMMUNES ===

const createHorizontalSlider = (config) => createSlider({ ...config, type: 'horizontal' });
const createVerticalSlider = (config) => createSlider({ ...config, type: 'vertical' });
const createCircularSlider = (config) => createSlider({ ...config, type: 'circular' });

const materialHorizontal = (config) => createSlider(sliderPresets.materialHorizontal(config));
const materialVertical = (config) => createSlider(sliderPresets.materialVertical(config));
const materialCircular = (config) => createSlider(sliderPresets.materialCircular(config));

// === EXPORT ===
export {
  createSlider,
  createHorizontalSlider,
  createVerticalSlider,
  createCircularSlider,
  materialHorizontal,
  materialVertical,
  materialCircular,
  sliderVariants,
  sliderSizes,
  sliderPresets
};

// Export par défaut
export default {
  create: createSlider,
  horizontal: createHorizontalSlider,
  vertical: createVerticalSlider,
  circular: createCircularSlider,
  materialHorizontal,
  materialVertical,
  materialCircular
};