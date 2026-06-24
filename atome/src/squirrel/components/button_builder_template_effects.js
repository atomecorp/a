// Template application extracted from button_builder.js: resolves a named template into a
// config (applyTemplate) and applies its DOM/interaction effects to a built button (applyTemplateEffects).
import { $, define } from '../squirrel.js';
import { buttonTemplates } from './button_builder_templates.js';

const applyTemplate = (config, templateName) => {
  const template = buttonTemplates[templateName];
  if (!template) {
    return config;
  }

  // Fusionner les styles du template avec la config
  const mergedConfig = {
    ...config,
    css: {
      ...template.css,
      ...config.css // Les styles personnalisés overrident le template
    }
  };

  // Appliquer les styles ON/OFF du template si pas définis dans config
  if (template.onStyle && !config.onStyle) {
    mergedConfig.onStyle = template.onStyle;
  } else if (template.onStyle && config.onStyle) {
    mergedConfig.onStyle = { ...template.onStyle, ...config.onStyle };
  }

  if (template.offStyle && !config.offStyle) {
    mergedConfig.offStyle = template.offStyle;
  } else if (template.offStyle && config.offStyle) {
    mergedConfig.offStyle = { ...template.offStyle, ...config.offStyle };
  }

  // Stocker les infos du template pour référence
  mergedConfig._templateName = templateName;
  mergedConfig._templateInfo = template;

  return mergedConfig;
};

// Fonction pour ajouter des effets hover/active du template
const applyTemplateEffects = (button, template) => {
  if (template.hover) {
    button.addEventListener('mouseenter', () => {
      button.$({ css: template.hover });
    });

    button.addEventListener('mouseleave', () => {
      const currentState = button.getState ? button.getState() : null;
      const preserveSize = () => {
        const css = {};
        if (button && /_toggle$/.test(button.id)) {
          let masterScale = 1;
          try { if (window.getIntuitionMasterScale) masterScale = window.getIntuitionMasterScale(); } catch (e) { }
          const baseSize = button.dataset.baseToggleSize ? parseFloat(button.dataset.baseToggleSize) : null;
          if (baseSize) {
            const scaled = Math.round(baseSize * masterScale) + 'px';
            css.width = scaled;
            css.height = scaled;
          } else {
            if (button.style.width) css.width = button.style.width;
            if (button.style.height) css.height = button.style.height;
          }
          if (button.style.borderRadius) css.borderRadius = button.style.borderRadius;
        }
        return css;
      };
      if (currentState !== null) {
        const stateStyle = currentState ? button._config.onStyle : button._config.offStyle;
        const merged = { ...template.css, ...stateStyle, ...preserveSize() };
        button.$({ css: merged });
      } else {
        const baseCss = { ...template.css, ...preserveSize() };
        button.$({ css: baseCss });
      }
    });
  }

  if (template.active) {
    button.addEventListener('mousedown', () => {
      button.$({ css: template.active });
    });

    button.addEventListener('mouseup', () => {
      const currentState = button.getState ? button.getState() : null;
      const preserveSize = () => {
        const css = {};
        if (button && /_toggle$/.test(button.id)) {
          let masterScale = 1;
          try { if (window.getIntuitionMasterScale) masterScale = window.getIntuitionMasterScale(); } catch (e) { }
          const baseSize = button.dataset.baseToggleSize ? parseFloat(button.dataset.baseToggleSize) : null;
          if (baseSize) {
            const scaled = Math.round(baseSize * masterScale) + 'px';
            css.width = scaled;
            css.height = scaled;
          } else {
            if (button.style.width) css.width = button.style.width;
            if (button.style.height) css.height = button.style.height;
          }
          if (button.style.borderRadius) css.borderRadius = button.style.borderRadius;
        }
        return css;
      };
      if (currentState !== null) {
        const stateStyle = currentState ? button._config.onStyle : button._config.offStyle;
        const merged = { ...template.css, ...stateStyle, ...preserveSize() };
        button.$({ css: merged });
      } else {
        const baseCss = { ...template.css, ...preserveSize() };
        button.$({ css: baseCss });
      }
    });
  }
};

// === DÉFINITION DES TEMPLATES DE BASE ===

// Template pour le conteneur principal du bouton
define('button-container', {
  tag: 'button',
  class: 'hs-button',
  text: '',
  css: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 16px',
    // remove default contour
    border: 'none',
    borderRadius: '4px',
    // backgroundColor: '#f8f9fa', // ❌ Retiré pour éviter les conflits
    // color: '#333', // ❌ Retiré pour éviter les conflits
    fontSize: '14px',
    fontFamily: 'system-ui, sans-serif',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    outline: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    WebkitTouchCallout: 'none',
    WebkitUserDrag: 'none'
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
    fontSize: '16px',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    pointerEvents: 'none',
    WebkitUserDrag: 'none'
  },
  attrs: {
    draggable: 'false'
  }
});

// Template pour le texte du bouton
define('button-text', {
  tag: 'span',
  class: 'hs-button-text',
  css: {
    fontSize: 'inherit',
    fontWeight: '400',
    lineHeight: '1',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    pointerEvents: 'none',
    WebkitUserDrag: 'none'
  },
  attrs: {
    draggable: 'false'
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
    userSelect: 'none',
    WebkitUserSelect: 'none',
    pointerEvents: 'none',
    WebkitUserDrag: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: '600',
    lineHeight: '1'
  }
});

// === VARIANTES DE STYLES PRÉDÉFINIES ===


export { applyTemplate, applyTemplateEffects };
