// mon test: 
function fct_to_trig(state) {
    console.log('trig: ' + state);
}

function fct_to_trig2(state) {
    console.log('trigger 2 : ' + state);
}

// === EXEMPLE 1: Votre bouton existant ===
const toggle = Button({
    onText: 'ON',
    offText: 'OFF',
    onAction: fct_to_trig,
    offAction: fct_to_trig2,
    parent: '#view', // parent direct
    onStyle: { backgroundColor: '#28a745', color: 'white' },
    offStyle: { backgroundColor: '#dc3545', color: 'white' },
    css: {
        width: '50px',
        height: '24px',
        left: '120px',
        top: '120px',
        borderRadius: '6px',
        backgroundColor: 'orange',
        position: 'relative',
        border: 'none',
        cursor: 'pointer',
        transition: 'background-color 0.3s ease',
        border: '3px solid rgba(255,255,255,0.3)',
        boxShadow: '0 2px 4px rgba(255,255,1,1)',
    }
});

// end mon test 
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

// TEST SIMPLE - fonction comme dans buttons.js
function testButtonClick() {
    console.log('🔥 BOUTON TEST CLIQUÉ - ça marche !');
    output.$({ text: '🔥 Test bouton réussi !' });
}

// Bouton de test simple comme dans buttons.js
const testButton = Button({
    text: 'TEST BOUTON',
    onAction: testButtonClick,
    parent: '#view',
    css: {
        margin: '16px',
        padding: '12px 24px',
        backgroundColor: '#ff6b6b',
        color: '#fff',
        borderRadius: '6px',
        cursor: 'pointer',
        position: 'relative',
        border: 'none'
    }
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

// Fonctions pour les boutons de recherche rapide
function handleQuickSearch(term) {
    console.log('🔍 BOUTON RECHERCHE RAPIDE CLIQUÉ - Debug info:');
    console.log('- Terme:', term);
    searchInput.value = term;
    performSearch(term);
    output.$({ text: `🔍 Recherche rapide: "${term}"` });
}

quickSearches.forEach(term => {
  const quickSearchButton = Button({
    text: term,
    onAction: () => handleQuickSearch(term),
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

// Fonctions pour les boutons de sites
function handleSiteNavigation(site) {
    console.log('🌐 BOUTON SITE CLIQUÉ - Debug info:');
    console.log('- Site:', site.name);
    console.log('- URL:', site.url);
    loadInWebView(site.url, site.name);
    output.$({ text: `🌐 Navigation: ${site.name}` });
}

quickSites.forEach(site => {
  const quickSiteButton = Button({
    text: site.name,
    onAction: () => handleSiteNavigation(site),
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

// Fonctions pour les boutons de navigation
function openGoogleNewTab() {
    console.log('🔍 BOUTON "OUVRIR GOOGLE" CLIQUÉ');
    try {
        window.open('https://www.google.com', '_blank');
        console.log('✅ Google ouvert avec succès');
        output.$({ text: '🔍 Google ouvert dans un nouvel onglet' });
    } catch(e) {
        console.log('❌ Erreur:', e);
        output.$({ text: '❌ Erreur: ' + e.message });
    }
}

function navigateToGoogle() {
    console.log('🌐 BOUTON "ALLER À GOOGLE" CLIQUÉ');
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

function openGooglePopup() {
    console.log('📱 BOUTON "GOOGLE EN POPUP" CLIQUÉ');
    try {
        const popup = window.open(
            'https://www.google.com', 
            'GooglePopup',
            'width=800,height=600,resizable=yes,scrollbars=yes,status=yes'
        );
        
        if (popup) {
            console.log('✅ Popup Google ouverte avec succès');
            output.$({ text: '📱 Google ouvert en popup' });
        } else {
            console.log('⚠️ Popup bloquée');
            output.$({ text: '⚠️ Popup bloquée par le navigateur' });
        }
    } catch(e) {
        console.log('❌ Erreur popup:', e);
        output.$({ text: '❌ Erreur popup: ' + e.message });
    }
}

// Bouton pour ouvrir Google
const openGoogleButton = Button({
  text: '� Ouvrir Google',
  onAction: openGoogleNewTab,
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
  }
});

// Bouton pour ouvrir dans la même fenêtre
const navigateToGoogleButton = Button({
  text: '🌐 Aller à Google (même onglet)',
  onAction: navigateToGoogle,
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
  }
});

// Bouton pour ouvrir dans une popup
const popupGoogleButton = Button({
  text: '📱 Google en popup',
  onAction: openGooglePopup,
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
  }
});

