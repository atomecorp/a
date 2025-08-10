// Exemple de démo compatible Squirrel

// 1. Titre principal
$('h1', {
  parent: '#view',
  id: 'demo-title',
  css: {
    backgroundColor: '#222',
    color: '#fff',
    padding: '16px',
    margin: '16px 0',
    borderRadius: '8px',
    textAlign: 'center'
  },
  text: 'Démo Squirrel 🎉'
});

// 2. Zone d'affichage dynamique
const output = $('div', {
  parent: '#view',
  id: 'demo-output',
  css: {
    backgroundColor: '#f9f9f9',
    border: '1px solid #ccc',
    borderRadius: '8px',
    padding: '16px',
    margin: '16px 0',
    minHeight: '40px'
  },
  text: 'Cliquez sur un bouton pour voir une action.'
});

// 3. Bouton Squirrel avec composant Button
const messageButton = Button({
  text: 'Afficher un message',
  parent: '#view',
  css: {
    margin: '8px',
    padding: '10px 20px',
    backgroundColor: '#007bff',
    color: '#fff',
    borderRadius: '5px',
    cursor: 'pointer',
    position: 'relative'
  },
  onAction: () => {
    console.log('Message button clicked');
    output.$({ text: 'Bravo, vous avez cliqué le bouton ! 🚀' });
  }
});

// 4. Slider Squirrel
const demoSlider = Slider({
  min: 0,
  max: 100,
  value: 50,
  step: 1,
  parent: '#view',
  css: {
    margin: '8px',
    width: '200px'
  },
  onInput: (value) => {
    console.log('Slider value:', value);
    output.$({ text: `Valeur du slider : ${value}` });
  }
});

// 5. Exemple d'animation Squirrel
const animBox = $('div', {
  parent: '#view',
  id: 'anim-box',
  css: {
    width: '80px',
    height: '80px',
    backgroundColor: '#4caf50',
    margin: '16px auto',
    borderRadius: '8px',
    transition: 'all 0.5s'
  }
});

const animButton = Button({
  text: 'Animer la boîte',
  parent: '#view',
  css: {
    margin: '8px',
    padding: '10px 20px',
    backgroundColor: '#ff9800',
    color: '#fff',
    borderRadius: '5px',
    cursor: 'pointer',
    position: 'relative'
  },
  onAction: () => {
    console.log('Animation button clicked');
    animBox.$({
      css: {
        width: '160px',
        height: '160px',
        backgroundColor: '#e91e63'
      }
    });
    setTimeout(() => {
      animBox.$({
        css: {
          width: '80px',
          height: '80px',
          backgroundColor: '#4caf50'
        }
      });
    }, 700);
  }
});

// 6. Input text Squirrel
$('input', {
  parent: '#view',
  attrs: {
    type: 'text',
    placeholder: 'Tapez quelque chose...'
  },
  css: {
    margin: '8px',
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    width: '200px'
  },
  oninput: (e) => {
    console.log('Input value:', e.target.value);
    output.$({ text: `Vous tapez : "${e.target.value}"` });
  }
});

// 7. Liste de couleurs
const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f7d794', '#c44569'];
$('div', {
  parent: '#view',
  css: {
    margin: '16px 0',
    textAlign: 'center'
  },
  text: 'Choisissez une couleur :'
});

colors.forEach((color, index) => {
  Button({
    text: `Couleur ${index + 1}`,
    parent: '#view',
    css: {
      margin: '4px',
      padding: '8px 16px',
      backgroundColor: color,
      color: '#fff',
      borderRadius: '4px',
      cursor: 'pointer',
      position: 'relative'
    },
    onAction: () => {
      console.log('Color button clicked:', color);
      document.body.style.backgroundColor = color;
      output.$({ text: `Couleur de fond changée en ${color}` });
    }
  });
});

// Export pour ES6 modules
export default {};

//media examples

// 8. Section média
$('h2', {
  parent: '#view',
  css: {
    color: '#333',
    margin: '32px 0 16px 0',
    textAlign: 'center',
    borderBottom: '2px solid #007bff',
    paddingBottom: '8px'
  },
  text: 'Exemples Média 🎵📷🎬'
});

