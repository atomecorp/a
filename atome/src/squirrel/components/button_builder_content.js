// Extracted from button_builder.js createButton: appends icon/text/badge to a built button and
// attaches its base mutation methods (updateText/updateBadge/setVariant/setDisabled + template getters).
import { $ } from '../squirrel.js';

export function attachButtonContentAndMethods(button, deps) {
  const { buttonId, icon, finalText, badge, skin, buttonStyles, processedConfig } = deps;

  // === MÉTHODES POUR TEMPLATES ===
  button.getTemplate = () => processedConfig._templateName || null;
  button.getTemplateInfo = () => processedConfig._templateInfo || null;

  // Ajout de l'icône si présente
  if (icon) {
    const iconElement = $('button-icon', {
      id: `${buttonId}_icon`,
      text: icon,
      css: skin.icon || {}
    });

    // Ajustement de la marge si pas de texte
    if (!finalText) {
      iconElement.$({ css: { marginRight: '0' } });
    }

    button.appendChild(iconElement);
  }

  // Ajout du texte si présent
  if (finalText) {
    // Si le bouton n'a pas déjà de texte, on le met directement sur le bouton principal
    if (!button.querySelector('.hs-button-text')) {
      button.textContent = finalText;
    } else {
      const textElement = $('button-text', {
        id: `${buttonId}_text`,
        text: finalText,
        css: skin.text || {}
      });
      button.appendChild(textElement);
    }
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

  // Méthodes utilitaires de base
  button.updateText = (newText) => {
    // Si le bouton n'a pas de .hs-button-text, on modifie directement textContent
    const textEl = button.querySelector('.hs-button-text');
    if (textEl) textEl.textContent = newText;
    else button.textContent = newText;
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

}

// Exposes onClick/onAction/offAction as live getter/setters over button._handlers.
export function exposeButtonHandlerProperties(button) {
  // === CORRECTION: EXPOSER LES HANDLERS COMME PROPRIÉTÉS MODIFIABLES ===

  // Exposer onClick comme propriété getter/setter
  Object.defineProperty(button, 'onClick', {
    get() {
      return this._handlers.onClick;
    },
    set(newHandler) {
      this._handlers.onClick = newHandler;
    },
    enumerable: true,
    configurable: true
  });

  // Exposer onAction comme propriété getter/setter
  Object.defineProperty(button, 'onAction', {
    get() {
      return this._handlers.onAction;
    },
    set(newHandler) {
      this._handlers.onAction = newHandler;
    },
    enumerable: true,
    configurable: true
  });

  // Exposer offAction comme propriété getter/setter
  Object.defineProperty(button, 'offAction', {
    get() {
      return this._handlers.offAction;
    },
    set(newHandler) {
      this._handlers.offAction = newHandler;
    },
    enumerable: true,
    configurable: true
  });
}
