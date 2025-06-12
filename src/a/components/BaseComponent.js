/**
 * 🚀 BaseComponent - Modern Particle System Foundation
 * 
 * Classe de base moderne qui unifie:
 * - Système de particules moderne (ultra performance)
 * - Web Components natifs (encapsulation)
 * - Rétro-compatibilité Framework A (migration douce)
 * 
 * @version 3.0.0 - MODERN HYBRID SYSTEM
 * @author Squirrel Framework Team
 */

// Import du système de particules modernes
import { sharedParticles } from '../utils/shared-particles.js';
import { universalProcessor, processParticle, processContainerStyle } from '../utils/universal-particle-processor.js';

export class BaseComponent extends HTMLElement {
    static observedAttributes = ['x', 'y', 'width', 'height', 'backgroundColor', 'opacity', 'smooth'];
    
    constructor() {
        super();
        
        // 🚀 SYSTÈME MODERNE DE PARTICULES
        this._particleValues = new Map();
        this._particleCache = new Map();
        this._sharedParticles = new Map();
        
        // Configuration moderne
        this.useModernParticles = true;
        this.enableFallback = true;
        this.batchUpdates = true;
        
        // Propriétés communes centralisées (rétro-compatibilité)
        this.commonConfig = {
            x: undefined,
            y: undefined,
            width: undefined,
            height: undefined,
            backgroundColor: undefined,
            opacity: 1,
            smooth: true,
            id: `component_${Date.now()}`,
        };
        
        // Registry des instances (global)
        if (!BaseComponent.instances) {
            BaseComponent.instances = new Map();
        }
        BaseComponent.instances.set(this.commonConfig.id, this);
        
        // 🔥 CHARGER LES PARTICULES MODERNES
        this._loadModernParticles();
    }
    
    /**
     * 🚀 CHARGEMENT MODERNE DES PARTICULES
     */
    _loadModernParticles() {
        // Charger les particules partagées
        sharedParticles.forEach(particle => {
            this._sharedParticles.set(particle.name, particle);
        });
        
        // Intégration Framework A traditionnel (rétro-compatibilité)
        if (typeof window !== 'undefined' && window.defineParticle) {
            this._initializeFrameworkAIntegration();
        } else {
            // Attendre le chargement du Framework A
            window.addEventListener('AFrameworkLoaded', () => {
                this._initializeFrameworkAIntegration();
            });
        }
    }
    
    /**
     * 🎯 INTÉGRATION FRAMEWORK A (Rétro-compatibilité)
     */
    _initializeFrameworkAIntegration() {
        // Enregistrer nos particules modernes dans le système traditionnel
        this._sharedParticles.forEach(particle => {
            if (window.defineParticle) {
                window.defineParticle(particle);
            }
        });
    }
    
    /**
     * 🚀 API MODERNE POUR PARTICULES
     */
    setParticle(name, value, options = {}) {
        // Stocker la valeur
        this._particleValues.set(name, value);
        
        // Mettre à jour la config commune si applicable
        if (this.commonConfig.hasOwnProperty(name)) {
            this.commonConfig[name] = value;
        }
        
        // Traiter la particule
        return this._processParticle(name, value, options);
    }
    
    /**
     * 📊 OBTENIR UNE VALEUR DE PARTICULE
     */
    getParticle(name) {
        return this._particleValues.get(name) ?? this.commonConfig[name];
    }
    
    /**
     * 🔥 TRAITEMENT BATCH OPTIMISÉ
     */
    setParticles(particlesData, options = {}) {
        if (this.batchUpdates) {
            return this._processBatch(particlesData, options);
        }
        
        // Mode synchrone traditionnel
        const results = [];
        Object.entries(particlesData).forEach(([name, value]) => {
            results.push(this.setParticle(name, value, options));
        });
        return results;
    }

