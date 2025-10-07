import createModularBlocks, { DEFAULT_THEME } from './index.js';

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
    id: 'jeezs-blocks'
  });
}

mountJeezsDemo();
