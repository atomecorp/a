/**
 * 🎮 SQUIRREL APPLICATION - DYNAMIC EXAMPLES BROWSER
 * Interface dynamique pour naviguer et exécuter les exemples
 * Auto-détection des fichiers dans le dossier examples/
 */

class ExamplesBrowser {
    constructor() {
        this.currentExample = null;
        this.examples = new Map();
        this.containerSelector = '#examples-container';
        this.viewerSelector = '#example-viewer';
        
        this.init();
    }

    async init() {
        console.log('🎮 Initialisation du navigateur d\'exemples...');
        
        // Créer l'interface de base
        this.createBaseInterface();
        
        // Scanner et charger les exemples dynamiquement
        await this.scanExamples();
        
        // Générer l'interface
        this.renderExamplesGrid();
        
        console.log(`✅ ${this.examples.size} exemples détectés et chargés`);
    }

    createBaseInterface() {
        const appContainer = document.body;
        
        const html = `
            <div id="examples-app" style="
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                padding: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                margin: 0;
            ">
                <header style="
                    text-align: center;
                    margin-bottom: 30px;
                    color: white;
                ">
                    <h1 style="
                        font-size: 2.5em;
                        margin: 0;
                        text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                    ">🎮 Squirrel Examples</h1>
                    <p style="
                        font-size: 1.2em;
                        opacity: 0.9;
                        margin: 10px 0;
                    ">Navigation dynamique des exemples - Auto-refresh</p>
                </header>

                <div id="examples-container" style="
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: 20px;
                    margin-bottom: 30px;
                "></div>

                <div id="example-viewer" style="
                    background: white;
                    border-radius: 15px;
                    padding: 20px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                    min-height: 400px;
                    display: none;
                ">
                    <div id="viewer-header" style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 20px;
                        padding-bottom: 15px;
                        border-bottom: 2px solid #eee;
                    ">
                        <h2 id="viewer-title" style="
                            margin: 0;
                            color: #333;
                        "></h2>
                        <button id="close-viewer" style="
                            background: #ff4757;
                            color: white;
                            border: none;
                            border-radius: 50%;
                            width: 35px;
                            height: 35px;
                            cursor: pointer;
                            font-size: 18px;
                            transition: all 0.3s ease;
                        " onmouseover="this.style.transform='scale(1.1)'" 
                           onmouseout="this.style.transform='scale(1)'">✕</button>
                    </div>
                    <div id="viewer-content"></div>
                </div>
            </div>
        `;
        
        appContainer.innerHTML = html;
        
        // Event listener pour fermer le viewer
        document.getElementById('close-viewer').addEventListener('click', () => {
            this.closeViewer();
        });
    }

    async scanExamples() {
        const examplesPath = './examples/';
        
        // Liste des fichiers à scanner (sans test.json)
        const potentialExamples = [
            'audio-workstation.js',
            'demos.js', 
            'matrix.js',
            'modules.js',
            'sliders.js',
            'wavesurfer.js'
        ];

        for (const fileName of potentialExamples) {
            try {
                // Vérifier l'existence du fichier via fetch (sans l'importer)
                const modulePath = `${examplesPath}${fileName}`;
                const response = await fetch(modulePath, { method: 'HEAD' });
                
                if (response.ok) {
                    // Le fichier existe - créer les métadonnées sans charger le module
                    const metadata = this.extractMetadata(fileName, null);
                    
                    this.examples.set(fileName, {
                        fileName,
                        modulePath,
                        module: null, // Ne pas charger le module maintenant
                        metadata,
                        loaded: false // Marquer comme non chargé
                    });
                    
                    console.log(`✅ Exemple détecté: ${fileName}`);
                } else {
                    console.log(`ℹ️ Exemple non disponible: ${fileName}`);
                }
                
            } catch (error) {
                console.log(`ℹ️ Exemple non disponible: ${fileName}`);
                // Ne pas ajouter à la liste si le fichier n'existe pas
            }
        }
    }