    /**
     * 🎨 API SPÉCIALISÉE POUR CONTAINER STYLE
     * Traite directement les styles complexes avec le processeur universel
     */
    setContainerStyle(containerStyle, options = {}) {
        // Trouver l'élément cible approprié selon le type de Web Component
        let target;
        
        if (this.shadowRoot) {
            // Priorité : élément avec classe .module-container, .list-container, etc.
            target = this.shadowRoot.querySelector('.module-container') ||
                    this.shadowRoot.querySelector('.list-container') ||
                    this.shadowRoot.querySelector('.table-wrapper') ||
                    this.shadowRoot.querySelector('.matrix-container') ||
                    this.shadowRoot.querySelector('.slider-container') ||
                    this.shadowRoot.querySelector('.particle-container') ||
                    this.shadowRoot.firstElementChild;
        }
        
        // Fallback sur l'élément lui-même
        if (!target) {
            target = this;
        }
        
        const extendedOptions = {
            ...options,
            webComponent: true,
            shadowRoot: this.shadowRoot,
            baseElement: this
        };

        return processContainerStyle(target, containerStyle, extendedOptions);
    }
    
    /**
     * ⚡ PROCESSEUR BATCH MODERNE
     */
    async _processBatch(particlesData, options = {}) {
        // Grouper les mises à jour
        const updates = Object.entries(particlesData).map(([name, value]) => {
            this._particleValues.set(name, value);
            if (this.commonConfig.hasOwnProperty(name)) {
                this.commonConfig[name] = value;
            }
            return { name, value };
        });
        
        // Traitement optimisé par RequestAnimationFrame
        return new Promise(resolve => {
            requestAnimationFrame(() => {
                const results = updates.map(({ name, value }) => 
                    this._processParticle(name, value, { ...options, batch: true })
                );
                resolve(results);
            });
        });
    }
    
    /**
     * ⚡ PROCESSEUR CORE DE PARTICULES - VERSION UNIVERSELLE
     * Utilise le processeur universel pour tous les types de particles
     */
    _processParticle(name, value, options = {}) {
        // Élément cible (Shadow DOM ou élément principal)
        const target = this.shadowRoot?.querySelector('.particle-container') || 
                      this.shadowRoot?.firstElementChild || 
                      this;
        
        // Options étendues pour Web Components
        const extendedOptions = {
            ...options,
            webComponent: true,
            shadowRoot: this.shadowRoot,
            baseElement: this,
            withTransition: options.withTransition !== false
        };

        // 🚀 UTILISER LE PROCESSEUR UNIVERSEL
        return universalProcessor.process(target, name, value, extendedOptions);
    }

    /**
     * 🌟 APPLIQUER PARTICULE PARTAGÉE
     */
    _applySharedParticle(name, value, options) {
        const particle = this._sharedParticles.get(name);
        
        // Élément cible (Shadow DOM ou élément principal)
        const target = this.shadowRoot?.querySelector('.particle-container') || this;
        
        // Options étendues pour Web Components
        const extendedOptions = {
            ...options,
            webComponent: true,
            shadowRoot: this.shadowRoot,
            baseElement: this
        };

        // Traitement optimisé
        if (options.batch) {
            return new Promise(resolve => {
                requestAnimationFrame(() => {
                    resolve(particle.process(target, value, extendedOptions));
                });
            });
        }

        return particle.process(target, value, extendedOptions);
    }

    /**
     * 🎯 ESSAYER FRAMEWORK A TRADITIONNEL
     */
    _tryFrameworkA(name, value, options) {
        // Vérifier si le système traditionnel est disponible
        if (typeof window?.setParticle === 'function') {
            try {
                window.setParticle(this, name, value, options);
                return true;
            } catch (error) {
                console.warn(`Framework A particle '${name}' failed:`, error);
                return false;
            }
        }
        return false;
    }

    /**
     * 🛡️ SYSTÈME DE FALLBACK CSS
     */
    _applyFallback(name, value, options) {
        console.warn(`Using CSS fallback for particle '${name}'`);
        
        // Fallbacks CSS directs et fiables
        const fallbacks = {
            // Position
            x: (val) => this.style.left = this._formatPixels(val),
            y: (val) => this.style.top = this._formatPixels(val),
            
            // Dimensions
            width: (val) => this.style.width = this._formatPixels(val),
            height: (val) => this.style.height = this._formatPixels(val),
            
            // Apparence
            backgroundColor: (val) => this.style.backgroundColor = val,
            opacity: (val) => this.style.opacity = val,
            color: (val) => this.style.color = val,
            
            // Effet
            smooth: (val) => this.style.transition = val ? 'all 0.3s ease' : 'none',
        };

        const fallback = fallbacks[name];
        if (fallback) {
            return fallback(value);
        }

        // Fallback ultime : propriété CSS directe
        if (typeof value === 'string' || typeof value === 'number') {
            this.style[name] = value;
            return true;
        }

        return false;
    }

