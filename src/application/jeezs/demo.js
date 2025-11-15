import createModularBlocks, { DEFAULT_THEME } from './index.js';

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

const I18N_MESSAGES = {
  fr: {
    demo: {
      menu: {
        videos: 'Vidéos',
        photos: 'Photos',
        calendar: 'Calendrier',
        faq: 'FAQ',
        youtube: 'YouTube',
        palette: {
          components: 'Composants'
        }
      },
      banner: {
        eyebrow: 'Studio créatif',
        title: 'Compose ta page en quelques blocs modulaires',
        subtitle: 'Un système simple pour assembler bannière, contenus narratifs, visuels immersifs et agenda dynamique. Chaque bloc est skinnable pour adopter la personnalité de ton univers.',
        actions: {
          start: 'Commencer',
          add: 'Ajouter un bloc'
        },
        media: {
          alt: 'Moodboard digital futuriste'
        }
      },
      image: {
        label: 'Mood visuel',
        alt: 'Palette de couleurs et accessoires créatifs',
        caption: 'Définis ton identité visuelle par blocs : palette, textures, typographies et éléments immersifs.',
        credit: 'Crédit photo — Unsplash'
      },
      richText: {
        badge: 'Rich text',
        title: 'Un storytelling précis pour chaque section',
        lead: 'Développe ton argumentaire avec du texte enrichi, des listes, citations, appels à l’action… Tout est modulaire.',
        body: {
          first: 'Glisse ce bloc où tu veux pour raconter ton histoire. Ajoute des paragraphes, des listes, des callouts ou des citations en un clin d’œil.',
          second: 'Besoin de nouveaux formats ? Déclare simplement un nouveau renderer pour introduire un type unique (formulaire, carrousel, métriques, etc.).'
        },
        listItems: {
          first: 'Supports titres Hn personnalisables',
          second: 'Styles de texte synchronisés avec le thème',
          third: 'Actions multiples : liens, boutons, déclencheurs'
        },
        quote: {
          text: 'Le design devient simple quand chaque bloc est autonome et réutilisable.',
          author: 'Équipe Jeezs'
        },
        actions: {
          doc: 'Voir la doc'
        }
      },
      calendar: {
        month: 'Octobre 2024',
        description: 'Planifie événements, lancements et rendez-vous. Chaque jour peut accueillir titre, horaire et localisation.',
        events: {
          ux: { title: 'Atelier UX', location: 'Studio A' },
          designReview: { title: 'Review design system', location: 'En ligne' },
          sprintDelivery: { title: 'Livraison sprint' },
          popup: { title: 'Pop-up créatif', location: 'Paris' }
        },
        legend: {
          confirmed: 'Événement confirmé'
        }
      },
      audio: {
        title: 'Sessions audio',
        subtitle: 'Écoute des extraits préparatoires et repère visuellement l’énergie du morceau.',
        tracks: {
          riff: { title: 'Riff futuriste', description: 'Démo studio — guitares & synths' },
          after: { title: 'After The War', description: 'Atmosphère épique — build orchestral' },
          alive: { title: 'Alive', description: 'Groove pop — voix lead' },
          bigBrother: { title: 'Big Brother', description: 'Riff heavy — section rythmique' }
        }
      },
      video: {
        title: 'Captations vidéo',
        subtitle: 'Un aperçu brut des répétitions et du setup scénique.',
        videos: {
          rehearsal: {
            title: 'Live rehearsal',
            description: 'Extrait caméra fixe — work in progress'
          }
        }
      },
      contact: {
        title: 'Discutons de votre projet',
        subtitle: 'Booking, production ou simple prise de contact : laissez-nous un message et on revient vers vous rapidement.',
        submitLabel: 'Envoyer la demande',
        successMessage: 'Votre message est bien envoyé. À très vite !',
        helperText: 'Nous lisons chaque message avec attention.'
      },
      youtube: {
        title: 'Live stream YouTube',
        subtitle: 'Retrouve les dernières captations en ligne.',
        videos: {
          main: {
            title: 'Demo YouTube Embed',
            description: 'Player responsive intégré via Squirrel.'
          }
        }
      },
      faq: {
        title: 'Questions fréquentes',
        subtitle: 'Quelques réponses rapides pour cadrer votre projet.',
        items: {
          customBlocks: {
            question: 'Peut-on personnaliser chaque bloc ?',
            answer: 'Oui, chaque module est skinnable via le thème et extensible en déclarant un nouveau renderer.'
          },
          mediaIntegration: {
            question: 'Intégrez-vous vos contenus audio/vidéo préférés ?',
            answer: 'Les blocs acceptent des sources locales ou distantes. Il suffit de fournir l’URL du média et nous gérons la mise en page.'
          },
          formAction: {
            question: 'Comment déclencher une action après envoi du formulaire ?',
            answer: 'Passe une fonction onSubmit dans les données du bloc contact pour relier ton propre backend ou automatisation.'
          }
        }
      }
    }
  },
  en: {
    demo: {
      menu: {
        videos: 'Videos',
        photos: 'Photos',
        calendar: 'Calendar',
        faq: 'FAQ',
        youtube: 'YouTube',
        palette: {
          components: 'Components'
        }
      },
      banner: {
        eyebrow: 'Creative Studio',
        title: 'Compose your page with modular blocks in minutes',
        subtitle: 'A simple system for assembling banners, narrative content, immersive visuals, and a dynamic agenda. Every block can adopt the personality of your universe.',
        actions: {
          start: 'Get started',
          add: 'Add a block'
        },
        media: {
          alt: 'Futuristic digital moodboard'
        }
      },
      image: {
        label: 'Visual mood',
        alt: 'Color palette and creative accessories',
        caption: 'Define your visual identity block by block: palette, textures, typography, and immersive elements.',
        credit: 'Photo credit — Unsplash'
      },
      richText: {
        badge: 'Rich text',
        title: 'Precise storytelling for every section',
        lead: 'Develop your narrative with rich text, lists, quotes, and calls to action. Everything stays modular.',
        body: {
          first: 'Place this block wherever you need to tell your story. Add paragraphs, lists, callouts, or quotes in seconds.',
          second: 'Need new formats? Declare a custom renderer to introduce unique blocks like forms, carousels, or metrics.'
        },
        listItems: {
          first: 'Customizable heading levels',
          second: 'Text styles synced with the theme',
          third: 'Multiple actions: links, buttons, triggers'
        },
        quote: {
          text: 'Design becomes simple when each block is autonomous and reusable.',
          author: 'Jeezs Team'
        },
        actions: {
          doc: 'Read the docs'
        }
      },
      calendar: {
        month: 'October 2024',
        description: 'Plan events, launches, and meetings. Every day can hold a title, time, and location.',
        events: {
          ux: { title: 'UX workshop', location: 'Studio A' },
          designReview: { title: 'Design system review', location: 'Online' },
          sprintDelivery: { title: 'Sprint delivery' },
          popup: { title: 'Creative pop-up', location: 'Paris' }
        },
        legend: {
          confirmed: 'Confirmed event'
        }
      },
      audio: {
        title: 'Audio sessions',
        subtitle: 'Listen to prep excerpts and feel the energy of the track at a glance.',
        tracks: {
          riff: { title: 'Futuristic riff', description: 'Studio demo — guitars & synths' },
          after: { title: 'After The War', description: 'Epic atmosphere — orchestral build' },
          alive: { title: 'Alive', description: 'Pop groove — lead vocals' },
          bigBrother: { title: 'Big Brother', description: 'Heavy riff — rhythm section' }
        }
      },
      video: {
        title: 'Video captures',
        subtitle: 'A raw glimpse of rehearsals and the stage setup.',
        videos: {
          rehearsal: {
            title: 'Live rehearsal',
            description: 'Static camera excerpt — work in progress'
          }
        }
      },
      contact: {
        title: 'Let’s talk about your project',
        subtitle: 'Booking, production, or a quick hello: leave us a note and we’ll get back to you shortly.',
        submitLabel: 'Send request',
        successMessage: 'We received your message. Talk soon!',
        helperText: 'We carefully read every message.'
      },
      youtube: {
        title: 'YouTube livestream',
        subtitle: 'Catch the latest sessions online.',
        videos: {
          main: {
            title: 'YouTube embed demo',
            description: 'Responsive player powered by Squirrel.'
          }
        }
      },
      faq: {
        title: 'Frequently asked questions',
        subtitle: 'Quick answers to help you frame the project.',
        items: {
          customBlocks: {
            question: 'Can each block be customized?',
            answer: 'Yes. Every module can adopt the theme and you can declare new renderers for custom behaviors.'
          },
          mediaIntegration: {
            question: 'Can we embed our favourite audio/video content?',
            answer: 'Blocks accept local or remote sources. Provide the media URL and we handle the layout.'
          },
          formAction: {
            question: 'How do we trigger an action after form submission?',
            answer: 'Provide an onSubmit function in the contact block data to link your backend or automation.'
          }
        }
      }
    }
  }
};

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
      eyebrow: tx('banner.eyebrow', 'Studio créatif'),
      title: tx('banner.title', 'Compose ta page en quelques blocs modulaires'),
      subtitle: tx('banner.subtitle', 'Un système simple pour assembler bannière, contenus narratifs, visuels immersifs et agenda dynamique. Chaque bloc est skinnable pour adopter la personnalité de ton univers.'),
      actions: [
        { label: tx('banner.actions.start', 'Commencer'), href: '#', target: '_self' },
        {
          label: tx('banner.actions.add', 'Ajouter un bloc'),
          onClick: () => console.log(i18n.t('demo.banner.actions.add', 'Ajouter un bloc'))
        }
      ],
      media: {
        src: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80',
        alt: tx('banner.media.alt', 'Moodboard digital futuriste')
      }
    }
  },
  {
    type: 'image',
    data: {
      label: tx('image.label', 'Mood visuel'),
      src: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=1200&q=80',
      alt: tx('image.alt', 'Palette de couleurs et accessoires créatifs'),
      caption: tx('image.caption', 'Définis ton identité visuelle par blocs : palette, textures, typographies et éléments immersifs.'),
      credit: tx('image.credit', 'Crédit photo — Unsplash')
    }
  },
  {
    type: 'rich-text',
    data: {
      badge: tx('richText.badge', 'Rich text'),
      title: tx('richText.title', 'Un storytelling précis pour chaque section'),
      lead: tx('richText.lead', 'Développe ton argumentaire avec du texte enrichi, des listes, citations, appels à l’action… Tout est modulaire.'),
      body: [
        tx('richText.body.first', 'Glisse ce bloc où tu veux pour raconter ton histoire. Ajoute des paragraphes, des listes, des callouts ou des citations en un clin d’œil.'),
        tx('richText.body.second', 'Besoin de nouveaux formats ? Déclare simplement un nouveau renderer pour introduire un type unique (formulaire, carrousel, métriques, etc.).')
      ],
      listItems: [
        tx('richText.listItems.first', 'Supports titres Hn personnalisables'),
        tx('richText.listItems.second', 'Styles de texte synchronisés avec le thème'),
        tx('richText.listItems.third', 'Actions multiples : liens, boutons, déclencheurs')
      ],
      quote: {
        text: tx('richText.quote.text', 'Le design devient simple quand chaque bloc est autonome et réutilisable.'),
        author: tx('richText.quote.author', 'Équipe Jeezs')
      },
      actions: [
        { label: tx('richText.actions.doc', 'Voir la doc'), href: '#', target: '_blank' }
      ]
    }
  },
  {
    type: 'calendar',
    data: {
      css: blockVisibilityState.calendar ? undefined : { display: 'none' },
      month: tx('calendar.month', 'Octobre 2024'),
      description: tx('calendar.description', 'Planifie événements, lancements et rendez-vous. Chaque jour peut accueillir titre, horaire et localisation.'),
      startOffset: 1,
      totalDays: 31,
      events: [
        { day: 4, title: tx('calendar.events.ux.title', 'Atelier UX'), time: '10:00', location: tx('calendar.events.ux.location', 'Studio A') },
        { day: 11, title: tx('calendar.events.designReview.title', 'Review design system'), time: '15:30', location: tx('calendar.events.designReview.location', 'En ligne') },
        { day: 18, title: tx('calendar.events.sprintDelivery.title', 'Livraison sprint'), time: '09:00' },
        { day: 27, title: tx('calendar.events.popup.title', 'Pop-up créatif'), time: '14:00', location: tx('calendar.events.popup.location', 'Paris') }
      ],
      legend: [
        { label: tx('calendar.legend.confirmed', 'Événement confirmé') }
      ]
    }
  },
  {
    type: 'audio-wave',
    data: {
      title: tx('audio.title', 'Sessions audio'),
      subtitle: tx('audio.subtitle', 'Écoute des extraits préparatoires et repère visuellement l’énergie du morceau.'),
      tracks: [
        {
          src: riffAudio,
          title: tx('audio.tracks.riff.title', 'Riff futuriste'),
          artist: 'Jeezs',
          description: tx('audio.tracks.riff.description', 'Démo studio — guitares & synths'),
          preload: 'auto'
        },
        {
          src: encodeURI('../assets/audios/After The War.m4a'),
          title: tx('audio.tracks.after.title', 'After The War'),
          artist: 'Jeezs',
          description: tx('audio.tracks.after.description', 'Atmosphère épique — build orchestral'),
          preload: 'auto'
        },
        {
          src: encodeURI('../assets/audios/Alive.m4a'),
          title: tx('audio.tracks.alive.title', 'Alive'),
          artist: 'Jeezs',
          description: tx('audio.tracks.alive.description', 'Groove pop — voix lead'),
          preload: 'auto'
        },
        {
          src: encodeURI('../assets/audios/Big Brother.m4a'),
          title: tx('audio.tracks.bigBrother.title', 'Big Brother'),
          artist: 'Jeezs',
          description: tx('audio.tracks.bigBrother.description', 'Riff heavy — section rythmique'),
          preload: 'auto'
        }
      ]
    }
  },
  {
    type: 'video-player',
    data: {
      title: tx('video.title', 'Captations vidéo'),
      subtitle: tx('video.subtitle', 'Un aperçu brut des répétitions et du setup scénique.'),
      videos: [
        {
          src: demoVideo,
          title: tx('video.videos.rehearsal.title', 'Live rehearsal'),
          description: tx('video.videos.rehearsal.description', 'Extrait caméra fixe — work in progress'),
          preload: 'metadata'
        }
      ]
    }
  },
  {
    type: 'contact',
    data: {
      title: tx('contact.title', 'Discutons de votre projet'),
      subtitle: tx('contact.subtitle', 'Booking, production ou simple prise de contact : laissez-nous un message et on revient vers vous rapidement.'),
      submitLabel: tx('contact.submitLabel', 'Envoyer la demande'),
      successMessage: tx('contact.successMessage', 'Votre message est bien envoyé. À très vite !'),
      helperText: tx('contact.helperText', 'Nous lisons chaque message avec attention.'),
      onSubmit: (payload) => {
        console.log('[Jeezs Demo][Contact]', payload);
      }
    }
  },
  {
    type: 'youtube',
    data: {
      css: blockVisibilityState.youtube ? undefined : { display: 'none' },
      title: tx('youtube.title', 'Live stream YouTube'),
      subtitle: tx('youtube.subtitle', 'Retrouve les dernières captations en ligne.'),
      videos: [
        {
          url: 'https://www.youtube.com/watch?v=QapkGK-6G90&list=RDGMEM_v2KDBP3d4f8uT-ilrs8fQVMQapkGK-6G90',
          title: tx('youtube.videos.main.title', 'Demo YouTube Embed'),
          description: tx('youtube.videos.main.description', 'Player responsive intégré via Squirrel.')
        }
      ]
    }
  },
  {
    type: 'faq',
    data: {
      title: tx('faq.title', 'Questions fréquentes'),
      subtitle: tx('faq.subtitle', 'Quelques réponses rapides pour cadrer votre projet.'),
      items: [
        {
          question: tx('faq.items.customBlocks.question', 'Peut-on personnaliser chaque bloc ?'),
          answer: tx('faq.items.customBlocks.answer', 'Oui, chaque module est skinnable via le thème et extensible en déclarant un nouveau renderer.')
        },
        {
          question: tx('faq.items.mediaIntegration.question', 'Intégrez-vous vos contenus audio/vidéo préférés ?'),
          answer: tx('faq.items.mediaIntegration.answer', 'Les blocs acceptent des sources locales ou distantes. Il suffit de fournir l’URL du média et nous gérons la mise en page.'),
          open: true
        },
        {
          question: tx('faq.items.formAction.question', 'Comment déclencher une action après envoi du formulaire ?'),
          answer: tx('faq.items.formAction.answer', 'Passe une fonction onSubmit dans les données du bloc contact pour relier ton propre backend ou automatisation.')
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
    i18n,
    css: {
      paddingTop: `calc(${MENU_VERTICAL_OFFSET}px + clamp(28px, 5vw, 72px))`
    }
  });

  refreshBlockVisibility();
  refreshMenuStates();
}

mountJeezsDemo();
