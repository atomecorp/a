// Exemple d'utilisation de l'API de fichiers avec Squirrel
// Fichier: src/application/examples/file-system-example.js

// Créer une interface pour gérer les fichiers
const FileManagerInterface = $('div', {
  id: 'fileManager',
  css: {
    padding: '20px',
    backgroundColor: '#f5f5f5',
    borderRadius: '10px',
    margin: '10px'
  }
});

// Titre
FileManagerInterface.add($('h2', {
  text: 'Gestionnaire de fichiers Atome',
  css: {
    color: '#333',
    marginBottom: '20px'
  }
}));

// Informations sur le stockage
const storageInfo = $('div', {
  id: 'storageInfo',
  css: {
    backgroundColor: '#e3f2fd',
    padding: '15px',
    borderRadius: '8px',
    marginBottom: '20px',
    border: '1px solid #90caf9'
  }
});

FileManagerInterface.add(storageInfo);

// Fonction pour afficher les infos de stockage
function updateStorageInfo() {
  AtomeFileSystem.getStorageInfo((result) => {
    if (result.success) {
      const info = result.data;
      storageInfo.text = `
        Type de stockage: ${info.storageType === 'icloud' ? 'iCloud (synchronisé)' : 'Local (cet appareil uniquement)'}
        iCloud disponible: ${info.isICloudAvailable ? 'Oui' : 'Non'}
        Système initialisé: ${info.isInitialized ? 'Oui' : 'Non'}
      `;
    }
  });
}

// Bouton pour ouvrir les paramètres de stockage
const settingsButton = $('button', {
  text: '⚙️ Paramètres de stockage',
  css: {
    backgroundColor: '#2196f3',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    marginBottom: '20px'
  },
  on: {
    click: () => {
      AtomeFileSystem.showStorageSettings();
    }
  }
});

FileManagerInterface.add(settingsButton);

// Zone de création de projet
const projectCreator = $('div', {
  css: {
    backgroundColor: 'white',
    padding: '15px',
    borderRadius: '8px',
    marginBottom: '20px',
    border: '1px solid #ddd'
  }
});

projectCreator.add($('h3', {
  text: 'Créer un nouveau projet',
  css: { marginBottom: '10px' }
}));

const projectNameInput = $('input', {
  type: 'text',
  placeholder: 'Nom du projet',
  css: {
    width: '200px',
    padding: '8px',
    marginRight: '10px',
    border: '1px solid #ccc',
    borderRadius: '4px'
  }
});

const saveProjectButton = $('button', {
  text: '💾 Sauvegarder projet',
  css: {
    backgroundColor: '#4caf50',
    color: 'white',
    padding: '8px 16px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  on: {
    click: async () => {
      const projectName = projectNameInput.value;
      if (!projectName) {
        alert('Veuillez entrer un nom de projet');
        return;
      }
      
      try {
        // Données exemple d'un projet
        const projectData = {
          name: projectName,
          created: new Date().toISOString(),
          tracks: [
            { id: 1, name: 'Track 1', volume: 0.8 },
            { id: 2, name: 'Track 2', volume: 0.6 }
          ],
          effects: [
            { id: 1, type: 'reverb', settings: { roomSize: 0.5 } }
          ]
        };
        
        await saveProject(projectData, projectName);
        alert('Projet sauvegardé avec succès!');
        projectNameInput.value = '';
        loadProjectsList();
      } catch (error) {
        alert('Erreur lors de la sauvegarde: ' + error.message);
      }
    }
  }
});

projectCreator.add(projectNameInput);
projectCreator.add(saveProjectButton);
FileManagerInterface.add(projectCreator);

// Liste des projets
const projectsList = $('div', {
  id: 'projectsList',
  css: {
    backgroundColor: 'white',
    padding: '15px',
    borderRadius: '8px',
    border: '1px solid #ddd'
  }
});

projectsList.add($('h3', {
  text: 'Projets sauvegardés',
  css: { marginBottom: '10px' }
}));

FileManagerInterface.add(projectsList);