    /**
     * 🔧 HELPER FORMATAGE PIXELS
     */
    _formatPixels(value) {
        if (typeof value === 'number') {
            return `${value}px`;
        }
        if (typeof value === 'string' && !value.includes('px') && !isNaN(value)) {
            return `${value}px`;
        }
        return value;
    }
    
    /**
     * Définit les particules communes utilisées par tous les composants
     */
    _defineCommonParticles() {
        // Particules de position
        ParticleFactory.batch([
            {
                name: 'componentX',
                type: 'number',
                category: 'position',
                process: (el, v, config, instance) => {
                    instance.commonConfig.x = v;
                    instance._applyPositioning();
                }
            },
            {
                name: 'componentY', 
                type: 'number',
                category: 'position',
                process: (el, v, config, instance) => {
                    instance.commonConfig.y = v;
                    instance._applyPositioning();
                }
            },
            {
                name: 'componentWidth',
                type: 'any',
                category: 'dimension',
                process: (el, v, config, instance) => {
                    instance.commonConfig.width = v;
                    instance._applyDimensions();
                }
            },
            {
                name: 'componentHeight',
                type: 'any', 
                category: 'dimension',
                process: (el, v, config, instance) => {
                    instance.commonConfig.height = v;
                    instance._applyDimensions();
                }
            },
            {
                name: 'componentAttach',
                type: 'any',
                category: 'structural',
                process: (el, v, config, instance) => {
                    instance.commonConfig.attach = v;
                    instance._performAttachment();
                }
            }
        ]);
    }
    
    /**
     * Méthode centralisée pour traiter la configuration commune
     */
    processCommonConfig(config) {
        // Mapping des propriétés vers les particules
        const propertyMapping = {
            x: 'componentX',
            y: 'componentY', 
            width: 'componentWidth',
            height: 'componentHeight',
            attach: 'componentAttach'
        };
        
        // Traiter chaque propriété commune via les particules
        for (const [key, value] of Object.entries(config)) {
            if (propertyMapping[key] && value !== undefined) {
                const particleName = propertyMapping[key];
                
                // Utiliser le système de particules si disponible
                if (window._particles && window._particles[particleName]) {
                    try {
                        window._particles[particleName].process(this, value, config, this);
                    } catch (err) {
                        console.warn(`Error processing particle ${particleName}:`, err);
                        // Fallback vers traitement direct
                        this._processPropertyDirect(key, value);
                    }
                } else {
                    // Fallback si particules non disponibles
                    this._processPropertyDirect(key, value);
                }
            }
        }
        
        // Enregistrer l'instance
        if (config.id) {
            BaseComponent.instances.set(config.id, this);
        }
    }
    
    /**
     * Traitement direct des propriétés (fallback)
     */
    _processPropertyDirect(key, value) {
        this.commonConfig[key] = value;
        
        switch (key) {
            case 'x':
            case 'y':
                this._applyPositioning();
                break;
            case 'width':
            case 'height':
                this._applyDimensions();
                break;
            case 'attach':
                this._performAttachment();
                break;
        }
    }
    
    /**
     * Application centralisée du positionnement
     */
    _applyPositioning() {
        if (this.commonConfig.x !== undefined || this.commonConfig.y !== undefined) {
            this.style.position = 'absolute';
            
            if (this.commonConfig.x !== undefined) {
                this.style.left = this._formatSize(this.commonConfig.x);
            }
            
            if (this.commonConfig.y !== undefined) {
                this.style.top = this._formatSize(this.commonConfig.y);
            }
        }
    }
    
