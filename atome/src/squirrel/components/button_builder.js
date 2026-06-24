import { $ } from '../squirrel.js';
import { buttonTemplates, buttonStyles, buttonSizes } from './button_builder_templates.js';
import { applyTemplate, applyTemplateEffects } from './button_builder_template_effects.js';
import { attachButtonContentAndMethods, exposeButtonHandlerProperties } from './button_builder_content.js';
import { getNextStateIndex, createPrimaryButton, createSecondaryButton, createSuccessButton, createDangerButton, createWarningButton, createIconButton, createOutlineButton, materialSwitch } from './button_builder_presets.js';

/**
 * Composant Button skinnable avec HyperSquirrel
 * Chaque élément du bouton est entièrement customisable
 */

// === SYSTÈME DE TEMPLATES/SKINS ===

// Registre des templates globaux
const createButton = (config = {}) => {
  const {
    // default to empty text: components will show no label unless explicitly provided
    text = '',
    icon,
    badge,
    variant = 'default',
    size = 'md',
    onClick,
    skin = {},
    id,
    disabled = false,

    // === SYSTÈME DE TEMPLATES ===
    template, // ou templates pour compatibilité
    templates, // alias pour template

    // === NOUVELLES PROPRIÉTÉS TOGGLE ===
    onText,
    offText,
    onAction,
    offAction,
    onStyle = {},
    offStyle = {},
    initialState = false, // false = OFF, true = ON
    onStateChange,

    // === PROPRIÉTÉS POUR ÉTATS MULTIPLES ===
    states, // Array d'états personnalisés
    cycleMode = 'forward',

    ...otherProps
  } = config;

  // Génération d'ID unique si non fourni
  const buttonId = id || `btn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  // Résoudre le nom du template
  const templateName = template || templates;

  // Appliquer le template si spécifié
  let processedConfig = config;
  if (templateName) {
    processedConfig = applyTemplate(config, templateName);
  }

  // Déterminer le mode de fonctionnement
  // Toggle mode if any of: onText/offText, onStyle/offStyle, onAction/offAction, or explicit toggle flag
  const isToggleMode = (
    onText !== undefined ||
    offText !== undefined ||
    (onStyle && Object.keys(onStyle).length > 0) ||
    (offStyle && Object.keys(offStyle).length > 0) ||
    typeof onAction === 'function' ||
    typeof offAction === 'function' ||
    processedConfig.toggle === true
  );
  const isMultiStateMode = states && states.length > 0;

  // État interne pour le toggle
  let currentToggleState = initialState;
  let currentStateIndex = 0;
  let pingPongDirection = 1;

  // Configuration initiale selon le mode
  let finalText = text;
  let finalStyles = {};

  if (isToggleMode) {
    // Mode toggle: utiliser l'état initial pour déterminer le texte
    finalText = currentToggleState ? (onText || text) : (offText || text);
    // Note: Les styles d'état seront appliqués plus tard dans containerStyles
  } else if (isMultiStateMode) {
    // Mode multi-états: utiliser le premier état
    const firstState = states[0];
    finalText = firstState.text || text;
    finalStyles = { ...firstState.css };
  }

  // Styles de base selon variant et size
  let containerStyles = { ...buttonStyles[variant] || {}, ...buttonSizes[size] || {} };

  // ✅ FUSION COMPLÈTE AVANT CRÉATION DU BOUTON
  // 1. Styles de base (variant + size)
  if (templateName && processedConfig.css) {
    // 2. Ajouter les styles du template fusionnés avec config
    containerStyles = { ...containerStyles, ...processedConfig.css };
  } else if (templateName && buttonTemplates[templateName]) {
    // Fallback si pas de processedConfig.css
    containerStyles = { ...containerStyles, ...buttonTemplates[templateName].css };
  } else if (processedConfig.css) {
    // Pas de template, juste les styles utilisateur
    containerStyles = { ...containerStyles, ...processedConfig.css };
  }

  // 3. Ajouter les styles skin
  if (skin.container) {
    containerStyles = { ...containerStyles, ...skin.container };
  }

  // 4. ✅ FUSION FINALE : Ajouter les styles d'état initial AVANT création
  if (isToggleMode && templateName && buttonTemplates[templateName]) {
    // Récupérer les styles d'état du template
    const templateStateStyles = currentToggleState ?
      (buttonTemplates[templateName].onStyle || {}) :
      (buttonTemplates[templateName].offStyle || {});

    // Récupérer les styles d'état de l'utilisateur
    const userStateStyles = currentToggleState ?
      (processedConfig.onStyle || {}) :
      (processedConfig.offStyle || {});

    // Appliquer les styles d'état par-dessus tout
    if (templateStateStyles && Object.keys(templateStateStyles).length > 0) {
      containerStyles = { ...containerStyles, ...templateStateStyles };
    }
    if (userStateStyles && Object.keys(userStateStyles).length > 0) {
      containerStyles = { ...containerStyles, ...userStateStyles };
    }
  } else if (isToggleMode) {
    // Apply user-provided state styles even without a template
    const userStateStylesOnly = currentToggleState ? (processedConfig.onStyle || {}) : (processedConfig.offStyle || {});
    if (Object.keys(userStateStylesOnly).length > 0) {
      containerStyles = { ...containerStyles, ...userStateStylesOnly };
    }
  } else if (Object.keys(finalStyles).length > 0) {
    // Pour les modes non-toggle, appliquer finalStyles
    containerStyles = { ...containerStyles, ...finalStyles };
  }

  // Styles pour état disabled
  if (disabled) {
    containerStyles.opacity = '0.6';
    containerStyles.cursor = 'not-allowed';
    containerStyles.pointerEvents = 'none';
  }

  // Respect explicit small width/height: if the developer provided small dimensions
  // prefer an icon-only compact button (no padding/minWidth that would expand it).
  const parsePx = (v) => {
    if (v === undefined || v === null) return null;
    if (typeof v === 'number') return v;
    const m = String(v).match(/^(-?\d+(?:\.\d+)?)(px)?$/);
    return m ? Number(m[1]) : null;
  };

  const explicitW = parsePx(containerStyles.width || processedConfig.width || processedConfig.css && processedConfig.css.width);
  const explicitH = parsePx(containerStyles.height || processedConfig.height || processedConfig.css && processedConfig.css.height);
  const smallThreshold = 32; // px — consider buttons <= this size as icon-only
  const isSmall = (explicitW !== null && explicitW <= smallThreshold) || (explicitH !== null && explicitH <= smallThreshold);

  if (isSmall) {
    // Force compact rendering by overriding template defaults so explicit sizes are respected
    containerStyles.boxSizing = 'border-box';
    containerStyles.padding = '0';
    containerStyles.minWidth = '0';
    containerStyles.minHeight = '0';
    // ensure explicit width/height remain as provided (if numeric, add px)
    if (explicitW !== null) containerStyles.width = String(explicitW) + 'px';
    if (explicitH !== null) containerStyles.height = String(explicitH) + 'px';
    // hide any text when small unless explicitly forced
    if (!processedConfig.forceText) {
      // this will make later checks like `if (finalText)` fail and avoid adding text nodes
      finalText = '';
    }
    // reduce font-size influence
    containerStyles.fontSize = '0px';
    // make overflow hidden so inner content doesn't push size
    containerStyles.overflow = 'hidden';
    // ensure inline-flex alignment centers icon
    containerStyles.display = 'inline-flex';
    containerStyles.alignItems = 'center';
    containerStyles.justifyContent = 'center';
  }

  // Fonction de gestion du clic
  const handleClick = (event) => {
    if (disabled) return;

    if (isToggleMode) {
      // Mode toggle: basculer entre ON/OFF
      currentToggleState = !currentToggleState;

      // Mettre à jour le texte
      const newText = currentToggleState ? onText : offText;
      if (newText) {
        button.updateText(newText);
      }

      // Mettre à jour les styles
      // ✅ Récupérer les styles du template pour le nouvel état
      const templateStateStyles = currentToggleState ?
        (templateName && buttonTemplates[templateName] ? buttonTemplates[templateName].onStyle || {} : {}) :
        (templateName && buttonTemplates[templateName] ? buttonTemplates[templateName].offStyle || {} : {});

      // ✅ Récupérer les styles utilisateur pour le nouvel état
      const userStateStyles = currentToggleState ?
        (processedConfig.onStyle || {}) :
        (processedConfig.offStyle || {});

      // ✅ Fusionner les styles: template base + template state + user state + user css
      const templateBase = templateName && buttonTemplates[templateName] ? buttonTemplates[templateName].css : {};
      // Compose so state styles override base CSS. Base = template + user css; State = template state + user state.
      const finalStyles = {
        ...templateBase,        // 1) Template base styles
        ...processedConfig.css, // 2) User base CSS
        ...templateStateStyles, // 3) Template state styles
        ...userStateStyles      // 4) User state styles (highest priority)
      };

      // Preserve externally imposed size.
      // If the button already has inline width/height coming from another system (and caller didn't explicitly set new ones in finalStyles), keep them.
      if (button && button.id && /_toggle$/.test(button.id)) {
        // Recompute width/height from stored base size * external master scale if available
        const baseSize = button.dataset.baseToggleSize ? parseFloat(button.dataset.baseToggleSize) : null;
        let masterScale = 1;
        try { if (window.getIntuitionMasterScale) masterScale = window.getIntuitionMasterScale(); } catch (e) { }
        if (baseSize) {
          const scaled = Math.round(baseSize * masterScale) + 'px';
          finalStyles.width = scaled;
          finalStyles.height = scaled;
        } else {
          const existingW = button.style.width;
          const existingH = button.style.height;
          if (existingW && finalStyles.width === undefined) finalStyles.width = existingW;
          if (existingH && finalStyles.height === undefined) finalStyles.height = existingH;
        }
        // Also ensure borderRadius kept if externally scaled
        const existingBR = button.style.borderRadius;
        if (existingBR && finalStyles.borderRadius === undefined) finalStyles.borderRadius = existingBR;
      }

      button.$({ css: finalStyles });

      // Exécuter l'action appropriée (with async error handling)
      if (currentToggleState && button._handlers.onAction) {
        Promise.resolve(button._handlers.onAction(currentToggleState, button)).catch(err => {
        });
      } else if (!currentToggleState && button._handlers.offAction) {
        Promise.resolve(button._handlers.offAction(currentToggleState, button)).catch(err => {
        });
      }

      // Callback de changement d'état
      if (onStateChange) {
        Promise.resolve(onStateChange(currentToggleState, button)).catch(err => {
        });
      }

    } else if (isMultiStateMode) {
      // Mode multi-états: passer à l'état suivant
      currentStateIndex = getNextStateIndex(currentStateIndex, states.length, cycleMode, pingPongDirection);

      // Pour ping-pong, ajuster la direction si nécessaire
      if (cycleMode === 'ping-pong') {
        if (currentStateIndex === states.length - 1) {
          pingPongDirection = -1;
        } else if (currentStateIndex === 0) {
          pingPongDirection = 1;
        }
      }

      const newState = states[currentStateIndex];

      // Mettre à jour l'apparence
      if (newState.text) button.updateText(newState.text);
      if (newState.css) {
        const baseStyles = templateName && buttonTemplates[templateName] ? buttonTemplates[templateName].css : {};
        button.$({ css: { ...baseStyles, ...newState.css, ...processedConfig.css } });
      }
      if (newState.icon) {
        const iconEl = button.querySelector('.hs-button-icon');
        if (iconEl) iconEl.textContent = newState.icon;
      }

      // Exécuter l'action de l'état (with async error handling)
      if (newState.action) {
        Promise.resolve(newState.action(newState, currentStateIndex, button)).catch(err => {
        });
      }

      // Callback de changement d'état
      if (onStateChange) {
        Promise.resolve(onStateChange(newState, currentStateIndex, button)).catch(err => {
        });
      }

    } else {
      // Mode bouton classique (with async error handling)
      if (button._handlers.onClick) {
        Promise.resolve(button._handlers.onClick(event, button)).catch(err => {
        });
      }
    }
  };

  // Création du conteneur principal

  // ✅ Nettoyer les styles CSS pour éviter les propriétés parasites
  const cleanStyles = {};
  // Utiliser Object.keys() au lieu de for...in pour éviter les propriétés héritées
  Object.keys(containerStyles).forEach(key => {
    if (typeof containerStyles[key] !== 'function' && key !== 'define_method' && key !== 'inspect') {
      cleanStyles[key] = containerStyles[key];
    }
  });


  const button = $('button-container', {
    id: buttonId,
    css: cleanStyles,
    attrs: { disabled },
    onClick: handleClick,
    ...otherProps
  });

  // Empêcher la sélection/drag native pour que tout le bouton soit la cible
  button.addEventListener('dragstart', (e) => e.preventDefault());
  button.addEventListener('selectstart', (e) => e.preventDefault());

  // Ensure no default outline/border remains (some templates or UA styles may inject them)
  try {
    // remove possible outline and border set later
    button.style.setProperty('outline', 'none');
    button.style.setProperty('border', 'none');
  } catch (e) {
    // ignore
  }

  // ✅ FORCER TOUS les styles critiques manuellement
  Object.keys(cleanStyles).forEach(key => {
    if (typeof cleanStyles[key] !== 'function' && key !== 'define_method' && key !== 'inspect') {
      const kebabKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      button.style.setProperty(kebabKey, cleanStyles[key]);
    }
  });

  // ✅ Debug: vérifier les styles appliqués dans le DOM

  // Stocker la config pour référence
  button._config = processedConfig;

  // === CORRECTION: INITIALISER LES HANDLERS DANS L'OBJET BOUTON ===
  // Stocker les handlers dans l'objet bouton pour permettre leur modification
  button._handlers = {
    onClick: onClick,
    onAction: onAction,
    offAction: offAction
  };

  // Appliquer les effets du template si disponible
  if (templateName && buttonTemplates[templateName]) {
    applyTemplateEffects(button, buttonTemplates[templateName]);
  }

  attachButtonContentAndMethods(button, { buttonId, icon, finalText, badge, skin, buttonStyles, processedConfig });
  // === MÉTHODES SPÉCIFIQUES AU TOGGLE ===
  if (isToggleMode) {
    button.toggle = () => {
      handleClick();
      return button;
    };

    button.setState = (state) => {
      if (currentToggleState !== state) {
        handleClick();
      }
      return button;
    };

    button.getState = () => currentToggleState;

    button.setOnState = () => {
      if (!currentToggleState) {
        handleClick();
      }
      return button;
    };

    button.setOffState = () => {
      if (currentToggleState) {
        handleClick();
      }
      return button;
    };
  }

  // === MÉTHODES SPÉCIFIQUES MULTI-ÉTATS ===
  if (isMultiStateMode) {
    button.nextState = () => {
      handleClick();
      return button;
    };

    button.setStateIndex = (index) => {
      if (index >= 0 && index < states.length && index !== currentStateIndex) {
        currentStateIndex = index;
        const newState = states[currentStateIndex];

        if (newState.text) button.updateText(newState.text);
        if (newState.css) button.$({ css: newState.css });
        if (newState.icon) {
          const iconEl = button.querySelector('.hs-button-icon');
          if (iconEl) iconEl.textContent = newState.icon;
        }

        if (newState.action) {
          newState.action(newState, currentStateIndex, button);
        }

        if (onStateChange) {
          onStateChange(newState, currentStateIndex, button);
        }
      }
      return button;
    };

    button.getCurrentState = () => states[currentStateIndex];
    button.getCurrentStateIndex = () => currentStateIndex;
    button.getStates = () => states;
  }

  exposeButtonHandlerProperties(button);

  return button;
};


// === API STATIQUE POUR LES TEMPLATES ===

// Ajouter les templates à la fonction Button
createButton.templates = buttonTemplates;
createButton.getTemplateList = () => Object.keys(buttonTemplates);
createButton.getTemplate = (name) => buttonTemplates[name];
createButton.addTemplate = (name, template) => {
  buttonTemplates[name] = template;
  return createButton;
};

createButton.listTemplates = () => {
  return createButton;
};

createButton.removeTemplate = (name) => {
  if (buttonTemplates[name]) {
    delete buttonTemplates[name];
  } else {
  }
  return createButton;
};

// === EXPORTS ===
export { createButton };

// Alias pour compatibilité avec l'ancien pattern
const Button = createButton;

// Copier les méthodes statiques sur l'alias Button
Button.templates = createButton.templates;
Button.getTemplateList = createButton.getTemplateList;
Button.getTemplate = createButton.getTemplate;
Button.addTemplate = createButton.addTemplate;
Button.listTemplates = createButton.listTemplates;
Button.removeTemplate = createButton.removeTemplate;

export { Button };

// Export par défaut - fonction directe pour usage: Button({...})
export default createButton;

// Export des utilitaires supplémentaires
export {
  createPrimaryButton,
  createSecondaryButton,
  createSuccessButton,
  createDangerButton,
  createWarningButton,
  createIconButton,
  createOutlineButton,
  buttonStyles,
  buttonSizes,
  materialSwitch
};