// Fonction pour charger la liste des projets
function loadProjectsList() {
  AtomeFileSystem.listFiles('Projects', (result) => {
    if (result.success) {
      const projectsContainer = $('div', { id: 'projectsContainer' });
      
      const files = result.data.files.filter(file => 
        file.name.endsWith('.atome') && !file.isDirectory
      );
      
      if (files.length === 0) {
        projectsContainer.add($('p', {
          text: 'Aucun projet trouvé',
          css: { color: '#666', fontStyle: 'italic' }
        }));
      } else {
        files.forEach(file => {
          const projectItem = $('div', {
            css: {
              display: 'flex',
              alignItems: 'center',
              padding: '10px',
              marginBottom: '5px',
              backgroundColor: '#f9f9f9',
              borderRadius: '4px',
              border: '1px solid #eee'
            }
          });
          
          const projectName = file.name.replace('.atome', '');
          const createdDate = new Date(file.createdAt * 1000).toLocaleDateString();
          
          projectItem.add($('div', {
            css: { flex: '1' },
            children: [
              $('div', {
                text: projectName,
                css: { fontWeight: 'bold' }
              }),
              $('div', {
                text: `Créé le ${createdDate}`,
                css: { fontSize: '12px', color: '#666' }
              })
            ]
          }));
          
          // Bouton charger
          projectItem.add($('button', {
            text: '📂 Charger',
            css: {
              backgroundColor: '#2196f3',
              color: 'white',
              padding: '5px 10px',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              marginRight: '5px'
            },
            on: {
              click: async () => {
                try {
                  const projectData = await loadProject(projectName);
                  console.log('Projet chargé:', projectData);
                  alert('Projet chargé avec succès!');
                } catch (error) {
                  alert('Erreur lors du chargement: ' + error.message);
                }
              }
            }
          }));
          
          // Bouton supprimer
          projectItem.add($('button', {
            text: '🗑️',
            css: {
            backgroundColor: 'transparent',
              color: 'white',
              padding: '5px 8px',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer'
            },
            on: {
              click: () => {
                if (confirm('Êtes-vous sûr de vouloir supprimer ce projet?')) {
                  const projectPath = 'Projects/' + file.name;
                  AtomeFileSystem.deleteFile(projectPath, (result) => {
                    if (result.success) {
                      alert('Projet supprimé');
                      loadProjectsList();
                    } else {
                      alert('Erreur lors de la suppression: ' + result.error);
                    }
                  });
                }
              }
            }
          }));
          
          projectsContainer.add(projectItem);
        });
      }
      
      // Remplacer le contenu existant
      const existingContainer = document.getElementById('projectsContainer');
      if (existingContainer) {
        existingContainer.remove();
      }
      projectsList.add(projectsContainer);
    }
  });
}

// Zone d'export audio
const audioExporter = $('div', {
  css: {
    backgroundColor: 'white',
    padding: '15px',
    borderRadius: '8px',
    marginTop: '20px',
    border: '1px solid #ddd'
  }
});

audioExporter.add($('h3', {
  text: 'Export audio',
  css: { marginBottom: '10px' }
}));

const exportNameInput = $('input', {
  type: 'text',
  placeholder: 'Nom du fichier',
  css: {
    width: '200px',
    padding: '8px',
    marginRight: '10px',
    border: '1px solid #ccc',
    borderRadius: '4px'
  }
});

const exportButton = $('button', {
  text: '🎵 Exporter audio',
  css: {
    backgroundColor: '#ff9800',
    color: 'white',
    padding: '8px 16px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  on: {
    click: async () => {
      const fileName = exportNameInput.value;
      if (!fileName) {
        alert('Veuillez entrer un nom de fichier');
        return;
      }
      
      try {
        // Ici vous pourriez capturer l'audio réel de votre application
        const dummyAudioData = 'RIFF...'; // Données audio simulées
        
        await exportAudio(dummyAudioData, fileName);
        alert('Audio exporté avec succès!');
        exportNameInput.value = '';
      } catch (error) {
        alert('Erreur lors de l\'export: ' + error.message);
      }
    }
  }
});

audioExporter.add(exportNameInput);
audioExporter.add(exportButton);
FileManagerInterface.add(audioExporter);

// Initialisation
updateStorageInfo();
loadProjectsList();

// Actualiser toutes les 5 secondes
setInterval(() => {
  updateStorageInfo();
}, 5000);

// Ajouter l'interface à la page
document.body.appendChild(FileManagerInterface.element);
