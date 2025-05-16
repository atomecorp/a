
const A = (() => {
    // Stockage global des instances Atome par ID pour les références
    const atomeRegistry = {};

    // Style de base pour réinitialiser les valeurs par défaut
    const baseStyles = {
        margin: '0',
        padding: '0',
        boxSizing: 'border-box',
        display: 'block',
        position: 'absolute', // Par défaut en position absolue
        lineHeight: 'normal',
        fontSize: 'inherit',
        fontWeight: 'inherit',
        color: 'inherit',
        background: 'transparent'
    };

    // Handlers prédéfinis pour certaines clés
    const handlers = {
        id: (el, v, _, __, instance) => {
            el.id = v;
            // Enregistrer l'instance dans le registre global pour références ultérieures
            if (v) {
                atomeRegistry[v] = instance;
            }
        },
        class: (el, v) => {
            const cls = Array.isArray(v) ? v.join(' ') : v;
            el.className = cls;
        },
        markup: (el, v, instance) => {
            // Si markup est spécifié, on crée un nouvel élément du type demandé
            if (v && typeof v === 'string') {
                const newEl = document.createElement(v);
                // Copier les attributs et styles de l'ancien élément
                Array.from(el.attributes).forEach(attr => {
                    newEl.setAttribute(attr.name, attr.value);
                });
                newEl.style.cssText = el.style.cssText;
                // Remplacer l'élément dans l'instance
                instance._element = newEl;
                return newEl; // Important : retourner le nouvel élément
            }
            return el;
        },
        type: (el, v) => { el.dataset.type = v; },
        renderers: (el, v) => {
            if (Array.isArray(v)) v.forEach(r => el.classList.add(`renderer-${r}`));
        },
        apply: (el, v) => {
            if (Array.isArray(v)) v.forEach(fn => {
                if (typeof el[fn] === 'function') el[fn]();
            });
        },
        attach: (el, v) => {
            let parent;
            if (typeof v === 'string') {
                parent = document.querySelector(v) || document.body;
            } else if (v instanceof HTMLElement) {
                parent = v;
            } else parent = document.body;
            parent.appendChild(el);
        },
        center: (el, v) => {
            if (v) {
                // Centrer horizontalement tout en respectant la position absolue
                el.style.left = '50%';
                el.style.transform = 'translateX(-50%)';
                // Si on veut aussi centrer verticalement
                // el.style.top = '50%';
                // el.style.transform = 'translate(-50%, -50%)';
            }
        },
        smooth: (el, v) => {
            if (typeof v === 'number') {
                el.style.borderRadius = `${v}px`;
            } else if (typeof v === 'string') {
                el.style.borderRadius = v;
            }
        },
        color:(el, v) => {
            el.style.backgroundColor = v;
        },
        shadow: (el, v) => {
            // Définir les valeurs par défaut
            const blur = v.blur !== undefined ? v.blur : 7;
            const x = v.x !== undefined ? v.x : 3;
            const y = v.y !== undefined ? v.y : 3;
            const color = v.color !== undefined ? v.color : 'rgba(0,0,0,0.6)';
            const inset = v.invert ? 'inset ' : ''; // Ajouter la gestion de l'option inset

            // Appliquer directement le style
            el.style.boxShadow = inset + x + 'px ' + y + 'px ' + blur + 'px ' + color;
        },
        unit: (el, v, _, data) => {
            // Ne fait rien directement, mais sera utilisé par d'autres handlers
        },
        innerHTML: (el, v) => {
            el.innerHTML = v;
        },
        text: (el, v) => {
            el.textContent = v;
        },
        // Contrôle si les styles par défaut doivent être appliqués
        reset: (el, v) => {
            // Si reset est false, ne pas appliquer les styles de base
            if (v === false) return;

            // Appliquer les styles de base pour réinitialiser les défauts du navigateur
            for (const [key, value] of Object.entries(baseStyles)) {
                el.style[key] = value;
            }
        },
        // Pour permettre de définir une position relative plutôt qu'absolue
        position: (el, v) => {
            el.style.position = v;
        },
        // Gestion des origines
        origin: (el, v) => {
            if (!v || typeof v !== 'object') return;

            // On stocke l'origine dans les données de l'élément pour référence
            el.dataset.origin = JSON.stringify(v);

            // Application des ajustements de position si nécessaire
            // Note: ceci serait mieux géré avec un système complet de positionnement
        },
        // Gestion du débordement
        overflow: (el, v) => {
            el.style.overflow = v;
        },
        // Gestion des objets fastened (rattachés)
        fasten: (el, v, _, __, instance) => {
            if (Array.isArray(v)) {
                el.dataset.fasten = v.join(',');
                // Stocker les IDs des enfants dans l'instance
                instance._fastened = v;
            }
        },
        // NOUVEAU - Gestion des éléments enfants
        children: (el, v, _, __, instance) => {
            if (!Array.isArray(v) || v.length === 0) return;

            // Utilisation de DocumentFragment pour améliorer les performances
            const fragment = document.createDocumentFragment();

            // Tableau pour stocker les IDs des enfants créés
            const childrenIds = [];

            // Créer chaque enfant et l'attacher au fragment
            v.forEach(childConfig => {
                // S'assurer que l'enfant est bien configuré
                const childAtome = new A({
                    ...childConfig,
                    attach: null // On n'attache pas tout de suite
                });

                // Ajouter l'élément au fragment
                fragment.appendChild(childAtome.getElement());

                // Si l'enfant a un ID, l'ajouter à la liste des enfants
                if (childConfig.id) {
                    childrenIds.push(childConfig.id);
                }
            });

            // Attacher tous les enfants en une seule opération
            el.appendChild(fragment);

            // Si des enfants ont été créés avec des IDs, les ajouter à fasten
            if (childrenIds.length > 0) {
                // Si fasten existe déjà, fusionner les tableaux
                if (instance._fastened && Array.isArray(instance._fastened)) {
                    instance._fastened = [...new Set([...instance._fastened, ...childrenIds])];
                    el.dataset.fasten = instance._fastened.join(',');
                } else {
                    instance._fastened = childrenIds;
                    el.dataset.fasten = childrenIds.join(',');
                }
            }
        },
        // NOUVEAU - Gestion des événements
        events: (el, v) => {
            if (v && typeof v === 'object') {
                // Stocker les gestionnaires pour une suppression ultérieure
                el._eventHandlers = el._eventHandlers || {};

                for (const [event, handler] of Object.entries(v)) {
                    if (typeof handler === 'function') {
                        el.addEventListener(event, handler);
                        el._eventHandlers[event] = handler;
                    }
                }
            }
        },
        // NOUVEAU - Gestion des animations
        animate: (el, v) => {
            if (v && typeof v === 'object') {
                // Définir les propriétés de transition
                const duration = v.duration || 0.3;
                const easing = v.easing || 'ease';
                const delay = v.delay || 0;

                el.style.transition = `all ${duration}s ${easing} ${delay}s`;

                // Utiliser requestAnimationFrame pour de meilleures performances
                if (v.properties && typeof v.properties === 'object') {
                    requestAnimationFrame(() => {
                        for (const [prop, value] of Object.entries(v.properties)) {
                            el.style[prop] = typeof value === 'number' ? `${value}px` : value;
                        }
                    });
                }
            }
        }
    };

    // Gestion des propriétés dimensionnelles avec unités
    const dimensionProps = ['x', 'y', 'width', 'height'];
    dimensionProps.forEach(prop => {
        handlers[prop] = (el, value, key, data) => {
            if (value === undefined || value === null) return;

            // Détermination de l'unité
            let unit = 'px'; // Unité par défaut

            if (data.unit && data.unit[prop]) {
                unit = data.unit[prop];
            }

            // Mappage des propriétés x/y vers left/top
            const cssProp = prop === 'x' ? 'left' :
                prop === 'y' ? 'top' : prop;

            // Application de la propriété avec son unité
            el.style[cssProp] = `${value}${unit}`;
        };
    });

    // Handler par défaut pour toutes les autres clés
    function defaultHandler(el, value, key) {
        if (typeof value === 'number' || typeof value === 'string') {
            // styles en px si nombre
            el.style[key] = typeof value === 'number' ? `${value}px` : value;
        } else if (typeof value === 'boolean') {
            el.dataset[key] = value;
        } else if (Array.isArray(value)) {
            el.dataset[key] = value.join(',');
        } else if (value instanceof HTMLElement) {
            el.appendChild(value);
        } else if (value && typeof value === 'object') {
            el.dataset[key] = JSON.stringify(value);
        }
    }

    // Classe A avec proxy pour accès direct aux propriétés
    class ABase {
        constructor(jsonObject) {
            if (!jsonObject || typeof jsonObject !== 'object' || Array.isArray(jsonObject)) {
                throw new TypeError('Objet JSON invalide (non-null, objet attendu).');
            }
            this._data = jsonObject;
            this._element = document.createElement('div');
            this._fastened = []; // Liste des éléments rattachés (enfants)

            // Créer un proxy pour le style
            this._styleProxy = new Proxy({}, {
                get: (target, prop) => {
                    return this._element.style[prop];
                },
                set: (target, prop, value) => {
                    // Logger la propriété et la valeur ajoutée/modifiée
                    console.log(`Style: ${prop} = ${value}`);
                    this._element.style[prop] = value;
                    return true;
                }
            });

            // Par défaut, appliquer le reset des styles
            if (this._data.reset !== false) {
                for (const [key, value] of Object.entries(baseStyles)) {
                    this._element.style[key] = value;
                }
            }

            this._process();

            // Intégration automatique si attach est fourni
            if (this._data.attach && !this._element.parentNode) {
                let parent;
                const v = this._data.attach;
                if (typeof v === 'string') {
                    parent = document.querySelector(v) || document.body;
                } else if (v instanceof HTMLElement) {
                    parent = v;
                } else parent = document.body;
                parent.appendChild(this._element);
            }

            // Création du proxy pour accès direct aux propriétés
            return new Proxy(this, {
                get(target, prop) {
                    // Accès au style via .style
                    if (prop === 'style') {
                        return target._styleProxy;
                    }

                    // Propriétés spéciales qui doivent être accessibles directement
                    if (prop === '_data' || prop === '_fastened' || prop === '_process' ||
                        prop === 'destroy' || prop === 'get' || prop === 'set' ||
                        prop === 'addChild' || prop === 'removeChild' ||
                        prop === 'getFastened' || prop === 'getElement' ||
                        prop === '_element' || prop === '_styleProxy') {
                        return target[prop];
                    }

                    // Accès à l'élément DOM via .element
                    if (prop === 'element') {
                        return target._element;
                    }

                    // Si la propriété existe dans _data, créer une fonction getter/setter
                    if (prop in target._data) {
                        // Retourner une fonction qui agit comme getter/setter
                        return function(value) {
                            // Si un argument est fourni, c'est un setter
                            if (arguments.length > 0) {
                                // Logger la propriété et la valeur ajoutée/modifiée
                                console.log(`Property: ${prop} = ${value}`);

                                target._data[prop] = value;
                                // Appliquer la modification à l'élément
                                const handler = handlers[prop] || defaultHandler;
                                handler(target._element, value, prop, target._data, target);
                                return target; // Pour chaînage
                            }
                            // Sans argument, c'est un getter
                            return target._data[prop];
                        };
                    }

                    // Sinon, retourner la propriété normale de l'objet
                    return target[prop];
                },
                set(target, prop, value) {
                    // Ne pas permettre de modifier certaines propriétés spéciales
                    if (prop === '_data' || prop === '_element' || prop === '_fastened' ||
                        prop === '_process' || prop === 'destroy' || prop === 'get' ||
                        prop === 'set' || prop === 'addChild' || prop === 'removeChild' ||
                        prop === 'getFastened' || prop === 'getElement' ||
                        prop === '_styleProxy') {
                        return false;
                    }

                    // Propriétés spéciales
                    if (prop === 'element') {
                        return false; // Ne pas permettre de remplacer directement l'élément
                    }

                    if (prop === 'style') {
                        return false; // On ne peut pas remplacer le proxy de style
                    }

                    // Si c'est une propriété connue dans _data, la mettre à jour et l'appliquer
                    if (prop in target._data) {
                        // Logger la propriété et la valeur ajoutée/modifiée
                        console.log(`Property: ${prop} = ${value}`);

                        target._data[prop] = value;

                        // Appliquer la modification à l'élément
                        const handler = handlers[prop] || defaultHandler;
                        handler(target._element, value, prop, target._data, target);

                        return true;
                    }

                    // Sinon, définir comme propriété normale de l'objet
                    target[prop] = value;
                    return true;
                }
            });
        }

        _process() {
            let el = this._element;
            const data = this._data;
            const fnHandlers = handlers;
            const fallback = defaultHandler;

            // Traiter markup en premier s'il existe
            if (data.markup && fnHandlers.markup) {
                el = fnHandlers.markup(el, data.markup, this);
            }

            // Traiter les propriétés height et width prioritairement pour éviter le problème de height: 0
            if (data.height !== undefined) {
                el.style.height = typeof data.height === 'number' ? `${data.height}px` : data.height;
            }
            if (data.width !== undefined) {
                el.style.width = typeof data.width === 'number' ? `${data.width}px` : data.width;
            }

            // Traiter l'ID en premier pour l'enregistrement
            if (data.id && fnHandlers.id) {
                fnHandlers.id(el, data.id, 'id', data, this);
            }

            // Boucle pour toutes les autres propriétés
            for (const [key, value] of Object.entries(data)) {
                if (key === 'markup' || key === 'height' || key === 'width' || key === 'id') continue; // Déjà traités
                const fn = fnHandlers[key] || fallback;
                fn(el, value, key, data, this);
            }

            // S'assurer que la position est correctement définie
            if (!el.style.position && (data.x !== undefined || data.y !== undefined)) {
                el.style.position = 'absolute';
            }
        }

        // Récupère l'élément créé
        getElement() {
            return this._element;
        }

        // Obtenir tous les éléments rattachés (enfants)
        getFastened() {
            return this._fastened.map(id => atomeRegistry[id]).filter(Boolean);
        }

        // Ajouter un élément enfant
        addChild(childConfig) {
            // Si childConfig est déjà un Atome
            if (childConfig instanceof ABase) {
                this._element.appendChild(childConfig.getElement());
                if (childConfig._data.id) {
                    this._fastened.push(childConfig._data.id);
                    this._element.dataset.fasten = this._fastened.join(',');
                }
                return childConfig;
            }

            // Sinon, créer un nouvel Atome à partir de la config
            const child = new A({
                ...childConfig,
                attach: this._element
            });

            // Si l'enfant a un ID, l'ajouter à la liste des enfants
            if (childConfig.id) {
                this._fastened.push(childConfig.id);
                this._element.dataset.fasten = this._fastened.join(',');
            }

            return child;
        }

        // Supprimer un enfant par ID
        removeChild(childId) {
            const child = atomeRegistry[childId];
            if (child && child.getElement().parentNode === this._element) {
                this._element.removeChild(child.getElement());
                this._fastened = this._fastened.filter(id => id !== childId);
                this._element.dataset.fasten = this._fastened.join(',');
                return true;
            }
            return false;
        }

        // Méthode pour obtenir une valeur à partir des données
        get(key) {
            return this._data[key];
        }

        // Méthode pour définir une valeur et l'appliquer
        set(key, value) {
            this._data[key] = value;
            const handler = handlers[key] || defaultHandler;
            handler(this._element, value, key, this._data, this);
            return this;
        }

        // Méthode de nettoyage - peut être appelée pour libérer les ressources
        destroy() {
            // Supprimer du DOM
            if (this._element.parentNode) {
                this._element.parentNode.removeChild(this._element);
            }

            // Supprimer les écouteurs d'événements
            if (this._element._eventHandlers) {
                for (const [event, handler] of Object.entries(this._element._eventHandlers)) {
                    this._element.removeEventListener(event, handler);
                }
                this._element._eventHandlers = {};
            }

            // Supprimer du registre
            if (this._data.id) {
                delete atomeRegistry[this._data.id];
            }

            // Nettoyer les références
            this._fastened = null;
            this._data = null;
        }
    }

    // Création de la classe A finale
    const A = function(config) {
        return new ABase(config);
    };

    // Ajout des méthodes statiques
    A.getById = function(id) {
        return atomeRegistry[id];
    };


    A.cleanRegistry = function() {
        for (const id in atomeRegistry) {
            const instance = atomeRegistry[id];
            if (!instance._element || !document.contains(instance._element)) {
                delete atomeRegistry[id];
            }
        }
    };

    return A;
})();

