import createModularBlocks, { DEFAULT_THEME } from './index.js';

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
    id: 'jeezs-blocks'
  });
}

mountJeezsDemo();