    /**
     * Application centralisée des dimensions
     */
    _applyDimensions() {
        if (this.commonConfig.width !== undefined) {
            this.style.width = this._formatSize(this.commonConfig.width);
        }
        
        if (this.commonConfig.height !== undefined) {
            this.style.height = this._formatSize(this.commonConfig.height);
        }
    }
    
    /**
     * Attachement centralisé au DOM
     */
    _performAttachment() {
        if (!this.commonConfig.attach || this.parentElement) return;
        
        let container;
        
        if (this.commonConfig.attach === 'body') {
            container = document.body;
        } else if (typeof this.commonConfig.attach === 'string') {
            container = document.querySelector(this.commonConfig.attach);
        } else if (this.commonConfig.attach instanceof HTMLElement) {
            container = this.commonConfig.attach;
        }
        
        if (container) {
            container.appendChild(this);
        }
    }
    
    /**
     * Formateur de taille centralisé (similaire à ParticleFactory._formatSize)
     */
    _formatSize(value) {
        if (typeof value === 'number') {
            return value + 'px';
        }
        if (typeof value === 'string') {
            if (/^[\d.]+(%|px|em|rem|vh|vw|pt|pc|in|cm|mm|ex|ch|vmin|vmax)$/i.test(value)) {
                return value;
            }
            if (/^[\d.]+$/.test(value)) {
                return value + 'px';
            }
            return value;
        }
        return value;
    }
    