// 9. Balise audio Squirrel avec syntaxe correcte
const audioElement = $('audio', {
  parent: '#view',
  id: 'demo-audio',
  attrs: {
    src: './assets/audios/riff.m4a',
    controls: true
  },
  css: {
    width: '100%',
    maxWidth: '400px',
    margin: '16px auto',
    display: 'block',
    borderRadius: '8px'
  },
  onplay: () => {
    console.log('Audio play event triggered');
    output.$({ text: '🎵 Audio en cours de lecture...' });
  },
  onpause: () => {
    console.log('Audio pause event triggered');
    output.$({ text: '⏸️ Audio en pause' });
  },
  onended: () => {
    console.log('Audio ended event triggered');
    output.$({ text: '✅ Lecture audio terminée' });
  },
  onerror: (e) => {
    console.log('Audio error:', e);
    output.$({ text: '❌ Erreur de chargement audio' });
  }
});

// 10. Galerie d'images Squirrel
$('div', {
  parent: '#view',
  css: {
    textAlign: 'center',
    margin: '16px 0'
  },
  text: 'Galerie d\'images :'
});

const imageElement1 = $('img', {
  parent: '#view',
  id: 'img1',
  attrs: {
    src: './assets/images/green_planet.png',
    alt: 'Planète verte'
  },
  css: {
    width: '150px',
    height: '150px',
    objectFit: 'cover',
    borderRadius: '50%',
    margin: '8px',
    display: 'inline-block',
    border: '4px solid #4caf50',
    cursor: 'pointer',
    transition: 'transform 0.3s ease'
  },
  onclick: () => {
    console.log('Image 1 clicked');
    output.$({ text: '🌍 Image cliquée : Planète verte!' });
  },
  onmouseover: function() {
    this.style.transform = 'scale(1.1)';
  },
  onmouseout: function() {
    this.style.transform = 'scale(1)';
  }
});

const imageElement2 = $('img', {
  parent: '#view',
  id: 'img2',
  attrs: {
    src: './assets/images/puydesancy.jpg',
    alt: 'Puy de Sancy'
  },
  css: {
    width: '150px',
    height: '150px',
    objectFit: 'cover',
    borderRadius: '8px',
    margin: '8px',
    display: 'inline-block',
    border: '4px solid #ff9800',
    cursor: 'pointer',
    transition: 'transform 0.3s ease'
  },
  onclick: () => {
    console.log('Image 2 clicked');
    output.$({ text: '🏔️ Image cliquée : Puy de Sancy!' });
  },
  onmouseover: function() {
    this.style.transform = 'scale(1.1) rotate(5deg)';
  },
  onmouseout: function() {
    this.style.transform = 'scale(1) rotate(0deg)';
  }
});

// 11. Balise vidéo Squirrel
const videoElement = $('video', {
  parent: '#view',
  id: 'demo-video',
  attrs: {
    src: './assets/videos/avengers.mp4',
    controls: true,
    width: 400,
    height: 225
  },
  css: {
    margin: '16px auto',
    display: 'block',
    borderRadius: '8px',
    boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
  },
  onplay: () => {
    console.log('Video play event triggered');
    output.$({ text: '🎬 Vidéo en cours de lecture...' });
  },
  onpause: () => {
    console.log('Video pause event triggered');
    output.$({ text: '⏸️ Vidéo en pause' });
  },
  onended: () => {
    console.log('Video ended event triggered');
    output.$({ text: '🎭 Lecture vidéo terminée' });
  },
  onerror: (e) => {
    console.log('Video error:', e);
    output.$({ text: '❌ Erreur lors du chargement de la vidéo' });
  }
});

// 13. Section Google intégré
$('h2', {
  parent: '#view',
  css: {
    color: '#333',
    margin: '32px 0 16px 0',
    textAlign: 'center',
    borderBottom: '2px solid #007bff',
    paddingBottom: '8px'
  },
  text: 'Google intégré 🔍'
});

// Interface de recherche Google-like
const googleContainer = $('div', {
  parent: '#view',
  id: 'google-container',
  css: {
    width: '800px',
    height: '600px',
    margin: '16px auto',
    border: '2px solid #ccc',
    borderRadius: '8px',
    backgroundColor: '#fff',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
    overflow: 'hidden'
  }
});

// Iframe pour afficher les pages web (cachée initialement)
const webViewFrame = $('iframe', {
  parent: googleContainer,
  id: 'web-view-frame',
  attrs: {
    src: 'about:blank',
    frameborder: '0'
  },
  css: {
    width: '100%',
    height: '0px',
    transition: 'height 0.3s ease',
    border: 'none',
    display: 'none'
  }
});

// Header Google-like
const googleHeader = $('div', {
  parent: googleContainer,
  css: {
    height: '60px',
    backgroundColor: '#f8f9fa',
    borderBottom: '1px solid #e0e0e0',
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    gap: '15px'
  }
});

// Logo Google
$('div', {
  parent: googleHeader,
  css: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#4285f4'
  },
  text: 'Google'
});

