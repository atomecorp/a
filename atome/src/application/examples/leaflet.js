// Leaflet Map Demo - Version AVANCÉE avec Squirrel
console.log('🗺️ Démo Leaflet Avancée chargée');

// === TEST DE CONTAMINATION SQUIRREL (DOIT ÊTRE PROPRE MAINTENANT) ===
console.log('🧪 TEST: Vérification contamination Squirrel...');
console.log('🔍 Object.prototype.define_method:', typeof Object.prototype.define_method);
console.log('🔍 Object.prototype.inspect:', typeof Object.prototype.inspect);

// Test sur un objet simple - ne doit plus contaminer for...in
const testObj = {};
console.log('🔍 testObj.define_method:', typeof testObj.define_method);
console.log('🔍 testObj.inspect:', typeof testObj.inspect);
console.log('🔍 testObj keys (doit être vide):', Object.keys(testObj));

// Test for...in (crucial pour Leaflet)
const testForIn = [];
for (const key in testObj) {
    testForIn.push(key);
}
console.log('🔍 testObj for...in (doit être vide):', testForIn);

// Fonction pour créer une démo de carte Leaflet
function createLeafletDemo() {
  console.log('🚀 Création de la démo Leaflet...');
  
  // Vérifier que Leaflet est disponible
  if (typeof L === 'undefined') {
    console.error('❌ Leaflet (L) n\'est pas disponible !');
    return;
  }
  
  console.log('✅ Leaflet détecté:', typeof L);
  
  // Créer l'élément map avec DOM natif
  const viewElement = document.getElementById('view');
  if (!viewElement) {
    console.error('❌ Élément #view introuvable !');
    return;
  }
  
  // Nettoyer d'abord
  viewElement.innerHTML = '';
  
  // Créer le conteneur avec DOM natif
  const mapContainer = document.createElement('div');
  mapContainer.id = 'map';
  mapContainer.style.cssText = `
    width: 90%;
    height: 400px;
    border: 2px solid #27ae60;
    border-radius: 10px;
    margin-bottom: 20px;
    position: relative;
    top: 50px;
    left: 5%;
  `;
  
  viewElement.appendChild(mapContainer);
  
  console.log('✅ Conteneur map créé avec DOM natif');
  
  // Attendre que le DOM soit prêt
  setTimeout(() => {
    initMap();
  }, 100);
}

