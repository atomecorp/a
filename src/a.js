/**
 * Framework A optimisé - Version ultra-simplifiée et robuste
 */

// Exporter les variables principales pour l'ES6
let A, grab, puts, defineParticle;

// Implémentation du framework
(function() {
    // Registre global pour les instances
    const registry = {};

    // Registre des particules
    const particles = {};

    // Styles de base
    const baseStyles = {
        margin: '0', padding: '0', boxSizing: 'border-box',
        display: 'block', position: 'absolute',
        lineHeight: 'normal', fontSize: 'inherit',
        fontWeight: 'inherit', color: 'inherit',
        background: 'transparent'
    };

    // Utilitaires
    const isNumber = v => typeof v === 'number';
    const formatSize = v => isNumber(v) ? `${v}px` : v;

    // Définir une particule
    defineParticle = function(config) {
        // Vérifier que la configuration est valide
        if (!config || !config.name || !config.process || typeof config.process !== 'function') {
            console.error("Définition de particule invalide:", config);
            return null;
        }

        particles[config.name] = config;
        return config;
    };

    // Classe principale A
    A = class {
        constructor(config = {}) {
            this._data = {...config};
            this.element = document.createElement('div');
            this._fastened = config.fasten || [];

            // Appliquer les styles de base
            if (config.reset !== false) {
                Object.assign(this.element.style, baseStyles);
            }

            // Accès direct au style
            this.style = this.element.style;

            // Traiter toutes les propriétés
            this._processConfig(config);

            // Attacher l'élément si nécessaire
            if (config.attach) {
                this._handleAttach(config.attach);
            }

            // Enregistrer l'instance si elle a un ID
            if (config.id) {
                registry[config.id] = this;
            }
        }

        // Traiter toutes les propriétés
        _processConfig(config) {
            for (const [key, value] of Object.entries(config)) {
                if (key === 'fasten' || key === 'reset') {
                    continue; // Déjà traité
                }

                // Rechercher une particule associée
                if (particles[key]) {
                    try {
                        particles[key].process(this.element, value, config, this);
                    } catch (err) {
                        console.error(`Erreur lors du traitement de la particule ${key}:`, err);
                    }
                } else {
                    // Traitement par défaut
                    this._processDefaultProperty(key, value);
                }

                // Créer une méthode pour cette propriété si elle n'existe pas déjà
                if (typeof this[key] !== 'function') {
                    this._createPropertyMethod(key);
                }
            }
        }

        // Traiter une propriété sans particule définie
        _processDefaultProperty(key, value) {
            if (typeof value === 'number') {
                // Valeur numérique = probablement une taille en pixels
                this.element.style[key] = formatSize(value);
            } else if (typeof value === 'string') {
                // Valeur chaîne = probablement une propriété CSS directe
                this.element.style[key] = value;
            } else if (Array.isArray(value)) {
                // Tableau = stocker dans dataset
                this.element.dataset[key] = value.join(',');
            } else if (value instanceof HTMLElement) {
                // Élément HTML = l'ajouter comme enfant
                this.element.appendChild(value);
            } else if (value && typeof value === 'object') {
                // Objet = sérialiser en JSON
                this.element.dataset[key] = JSON.stringify(value);
            }
        }

        // Créer une méthode getter/setter pour une propriété
        _createPropertyMethod(key) {
            if (key === 'inspect' || key === 'addChild' || key === 'getElement') {
                return; // Ne pas créer de méthode pour ces noms réservés
            }

            this[key] = function(value) {
                if (arguments.length === 0) {
                    // Getter
                    return this._data[key];
                }

                // Setter
                this._data[key] = value;

                // Appliquer la valeur via la particule si elle existe
                if (particles[key]) {
                    try {
                        particles[key].process(this.element, value, this._data, this);
                    } catch (err) {
                        console.error(`Erreur lors de l'appel de la particule ${key}:`, err);
                    }
                } else {
                    // Traitement par défaut
                    this._processDefaultProperty(key, value);
                }

                return this;
            };
        }

        // Gérer l'attachement au DOM
        _handleAttach(value) {
            setTimeout(() => {
                if (this.element.parentNode) return;

                let parent;
                if (typeof value === 'string') {
                    parent = document.querySelector(value) || document.body;
                } else if (value instanceof HTMLElement) {
                    parent = value;
                } else {
                    parent = document.body;
                }

                parent.appendChild(this.element);
            }, 0);
        }

        // API publique
        getElement() {
            return this.element;
        }

        getFastened() {
            return this._fastened.map(id => registry[id]).filter(Boolean);
        }

        addChild(childConfig) {
            if (childConfig instanceof A) {
                this.element.appendChild(childConfig.getElement());
                if (childConfig._data.id) {
                    this._fastened.push(childConfig._data.id);
                }
                return childConfig;
            }

            const child = new A({...childConfig, attach: this.element});
            if (childConfig.id) {
                this._fastened.push(childConfig.id);
            }
            return child;
        }

        inspect() {
            console.group('Instance A');
            console.log('ID:', this._data.id);
            console.log('Element:', this.element);
            console.log('Style:', this.element.style.cssText);
            console.log('Data:', this._data);
            console.groupEnd();
            return this;
        }

        static getById(id) {
            return registry[id];
        }
    };

    // Fonction grab simplifiée
    grab = function(id) {
        if (!id) return null;

        // Chercher dans le registre
        const instance = registry[id];
        if (instance) return instance;

        // Chercher dans le DOM
        const element = document.getElementById(id);
        if (!element) return null;

        // Ajouter des méthodes utiles
        const cssProperties = ['width', 'height', 'color', 'backgroundColor', 'x', 'y'];
        cssProperties.forEach(prop => {
            if (!element[prop]) {
                element[prop] = function(value) {
                    const styleProp = prop === 'x' ? 'left' : prop === 'y' ? 'top' : prop;

                    if (arguments.length === 0) {
                        return getComputedStyle(this)[styleProp];
                    }

                    this.style[styleProp] = isNumber(value) ? `${value}px` : value;
                    return this;
                };
            }
        });

        return element;
    };

    // Fonction puts
    puts = function(msg) {
        console.log(msg);
    };

    // Définir les particules de base
    defineParticle({
        name: 'id',
        type: 'string',
        category: 'structural',
        process(el, v, _, instance) {
            el.id = v;
            if (v) registry[v] = instance;
        }
    });

    defineParticle({
        name: 'markup',
        type: 'string',
        category: 'structural',
        process(el, v, data, instance) {
            if (!v || typeof v !== 'string') return;

            const newEl = document.createElement(v);
            // Copier les attributs
            for (const attr of el.attributes) {
                newEl.setAttribute(attr.name, attr.value);
            }

            // Copier les styles
            newEl.style.cssText = el.style.cssText;

            // Remplacer l'élément
            instance.element = newEl;
        }
    });

    defineParticle({
        name: 'x',
        type: 'number',
        category: 'position',
        process(el, v) { el.style.left = formatSize(v); }
    });

    defineParticle({
        name: 'y',
        type: 'number',
        category: 'position',
        process(el, v) { el.style.top = formatSize(v); }
    });

    defineParticle({
        name: 'width',
        type: 'number',
        category: 'dimension',
        process(el, v) { el.style.width = formatSize(v); }
    });

    defineParticle({
        name: 'height',
        type: 'number',
        category: 'dimension',
        process(el, v) { el.style.height = formatSize(v); }
    });

    defineParticle({
        name: 'color',
        type: 'string',
        category: 'appearance',
        process(el, v) { el.style.backgroundColor = v; }
    });

    defineParticle({
        name: 'backgroundColor',
        type: 'string',
        category: 'appearance',
        process(el, v) { el.style.backgroundColor = v; }
    });

    defineParticle({
        name: 'smooth',
        type: 'number',
        category: 'appearance',
        process(el, v) { el.style.borderRadius = formatSize(v); }
    });

    defineParticle({
        name: 'shadow',
        type: 'object',
        category: 'appearance',
        process(el, v) {
            if (Array.isArray(v)) {
                const shadows = v.map(shadow => {
                    const {blur=0, x=0, y=0, color={}, invert=false} = shadow;
                    const {red=0, green=0, blue=0, alpha=1} = color;
                    const rgba = `rgba(${red*255},${green*255},${blue*255},${alpha})`;
                    return `${invert ? 'inset ' : ''}${x}px ${y}px ${blur}px ${rgba}`;
                }).join(', ');
                el.style.boxShadow = shadows;
            } else if (typeof v === 'string') {
                el.style.boxShadow = v;
            }
        }
    });

    defineParticle({
        name: 'overflow',
        type: 'string',
        category: 'appearance',
        process(el, v) { el.style.overflow = v; }
    });

    defineParticle({
        name: 'attach',
        type: 'any',
        category: 'structural',
        process(el, v, _, instance) {
            instance._handleAttach(v);
        }
    });

    // Exporter dans l'espace global
    window.A = A;
    window.grab = grab;
    window.puts = puts;
    window.defineParticle = defineParticle;
})();

// Export pour ES modules
export { A as default, A, grab, defineParticle, puts };