// Barre de recherche
const searchInput = $('input', {
  parent: googleHeader,
  attrs: {
    type: 'text',
    placeholder: 'Rechercher...'
  },
  css: {
    flex: '1',
    height: '40px',
    padding: '0 15px',
    borderRadius: '20px',
    border: '1px solid #ddd',
    fontSize: '16px',
    outline: 'none'
  },
  onkeypress: (e) => {
    if (e.key === 'Enter') {
      performSearch(e.target.value);
    }
  }
});

// Bouton de recherche
const searchButton = Button({
  text: '🔍',
  parent: googleHeader,
  css: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: '#4285f4',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    position: 'relative'
  },
  onAction: () => {
    const query = searchInput.value;
    if (query.trim()) {
      performSearch(query);
    }
  }
});

// Bouton pour fermer l'iframe et revenir à la recherche
const closeWebViewButton = Button({
  text: '✕',
  parent: googleHeader,
  css: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: '#ea4335',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    position: 'relative',
    display: 'none'
  },
  onAction: () => {
    closeWebView();
  }
});

// Zone de résultats
const resultsContainer = $('div', {
  parent: googleContainer,
  id: 'results-container',
  css: {
    flex: '1',
    padding: '20px',
    overflow: 'auto',
    backgroundColor: '#fff'
  }
});

// Message initial
$('div', {
  parent: resultsContainer,
  css: {
    textAlign: 'center',
    marginTop: '100px',
    color: '#666',
    fontSize: '18px'
  },
  text: 'Tapez votre recherche et appuyez sur Entrée'
});

// Fonction de recherche simulée
async function performSearch(query) {
  console.log('🔍 Recherche Google simulée - Debug info:');
  console.log('- Query:', query);
  
  // Vider les résultats
  resultsContainer.innerHTML = '';
  
  // Afficher le chargement
  const loadingDiv = $('div', {
    parent: resultsContainer,
    css: {
      textAlign: 'center',
      padding: '50px',
      fontSize: '16px',
      color: '#666'
    },
    text: '🔄 Recherche en cours...'
  });
  
  output.$({ text: `🔍 Recherche: "${query}"` });
  
  try {
    // Simulation d'API de recherche avec délai
    setTimeout(() => {
      // Supprimer le loading
      loadingDiv.remove();
      
      // Créer des résultats simulés
      createSearchResults(query);
      
      console.log('✅ Résultats de recherche générés');
      output.$({ text: `✅ Résultats trouvés pour: "${query}"` });
    }, 1000);
    
  } catch(e) {
    console.log('❌ Erreur de recherche:', e);
    loadingDiv.$({ text: '❌ Erreur lors de la recherche' });
    output.$({ text: '❌ Erreur de recherche: ' + e.message });
  }
}

// Créer des résultats de recherche simulés
function createSearchResults(query) {
  // Titre des résultats
  $('div', {
    parent: resultsContainer,
    css: {
      fontSize: '14px',
      color: '#666',
      marginBottom: '20px',
      borderBottom: '1px solid #eee',
      paddingBottom: '10px'
    },
    text: `Environ 1,250,000 résultats pour "${query}"`
  });
  
  // Génération de résultats factices basés sur la requête
  const results = generateMockResults(query);
  
  results.forEach((result, index) => {
    // Container du résultat
    const resultDiv = $('div', {
      parent: resultsContainer,
      css: {
        marginBottom: '25px',
        padding: '10px',
        borderRadius: '5px',
        cursor: 'pointer',
        transition: 'background-color 0.2s'
      },
      onmouseover: function() {
        this.style.backgroundColor = '#f8f9fa';
      },
      onmouseout: function() {
        this.style.backgroundColor = 'transparent';
      },
      onclick: () => {
        // Ne plus intercepter les clics puisque nous avons de vrais liens
        console.log('📄 Zone de résultat cliquée:', result.title);
      }
    });
    
    // URL cliquable
    $('div', {
      parent: resultDiv,
      css: {
        fontSize: '14px',
        color: '#1a73e8',
        marginBottom: '5px',
        textDecoration: 'none',
        display: 'block',
        cursor: 'pointer'
      },
      text: result.url,
      onclick: (e) => {
        e.stopPropagation();
        console.log('🔗 Lien URL cliqué:', result.url);
        loadInWebView(result.url, result.title);
        output.$({ text: `🔗 Chargement: ${result.url}` });
      }
    });
    
    // Titre cliquable
    $('div', {
      parent: resultDiv,
      css: {
        fontSize: '20px',
        color: '#1a73e8',
        fontWeight: '400',
        marginBottom: '5px',
        textDecoration: 'underline',
        display: 'block',
        cursor: 'pointer'
      },
      text: result.title,
      onclick: (e) => {
        e.stopPropagation();
        console.log('🔗 Lien titre cliqué:', result.title);
        loadInWebView(result.url, result.title);
        output.$({ text: `🔗 Chargement: ${result.title}` });
      }
    });
    
    // Description
    $('div', {
      parent: resultDiv,
      css: {
        fontSize: '14px',
        color: '#4d5156',
        lineHeight: '1.4'
      },
      text: result.description
    });
  });
}