// Fonction d'initialisation de la carte AVANCÉE
function initMap() {
  try {
    console.log('🗺️ Création carte avancée...');
    
    // Vérifier que l'élément existe
    const mapElement = document.getElementById('map');
    if (!mapElement) {
      console.error('❌ Élément #map introuvable !');
      return;
    }
    
    console.log('✅ Élément #map trouvé');
    console.log('🔍 Debug Leaflet version:', L.version);
    
    // === CRÉATION CARTE STANDARD ===
    const map = L.map('map').setView([48.8566, 2.3522], 13);
    
    console.log('✅ Carte créée avec API standard !');
    
    // Test for...in sur map._layers (doit être propre)
    const layersKeys = [];
    for (const key in map._layers) {
      layersKeys.push(key);
    }
    console.log('🔍 MAP._layers for...in:', layersKeys);
    
    // === AJOUT TUILES STANDARD ===
    console.log('🗺️ Ajout tuiles standard...');
    
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
    console.log('✅ Tuiles ajoutées !');
    
    // === TESTS AVANCÉS: MARQUEURS ET INTERACTIONS ===
    console.log('🧪 Tests avancés Leaflet...');
    
    // 1. Marqueur simple à Paris
    const parisMarker = L.marker([48.8566, 2.3522])
      .addTo(map)
      .bindPopup('<b>Paris</b><br>Capitale de la France')
      .openPopup();
    
    // 2. Cercle autour de Paris
    const circle = L.circle([48.8566, 2.3522], {
      color: 'red',
      fillColor: '#f03',
      fillOpacity: 0.3,
      radius: 2000
    }).addTo(map).bindPopup('Cercle de 2km autour de Paris');
    
    // 3. Polygone (Triangle autour de monuments)
    const polygon = L.polygon([
      [48.8584, 2.2945],  // Tour Eiffel
      [48.8606, 2.3376],  // Louvre
      [48.8530, 2.3499]   // Notre-Dame
    ], {
      color: 'blue',
      fillColor: '#30f',
      fillOpacity: 0.2
    }).addTo(map).bindPopup('Triangle des monuments parisiens');
    
    // 4. Polyligne (trajet)
    const polyline = L.polyline([
      [48.8584, 2.2945],  // Tour Eiffel
      [48.8606, 2.3376],  // Louvre
      [48.8530, 2.3499],  // Notre-Dame
      [48.8566, 2.3522]   // Centre Paris
    ], {
      color: 'green',
      weight: 4,
      opacity: 0.7
    }).addTo(map).bindPopup('Parcours touristique parisien');
    
    // 5. Marqueurs avec icônes personnalisées
    const customIcon = L.icon({
      iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJDOC4xMyAyIDUgNS4xMyA1IDlDNSAxNC4yNSAxMiAyMiAxMiAyMkMxMiAyMiAxOSAxNC4yNSAxOSA5QzE5IDUuMTMgMTUuODcgMiAxMiAyWk0xMiAxMS41QzEwLjYyIDExLjUgOS41IDEwLjM4IDkuNSA5QzkuNSA3LjYyIDEwLjYyIDYuNSAxMiA2LjVDMTMuMzggNi41IDE0LjUgNy42MiAxNC41IDlDMTQuNSAxMC4zOCAxMy4zOCAxMS41IDEyIDExLjVaIiBmaWxsPSIjRkY2N0I0Ii8+Cjwvc3ZnPgo=',
      iconSize: [24, 24],
      iconAnchor: [12, 24],
      popupAnchor: [0, -24]
    });
    
    // Marqueurs avec icône personnalisée
    const eiffelMarker = L.marker([48.8584, 2.2945], { icon: customIcon })
      .addTo(map)
      .bindPopup('<b>🗼 Tour Eiffel</b><br>Monument emblématique');
    
    const louvreMarker = L.marker([48.8606, 2.3376], { icon: customIcon })
      .addTo(map)
      .bindPopup('<b>🖼️ Musée du Louvre</b><br>Plus grand musée du monde');
    
    const notreDameMarker = L.marker([48.8530, 2.3499], { icon: customIcon })
      .addTo(map)
      .bindPopup('<b>⛪ Notre-Dame</b><br>Cathédrale gothique');
    
    // 6. Contrôles de couches
    const baseMaps = {
      "OpenStreetMap": osmLayer,
      "Satellite": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri'
      })
    };
    
    const overlayMaps = {
      "Monuments": L.layerGroup([eiffelMarker, louvreMarker, notreDameMarker]),
      "Zones": L.layerGroup([circle, polygon]),
      "Parcours": L.layerGroup([polyline])
    };
    
    L.control.layers(baseMaps, overlayMaps).addTo(map);
    
    // 7. Contrôle d'échelle
    L.control.scale().addTo(map);
    
    // 8. Events de la carte
    map.on('click', function(e) {
      console.log('🖱️ Clic sur carte à:', e.latlng);
      
      // Ajouter un marqueur temporaire au clic
      const tempMarker = L.marker([e.latlng.lat, e.latlng.lng])
        .addTo(map)
        .bindPopup(`Marqueur temporaire<br>Lat: ${e.latlng.lat.toFixed(4)}<br>Lng: ${e.latlng.lng.toFixed(4)}`)
        .openPopup();
      
      // Supprimer après 3 secondes
      setTimeout(() => {
        map.removeLayer(tempMarker);
      }, 3000);
    });
    
    map.on('zoom', function(e) {
      console.log('🔍 Zoom niveau:', map.getZoom());
    });
    
    map.on('move', function(e) {
      const center = map.getCenter();
      console.log('🗺️ Centre carte:', center.lat.toFixed(4), center.lng.toFixed(4));
    });
    
    console.log('✅ Tests avancés ajoutés !');
    console.log('🎉 SUCCÈS: Carte Leaflet COMPLÈTE avec Squirrel !');
    
    // === INTERFACE DE TEST ===
    setTimeout(() => {
      addTestInterface(map);
    }, 1000);
    
    // Test interactivité
    setTimeout(() => {
      map.invalidateSize();
      console.log('🔄 Taille rafraîchie');
    }, 500);
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation:', error);
    console.error('❌ Stack trace:', error.stack);
    
    // Fallback informatif
    const mapEl = document.getElementById('map');
    if (mapEl) {
      mapEl.innerHTML = `
        <div style="
          padding: 20px; 
          background: linear-gradient(45deg, #27ae60, #2ecc71); 
          border-radius: 8px; 
          text-align: center; 
          color: white;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
        ">
          <h3>🗺️ Carte Leaflet</h3>
          <p>Version: ${L.version}</p>
          <p>Squirrel: Compatible</p>
          <p>❌ Erreur: ${error.message}</p>
        </div>
      `;
    }
  }
}

