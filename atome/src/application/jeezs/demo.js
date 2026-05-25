import createModularBlocks, { DEFAULT_THEME } from './index.js';
import { createJeezsDemoBlocks } from './demo_blocks.js';
import { I18N_MESSAGES } from './demo_messages.js';

function ensureI18nHelpers() {
  const fallbackSource = (typeof window !== 'undefined' && window.ModularBlocks) || createModularBlocks;
  const createI18nFn = fallbackSource && typeof fallbackSource.createI18n === 'function' ? fallbackSource.createI18n : null;
  const i18nTextFn = fallbackSource && typeof fallbackSource.i18nText === 'function' ? fallbackSource.i18nText : null;
  if (typeof createI18nFn !== 'function' || typeof i18nTextFn !== 'function') {
    throw new Error('[Jeezs Demo] i18n helpers are not available. Ensure createI18n/i18nText are exported from ModularBlocks.');
  }
  return { createI18n: createI18nFn, i18nText: i18nTextFn };
}

const { createI18n, i18nText } = ensureI18nHelpers();

const globalWindow = typeof window !== 'undefined' ? window : undefined;

function detectUserLocale() {
  if (typeof navigator !== 'undefined') {
    return navigator.language || navigator.userLanguage || 'fr';
  }
  return 'fr';
}

const i18n = createI18n({
  locale: detectUserLocale(),
  fallbackLocale: 'fr',
  messages: I18N_MESSAGES
});

const tx = (path, fallback, params) => i18nText(`demo.${path}`, fallback, params);
const tr = (path, fallback, params) => i18n.resolve(tx(path, fallback, params));

if (globalWindow) {
  globalWindow.jeezsI18n = i18n;
}

// Correspondance entre les items du menu et les blocs de la page
const MENU_TOGGLE_CONFIG = {
  videos: {
    menuKey: 'toggle_videos',
    selector: '.jeezs-block--video',
    label: tr('menu.videos', 'Vidéos'),
    defaultVisible: true
  },
  photos: {
    menuKey: 'toggle_photos',
    selector: '.jeezs-block--image',
    label: tr('menu.photos', 'Photos'),
    defaultVisible: true
  },
  calendar: {
    menuKey: 'toggle_calendar',
    selector: '.jeezs-block--calendar',
    label: tr('menu.calendar', 'Calendrier'),
    defaultVisible: false
  },
  faq: {
    menuKey: 'toggle_faq',
    selector: '.jeezs-block--faq',
    label: tr('menu.faq', 'FAQ'),
    defaultVisible: true
  },
  youtube: {
    menuKey: 'toggle_youtube',
    selector: '.jeezs-block--video-youtube',
    label: tr('menu.youtube', 'YouTube'),
    defaultVisible: false
  }
};

const MENU_KEYS_IN_ORDER = ['videos', 'photos', 'calendar', 'faq', 'youtube'];
const MENU_TOOLBOX_KEYS = MENU_KEYS_IN_ORDER.map((key) => MENU_TOGGLE_CONFIG[key].menuKey);

const blockVisibilityState = MENU_KEYS_IN_ORDER.reduce((acc, key) => {
  const config = MENU_TOGGLE_CONFIG[key];
  acc[key] = config ? Boolean(config.defaultVisible) : true;
  return acc;
}, {});

let menuObserver = null;
let menuObserverScheduled = false;

function toNumber(value, fallback = 0) {
  const parsed = typeof value === 'string' || typeof value === 'number'
    ? parseFloat(value)
    : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function computeMenuVerticalOffset() {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  const styles = root && typeof getComputedStyle === 'function' ? getComputedStyle(root) : null;
  const support = toNumber(styles?.getPropertyValue('--eve-v2-toolbox-handle-size'), 54);
  const offsetEdge = toNumber(styles?.getPropertyValue('--eve-v2-toolbox-inset'), 0);
  const offsetMain = 0;
  const itemsSpacing = toNumber(styles?.getPropertyValue('--eve-tool-gap'), 0);
  const safetyMargin = 24;
  return support + offsetEdge + offsetMain + itemsSpacing + safetyMargin;
}

// Espace additionnel pour que l’ouverture du menu ne masque pas les blocs
const MENU_VERTICAL_OFFSET = computeMenuVerticalOffset();

function applyVisibilityToSelector(selector, visible) {
  if (typeof document === 'undefined') return;
  if (!selector) return;
  document.querySelectorAll(selector).forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    node.style.display = visible ? '' : 'none';
  });
}

function refreshBlockVisibility() {
  if (typeof document === 'undefined') return;
  MENU_KEYS_IN_ORDER.forEach((key) => {
    const config = MENU_TOGGLE_CONFIG[key];
    if (!config) return;
    applyVisibilityToSelector(config.selector, blockVisibilityState[key]);
  });
}

function elementIsVisible(node) {
  if (!(node instanceof HTMLElement)) return false;
  if (typeof node.checkVisibility === 'function') {
    try {
      return node.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true });
    } catch (err) {
      // ignore and fallback
    }
  }
  if (node.offsetParent !== null) return true;
  const rect = node.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

