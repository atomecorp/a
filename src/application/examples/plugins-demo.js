/**
 * 🔌 DÉMO INTERACTIVE DU SYSTÈME DE PLUGINS
 * Interface de gestion et d'exemples des plugins Squirrel.js
 */

console.log('🔌 === DÉMO SYSTÈME DE PLUGINS ===');

// Variable pour éviter l'initialisation multiple
let demoInitialized = false;

// Initialiser la démo interactive
const initPluginDemo = async () => {
  if (demoInitialized) {
    console.log('🔌 Démo déjà initialisée, ignoré');
    return;
  }
  
  // Attendre que tout soit chargé
  await new Promise(resolve => setTimeout(resolve, 300));
  
  if (!window.Squirrel) {
    console.error('❌ Squirrel API non disponible');
    return;
  }
  
  demoInitialized = true;
  console.log('🔌 Initialisation de la démo des plugins...');
  
  // Créer le conteneur principal
  const mainContainer = document.createElement('div');
  mainContainer.style.cssText = `
    position: fixed;
    top: 80px;
    left: 20px;
    width: 420px;
    max-height: 80vh;
    overflow-y: auto;
    background: white;
    border: 2px solid #4CAF50;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    z-index: 1000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  
  // En-tête
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 16px 20px;
    background: linear-gradient(135deg, #4CAF50, #45a049);
    color: white;
    border-radius: 10px 10px 0 0;
    font-weight: 600;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;
  header.innerHTML = `
    <span>🔌 Gestionnaire de Plugins</span>
    <span id="plugin-counter" style="font-size: 12px; opacity: 0.9;">0/0</span>
  `;
  mainContainer.appendChild(header);
  
  // Section des plugins disponibles
  const availableSection = document.createElement('div');
  availableSection.style.cssText = `
    padding: 20px;
    border-bottom: 1px solid #eee;
  `;
  
  const availableTitle = document.createElement('h3');
  availableTitle.textContent = '📋 Plugins Disponibles';
  availableTitle.style.cssText = `
    margin: 0 0 15px 0;
    color: #333;
    font-size: 14px;
    font-weight: 600;
  `;
  availableSection.appendChild(availableTitle);
  
  // Grille des plugins
  const pluginsGrid = document.createElement('div');
  pluginsGrid.id = 'plugins-grid';
  pluginsGrid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-bottom: 15px;
  `;
  availableSection.appendChild(pluginsGrid);
  
  // Bouton tout charger
  const loadAllButton = document.createElement('button');
  loadAllButton.textContent = '🚀 Charger Tous';
  loadAllButton.style.cssText = `
    width: 100%;
    padding: 8px 12px;
    background: #2196F3;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: background 0.2s;
  `;
  loadAllButton.addEventListener('mouseenter', () => {
    loadAllButton.style.background = '#1976D2';
  });
  loadAllButton.addEventListener('mouseleave', () => {
    loadAllButton.style.background = '#2196F3';
  });
  loadAllButton.addEventListener('click', loadAllPlugins);
  availableSection.appendChild(loadAllButton);
  
  mainContainer.appendChild(availableSection);
  
  // Section des plugins chargés avec exemples
  const loadedSection = document.createElement('div');
  loadedSection.style.cssText = `
    padding: 20px;
  `;
  
  const loadedTitle = document.createElement('h3');
  loadedTitle.textContent = '✅ Plugins Chargés - Cliquez pour tester';
  loadedTitle.style.cssText = `
    margin: 0 0 15px 0;
    color: #333;
    font-size: 14px;
    font-weight: 600;
  `;
  loadedSection.appendChild(loadedTitle);
  
  const loadedList = document.createElement('div');
  loadedList.id = 'loaded-plugins-list';
  loadedList.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;
  loadedSection.appendChild(loadedList);
  
  // Zone d'exemple
  const exampleArea = document.createElement('div');
  exampleArea.id = 'example-area';
  exampleArea.style.cssText = `
    margin-top: 15px;
    padding: 15px;
    background: #f8f9fa;
    border-radius: 8px;
    border: 1px dashed #ddd;
    min-height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #666;
    font-size: 13px;
    text-align: center;
  `;
  exampleArea.innerHTML = '💡 Cliquez sur un plugin chargé pour voir un exemple';
  loadedSection.appendChild(exampleArea);
  
  mainContainer.appendChild(loadedSection);
  document.body.appendChild(mainContainer);
  
  // IMPORTANT: Toutes les fonctions d'interface doivent être définies AVANT l'ajout au DOM
  
  // Fonction pour créer les boutons de plugins
  function createPluginButton(pluginName, isLoaded = false) {
    const button = document.createElement('button');
    
    const updateButtonState = (loaded) => {
      button.textContent = `${loaded ? '✅' : '⚪'} ${pluginName}`;
      button.style.cssText = `
        padding: 8px 12px;
        font-size: 11px;
        border: 1px solid ${loaded ? '#4CAF50' : '#ddd'};
        background: ${loaded ? '#E8F5E8' : 'white'};
        color: ${loaded ? '#2E7D32' : '#666'};
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        font-weight: 500;
      `;
    };
    
    updateButtonState(isLoaded);
    
    button.addEventListener('mouseenter', () => {
      if (!isLoaded) {
        button.style.backgroundColor = '#f5f5f5';
        button.style.borderColor = '#bbb';
      }
    });
    
    button.addEventListener('mouseleave', () => {
      updateButtonState(isLoaded);
    });
    
    button.addEventListener('click', async () => {
      if (!isLoaded) {
        try {
          console.log(`🔄 Chargement du plugin "${pluginName}"...`);
          button.textContent = `⏳ ${pluginName}`;
          button.disabled = true;
          
          await window.loadPlugin(pluginName);
          
          isLoaded = true;
          updateButtonState(true);
          button.disabled = false;
          
          console.log(`✅ Plugin "${pluginName}" chargé!`);
          showNotification(`Plugin ${pluginName} chargé!`, 'success');
          
          // Mettre à jour l'interface
          updateLoadedPluginsList();
          updatePluginCounter();
          
        } catch (error) {
          console.error(`❌ Erreur lors du chargement de "${pluginName}":`, error);
          button.textContent = `❌ ${pluginName}`;
          button.style.border = '1px solid #f44336';
          button.style.background = '#ffebee';
          button.disabled = false;
          showNotification(`Erreur: ${pluginName}`, 'error');
        }
      }
    });
    
    return button;
  }
  
  // Fonction pour charger tous les plugins
  async function loadAllPlugins() {
    loadAllButton.disabled = true;
    loadAllButton.textContent = '⏳ Chargement...';
    
    try {
      const availablePlugins = window.Squirrel.getAvailablePlugins();
      
      for (const pluginName of availablePlugins) {
        if (!window.Squirrel.isPluginLoaded(pluginName)) {
          await window.loadPlugin(pluginName);
        }
      }
      
      updateInterface();
      showNotification('Tous les plugins chargés!', 'success');
      
    } catch (error) {
      console.error('❌ Erreur lors du chargement:', error);
      showNotification('Erreur de chargement', 'error');
    } finally {
      loadAllButton.disabled = false;
      loadAllButton.textContent = '🚀 Charger Tous';
    }
  }
  
  // Fonction pour mettre à jour la liste des plugins chargés
  function updateLoadedPluginsList() {
    const loadedList = document.getElementById('loaded-plugins-list');
    if (!loadedList) {
      console.warn('⚠️ Element loaded-plugins-list non trouvé');
      return;
    }
    
    const loadedPlugins = window.Squirrel.getLoadedPlugins();
    
    loadedList.innerHTML = '';
    
    if (loadedPlugins.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.textContent = 'Aucun plugin chargé';
      emptyMessage.style.cssText = `
        color: #999;
        font-style: italic;
        font-size: 12px;
        text-align: center;
        padding: 10px;
      `;
      loadedList.appendChild(emptyMessage);
      return;
    }
    
    loadedPlugins.forEach(pluginName => {
      const pluginItem = document.createElement('button');
      pluginItem.textContent = `🎯 ${pluginName}`;
      pluginItem.style.cssText = `
        padding: 10px 12px;
        background: linear-gradient(135deg, #E3F2FD, #E1F5FE);
        border: 1px solid #2196F3;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        color: #1976D2;
        transition: all 0.2s;
        text-align: left;
        display: flex;
        align-items: center;
        gap: 8px;
      `;
      
      pluginItem.addEventListener('mouseenter', () => {
        pluginItem.style.background = 'linear-gradient(135deg, #BBDEFB, #B3E5FC)';
        pluginItem.style.transform = 'translateY(-1px)';
      });
      
      pluginItem.addEventListener('mouseleave', () => {
        pluginItem.style.background = 'linear-gradient(135deg, #E3F2FD, #E1F5FE)';
        pluginItem.style.transform = 'translateY(0)';
      });
      
      pluginItem.addEventListener('click', () => {
        showPluginExample(pluginName);
      });
      
      loadedList.appendChild(pluginItem);
    });
  }
  
  // Fonction pour afficher un exemple de plugin
  function showPluginExample(pluginName) {
    const exampleArea = document.getElementById('example-area');
    exampleArea.innerHTML = '';
    exampleArea.style.background = 'white';
    exampleArea.style.border = '1px solid #ddd';
    exampleArea.style.alignItems = 'flex-start';
    exampleArea.style.justifyContent = 'flex-start';
    
    // Titre de l'exemple
    const title = document.createElement('div');
    title.textContent = `💫 Exemple: ${pluginName}`;
    title.style.cssText = `
      font-weight: 600;
      color: #333;
      margin-bottom: 10px;
      font-size: 13px;
    `;
    exampleArea.appendChild(title);
    
    // Conteneur pour l'exemple
    const exampleContainer = document.createElement('div');
    exampleContainer.style.cssText = `
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;
    
    try {
      switch (pluginName) {
        case 'Button':
          if (window.Button) {
            const button = window.Button({
              text: `Plugin ${pluginName}`,
              onClick: () => showNotification(`${pluginName} cliqué!`, 'info')
            });
            if (button && button.nodeType) {
              exampleContainer.appendChild(button);
            } else {
              const fallback = document.createElement('div');
              fallback.textContent = 'Button créé mais DOM non accessible';
              fallback.style.cssText = 'color: #f44336; font-size: 12px;';
              exampleContainer.appendChild(fallback);
            }
          }
          break;
          
        case 'Slider':
          if (window.Slider) {
            const slider = window.Slider({
              min: 0,
              max: 100,
              value: 50,
              label: `Plugin ${pluginName}`,
              onChange: (value) => showNotification(`${pluginName}: ${value}`, 'info')
            });
            if (slider && slider.nodeType) {
              exampleContainer.appendChild(slider);
            } else {
              const fallback = document.createElement('div');
              fallback.textContent = 'Slider créé mais DOM non accessible';
              fallback.style.cssText = 'color: #f44336; font-size: 12px;';
              exampleContainer.appendChild(fallback);
            }
          }
          break;
          
        case 'Matrix':
          if (window.Matrix) {
            const matrix = new window.Matrix({
              rows: 3,
              cols: 3,
              cellSize: 25,
              attach: null // Ne pas attacher automatiquement
            });
            if (matrix && matrix.container) {
              // Détacher du parent automatique si nécessaire
              if (matrix.container.parentNode) {
                matrix.container.parentNode.removeChild(matrix.container);
              }
              exampleContainer.appendChild(matrix.container);
            } else {
              const fallback = document.createElement('div');
              fallback.textContent = 'Matrix créé mais container non accessible';
              fallback.style.cssText = 'color: #f44336; font-size: 12px;';
              exampleContainer.appendChild(fallback);
            }
          }
          break;
          
        case 'Table':
          if (window.Table) {
            const table = new window.Table({
              headers: ['Plugin', 'Statut'],
              data: [[pluginName, 'Actif']],
              attach: null // Ne pas attacher automatiquement
            });
            if (table && table.container) {
              // Détacher du parent automatique si nécessaire
              if (table.container.parentNode) {
                table.container.parentNode.removeChild(table.container);
              }
              exampleContainer.appendChild(table.container);
            } else {
              const fallback = document.createElement('div');
              fallback.textContent = 'Table créé mais container non accessible';
              fallback.style.cssText = 'color: #f44336; font-size: 12px;';
              exampleContainer.appendChild(fallback);
            }
          }
          break;
          
        case 'List':
          if (window.List) {
            const list = new window.List({
              items: [`Élément 1 de ${pluginName}`, `Élément 2 de ${pluginName}`],
              attach: null // Ne pas attacher automatiquement  
            });
            if (list && list.container) {
              // Détacher du parent automatique si nécessaire
              if (list.container.parentNode) {
                list.container.parentNode.removeChild(list.container);
              }
              exampleContainer.appendChild(list.container);
            } else {
              const fallback = document.createElement('div');
              fallback.textContent = 'List créé mais container non accessible';
              fallback.style.cssText = 'color: #f44336; font-size: 12px;';
              exampleContainer.appendChild(fallback);
            }
          }
          break;
          
        case 'Menu':
          if (window.Menu) {
            const menu = new window.Menu({
              content: [
                { type: 'text', content: 'Option 1', action: () => showNotification('Menu Option 1', 'info') },
                { type: 'text', content: 'Option 2', action: () => showNotification('Menu Option 2', 'info') }
              ],
              attach: null // Ne pas attacher automatiquement
            });
            if (menu && menu.container) {
              // Détacher du parent automatique si nécessaire
              if (menu.container.parentNode) {
                menu.container.parentNode.removeChild(menu.container);
              }
              exampleContainer.appendChild(menu.container);
            } else {
              const fallback = document.createElement('div');
              fallback.textContent = 'Menu créé mais container non accessible';
              fallback.style.cssText = 'color: #f44336; font-size: 12px;';
              exampleContainer.appendChild(fallback);
            }
          }
          break;
          
        case 'Module':
          if (window.ModuleBuilder) {
            try {
              const moduleBuilder = new window.ModuleBuilder();
              const module = moduleBuilder.create({
                id: `example-module-${Date.now()}`,
                title: `Module ${pluginName}`,
                position: { x: 0, y: 0 },
                inputs: [{ label: 'In' }],
                outputs: [{ label: 'Out' }]
              });
              if (module && module.nodeType) {
                module.style.cssText += 'transform: scale(0.8); transform-origin: top left;';
                exampleContainer.appendChild(module);
              } else {
                const fallback = document.createElement('div');
                fallback.textContent = `Module créé mais DOM non disponible`;
                fallback.style.cssText = 'color: #f44336; font-size: 12px; padding: 10px; border: 1px dashed #ccc;';
                exampleContainer.appendChild(fallback);
              }
            } catch (error) {
              const errorDiv = document.createElement('div');
              errorDiv.textContent = `Erreur Module: ${error.message}`;
              errorDiv.style.cssText = 'color: #f44336; font-size: 12px;';
              exampleContainer.appendChild(errorDiv);
            }
          }
          break;
          
        default:
          const info = document.createElement('div');
          info.textContent = `Plugin "${pluginName}" chargé mais aucun exemple disponible.`;
          info.style.cssText = 'color: #666; font-style: italic; font-size: 12px;';
          exampleContainer.appendChild(info);
          break;
      }
      
      // Bouton pour effacer l'exemple
      const clearButton = document.createElement('button');
      clearButton.textContent = '🗑️ Effacer';
      clearButton.style.cssText = `
        padding: 4px 8px;
        background: #f44336;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        align-self: flex-start;
        margin-top: 5px;
      `;
      clearButton.addEventListener('click', () => {
        exampleArea.innerHTML = '💡 Cliquez sur un plugin chargé pour voir un exemple';
        exampleArea.style.background = '#f8f9fa';
        exampleArea.style.border = '1px dashed #ddd';
        exampleArea.style.alignItems = 'center';
        exampleArea.style.justifyContent = 'center';
        exampleArea.style.color = '#666';
      });
      exampleContainer.appendChild(clearButton);
      
    } catch (error) {
      console.error(`Erreur lors de la création de l'exemple ${pluginName}:`, error);
      const errorMsg = document.createElement('div');
      errorMsg.textContent = `Erreur: ${error.message}`;
      errorMsg.style.cssText = 'color: #f44336; font-size: 12px;';
      exampleContainer.appendChild(errorMsg);
    }
    
    exampleArea.appendChild(exampleContainer);
  }
  
  // Fonction pour mettre à jour le compteur
  function updatePluginCounter() {
    const counter = document.getElementById('plugin-counter');
    if (!counter) {
      console.warn('⚠️ Element plugin-counter non trouvé');
      return;
    }
    
    const status = window.Squirrel.getPluginStatus();
    counter.textContent = `${status.loaded}/${status.available}`;
  }
  
  // Fonction pour mettre à jour toute l'interface
  function updateInterface() {
    const availablePlugins = window.Squirrel.getAvailablePlugins();
    const loadedPlugins = window.Squirrel.getLoadedPlugins();
    
    // Mettre à jour la grille des plugins disponibles
    const pluginsGrid = document.getElementById('plugins-grid');
    if (!pluginsGrid) {
      console.warn('⚠️ Element plugins-grid non trouvé, interface pas encore prête');
      return;
    }
    
    pluginsGrid.innerHTML = '';
    
    availablePlugins.forEach(pluginName => {
      const isLoaded = loadedPlugins.includes(pluginName);
      const button = createPluginButton(pluginName, isLoaded);
      pluginsGrid.appendChild(button);
    });
    
    updateLoadedPluginsList();
    updatePluginCounter();
  }
  
  // Fonction de notification
  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 50px;
      right: 450px;
      padding: 10px 15px;
      background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
      color: white;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      z-index: 10001;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      animation: slideIn 0.3s ease;
    `;
    
    // Ajouter l'animation CSS si pas déjà présente
    if (!document.getElementById('notification-styles')) {
      const style = document.createElement('style');
      style.id = 'notification-styles';
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Supprimer après 3 secondes
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
  
  // Exposer globalement
  window.showPluginNotification = showNotification;
  
  // Initialiser l'interface MAINTENANT que tout est prêt
  console.log('🔌 Initialisation de l\'interface après création du DOM...');
  updateInterface();
  
  console.log('✅ Interface de démo des plugins initialisée');
};

// Lancer la démo
initPluginDemo();
window.addEventListener('DOMContentLoaded', initPluginDemo);

console.log('🔌 Démo système de plugins prêt');