// === INTERFACE DE TEST INTERACTIVE ===
function addTestInterface(map) {
  console.log('🎮 Ajout interface de test...');
  
  // Créer un panneau de contrôle
  const controlPanel = document.createElement('div');
  controlPanel.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(255, 255, 255, 0.95);
    padding: 15px;
    border-radius: 10px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    z-index: 1000;
    font-family: Arial, sans-serif;
    font-size: 12px;
    min-width: 200px;
  `;
  
  controlPanel.innerHTML = `
    <h4 style="margin: 0 0 10px 0; color: #27ae60;">🧪 Tests Leaflet</h4>
    <button id="addRandomMarker" style="width: 100%; margin: 2px 0; padding: 5px; background: #3498db; color: white; border: none; border-radius: 3px; cursor: pointer;">➕ Marqueur aléatoire</button>
    <button id="clearMarkers" style="width: 100%; margin: 2px 0; padding: 5px; background: #e74c3c; color: white; border: none; border-radius: 3px; cursor: pointer;">🗑️ Vider marqueurs</button>
    <button id="flyToParis" style="width: 100%; margin: 2px 0; padding: 5px; background: #9b59b6; color: white; border: none; border-radius: 3px; cursor: pointer;">🛩️ Voler vers Paris</button>
    <button id="flyToTokyo" style="width: 100%; margin: 2px 0; padding: 5px; background: #f39c12; color: white; border: none; border-radius: 3px; cursor: pointer;">🗾 Voler vers Tokyo</button>
    <button id="addGeoJSON" style="width: 100%; margin: 2px 0; padding: 5px; background: #1abc9c; color: white; border: none; border-radius: 3px; cursor: pointer;">📊 Ajouter GeoJSON</button>
    <button id="testPerformance" style="width: 100%; margin: 2px 0; padding: 5px; background: #34495e; color: white; border: none; border-radius: 3px; cursor: pointer;">⚡ Test performance</button>
    <div id="info" style="margin-top: 10px; padding: 5px; background: #ecf0f1; border-radius: 3px; font-size: 10px;"></div>
  `;
  
  document.body.appendChild(controlPanel);
  
  // Variables pour les tests
  let randomMarkers = [];
  let geoJsonLayer = null;
  
  // === ÉVÉNEMENTS DES BOUTONS ===
  
  // Ajouter marqueur aléatoire
  document.getElementById('addRandomMarker').onclick = function() {
    const lat = 48.8566 + (Math.random() - 0.5) * 0.1; // Autour de Paris
    const lng = 2.3522 + (Math.random() - 0.5) * 0.1;
    
    const marker = L.marker([lat, lng])
      .addTo(map)
      .bindPopup(`Marqueur #${randomMarkers.length + 1}<br>Lat: ${lat.toFixed(4)}<br>Lng: ${lng.toFixed(4)}`);
    
    randomMarkers.push(marker);
    updateInfo(`${randomMarkers.length} marqueurs aléatoires`);
    console.log('➕ Marqueur aléatoire ajouté:', lat, lng);
  };
  
  // Vider les marqueurs
  document.getElementById('clearMarkers').onclick = function() {
    randomMarkers.forEach(marker => map.removeLayer(marker));
    randomMarkers = [];
    updateInfo('Marqueurs supprimés');
    console.log('🗑️ Marqueurs aléatoires supprimés');
  };
  
  // Voler vers Paris
  document.getElementById('flyToParis').onclick = function() {
    map.flyTo([48.8566, 2.3522], 13, {
      animate: true,
      duration: 2
    });
    updateInfo('Vol vers Paris');
    console.log('🛩️ Vol vers Paris');
  };
  
  // Voler vers Tokyo
  document.getElementById('flyToTokyo').onclick = function() {
    map.flyTo([35.6762, 139.6503], 13, {
      animate: true,
      duration: 3
    });
    updateInfo('Vol vers Tokyo');
    console.log('🗾 Vol vers Tokyo');
  };
  
  // Ajouter GeoJSON
  document.getElementById('addGeoJSON').onclick = function() {
    if (geoJsonLayer) {
      map.removeLayer(geoJsonLayer);
      geoJsonLayer = null;
      updateInfo('GeoJSON supprimé');
      return;
    }
    
    // Exemple de données GeoJSON (rectangle autour de Paris)
    const geoJsonData = {
      "type": "FeatureCollection",
      "features": [
        {
          "type": "Feature",
          "properties": {
            "name": "Zone test",
            "description": "Rectangle de test GeoJSON"
          },
          "geometry": {
            "type": "Polygon",
            "coordinates": [[
              [2.3, 48.83],
              [2.4, 48.83],
              [2.4, 48.88],
              [2.3, 48.88],
              [2.3, 48.83]
            ]]
          }
        }
      ]
    };
    
    geoJsonLayer = L.geoJSON(geoJsonData, {
      style: {
        color: '#ff7800',
        weight: 2,
        opacity: 0.8,
        fillOpacity: 0.3
      },
      onEachFeature: function(feature, layer) {
        if (feature.properties && feature.properties.name) {
          layer.bindPopup(feature.properties.name + '<br>' + feature.properties.description);
        }
      }
    }).addTo(map);
    
    updateInfo('GeoJSON ajouté');
    console.log('📊 GeoJSON ajouté');
  };
  
  // Test de performance
  document.getElementById('testPerformance').onclick = function() {
    console.log('⚡ Test de performance démarré...');
    updateInfo('Test performance...');
    
    const startTime = performance.now();
    const testMarkers = [];
    
    // Ajouter 100 marqueurs rapidement
    for (let i = 0; i < 100; i++) {
      const lat = 48.8566 + (Math.random() - 0.5) * 0.2;
      const lng = 2.3522 + (Math.random() - 0.5) * 0.2;
      
      const marker = L.marker([lat, lng])
        .addTo(map)
        .bindPopup(`Test marker ${i}`);
      
      testMarkers.push(marker);
    }
    
    const addTime = performance.now() - startTime;
    
    // Les supprimer
    const removeStart = performance.now();
    testMarkers.forEach(marker => map.removeLayer(marker));
    const removeTime = performance.now() - removeStart;
    
    const totalTime = performance.now() - startTime;
    
    updateInfo(`Perf: +${addTime.toFixed(1)}ms -${removeTime.toFixed(1)}ms (${totalTime.toFixed(1)}ms total)`);
    console.log('⚡ Performance:', {
      ajout: `${addTime.toFixed(1)}ms`,
      suppression: `${removeTime.toFixed(1)}ms`,
      total: `${totalTime.toFixed(1)}ms`
    });
  };
  
  function updateInfo(text) {
    document.getElementById('info').textContent = text;
  }
  
  updateInfo('Interface prête');
  console.log('✅ Interface de test ajoutée');
}

// Démarrer la démo
createLeafletDemo();





