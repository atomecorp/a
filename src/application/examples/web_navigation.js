

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

// Fonction pour le bouton de recherche
function performSearchAction() {
    const query = searchInput.value;
    if (query.trim()) {
        performSearch(query);
    }
}



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



const quickSearches = ['JavaScript', 'Squirrel framework', 'Web development', 'API REST'];

// Fonctions pour les boutons de recherche rapide
function handleQuickSearch(term) {
    console.log('🔍 BOUTON RECHERCHE RAPIDE CLIQUÉ - Debug info:');
    console.log('- Terme:', term);
    searchInput.value = term;
    performSearch(term);
    output.$({ text: `🔍 Recherche rapide: "${term}"` });
}

// Fonctions spécifiques pour chaque recherche rapide
function searchJavaScript() {
    handleQuickSearch('JavaScript');
}

function searchSquirrel() {
    handleQuickSearch('Squirrel framework');
}

function searchWebDev() {
    handleQuickSearch('Web development');
}

function searchAPIREST() {
    handleQuickSearch('API REST');
}



///buttons 


// TEST SIMPLE - fonction comme dans buttons.js
function testButtonClick() {
    console.log('🔥 BOUTON TEST CLIQUÉ - ça marche !');
    output.$({ text: '🔥 Test bouton réussi !' });
}

// Bouton de test simple comme dans buttons.js - modèle reference_button
const testButton = Button({
    id: 'test_button',
    onText: 'TEST BOUTON',
    offText: 'TEST BOUTON',
    onAction: testButtonClick,
    parent: '#view'
});