    /**
     * Gestion centralisée des attributs observés
     */
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            switch (name) {
                case 'x':
                    this.commonConfig.x = parseFloat(newValue);
                    this._applyPositioning();
                    break;
                case 'y':
                    this.commonConfig.y = parseFloat(newValue);
                    this._applyPositioning();
                    break;
                case 'width':
                    this.commonConfig.width = newValue;
                    this._applyDimensions();
                    break;
                case 'height':
                    this.commonConfig.height = newValue;
                    this._applyDimensions();
                    break;
                case 'attach':
                    this.commonConfig.attach = newValue;
                    this._performAttachment();
                    break;
            }
        }
    }
    
    /**
     * API publique pour mettre à jour les propriétés communes
     */
    updateCommonProperty(key, value) {
        this.processCommonConfig({ [key]: value });
    }
    
    /**
     * Obtenir la configuration commune
     */
    getCommonConfig() {
        return { ...this.commonConfig };
    }
    
    /**
     * Méthodes statiques pour la gestion globale
     */
    static getInstance(id) {
        return BaseComponent.instances.get(id);
    }
    
    static getAllInstances() {
        return Array.from(BaseComponent.instances.values());
    }
    
    static getInstancesByType(type) {
        return Array.from(BaseComponent.instances.values()).filter(
            instance => instance.constructor.name === type
        );
    }
    
    /**
     * 🔥 ANIMATIONS MODERNES
     */
    animateParticle(name, fromValue, toValue, duration = 300, easing = 'ease') {
        return new Promise(resolve => {
            const startTime = performance.now();
            const startVal = fromValue ?? this.getParticle(name) ?? 0;
            
            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                // Fonction d'easing
                const easedProgress = this._applyEasing(progress, easing);
                
                // Interpolation
                const currentValue = this._interpolate(startVal, toValue, easedProgress);
                
                // Appliquer la valeur
                this.setParticle(name, currentValue, { async: true });
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    resolve(toValue);
                }
            };
            
            requestAnimationFrame(animate);
        });
    }

    /**
     * 📈 FONCTIONS D'EASING
     */
    _applyEasing(t, type) {
        switch (type) {
            case 'ease-in': return t * t;
            case 'ease-out': return 1 - (1 - t) * (1 - t);
            case 'ease-in-out': return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
            case 'bounce': return t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (1 - t) * (1 - t) * (1 - t) * (1 - t);
            default: return t; // linear
        }
    }

    /**
     * 🔄 INTERPOLATION INTELLIGENTE
     */
    _interpolate(from, to, progress) {
        if (typeof from === 'number' && typeof to === 'number') {
            return from + (to - from) * progress;
        }
        
        // Support basique pour les couleurs
        if (typeof from === 'string' && typeof to === 'string') {
            if (from.startsWith('#') && to.startsWith('#')) {
                // TODO: Interpolation de couleurs hexadécimales
                return progress < 0.5 ? from : to;
            }
        }
        
        // Fallback : transition discrète
        return progress < 0.5 ? from : to;
    }

    /**
     * 🎯 LIFECYCLE HOOKS MODERNES
     */
    connectedCallback() {
        this._initializeFromAttributes();
        this._setupParticleObserver();
        
        // Appliquer les propriétés initiales
        this._applyInitialConfig();
    }

    /**
     * 📦 INITIALISATION DEPUIS LES ATTRIBUTS
     */
    _initializeFromAttributes() {
        // Traiter les attributs data-particle-*
        for (const attr of this.attributes) {
            if (attr.name.startsWith('data-particle-')) {
                const particleName = attr.name.replace('data-particle-', '');
                const value = this._parseAttributeValue(attr.value);
                this.setParticle(particleName, value);
            }
        }

        // Traiter les attributs de particules communes
        const commonParticles = ['x', 'y', 'width', 'height', 'backgroundColor', 'opacity', 'smooth'];
        commonParticles.forEach(name => {
            if (this.hasAttribute(name)) {
                const value = this._parseAttributeValue(this.getAttribute(name));
                this.setParticle(name, value);
            }
        });
    }

    /**
     * 👁️ OBSERVER LES CHANGEMENTS D'ATTRIBUTS
     */
    _setupParticleObserver() {
        if (!this._observer) {
            this._observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    if (mutation.type === 'attributes') {
                        const attrName = mutation.attributeName;
                        
                        if (attrName.startsWith('data-particle-')) {
                            const particleName = attrName.replace('data-particle-', '');
                            const value = this._parseAttributeValue(this.getAttribute(attrName));
                            this.setParticle(particleName, value);
                        }
                        
                        // Observer les attributs communs
                        if (BaseComponent.observedAttributes.includes(attrName)) {
                            const value = this._parseAttributeValue(this.getAttribute(attrName));
                            this.setParticle(attrName, value);
                        }
                    }
                });
            });

            this._observer.observe(this, {
                attributes: true,
                attributeFilter: BaseComponent.observedAttributes.concat(
                    Array.from(this.attributes)
                        .map(attr => attr.name)
                        .filter(name => name.startsWith('data-particle-'))
                )
            });
        }
    }

    /**
     * 🔍 PARSER INTELLIGENT DE VALEURS
     */
    _parseAttributeValue(value) {
        if (!value) return null;
        
        // Nombre
        if (!isNaN(value) && value.trim() !== '') {
            return Number(value);
        }
        
        // Booléen
        if (value === 'true') return true;
        if (value === 'false') return false;
        
        // JSON
        if (value.startsWith('{') || value.startsWith('[')) {
            try {
                return JSON.parse(value);
            } catch (e) {
                // Retourner comme string si parse échoue
            }
        }
        
        return value;
    }

    /**
     * 🎯 APPLICATION CONFIG INITIALE
     */
    _applyInitialConfig() {
        // Appliquer la configuration commune
        Object.entries(this.commonConfig).forEach(([key, value]) => {
            if (value !== undefined) {
                this.setParticle(key, value);
            }
        });
    }

    /**
     * 📊 CHANGEMENT D'ATTRIBUTS (Web Components standard)
     */
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            const value = this._parseAttributeValue(newValue);
            this.setParticle(name, value);
        }
    }

    /**
     * 🧹 NETTOYAGE
     */
    disconnectedCallback() {
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
        
        // Nettoyer les caches
        this._particleCache.clear();
        this._particleValues.clear();
        
        // Retirer de la registry
        if (BaseComponent.instances) {
            BaseComponent.instances.delete(this.commonConfig.id);
        }
    }

    /**
     * 📊 MÉTRIQUES DE PERFORMANCE
     */
    getParticleMetrics() {
        return {
            particleCount: this._particleValues.size,
            cacheSize: this._particleCache.size,
            sharedParticlesLoaded: this._sharedParticles.size,
            useModernParticles: this.useModernParticles,
            batchUpdates: this.batchUpdates
        };
    }
}

export default BaseComponent;
