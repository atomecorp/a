import createModularBlocks, { DEFAULT_THEME } from './index.js';

const globalWindow = typeof window !== 'undefined' ? window : undefined;

// Correspondance entre les items du menu et les blocs de la page
const MENU_TOGGLE_CONFIG = {
  videos: {
    menuKey: 'toggle_videos',
    selector: '.jeezs-block--video',
    label: 'Vidéos',
    defaultVisible: true
  },
  photos: {
    menuKey: 'toggle_photos',
    selector: '.jeezs-block--image',
    label: 'Photos',
    defaultVisible: true
  },
  calendar: {
    menuKey: 'toggle_calendar',
    selector: '.jeezs-block--calendar',
    label: 'Calendrier',
    defaultVisible: false
  },
  faq: {
    menuKey: 'toggle_faq',
    selector: '.jeezs-block--faq',
    label: 'FAQ',
    defaultVisible: true
  },
  youtube: {
    menuKey: 'toggle_youtube',
    selector: '.jeezs-block--video-youtube',
    label: 'YouTube',
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
  const theme = (globalWindow && globalWindow.Intuition_theme && globalWindow.Intuition_theme.basic) || {};
  const support = toNumber(theme.support_thickness, toNumber(theme.item_size, 54));
  const offsetEdge = toNumber(theme.toolboxOffsetEdge, 0);
  const offsetMain = toNumber(theme.toolboxOffsetMain, 0);
  const itemsSpacing = toNumber(theme.items_spacing, 0);
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
  const support = document.getElementById('toolbox_support');
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
  const theme = (globalWindow && globalWindow.Intuition_theme && globalWindow.Intuition_theme.basic) || {};
  return {
    inactive: theme.tool_bg || '',
    active: theme.tool_bg_active || theme.tool_active_bg || theme.tool_bg || '#7a7c73ff'
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
  meta: { namespace: 'vie.menu', defaultLocale: 'fr' },
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

Intuition({ name: 'menu_test', content: menu_content });
refreshMenuStates();
if (typeof requestAnimationFrame === 'function') {
  requestAnimationFrame(refreshMenuStates);
}
ensureMenuObserver();



const riffAudio = '../assets/audios/riff.m4a';
const demoVideo = '../assets/videos/superman.mp4';

const JEEZS_DEMO_BLOCKS = [
  {
    type: 'banner',
    data: {
      eyebrow: 'Studio créatif',
      title: 'Compose ta page en quelques blocs modulaires',
      subtitle: 'Un système simple pour assembler bannière, contenus narratifs, visuels immersifs et agenda dynamique. Chaque bloc est skinnable pour adopter la personnalité de ton univers.',
      actions: [
        { label: 'Commencer', href: '#', target: '_self' },
        { label: 'Ajouter un bloc', onClick: () => console.log('Ajouter un bloc') }
      ],
      media: {
        src: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80',
        alt: 'Moodboard digital futuriste'
      }
    }
  },
  {
    type: 'image',
    data: {
      label: 'Mood visuel',
      src: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=1200&q=80',
      alt: 'Palette de couleurs et accessoires créatifs',
      caption: 'Définis ton identité visuelle par blocs : palette, textures, typographies et éléments immersifs.',
      credit: 'Crédit photo — Unsplash'
    }
  },
  {
    type: 'rich-text',
    data: {
      badge: 'Rich text',
      title: 'Un storytelling précis pour chaque section',
      lead: 'Développe ton argumentaire avec du texte enrichi, des listes, citations, appels à l’action… Tout est modulaire.',
      body: [
        'Glisse ce bloc où tu veux pour raconter ton histoire. Ajoute des paragraphes, des listes, des callouts ou des citations en un clin d’œil.',
        'Besoin de nouveaux formats ? Déclare simplement un nouveau renderer pour introduire un type unique (formulaire, carrousel, métriques, etc.).'
      ],
      listItems: [
        'Supports titres Hn personnalisables',
        'Styles de texte synchronisés avec le thème',
        'Actions multiples : liens, boutons, déclencheurs'
      ],
      quote: {
        text: 'Le design devient simple quand chaque bloc est autonome et réutilisable.',
        author: 'Équipe Jeezs'
      },
      actions: [
        { label: 'Voir la doc', href: '#', target: '_blank' }
      ]
    }
  },
  {
    type: 'calendar',
    data: {
      css: blockVisibilityState.calendar ? undefined : { display: 'none' },
      month: 'Octobre 2024',
      description: 'Planifie événements, lancements et rendez-vous. Chaque jour peut accueillir titre, horaire et localisation.',
      startOffset: 1,
      totalDays: 31,
      events: [
        { day: 4, title: 'Atelier UX', time: '10:00', location: 'Studio A' },
        { day: 11, title: 'Review design system', time: '15:30', location: 'En ligne' },
        { day: 18, title: 'Livraison sprint', time: '09:00' },
        { day: 27, title: 'Pop-up créatif', time: '14:00', location: 'Paris' }
      ],
      legend: [
        { label: 'Événement confirmé' }
      ]
    }
  },
  {
    type: 'audio-wave',
    data: {
      title: 'Sessions audio',
      subtitle: 'Écoute des extraits préparatoires et repère visuellement l’énergie du morceau.',
      tracks: [
        {
          src: riffAudio,
          title: 'Riff futuriste',
          artist: 'Jeezs',
          description: 'Démo studio — guitares & synths',
          preload: 'auto'
        },
        {
          src: encodeURI('../assets/audios/After The War.m4a'),
          title: 'After The War',
          artist: 'Jeezs',
          description: 'Atmosphère épique — build orchestral',
          preload: 'auto'
        },
        {
          src: encodeURI('../assets/audios/Alive.m4a'),
          title: 'Alive',
          artist: 'Jeezs',
          description: 'Groove pop — voix lead',
          preload: 'auto'
        },
        {
          src: encodeURI('../assets/audios/Big Brother.m4a'),
          title: 'Big Brother',
          artist: 'Jeezs',
          description: 'Riff heavy — section rythmique',
          preload: 'auto'
        }
      ]
    }
  },
  {
    type: 'video-player',
    data: {
      title: 'Captations vidéo',
      subtitle: 'Un aperçu brut des répétitions et du setup scénique.',
      videos: [
        {
          src: demoVideo,
          title: 'Live rehearsal',
          description: 'Extrait caméra fixe — work in progress',
          preload: 'metadata'
        }
      ]
    }
  },
  {
    type: 'contact',
    data: {
      title: 'Discutons de votre projet',
      subtitle: 'Booking, production ou simple prise de contact : laissez-nous un message et on revient vers vous rapidement.',
      submitLabel: 'Envoyer la demande',
      successMessage: 'Votre message est bien envoyé. À très vite !',
      helperText: 'Nous lisons chaque message avec attention.',
      onSubmit: (payload) => {
        console.log('[Jeezs Demo][Contact]', payload);
      }
    }
  },
  {
    type: 'youtube',
    data: {
      css: blockVisibilityState.youtube ? undefined : { display: 'none' },
      title: 'Live stream YouTube',
      subtitle: 'Retrouve les dernières captations en ligne.',
      videos: [
        {
          url: 'https://www.youtube.com/watch?v=QapkGK-6G90&list=RDGMEM_v2KDBP3d4f8uT-ilrs8fQVMQapkGK-6G90',
          title: 'Demo YouTube Embed',
          description: 'Player responsive intégré via Squirrel.'
        }
      ]
    }
  },
  {
    type: 'faq',
    data: {
      title: 'Questions fréquentes',
      subtitle: 'Quelques réponses rapides pour cadrer votre projet.',
      items: [
        {
          question: 'Peut-on personnaliser chaque bloc ?',
          answer: 'Oui, chaque module est skinnable via le thème et extensible en déclarant un nouveau renderer.'
        },
        {
          question: 'Intégrez-vous vos contenus audio/vidéo préférés ?',
          answer: 'Les blocs acceptent des sources locales ou distantes. Il suffit de fournir l’URL du média et nous gérons la mise en page.',
          open: true
        },
        {
          question: 'Comment déclencher une action après envoi du formulaire ?',
          answer: 'Passe une fonction onSubmit dans les données du bloc contact pour relier ton propre backend ou automatisation.'
        }
      ]
    }
  }
];

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
    blocks: JEEZS_DEMO_BLOCKS,
    theme: DEFAULT_THEME,
    id: 'jeezs-blocks',
    css: {
      paddingTop: `calc(${MENU_VERTICAL_OFFSET}px + clamp(28px, 5vw, 72px))`
    }
  });

  refreshBlockVisibility();
  refreshMenuStates();
}

mountJeezsDemo();