// Générer des résultats factices intelligents
function generateMockResults(query) {
  const baseResults = [
    {
      url: `https://fr.wikipedia.org/wiki/${query}`,
      title: `${query} - Wikipédia`,
      description: `${query} est un terme qui désigne... Découvrez tout sur ${query} dans cette encyclopédie collaborative. Histoire, définition, utilisations et plus encore.`
    },
    {
      url: `https://www.youtube.com/results?search_query=${query}`,
      title: `${query} - Vidéos YouTube`,
      description: `Regardez des vidéos sur ${query}. Trouvez des tutoriels, des documentaires et des contenus populaires liés à ${query}.`
    },
    {
      url: `https://images.google.com/search?q=${query}`,
      title: `Images de ${query} - Google Images`,
      description: `Découvrez des milliers d'images liées à ${query}. Photos, illustrations, graphiques et plus encore.`
    },
    {
      url: `https://news.google.com/search?q=${query}`,
      title: `Actualités sur ${query} - Google Actualités`,
      description: `Les dernières nouvelles et actualités concernant ${query}. Articles récents de sources fiables.`
    },
    {
      url: `https://scholar.google.com/scholar?q=${query}`,
      title: `${query} - Google Scholar`,
      description: `Articles académiques et recherches scientifiques sur ${query}. Publications peer-reviewed et citations.`
    }
  ];
  
  return baseResults;
}

// Fonction pour charger une page dans l'iframe
function loadInWebView(url, title) {
  console.log('🌐 Chargement dans iframe:', url);
  
  try {
    // Ajouter le protocole si manquant
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    // Masquer les résultats de recherche
    resultsContainer.style.display = 'none';
    
    // Afficher et redimensionner l'iframe
    webViewFrame.style.display = 'block';
    webViewFrame.style.height = 'calc(100% - 60px)';
    webViewFrame.src = url;
    
    // Afficher le bouton de fermeture
    closeWebViewButton.style.display = 'block';
    
    // Feedback avec l'URL courante
    console.log('✅ Page chargée dans iframe');
    output.$({ text: `🌐 Page chargée: ${title} | URL: ${url}` });
    
  } catch(e) {
    console.log('❌ Erreur lors du chargement:', e);
    output.$({ text: `❌ Erreur: ${e.message}` });
  }
}

// Fonction pour fermer l'iframe et revenir à la recherche
function closeWebView() {
  console.log('🔙 Fermeture de l\'iframe');
  
  try {
    // Masquer l'iframe
    webViewFrame.style.display = 'none';
    webViewFrame.style.height = '0px';
    webViewFrame.src = 'about:blank';
    
    // Afficher les résultats de recherche
    resultsContainer.style.display = 'block';
    
    // Masquer le bouton de fermeture
    closeWebViewButton.style.display = 'none';
    
    // Feedback
    console.log('✅ Retour à la recherche');
    output.$({ text: '🔙 Retour à la recherche Google' });
    
  } catch(e) {
    console.log('❌ Erreur lors de la fermeture:', e);
    output.$({ text: `❌ Erreur: ${e.message}` });
  }
}

// Boutons de test rapide
const quickSearchContainer = $('div', {
  parent: '#view',
  css: {
    textAlign: 'center',
    margin: '16px 0'
  }
});

$('div', {
  parent: quickSearchContainer,
  css: {
    marginBottom: '10px',
    fontSize: '16px',
    color: '#666'
  },
  text: 'Recherches rapides :'
});

const quickSearches = ['JavaScript', 'Squirrel framework', 'Web development', 'API REST'];

quickSearches.forEach(term => {
  Button({
    text: term,
    parent: quickSearchContainer,
    css: {
      margin: '4px',
      padding: '8px 16px',
      backgroundColor: '#f8f9fa',
      color: '#1a73e8',
      border: '1px solid #dadce0',
      borderRadius: '4px',
      cursor: 'pointer',
      position: 'relative',
      fontSize: '14px'
    },
    onAction: () => {
      console.log('🔍 Recherche rapide:', term);
      searchInput.value = term;
      performSearch(term);
      output.$({ text: `🔍 Recherche rapide: "${term}"` });
    }
  });
});

