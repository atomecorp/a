

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

// Bouton de fermeture de l'iframe (initialement caché)
const closeWebViewButton = $('button', {
  parent: googleHeader,
  css: {
    padding: '8px 16px',
    backgroundColor: '#ea4335',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'none'
  },
  text: '✕ Fermer',
  onclick: closeWebView
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
    
    // Réafficher le header Google et les résultats de recherche
    googleHeader.style.display = 'flex';
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

// Fonctions pour créer des interfaces simulées des sites
function navigateToGitHub() {
    console.log('🌐 BOUTON GITHUB CLIQUÉ');
    createGitHubInterface();
    output.$({ text: '🌐 Interface GitHub simulée chargée' });
}

function navigateToYouTube() {
    console.log('🌐 BOUTON YOUTUBE CLIQUÉ');
    createYouTubeInterface();
    output.$({ text: '🌐 Interface YouTube simulée chargée' });
}

function navigateToGoogle() {
    console.log('🌐 BOUTON GOOGLE CLIQUÉ');
    createGoogleInterface();
    output.$({ text: '🌐 Interface Google simulée chargée' });
}

function navigateToWikipedia() {
    console.log('🌐 BOUTON WIKIPEDIA CLIQUÉ');
    createWikipediaInterface();
    output.$({ text: '🌐 Interface Wikipedia simulée chargée' });
}

// Créer une interface GitHub simulée
function createGitHubInterface() {
    // Masquer le header Google et les résultats de recherche
    googleHeader.style.display = 'none';
    resultsContainer.style.display = 'none';
    
    // Vider et afficher l'iframe comme conteneur
    webViewFrame.style.display = 'block';
    webViewFrame.style.height = '100%';
    webViewFrame.srcdoc = `
        <html>
        <head>
            <title>GitHub Simulé</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #0d1117; color: #f0f6fc; }
                .header { background: #21262d; padding: 15px; border-radius: 6px; margin-bottom: 20px; }
                .logo { font-size: 24px; font-weight: bold; color: #ffffff; }
                .repo { background: #21262d; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 3px solid #58a6ff; }
                .repo-name { font-size: 18px; color: #58a6ff; margin-bottom: 5px; }
                .repo-desc { color: #8b949e; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo">🐙 GitHub Simulé</div>
                <p>Interface de démonstration GitHub</p>
            </div>
            <div class="repo">
                <div class="repo-name">📁 mon-projet-awesome</div>
                <div class="repo-desc">Un projet génial avec du JavaScript et plus encore...</div>
            </div>
            <div class="repo">
                <div class="repo-name">📁 squirrel-framework</div>
                <div class="repo-desc">Framework Squirrel pour applications interactives</div>
            </div>
            <div class="repo">
                <div class="repo-name">📁 web-navigation-demo</div>
                <div class="repo-desc">Démonstration de navigation web avec iframe simulée</div>
            </div>
            <div style="text-align: center; margin-top: 30px;">
                <button onclick="parent.closeWebView()" style="padding: 12px 24px; background: #ea4335; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;">
                    ← Retour à Google
                </button>
            </div>
        </body>
        </html>
    `;
    
    // Afficher le bouton de fermeture
    closeWebViewButton.style.display = 'block';
}

// Créer une interface YouTube simulée
function createYouTubeInterface() {
    // Masquer le header Google et les résultats de recherche
    googleHeader.style.display = 'none';
    resultsContainer.style.display = 'none';
    
    webViewFrame.style.display = 'block';
    webViewFrame.style.height = '100%';
    webViewFrame.srcdoc = `
        <html>
        <head>
            <title>YouTube Simulé</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #0f0f0f; color: #ffffff; }
                .header { background: #212121; padding: 15px; display: flex; align-items: center; gap: 15px; border-bottom: 1px solid #3d3d3d; }
                .logo { font-size: 24px; font-weight: bold; color: #ff0000; }
                .search-container { flex: 1; display: flex; max-width: 600px; }
                .search-input { flex: 1; padding: 8px 15px; background: #121212; border: 1px solid #3d3d3d; color: #ffffff; border-radius: 2px 0 0 2px; }
                .search-btn { padding: 8px 15px; background: #3d3d3d; border: 1px solid #3d3d3d; color: #ffffff; cursor: pointer; border-radius: 0 2px 2px 0; }
                
                /* Styles pour la connexion */
                .user-area { display: flex; align-items: center; gap: 10px; }
                .login-btn { background: #065fd4; color: white; border: none; padding: 8px 16px; border-radius: 2px; cursor: pointer; font-size: 14px; }
                .login-btn:hover { background: #1976d2; }
                .user-profile { display: flex; align-items: center; gap: 8px; }
                .profile-pic { width: 32px; height: 32px; border-radius: 50%; }
                .username { font-size: 14px; color: #ffffff; }
                .logout-btn { background: transparent; color: #aaa; border: 1px solid #3d3d3d; padding: 4px 8px; border-radius: 2px; cursor: pointer; font-size: 12px; }
                .logout-btn:hover { background: #3d3d3d; }
                
                /* Styles pour la modale */
                .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: none; z-index: 1000; }
                .modal { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #fff; padding: 0; border-radius: 8px; width: 400px; max-width: 90vw; overflow: hidden; }
                .modal-header { background: #1976d2; color: white; padding: 20px; text-align: center; }
                .modal-header h2 { margin: 0; font-size: 20px; }
                .modal-body { padding: 30px; }
                .google-btn { width: 100%; background: #4285f4; color: white; border: none; padding: 12px; border-radius: 4px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 20px; }
                .google-btn:hover { background: #3367d6; }
                .divider { text-align: center; margin: 20px 0; color: #666; }
                .form-group { margin-bottom: 15px; }
                .form-group label { display: block; margin-bottom: 5px; color: #333; font-weight: 500; }
                .form-group input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box; }
                .form-group input:focus { outline: none; border-color: #1976d2; }
                .modal-actions { display: flex; gap: 10px; }
                .btn { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
                .btn-primary { background: #1976d2; color: white; }
                .btn-primary:hover { background: #1565c0; }
                .btn-secondary { background: #f5f5f5; color: #333; }
                .btn-secondary:hover { background: #e0e0e0; }
                .close-modal { position: absolute; top: 10px; right: 15px; background: none; border: none; color: white; font-size: 24px; cursor: pointer; }
                
                .content { padding: 20px; }
                .video-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
                .video { background: #212121; border-radius: 8px; overflow: hidden; cursor: pointer; transition: transform 0.2s; }
                .video:hover { transform: scale(1.02); }
                .video-thumbnail { width: 100%; height: 180px; background: linear-gradient(45deg, #ff0000, #ff6b6b); display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
                .play-button { font-size: 48px; color: white; opacity: 0.9; transition: all 0.3s ease; }
                .play-button:hover { opacity: 1; transform: scale(1.1); }
                .video-info { padding: 12px; }
                .video-title { font-size: 16px; color: #ffffff; margin-bottom: 8px; line-height: 1.3; }
                .video-meta { color: #aaaaaa; font-size: 14px; margin-bottom: 4px; }
                .channel-name { color: #aaaaaa; font-size: 14px; }
                .video-duration { position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.8); padding: 2px 6px; border-radius: 2px; font-size: 12px; }
                .no-results { text-align: center; color: #aaaaaa; margin-top: 50px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo">📺 YouTube</div>
                <div class="search-container">
                    <input class="search-input" id="youtube-search" placeholder="Rechercher des vidéos..." type="text">
                    <button class="search-btn" onclick="searchYouTube()">🔍</button>
                </div>
                <div class="user-area">
                    <button class="login-btn" id="login-btn" onclick="showLoginModal()">Se connecter</button>
                    <div class="user-profile" id="user-profile" style="display: none;">
                        <img class="profile-pic" id="profile-pic" src="" alt="Profile">
                        <span class="username" id="username"></span>
                        <button class="logout-btn" onclick="logout()">Déconnexion</button>
                    </div>
                </div>
            </div>
            <div class="content">
                <div class="video-grid" id="video-container">
                    <!-- Les vidéos seront ajoutées ici -->
                </div>
            </div>
            
            <!-- Modale de connexion -->
            <div class="modal-overlay" id="login-modal">
                <div class="modal">
                    <button class="close-modal" onclick="closeLoginModal()">&times;</button>
                    <div class="modal-header">
                        <h2>Connexion à YouTube</h2>
                    </div>
                    <div class="modal-body">
                        <button class="google-btn" onclick="loginWithGoogle()">
                            <span>🔍</span>
                            Se connecter avec Google
                        </button>
                        <div class="divider">── ou ──</div>
                        <form onsubmit="loginWithEmail(event)">
                            <div class="form-group">
                                <label for="email">Email</label>
                                <input type="email" id="email" required>
                            </div>
                            <div class="form-group">
                                <label for="password">Mot de passe</label>
                                <input type="password" id="password" required>
                            </div>
                            <div class="modal-actions">
                                <button type="button" class="btn btn-secondary" onclick="closeLoginModal()">Annuler</button>
                                <button type="submit" class="btn btn-primary">Se connecter</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <script>
                // Base de données de vidéos simulées
                const videoDatabase = [
                    {
                        id: 'js-tutorial',
                        title: 'JavaScript Complet - Tutoriel pour Débutants',
                        channel: 'CodeAcademy',
                        views: '1.2M vues',
                        time: 'il y a 2 jours',
                        duration: '45:32',
                        tags: ['javascript', 'programmation', 'tutorial', 'débutant'],
                        videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
                        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
                        category: 'javascript'
                    },
                    {
                        id: 'squirrel-guide',
                        title: 'Framework Squirrel - Guide Complet 2024',
                        channel: 'DevMaster',
                        views: '856K vues',
                        time: 'il y a 1 semaine',
                        duration: '32:15',
                        tags: ['squirrel', 'framework', 'web', 'développement'],
                        videoUrl: 'https://www.youtube.com/embed/9bZkp7q19f0',
                        thumbnail: 'https://img.youtube.com/vi/9bZkp7q19f0/hqdefault.jpg',
                        category: 'framework'
                    },
                    {
                        id: 'web-dev',
                        title: 'Développement Web Moderne - Les Meilleures Pratiques',
                        channel: 'WebPro',
                        views: '2.1M vues',
                        time: 'il y a 3 jours',
                        duration: '28:47',
                        tags: ['web', 'développement', 'html', 'css', 'javascript'],
                        videoUrl: 'https://www.youtube.com/embed/kUMe1FH4CHE',
                        thumbnail: 'https://img.youtube.com/vi/kUMe1FH4CHE/hqdefault.jpg',
                        category: 'webdev'
                    },
                    {
                        id: 'api-rest',
                        title: 'API REST - Comprendre et Créer des APIs Performantes',
                        channel: 'BackendGuru',
                        views: '743K vues',
                        time: 'il y a 5 jours',
                        duration: '52:18',
                        tags: ['api', 'rest', 'backend', 'http'],
                        videoUrl: 'simulation',
                        thumbnail: 'custom',
                        category: 'api'
                    },
                    {
                        id: 'react-hooks',
                        title: 'React Hooks Expliqués Simplement',
                        channel: 'ReactMaster',
                        views: '1.8M vues',
                        time: 'il y a 1 mois',
                        duration: '38:29',
                        tags: ['react', 'hooks', 'javascript', 'frontend'],
                        videoUrl: 'simulation',
                        thumbnail: 'custom',
                        category: 'react'
                    },
                    {
                        id: 'nodejs-express',
                        title: 'Node.js et Express - Créer un Serveur Web',
                        channel: 'NodeJsPro',
                        views: '967K vues',
                        time: 'il y a 2 semaines',
                        duration: '41:33',
                        tags: ['nodejs', 'express', 'server', 'backend'],
                        videoUrl: 'simulation',
                        thumbnail: 'custom',
                        category: 'nodejs'
                    }
                ];

                let currentVideos = [...videoDatabase];

                // Fonction pour créer une vidéo HTML
                function createVideoElement(video) {
                    const thumbnailContent = getThumbnailContent(video);
                    
                    return \`
                        <div class="video" onclick="playVideo('\${video.id}', '\${video.videoUrl}')">
                            <div class="video-thumbnail" id="thumbnail-\${video.id}" style="\${thumbnailContent.style}">
                                \${thumbnailContent.html}
                                <div class="video-duration">\${video.duration}</div>
                            </div>
                            <div class="video-info">
                                <div class="video-title">\${video.title}</div>
                                <div class="video-meta">\${video.views} • \${video.time}</div>
                                <div class="channel-name">\${video.channel}</div>
                            </div>
                        </div>
                    \`;
                }

                // Fonction pour générer le contenu des thumbnails
                function getThumbnailContent(video) {
                    if (video.thumbnail === 'custom') {
                        // Créer des thumbnails personnalisées selon la catégorie
                        const customThumbnails = {
                            'api': {
                                style: 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);',
                                html: '<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;"><div style="font-size: 48px; margin-bottom: 10px;">🔗</div><div style="color: white; font-weight: bold; font-size: 18px;">API REST</div></div><div class="play-button">▶️</div>'
                            },
                            'react': {
                                style: 'background: linear-gradient(135deg, #61dafb 0%, #21232a 100%);',
                                html: '<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;"><div style="font-size: 48px; margin-bottom: 10px;">⚛️</div><div style="color: white; font-weight: bold; font-size: 18px;">React Hooks</div></div><div class="play-button">▶️</div>'
                            },
                            'nodejs': {
                                style: 'background: linear-gradient(135deg, #68a063 0%, #3c5a3c 100%);',
                                html: '<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;"><div style="font-size: 48px; margin-bottom: 10px;">🟢</div><div style="color: white; font-weight: bold; font-size: 18px;">Node.js</div></div><div class="play-button">▶️</div>'
                            },
                            'javascript': {
                                style: 'background: linear-gradient(135deg, #f7df1e 0%, #323330 100%);',
                                html: '<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;"><div style="font-size: 48px; margin-bottom: 10px;">💛</div><div style="color: white; font-weight: bold; font-size: 18px;">JavaScript</div></div><div class="play-button">▶️</div>'
                            },
                            'framework': {
                                style: 'background: linear-gradient(135deg, #ff6b6b 0%, #4ecdc4 100%);',
                                html: '<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;"><div style="font-size: 48px; margin-bottom: 10px;">🛠️</div><div style="color: white; font-weight: bold; font-size: 18px;">Framework</div></div><div class="play-button">▶️</div>'
                            },
                            'webdev': {
                                style: 'background: linear-gradient(135deg, #74b9ff 0%, #0984e3 100%);',
                                html: '<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;"><div style="font-size: 48px; margin-bottom: 10px;">🌐</div><div style="color: white; font-weight: bold; font-size: 18px;">Web Dev</div></div><div class="play-button">▶️</div>'
                            },
                            'personal': {
                                style: 'background: linear-gradient(135deg, #fd79a8 0%, #e84393 100%);',
                                html: '<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;"><div style="font-size: 48px; margin-bottom: 10px;">🎯</div><div style="color: white; font-weight: bold; font-size: 16px;">Recommandé</div></div><div class="play-button">▶️</div>'
                            },
                            'subscriptions': {
                                style: 'background: linear-gradient(135deg, #00b894 0%, #00a085 100%);',
                                html: '<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;"><div style="font-size: 48px; margin-bottom: 10px;">📱</div><div style="color: white; font-weight: bold; font-size: 16px;">Abonnements</div></div><div class="play-button">▶️</div>'
                            },
                            'history': {
                                style: 'background: linear-gradient(135deg, #a29bfe 0%, #6c5ce7 100%);',
                                html: '<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;"><div style="font-size: 48px; margin-bottom: 10px;">📜</div><div style="color: white; font-weight: bold; font-size: 16px;">Historique</div></div><div class="play-button">▶️</div>'
                            }
                        };
                        
                        return customThumbnails[video.category] || {
                            style: 'background: linear-gradient(45deg, #ff0000, #ff6b6b);',
                            html: '<div class="play-button">▶️</div>'
                        };
                    } else {
                        // Utiliser la vraie thumbnail YouTube avec fallback simple
                        return {
                            style: \`background-image: url('\${video.thumbnail}'); background-size: cover; background-position: center;\`,
                            html: '<div class="play-button" style="background: rgba(0,0,0,0.7); border-radius: 50%; width: 68px; height: 68px; display: flex; align-items: center; justify-content: center;">▶️</div>'
                        };
                    }
                }

                // Fonction pour afficher les vidéos
                function displayVideos(videos) {
                    const container = document.getElementById('video-container');
                    if (videos.length === 0) {
                        container.innerHTML = '<div class="no-results">Aucune vidéo trouvée pour cette recherche</div>';
                    } else {
                        container.innerHTML = videos.map(createVideoElement).join('');
                    }
                }

                // Fonction de recherche
                function searchYouTube() {
                    const searchTerm = document.getElementById('youtube-search').value.toLowerCase().trim();
                    
                    if (searchTerm === '') {
                        currentVideos = [...videoDatabase];
                    } else {
                        currentVideos = videoDatabase.filter(video => {
                            return video.title.toLowerCase().includes(searchTerm) ||
                                   video.channel.toLowerCase().includes(searchTerm) ||
                                   video.tags.some(tag => tag.toLowerCase().includes(searchTerm));
                        });
                    }
                    
                    displayVideos(currentVideos);
                    console.log('🔍 Recherche YouTube:', searchTerm, 'Résultats:', currentVideos.length);
                }

                // Fonction pour jouer une vidéo
                function playVideo(videoId, videoUrl) {
                    console.log('🎥 Lecture vidéo:', videoId);
                    
                    const video = videoDatabase.find(v => v.id === videoId);
                    const container = document.getElementById('video-container');
                    
                    if (videoUrl === 'simulation') {
                        // Créer un lecteur vidéo simulé
                        container.innerHTML = \`
                            <div style="background: #000; padding: 20px; border-radius: 8px; text-align: center;">
                                <div style="width: 100%; height: 400px; background: linear-gradient(45deg, #ff0000, #ff6b6b); display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 8px; position: relative;">
                                    <div style="font-size: 64px; margin-bottom: 20px;">🎥</div>
                                    <div style="font-size: 24px; margin-bottom: 10px; color: white; text-shadow: 2px 2px 4px rgba(0,0,0,0.8);">\${video.title}</div>
                                    <div style="font-size: 16px; color: white; opacity: 0.9; text-shadow: 1px 1px 2px rgba(0,0,0,0.8);">Lecteur vidéo simulé - \${video.duration}</div>
                                    <div style="margin-top: 20px;">
                                        <button onclick="simulatePlay()" style="padding: 12px 24px; background: #ff0000; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; margin: 0 10px;">
                                            ▶️ Play
                                        </button>
                                        <button onclick="simulatePause()" style="padding: 12px 24px; background: #333; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; margin: 0 10px;">
                                            ⏸️ Pause
                                        </button>
                                    </div>
                                    <div id="playback-status" style="margin-top: 15px; color: white; font-size: 14px;"></div>
                                </div>
                                <div style="margin-top: 15px;">
                                    <button onclick="goBackToVideos()" style="padding: 10px 20px; background: #ff0000; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                        ← Retour aux vidéos
                                    </button>
                                </div>
                            </div>
                        \`;
                    } else {
                        // Essayer d'utiliser une vraie vidéo YouTube
                        container.innerHTML = \`
                            <div style="background: #000; padding: 20px; border-radius: 8px; text-align: center;">
                                <iframe width="100%" height="400" src="\${videoUrl}?autoplay=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>
                                <div style="margin-top: 15px; color: white;">
                                    <h3>\${video.title}</h3>
                                    <p>Par \${video.channel} • \${video.views} • \${video.time}</p>
                                </div>
                                <div style="margin-top: 15px;">
                                    <button onclick="goBackToVideos()" style="padding: 10px 20px; background: #ff0000; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                        ← Retour aux vidéos
                                    </button>
                                </div>
                            </div>
                        \`;
                    }
                }

                // Fonctions pour simuler la lecture
                function simulatePlay() {
                    const status = document.getElementById('playback-status');
                    status.innerHTML = '▶️ Lecture en cours...';
                    console.log('📺 Simulation: Lecture démarrée');
                }

                function simulatePause() {
                    const status = document.getElementById('playback-status');
                    status.innerHTML = '⏸️ Vidéo en pause';
                    console.log('📺 Simulation: Lecture en pause');
                }

                // Fonction pour revenir à la liste des vidéos
                function goBackToVideos() {
                    displayVideos(currentVideos);
                }

                // Recherche sur Entrée
                document.getElementById('youtube-search').addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        searchYouTube();
                    }
                });

                // Afficher toutes les vidéos au démarrage
                displayVideos(currentVideos);

                // ========== SYSTÈME DE CONNEXION YOUTUBE ==========
                
                // Variables globales pour l'authentification
                let isLoggedIn = false;
                let currentUser = null;

                // Fonction pour afficher la modale de connexion
                function showLoginModal() {
                    document.getElementById('login-modal').style.display = 'block';
                }

                // Fonction pour fermer la modale de connexion
                function closeLoginModal() {
                    document.getElementById('login-modal').style.display = 'none';
                }

                // Connexion avec Google (simulation de l'API YouTube)
                async function loginWithGoogle() {
                    console.log('🔐 Tentative de connexion avec Google...');
                    
                    // Afficher un indicateur de chargement
                    const loginBtn = document.querySelector('.google-btn');
                    const originalText = loginBtn.innerHTML;
                    loginBtn.innerHTML = '<span>⏳</span> Connexion en cours...';
                    loginBtn.disabled = true;
                    
                    // Simulation d'une connexion OAuth2 avec Google
                    try {
                        // Simuler une réponse de connexion réussie après 1 seconde
                        setTimeout(() => {
                            // Données simulées de l'utilisateur connecté
                            const userData = {
                                id: 'user123',
                                name: 'Jean-Eric Godard',
                                email: 'jean.eric@example.com',
                                picture: 'https://www.gravatar.com/avatar/205e460b479e2e5b48aec07710c08d50?s=32&d=identicon',
                                channelId: 'UC_fake_channel_id'
                            };
                            
                            handleSuccessfulLogin(userData);
                            
                            // Restaurer le bouton
                            loginBtn.innerHTML = originalText;
                            loginBtn.disabled = false;
                        }, 1000);
                        
                    } catch (error) {
                        console.error('❌ Erreur de connexion:', error);
                        alert('Erreur lors de la connexion avec Google');
                        
                        // Restaurer le bouton en cas d'erreur
                        loginBtn.innerHTML = originalText;
                        loginBtn.disabled = false;
                    }
                }

                // Connexion avec email/mot de passe
                function loginWithEmail(event) {
                    event.preventDefault();
                    
                    const email = document.getElementById('email').value;
                    const password = document.getElementById('password').value;
                    
                    console.log('🔐 Tentative de connexion avec email:', email);
                    
                    // Simulation de validation
                    if (email && password.length >= 6) {
                        const userData = {
                            id: 'email_user',
                            name: email.split('@')[0],
                            email: email,
                            picture: 'https://www.gravatar.com/avatar/fake?s=32&d=identicon',
                            channelId: 'UC_email_channel_id'
                        };
                        
                        handleSuccessfulLogin(userData);
                    } else {
                        alert('Veuillez vérifier vos identifiants');
                    }
                }

                // Gérer une connexion réussie
                function handleSuccessfulLogin(userData) {
                    isLoggedIn = true;
                    currentUser = userData;
                    
                    // Masquer le bouton de connexion
                    document.getElementById('login-btn').style.display = 'none';
                    
                    // Afficher le profil utilisateur
                    document.getElementById('user-profile').style.display = 'flex';
                    document.getElementById('profile-pic').src = userData.picture;
                    document.getElementById('username').textContent = userData.name;
                    
                    // Fermer la modale
                    closeLoginModal();
                    
                    // Charger les données personnalisées de l'utilisateur
                    loadUserPersonalizedContent();
                    
                    console.log('✅ Connexion réussie pour:', userData.name);
                    
                    // Notification de bienvenue
                    showNotification(\`Bienvenue \${userData.name} ! 🎉\`);
                }

                // Déconnexion
                function logout() {
                    console.log('👋 Déconnexion en cours...');
                    
                    isLoggedIn = false;
                    currentUser = null;
                    
                    // Afficher le bouton de connexion
                    document.getElementById('login-btn').style.display = 'block';
                    
                    // Masquer le profil utilisateur
                    document.getElementById('user-profile').style.display = 'none';
                    
                    // Restaurer le contenu par défaut (vidéos non-personnalisées)
                    currentVideos = [...videoDatabase];
                    displayVideos(currentVideos);
                    
                    console.log('✅ Déconnexion effectuée');
                    showNotification('Vous êtes déconnecté');
                }

                // Charger le contenu personnalisé pour l'utilisateur connecté
                function loadUserPersonalizedContent() {
                    console.log('📺 Chargement du contenu personnalisé...');
                    
                    // Créer des vidéos personnalisées simulées
                    const personalizedVideos = [
                        {
                            id: 'my-video-1',
                            title: '🎯 Mes vidéos recommandées - Programmation',
                            channel: 'Ma Chaîne',
                            views: '156K vues',
                            time: 'il y a 1 jour',
                            duration: '25:30',
                            tags: ['personnel', 'recommandé'],
                            videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
                            thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
                            category: 'personal'
                        },
                        {
                            id: 'my-video-2',
                            title: '📱 Mes abonnements - Dernières vidéos',
                            channel: 'Abonnements',
                            views: '89K vues',
                            time: 'il y a 3 heures',
                            duration: '18:45',
                            tags: ['abonnements'],
                            videoUrl: 'https://www.youtube.com/embed/9bZkp7q19f0',
                            thumbnail: 'https://img.youtube.com/vi/9bZkp7q19f0/hqdefault.jpg',
                            category: 'subscriptions'
                        },
                        {
                            id: 'my-history',
                            title: '📜 Mon historique de visionnage',
                            channel: 'YouTube',
                            views: 'Historique personnel',
                            time: 'Mis à jour',
                            duration: '∞',
                            tags: ['historique'],
                            videoUrl: 'simulation',
                            thumbnail: 'custom',
                            category: 'history'
                        },
                        // Ajouter les vidéos existantes aussi
                        ...videoDatabase
                    ];
                    
                    // Afficher les vidéos personnalisées
                    displayVideos(personalizedVideos);
                    
                    // Mettre à jour currentVideos pour la recherche
                    currentVideos = personalizedVideos;
                    
                    console.log('✅ Contenu personnalisé chargé:', personalizedVideos.length, 'vidéos');
                }

                // Fonction pour afficher des notifications
                function showNotification(message) {
                    // Créer une notification temporaire
                    const notification = document.createElement('div');
                    notification.style.cssText = \`
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background: #2196F3;
                        color: white;
                        padding: 15px 20px;
                        border-radius: 4px;
                        z-index: 1001;
                        font-size: 14px;
                        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
                        transition: all 0.3s ease;
                    \`;
                    notification.textContent = message;
                    
                    document.body.appendChild(notification);
                    
                    // Supprimer la notification après 3 secondes
                    setTimeout(() => {
                        notification.style.opacity = '0';
                        setTimeout(() => {
                            if (notification.parentNode) {
                                notification.parentNode.removeChild(notification);
                            }
                        }, 300);
                    }, 3000);
                }

                // Fermer la modale en cliquant sur l'overlay
                document.getElementById('login-modal').addEventListener('click', function(e) {
                    if (e.target === this) {
                        closeLoginModal();
                    }
                });
            </script>
        </body>
        </html>
    `;
}

// Créer une interface Google simulée (comme l'existante mais plus simple)
function createGoogleInterface() {
    // Masquer le header Google et les résultats de recherche
    googleHeader.style.display = 'none';
    resultsContainer.style.display = 'none';
    
    webViewFrame.style.display = 'block';
    webViewFrame.style.height = '100%';
    webViewFrame.srcdoc = `
        <html>
        <head>
            <title>Google Simulé</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #ffffff; }
                .header { text-align: center; margin-bottom: 40px; }
                .logo { font-size: 48px; color: #4285f4; margin-bottom: 20px; }
                .search-box { width: 80%; padding: 12px; border: 1px solid #ddd; border-radius: 24px; font-size: 16px; }
                .result { margin: 20px 0; padding: 10px; border-left: 3px solid #4285f4; }
                .result-title { font-size: 18px; color: #1a73e8; margin-bottom: 5px; }
                .result-desc { color: #545454; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo">Google</div>
                <input class="search-box" placeholder="Rechercher...">
            </div>
            <div class="result">
                <div class="result-title">JavaScript Documentation</div>
                <div class="result-desc">Guide complet pour apprendre JavaScript moderne...</div>
            </div>
            <div class="result">
                <div class="result-title">Framework Development</div>
                <div class="result-desc">Créer des frameworks avec les meilleures pratiques...</div>
            </div>
            <div style="text-align: center; margin-top: 30px;">
                <button onclick="parent.closeWebView()" style="padding: 12px 24px; background: #ea4335; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;">
                    ← Retour à la recherche
                </button>
            </div>
        </body>
        </html>
    `;
}

// Créer une interface Wikipedia simulée
function createWikipediaInterface() {
    // Masquer le header Google et les résultats de recherche
    googleHeader.style.display = 'none';
    resultsContainer.style.display = 'none';
    
    webViewFrame.style.display = 'block';
    webViewFrame.style.height = '100%';
    webViewFrame.srcdoc = `
        <html>
        <head>
            <title>Wikipedia Simulé</title>
            <style>
                body { font-family: Georgia, serif; margin: 0; padding: 20px; background: #ffffff; line-height: 1.6; }
                .header { border-bottom: 3px solid #a2a9b1; padding-bottom: 10px; margin-bottom: 20px; }
                .logo { font-size: 24px; font-weight: bold; }
                .article-title { font-size: 28px; margin: 20px 0; border-bottom: 1px solid #a2a9b1; }
                .article-content { color: #222; }
                .infobox { float: right; width: 250px; background: #f8f9fa; border: 1px solid #a2a9b1; margin: 0 0 20px 20px; padding: 15px; }
                .toc { background: #f8f9fa; border: 1px solid #a2a9b1; padding: 15px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo">📚 Wikipédia Simulé</div>
            </div>
            <div class="infobox">
                <h3>Informations</h3>
                <p><strong>Type:</strong> Encyclopédie</p>
                <p><strong>Langue:</strong> Français</p>
                <p><strong>Articles:</strong> 2.5M+</p>
            </div>
            <h1 class="article-title">JavaScript</h1>
            <div class="toc">
                <h3>Sommaire</h3>
                <ol>
                    <li>Histoire</li>
                    <li>Syntaxe</li>
                    <li>Frameworks</li>
                    <li>Applications</li>
                </ol>
            </div>
            <div class="article-content">
                <h2>Introduction</h2>
                <p>JavaScript est un langage de programmation de scripts principalement employé dans les pages web interactives...</p>
                <h2>Histoire</h2>
                <p>JavaScript a été créé en 1995 par Brendan Eich pour la société Netscape Communications...</p>
                <h2>Syntaxe</h2>
                <p>La syntaxe de JavaScript est largement inspirée de celle du langage C...</p>
            </div>
            <div style="text-align: center; margin-top: 30px;">
                <button onclick="parent.closeWebView()" style="padding: 12px 24px; background: #ea4335; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;">
                    ← Retour à Google
                </button>
            </div>
        </body>
        </html>
    `;
}

// // Bouton de test simple comme dans buttons.js - modèle reference_button
// const testButton = Button({
//     id: 'test_button',
//     onText: 'TEST BOUTON',
//     offText: 'TEST BOUTON',
//     onAction: testButtonClick,
//     parent: '#view'
// });

// Boutons de navigation - modèle reference_button
const githubButton = Button({
    id: 'github_button',
    onText: 'GitHub',
    offText: 'GitHub',
    onAction: navigateToGitHub,
    parent: '#view'
});

const youtubeButton = Button({
    id: 'youtube_button',
    onText: 'YouTube',
    offText: 'YouTube',
    onAction: navigateToYouTube,
    parent: '#view'
});

const googleButton = Button({
    id: 'google_button',
    onText: 'Google',
    offText: 'Google',
    onAction: navigateToGoogle,
    parent: '#view'
});

const wikipediaButton = Button({
    id: 'wikipedia_button',
    onText: 'Wikipedia',
    offText: 'Wikipedia',
    onAction: navigateToWikipedia,
    parent: '#view'
});