// Export pour l'utilisation comme module
window.A = A;
export default A;



// Cache global des instances A créées manuellement
const instanceCache = {};

// Fonction pour enregistrer une instance dans le cache
function registerInstance(instance, id) {
    if (id) {
        instanceCache[id] = instance;
        console.log(`Instance '${id}' enregistrée dans le cache`);
    }
}

// Remplacer new A pour qu'il enregistre automatiquement les instances
const originalA = window.A;
window.A = function(config) {
    const instance = new originalA(config);
    if (config && config.id) {
        registerInstance(instance, config.id);
    }
    return instance;
};
// Copier les méthodes statiques
for (const key in originalA) {
    if (originalA.hasOwnProperty(key)) {
        window.A[key] = originalA[key];
    }
}

// Fonction grab qui utilise le cache
function grab(id) {
    // Consulter d'abord le cache pour une correspondance exacte
    if (instanceCache[id]) {
        return instanceCache[id];
    }

    // Si pas dans le cache, essayer A.getById
    if (typeof A !== 'undefined' && typeof A.getById === 'function') {
        const instance = A.getById(id);
        if (instance) {
            return instance;
        }
    }

    // Fallback : retourner l'élément DOM
    return document.getElementById(id);
}

// Exposer globalement
window.grab = grab;
window.registerInstance = registerInstance;

// Enregistrer les instances existantes
// Ajouter après avoir créé container:
// registerInstance(container, 'main_container');