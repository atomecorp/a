// Leaflet Map Demo - Version qui marche comme au début
console.log('🗺️ Démo Leaflet Simple chargée');

// Fonction pour créer une démo de carte Leaflet

  console.log('🚀 Création de la démo Leaflet...');
  

  
  // Créer le conteneur de la carte AVEC SQUIRREL comme avant
  $('div', {
    id: 'map',
    parent: '#view',
    css: {
      width: '90%',
      height: '400px',
      border: '2px solid #3498db',
      borderRadius: '10px',
      marginBottom: '20px',
      position: 'relative',
      top: '50px',
      left: '5%'
    }
  });
  
  // Initialiser la carte Leaflet

 let map;
  
  // Fonction d'initialisation de la carte EXACTEMENT comme au début

   
    
    try {
      // Version ultra-simple qui marchait au début
      console.log('🗺️ Création carte ultra-simple...');
      
      // Juste créer la carte comme au début
      map = L.map('map').setView([48.8566, 2.3522], 13);
      
    //   console.log('✅ Carte créée, ajout des tuiles...');
      
    //   // Ajouter les tuiles comme au début
    //   L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    //     attribution: '&copy; OpenStreetMap contributors'
    //   }).addTo(map);
      
    //   console.log('✅ Tuiles ajoutées');
    //   console.log('�️ Carte Leaflet initialisée avec succès');
      
    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation de la carte:', error);
    }
  
  
  // Attendre que Leaflet soit prêt