function syncStateFromDom() {
  if (typeof document === 'undefined') return;
  MENU_KEYS_IN_ORDER.forEach((key) => {
    const config = MENU_TOGGLE_CONFIG[key];
    if (!config) return;
    const nodes = document.querySelectorAll(config.selector);
    if (!nodes.length) return;
    const isVisible = Array.from(nodes).some(elementIsVisible);
    blockVisibilityState[key] = isVisible;
  });
}

function requestMenuSync() {
  if (menuObserverScheduled) return;
  menuObserverScheduled = true;
  const run = () => {
    menuObserverScheduled = false;
    syncStateFromDom();
    refreshBlockVisibility();
    refreshMenuStates();
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(run);
      } else {
        setTimeout(run, 0);
      }
    });
  } else {
    setTimeout(run, 0);
  }
}

function ensureMenuObserver(attempt = 0) {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  if (menuObserver) return;
  const support = document.getElementById('menu_container_v2');
  if (!support) {
    const schedule = () => ensureMenuObserver(attempt + 1);
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(schedule);
    } else {
      setTimeout(schedule, 50);
    }
    return;
  }
  menuObserver = new MutationObserver(() => requestMenuSync());
  menuObserver.observe(support, { childList: true, subtree: true });
  requestMenuSync();
}

function resolveMenuTheme() {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  const styles = root && typeof getComputedStyle === 'function' ? getComputedStyle(root) : null;
  return {
    inactive: styles?.getPropertyValue('--eve-v2-tool-background') || '',
    active: styles?.getPropertyValue('--eve-v2-tool-active-background') || '#7a7c73ff'
  };
}

function syncMenuItemState(menuKey, isActive, el) {
  if (typeof document === 'undefined') return;
  const target = el || document.querySelector(`[data-name-key="${menuKey}"]`);
  if (!(target instanceof HTMLElement)) return;

  const themeColors = resolveMenuTheme();
  if (!target.dataset.defaultBg) {
    target.dataset.defaultBg = target.style.background || themeColors.inactive;
  }
  if (!target.dataset.activeBg) {
    target.dataset.activeBg = themeColors.active;
  }

  if (isActive) {
    target.dataset.simpleActive = 'true';
    target.dataset.activeTag = 'true';
    target.style.background = target.dataset.activeBg;
  } else {
    delete target.dataset.simpleActive;
    delete target.dataset.activeTag;
    target.style.background = target.dataset.defaultBg;
  }
}

function refreshMenuStates() {
  if (typeof document === 'undefined') return;
  MENU_KEYS_IN_ORDER.forEach((key) => {
    const config = MENU_TOGGLE_CONFIG[key];
    if (!config) return;
    syncMenuItemState(config.menuKey, blockVisibilityState[key]);
  });
}

function setBlockVisibility(key, visible, options = {}) {
  const config = MENU_TOGGLE_CONFIG[key];
  if (!config) return Boolean(visible);

  const nextValue = Boolean(visible);
  blockVisibilityState[key] = nextValue;
  refreshBlockVisibility();
  refreshMenuStates();
  syncMenuItemState(config.menuKey, nextValue, options.el);
  ensureMenuObserver();
  return nextValue;
}

function toggleBlockVisibility(key, el) {
  const applyToggle = () => {
    const datasetState = el && el.dataset ? el.dataset.simpleActive === 'true' : null;
    const current = blockVisibilityState[key];
    const nextValue = typeof datasetState === 'boolean' ? datasetState : !current;
    setBlockVisibility(key, nextValue, { el });
  };

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(applyToggle);
  } else {
    setTimeout(applyToggle, 0);
  }
}

function createMenuToggleHandler(key) {
  return ({ el }) => {
    toggleBlockVisibility(key, el);
  };
}

const menu_content = {
  version: '1.1',
  meta: { namespace: 'vie.menu', defaultLocale: i18n.locale },
  toolbox: { children: MENU_TOOLBOX_KEYS }
};

MENU_KEYS_IN_ORDER.forEach((key) => {
  const config = MENU_TOGGLE_CONFIG[key];
  if (!config) return;
  const handler = createMenuToggleHandler(key);
  menu_content[config.menuKey] = {
    type: 'tool',
    label: config.label,
    icon: false,
    touch: handler
  };
});

refreshMenuStates();
if (typeof requestAnimationFrame === 'function') {
  requestAnimationFrame(refreshMenuStates);
}
ensureMenuObserver();

function mountJeezsDemo() {
  if (document.getElementById('jeezs-blocks')) {
    return;
  }

  const view = document.querySelector('#view');
  if (!view) {
    window.addEventListener('squirrel:ready', mountJeezsDemo, { once: true });
    return;
  }

  window.jeezsBlocksDemo = createModularBlocks({
    namespace: 'jeezs',
    blocks: createJeezsDemoBlocks({ tx, blockVisibilityState }),
    theme: DEFAULT_THEME,
    id: 'jeezs-blocks',
    i18n,
    css: {
      paddingTop: `calc(${MENU_VERTICAL_OFFSET}px + clamp(28px, 5vw, 72px))`
    }
  });

  refreshBlockVisibility();
  refreshMenuStates();
}

mountJeezsDemo();