// Sites populaires en accès direct
$('div', {
  parent: quickSearchContainer,
  css: {
    marginBottom: '10px',
    marginTop: '20px',
    fontSize: '16px',
    color: '#666'
  },
  text: 'Navigation directe :'
});

const quickSites = [
  { name: 'Google', url: 'https://www.google.com' },
  { name: 'YouTube', url: 'https://www.youtube.com' },
  { name: 'Wikipedia', url: 'https://fr.wikipedia.org' },
  { name: 'GitHub', url: 'https://github.com' }
];

quickSites.forEach(site => {
  Button({
    text: site.name,
    parent: quickSearchContainer,
    css: {
      margin: '4px',
      padding: '8px 16px',
      backgroundColor: '#e8f0fe',
      color: '#1967d2',
      border: '1px solid #1967d2',
      borderRadius: '4px',
      cursor: 'pointer',
      position: 'relative',
      fontSize: '14px'
    },
    onAction: () => {
      console.log('🌐 Navigation directe vers:', site.url);
      loadInWebView(site.url, site.name);
      output.$({ text: `🌐 Navigation: ${site.name}` });
    }
  });
});

// Boutons de navigation
const buttonContainer = $('div', {
  parent: '#view',
  css: {
    textAlign: 'center',
    margin: '16px 0'
  }
});

// Bouton pour ouvrir Google
const openGoogleButton = Button({
  text: '� Ouvrir Google',
  parent: buttonContainer,
  css: {
    margin: '8px',
    padding: '12px 24px',
    backgroundColor: '#4285f4',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    position: 'relative',
    fontSize: '16px',
    fontWeight: 'bold'
  },
  onAction: () => {
    console.log('� Bouton "Ouvrir Google" cliqué - Debug info:');
    console.log('- Target: _blank (nouvel onglet)');
    console.log('- URL: https://www.google.com');
    
    try {
      window.open('https://www.google.com', '_blank');
      console.log('✅ Google ouvert avec succès');
      output.$({ text: '🔍 Google ouvert dans un nouvel onglet' });
    } catch(e) {
      console.log('❌ Erreur:', e);
      output.$({ text: '❌ Erreur: ' + e.message });
    }
  }
});

// Bouton pour ouvrir dans la même fenêtre
const navigateToGoogleButton = Button({
  text: '🌐 Aller à Google (même onglet)',
  parent: buttonContainer,
  css: {
    margin: '8px',
    padding: '12px 24px',
    backgroundColor: '#ea4335',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    position: 'relative',
    fontSize: '16px'
  },
  onAction: () => {
    console.log('🌐 Navigation vers Google dans le même onglet - Debug info:');
    console.log('- Method: window.location.href');
    console.log('- URL: https://www.google.com');
    
    if (confirm('Voulez-vous vraiment quitter cette page pour aller sur Google ?')) {
      try {
        window.location.href = 'https://www.google.com';
        console.log('✅ Navigation en cours...');
      } catch(e) {
        console.log('❌ Erreur de navigation:', e);
        output.$({ text: '❌ Erreur de navigation: ' + e.message });
      }
    } else {
      console.log('ℹ️ Navigation annulée par l\'utilisateur');
      output.$({ text: 'ℹ️ Navigation annulée' });
    }
  }
});

// Bouton pour ouvrir dans une popup
const popupGoogleButton = Button({
  text: '� Google en popup',
  parent: buttonContainer,
  css: {
    margin: '8px',
    padding: '12px 24px',
    backgroundColor: '#34a853',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    position: 'relative',
    fontSize: '16px'
  },
  onAction: () => {
    console.log('� Ouverture de Google en popup - Debug info:');
    console.log('- Dimensions: 800x600');
    console.log('- Features: resizable, scrollbars');
    
    try {
      const popup = window.open(
        'https://www.google.com', 
        'GooglePopup',
        'width=800,height=600,resizable=yes,scrollbars=yes,status=yes'
      );
      
      if (popup) {
        console.log('✅ Popup Google ouverte avec succès');
        output.$({ text: '� Google ouvert en popup' });
      } else {
        console.log('⚠️ Popup bloquée');
        output.$({ text: '⚠️ Popup bloquée par le navigateur' });
      }
    } catch(e) {
      console.log('❌ Erreur popup:', e);
      output.$({ text: '❌ Erreur popup: ' + e.message });
    }
  }
});