    extractMetadata(fileName, module) {
        // Extraire le nom lisible du fichier
        const displayName = fileName
            .replace('.js', '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());

        // Essayer d'extraire les métadonnées du module
        const metadata = {
            name: displayName,
            description: `Exemple ${displayName}`,
            icon: this.getIconForExample(fileName),
            color: this.getColorForExample(fileName)
        };

        // Si le module est chargé et exporte des métadonnées, les utiliser
        if (module) {
            if (module.default && module.default.metadata) {
                Object.assign(metadata, module.default.metadata);
            } else if (module.metadata) {
                Object.assign(metadata, module.metadata);
            }
        }

        return metadata;
    }

    getIconForExample(fileName) {
        const icons = {
            'audio-workstation.js': '🎵',
            'demos.js': '🎮',
            'matrix.js': '🔲',
            'modules.js': '📦',
            'sliders.js': '🎚️',
            'wavesurfer.js': '🌊'
        };
        return icons[fileName] || '📄';
    }

    getColorForExample(fileName) {
        const colors = {
            'audio-workstation.js': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'demos.js': 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            'matrix.js': 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            'modules.js': 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            'sliders.js': 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
            'wavesurfer.js': 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)'
        };
        return colors[fileName] || 'linear-gradient(135deg, #d299c2 0%, #fef9d7 100%)';
    }

    renderExamplesGrid() {
        const container = document.querySelector(this.containerSelector);
        
        if (!container) {
            console.error('Container non trouvé:', this.containerSelector);
            return;
        }

        // Vider le container
        container.innerHTML = '';

        // Créer une carte pour chaque exemple
        this.examples.forEach((example, fileName) => {
            const card = this.createExampleCard(example);
            container.appendChild(card);
        });

        // Ajouter une carte pour recharger/rafraîchir
        const refreshCard = this.createRefreshCard();
        container.appendChild(refreshCard);
    }

