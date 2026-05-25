export function createJeezsDemoBlocks({ tx, blockVisibilityState }) {
  const riffAudio = '../assets/audios/riff.m4a';
  const demoVideo = '../assets/videos/superman.mp4';

  return [
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
          onClick: () => void 0
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
}
