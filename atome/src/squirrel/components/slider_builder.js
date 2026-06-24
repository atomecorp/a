/**
 * Composant Slider skinnable avec HyperSquirrel
 * Chaque élément du slider est entièrement customisable
 * Support pour sliders horizontaux, verticaux et circulaires
 */

import { $, define } from '../squirrel.js';
import { sliderVariants, sliderSizes, sliderPresets } from './slider_builder_data.js';
import { setupSliderBehavior } from './slider_builder_behavior.js';

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
  const sState = { isDragging: false, currentVal: currentValue, currentHandleOffset: handleOffset };

  // Fonction de mise à jour de position
  const { updatePosition } = setupSliderBehavior({ container, track, handle, progression, label, type, isCircular, min, max, step, value, disabled, onChange, onInput, sState });
  container.setValue = (newValue) => {
    updatePosition(newValue);
    if (onChange) onChange(sState.currentVal);
    return container;
  };

  container.getValue = () => sState.currentVal;

  container.setRange = (newMin, newMax) => {
    min = newMin;
    max = newMax;
    updatePosition(sState.currentVal);
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
      sState.currentHandleOffset = offset;
      updatePosition(sState.currentVal);
    }
    return container;
  };

  container.getHandleOffset = () => sState.currentHandleOffset;

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

// Alias pour compatibilité
const Slider = createSlider;
createSlider.controlKind = 'generic-content-slider';
createSlider.isToolSlider = false;
createSlider.canonicalToolOwner = 'ToolSlider';
Slider.controlKind = createSlider.controlKind;
Slider.isToolSlider = createSlider.isToolSlider;
Slider.canonicalToolOwner = createSlider.canonicalToolOwner;
export { Slider };

// Export par défaut - fonction directe pour usage: Slider({...})
export default createSlider;