    createExampleCard(example) {
        const card = document.createElement('div');
        card.className = 'example-card';
        card.style.cssText = `
            background: ${example.metadata.color};
            border-radius: 15px;
            padding: 25px;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 8px 25px rgba(0,0,0,0.15);
            border: 2px solid rgba(255,255,255,0.1);
            position: relative;
            overflow: hidden;
        `;

        // Effet de survol
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-8px) scale(1.02)';
            card.style.boxShadow = '0 15px 35px rgba(0,0,0,0.25)';
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0) scale(1)';
            card.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
        });

        // Contenu de la carte
        card.innerHTML = `
            <div style="
                color: white;
                text-align: center;
            ">
                <div style="
                    font-size: 3em;
                    margin-bottom: 15px;
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                ">${example.metadata.icon}</div>
                <h3 style="
                    margin: 0 0 10px 0;
                    font-size: 1.4em;
                    text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
                ">${example.metadata.name}</h3>
                <p style="
                    margin: 0;
                    opacity: 0.9;
                    font-size: 0.95em;
                    text-shadow: 1px 1px 2px rgba(0,0,0,0.2);
                ">${example.metadata.description}</p>
            </div>
            
            <!-- Effet de brillance -->
            <div style="
                position: absolute;
                top: -50%;
                left: -50%;
                width: 200%;
                height: 200%;
                background: linear-gradient(45deg, transparent, rgba(255,255,255,0.1), transparent);
                transform: rotate(45deg);
                transition: all 0.6s ease;
                opacity: 0;
            " class="shine-effect"></div>
        `;

        // Event listener pour lancer l'exemple
        card.addEventListener('click', () => {
            this.loadExample(example);
        });

        return card;
    }

    createRefreshCard() {
        const card = document.createElement('div');
        card.className = 'refresh-card';
        card.style.cssText = `
            background: linear-gradient(135deg, #ffeaa7 0%, #fab1a0 100%);
            border-radius: 15px;
            padding: 25px;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 8px 25px rgba(0,0,0,0.15);
            border: 2px solid rgba(255,255,255,0.1);
            opacity: 0.8;
        `;

        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-8px) scale(1.02)';
            card.style.opacity = '1';
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0) scale(1)';
            card.style.opacity = '0.8';
        });

        card.innerHTML = `
            <div style="
                color: white;
                text-align: center;
            ">
                <div style="
                    font-size: 3em;
                    margin-bottom: 15px;
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                ">🔄</div>
                <h3 style="
                    margin: 0 0 10px 0;
                    font-size: 1.4em;
                    text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
                ">Rafraîchir</h3>
                <p style="
                    margin: 0;
                    opacity: 0.9;
                    font-size: 0.95em;
                    text-shadow: 1px 1px 2px rgba(0,0,0,0.2);
                ">Scanner nouveaux exemples</p>
            </div>
        `;

        card.addEventListener('click', () => {
            this.refreshExamples();
        });

        return card;
    }

    async loadExample(example) {
        console.log(`🚀 Chargement de l'exemple: ${example.metadata.name}`);
        
        const viewer = document.querySelector(this.viewerSelector);
        const title = document.getElementById('viewer-title');
        const content = document.getElementById('viewer-content');
        
        if (!viewer || !title || !content) {
            console.error('Éléments du viewer non trouvés');
            return;
        }

        // Afficher le viewer
        viewer.style.display = 'block';
        title.textContent = `${example.metadata.icon} ${example.metadata.name}`;
        
        // Vider le contenu précédent
        content.innerHTML = '<div style="text-align: center; padding: 20px;">⏳ Chargement...</div>';
        
        // Scroll vers le viewer
        viewer.scrollIntoView({ behavior: 'smooth' });

        try {
            // Charger le module dynamiquement si pas encore chargé
            if (!example.loaded || !example.module) {
                console.log(`📦 Chargement du module: ${example.fileName}`);
                example.module = await import(example.modulePath);
                example.loaded = true;
                console.log(`✅ Module chargé: ${example.fileName}`);
            }
            
            // Exécuter l'exemple
            if (example.module.default && typeof example.module.default === 'function') {
                // Si l'export par défaut est une fonction
                await example.module.default(content);
            } else if (example.module.init && typeof example.module.init === 'function') {
                // Si il y a une fonction init
                await example.module.init(content);
            } else if (example.module.default && example.module.default.init) {
                // Si l'export par défaut a une méthode init
                await example.module.default.init(content);
            } else {
                // Fallback: afficher les exports disponibles
                content.innerHTML = `
                    <div style="padding: 20px;">
                        <h3>📦 Exemple chargé: ${example.metadata.name}</h3>
                        <p>Exports disponibles:</p>
                        <ul>
                            ${Object.keys(example.module).map(key => 
                                `<li><strong>${key}</strong>: ${typeof example.module[key]}</li>`
                            ).join('')}
                        </ul>
                        <p><em>Cet exemple ne fournit pas de fonction d'initialisation standard.</em></p>
                    </div>
                `;
            }
            
            this.currentExample = example;
            console.log(`✅ Exemple ${example.metadata.name} chargé avec succès`);
            
        } catch (error) {
            console.error(`❌ Erreur lors du chargement de ${example.metadata.name}:`, error);
            content.innerHTML = `
                <div style="padding: 20px; color: #e74c3c;">
                    <h3>❌ Erreur de chargement</h3>
                    <p><strong>Exemple:</strong> ${example.metadata.name}</p>
                    <p><strong>Erreur:</strong> ${error.message}</p>
                    <details style="margin-top: 15px;">
                        <summary style="cursor: pointer;">Détails techniques</summary>
                        <pre style="background: #f8f9fa; padding: 10px; border-radius: 5px; overflow: auto; margin-top: 10px;">${error.stack}</pre>
                    </details>
                </div>
            `;
        }
    }

    closeViewer() {
        const viewer = document.querySelector(this.viewerSelector);
        if (viewer) {
            viewer.style.display = 'none';
        }
        
        // Nettoyer l'exemple actuel si nécessaire
        if (this.currentExample && this.currentExample.module.cleanup) {
            try {
                this.currentExample.module.cleanup();
            } catch (error) {
                console.warn('Erreur lors du nettoyage:', error);
            }
        }
        
        this.currentExample = null;
    }

    async refreshExamples() {
        console.log('🔄 Rafraîchissement des exemples...');
        
        // Fermer le viewer si ouvert
        this.closeViewer();
        
        // Vider la liste actuelle
        this.examples.clear();
        
        // Rescanner (sans charger les modules)
        await this.scanExamples();
        
        // Re-render
        this.renderExamplesGrid();
        
        console.log(`✅ Rafraîchissement terminé - ${this.examples.size} exemples détectés`);
        
        // Animation de feedback
        const container = document.querySelector(this.containerSelector);
        if (container) {
            container.style.transform = 'scale(0.95)';
            container.style.opacity = '0.7';
            
            setTimeout(() => {
                container.style.transform = 'scale(1)';
                container.style.opacity = '1';
                container.style.transition = 'all 0.3s ease';
            }, 100);
        }
    }
}

// Instance globale
let browserInstance = null;

// Fonction d'initialisation pour l'architecture Squirrel
export function initExamplesBrowser() {
    if (browserInstance) {
        console.log('🎮 ExamplesBrowser déjà initialisé');
        return browserInstance;
    }
    
    console.log('🎮 Initialisation ExamplesBrowser...');
    browserInstance = new ExamplesBrowser();
    return browserInstance;
}

// Auto-initialisation si DOM déjà prêt
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExamplesBrowser);
} else {
    // DOM déjà chargé, initialiser immédiatement
    setTimeout(initExamplesBrowser, 0);
}

// Export par défaut pour compatibilité
export default {
    ExamplesBrowser,
    init: initExamplesBrowser,
    getInstance: () => browserInstance
};