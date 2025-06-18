/**
 * 🎬 ANIMATION OPTIMIZER V2.0 - SYSTÈME AVANCÉ D'OPTIMISATION
 * Gestion intelligente des animations avec performance et qualité optimales
 */

class AnimationOptimizer {
    constructor() {
        this.activeAnimations = new Map();
        this.animationQueue = [];
        this.performanceMode = 'adaptive'; // 'high-performance', 'high-quality', 'adaptive'
        this.deviceCapabilities = this.detectDeviceCapabilities();
        
        // Configuration adaptative
        this.config = {
            maxConcurrentAnimations: this.deviceCapabilities.maxAnimations,
            preferredFrameRate: this.deviceCapabilities.preferredFPS,
            enableHardwareAcceleration: this.deviceCapabilities.hasGPU,
            enableMotionReduce: this.respectsMotionPreferences(),
            smartBatching: true,
            adaptiveQuality: true
        };
        
        // Métriques d'animation
        this.metrics = {
            totalAnimations: 0,
            droppedFrames: 0,
            avgFrameTime: 0,
            gpuMemoryUsage: 0,
            energyEfficiency: 0
        };
        
        // Pool d'objets pour réutilisation
        this.objectPool = {
            transforms: [],
            transitions: [],
            keyframes: []
        };
        
        this.initializeOptimizer();
    }

    initializeOptimizer() {
        this.setupIntersectionObserver();
        this.setupAdaptiveQuality();
        this.precompileShaders();
        
        // console.log('🎬 Animation Optimizer V2.0 initialized');
        // console.log('📊 Device capabilities:', this.deviceCapabilities);
    }

    /**
     * 🔍 DÉTECTION DES CAPACITÉS DE L'APPAREIL
     */
    detectDeviceCapabilities() {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        
        return {
            hasGPU: !!gl,
            maxTextureSize: gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 2048,
            maxAnimations: this.estimateMaxConcurrentAnimations(),
            preferredFPS: this.detectPreferredFrameRate(),
            memoryLimit: this.estimateMemoryLimit(),
            supportsCSSTransforms3D: this.supportsCSS3DTransforms(),
            supportsWebAnimations: 'animate' in document.createElement('div'),
            supportsIntersectionObserver: 'IntersectionObserver' in window,
            devicePixelRatio: window.devicePixelRatio || 1,
            isMobile: /Mobi|Android/i.test(navigator.userAgent),
            isLowEndDevice: this.detectLowEndDevice()
        };
    }

    estimateMaxConcurrentAnimations() {
        const baseLimit = 20;
        const memoryFactor = (navigator.deviceMemory || 4) / 4; // Assume 4GB baseline
        const coreFactor = (navigator.hardwareConcurrency || 4) / 4; // Assume 4 cores baseline
        
        return Math.floor(baseLimit * Math.min(memoryFactor, coreFactor, 2));
    }

    detectPreferredFrameRate() {
        // Détecter le taux de rafraîchissement optimal
        if (screen.refreshRate) return screen.refreshRate;
        if (this.deviceCapabilities?.isLowEndDevice) return 30;
        return 60;
    }

    estimateMemoryLimit() {
        // Estimer la limite mémoire basée sur les capacités du dispositif
        const deviceMemory = navigator.deviceMemory || 4; // GB
        const reservedMemory = 1; // Réserver 1GB pour le système
        
        return Math.max(1, (deviceMemory - reservedMemory) * 1024); // Retourner en MB
    }

    detectLowEndDevice() {
        const memoryLimit = navigator.deviceMemory || 4;
        const coreCount = navigator.hardwareConcurrency || 4;
        
        return memoryLimit <= 2 || coreCount <= 2;
    }

    supportsCSS3DTransforms() {
        // Tester le support des transformations 3D CSS
        const testElement = document.createElement('div');
        const transforms = [
            'perspective(1px)',
            'translate3d(0,0,0)',
            'translateZ(0)'
        ];
        
        return transforms.some(transform => {
            testElement.style.transform = transform;
            return testElement.style.transform !== '';
        });
    }

    respectsMotionPreferences() {
        // Vérifier les préférences d'accessibilité pour le mouvement
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        return mediaQuery && mediaQuery.matches;
    }

    setupAdaptiveQuality() {
        // Configuration de qualité adaptative
        // console.log('📱 Adaptive quality setup complete');
    }

    precompileShaders() {
        // Pré-compilation des shaders (placeholder)
        // console.log('🎨 Shaders precompiled');
    }

    generateAnimationId() {
        // Générer un ID unique pour l'animation
        return 'anim_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    processQueue() {
        // Traiter la queue d'animations (placeholder)
        // console.log('🔄 Processing animation queue');
    }

    generateOptimizationRecommendations() {
        const recommendations = [];
        
        if (this.metrics.droppedFrames / this.metrics.totalAnimations > 0.1) {
            recommendations.push('Consider reducing animation complexity or duration');
        }
        
        if (this.activeAnimations.size > this.config.maxConcurrentAnimations * 0.8) {
            recommendations.push('Implement animation queuing to prevent performance issues');
        }
        
        if (!this.config.enableHardwareAcceleration && this.deviceCapabilities.hasGPU) {
            recommendations.push('Enable hardware acceleration for better performance');
        }
        
        return recommendations;
    }

    /**
     * 🎯 ANIMATION INTELLIGENTE AVEC OPTIMISATIONS
     */
    animate(element, keyframes, options = {}) {
        const optimizedOptions = this.optimizeAnimationOptions(options);
        const animationId = this.generateAnimationId();
        
        // Vérifier si l'élément est visible
        if (!this.isElementVisible(element) && !options.forceRun) {
            return this.queueAnimation(element, keyframes, optimizedOptions);
        }
        
        // Limiter les animations simultanées
        if (this.activeAnimations.size >= this.config.maxConcurrentAnimations) {
            return this.queueAnimation(element, keyframes, optimizedOptions);
        }
        
        // Choisir la meilleure méthode d'animation
        const animationMethod = this.chooseBestAnimationMethod(element, keyframes, optimizedOptions);
        
        // Exécuter l'animation
        return this.executeAnimation(animationId, element, keyframes, optimizedOptions, animationMethod);
    }

    optimizeAnimationOptions(options) {
        const optimized = { ...options };
        
        // Adapter la durée selon les performances
        if (this.deviceCapabilities.isLowEndDevice) {
            optimized.duration = (optimized.duration || 300) * 0.7; // Réduire de 30%
        }
        
        // Adapter l'easing selon les capacités
        if (!this.deviceCapabilities.hasGPU && optimized.easing?.includes('cubic-bezier')) {
            optimized.easing = 'ease-out'; // Fallback plus simple
        }
        
        // Activer l'accélération matérielle si disponible
        if (this.config.enableHardwareAcceleration) {
            optimized.willChange = this.determineWillChangeProperty(options);
        }
        
        // Adapter selon les préférences d'accessibilité
        if (this.config.enableMotionReduce && this.respectsMotionPreferences()) {
            optimized.duration = Math.min(optimized.duration || 300, 200);
            optimized.iterations = 1;
        }
        
        return optimized;
    }

    chooseBestAnimationMethod(element, keyframes, options) {
        // Prioriser selon les capacités et le type d'animation
        const properties = Object.keys(keyframes[0] || {});
        
        // CSS Transforms pour les transformations (le plus performant)
        if (this.isTransformOnlyAnimation(properties)) {
            return 'css-transform';
        }
        
        // Web Animations API pour les animations complexes
        if (this.deviceCapabilities.supportsWebAnimations && !this.deviceCapabilities.isLowEndDevice) {
            return 'web-animations';
        }
        
        // CSS Transitions pour les animations simples
        if (properties.length <= 2) {
            return 'css-transition';
        }
        
        // Fallback vers requestAnimationFrame
        return 'raf';
    }

    executeAnimation(id, element, keyframes, options, method) {
        let animation;
        
        switch (method) {
            case 'css-transform':
                animation = this.executeCSSTr
nsformAnimation(element, keyframes, options);
                break;
            case 'web-animations':
                animation = this.executeWebAnimation(element, keyframes, options);
                break;
            case 'css-transition':
                animation = this.executeCSSTransition(element, keyframes, options);
                break;
            case 'raf':
                animation = this.executeRAFAnimation(element, keyframes, options);
                break;
        }
        
        // Enregistrer l'animation active
        this.activeAnimations.set(id, {
            element,
            animation,
            method,
            startTime: performance.now(),
            options
        });
        
        // Nettoyer à la fin
        animation.addEventListener('finish', () => {
            this.cleanupAnimation(id);
            this.processQueue();
        });
        
        return animation;
    }

    /**
     * 🔄 MÉTHODES D'ANIMATION OPTIMISÉES
     */
    executeCSSTr
nsformAnimation(element, keyframes, options) {
        // Optimisation pour les transforms (GPU-accéléré)
        const transformKeyframes = this.convertToTransformKeyframes(keyframes);
        
        // Pré-appliquer will-change
        element.style.willChange = 'transform';
        
        const animation = element.animate(transformKeyframes, {
            duration: options.duration || 300,
            easing: options.easing || 'ease-out',
            fill: options.fill || 'forwards'
        });
        
        // Nettoyer will-change après l'animation
        animation.addEventListener('finish', () => {
            element.style.willChange = 'auto';
        });
        
        return animation;
    }

    executeWebAnimation(element, keyframes, options) {
        // Utiliser l'API Web Animations native
        return element.animate(keyframes, {
            duration: options.duration || 300,
            easing: options.easing || 'ease-out',
            fill: options.fill || 'forwards',
            iterations: options.iterations || 1
        });
    }

    executeCSSTransition(element, keyframes, options) {
        // Optimisation pour les transitions CSS simples
        const endState = keyframes[keyframes.length - 1];
        
        element.style.transition = this.buildOptimalTransition(endState, options);
        
        // Appliquer l'état final
        Object.assign(element.style, endState);
        
        // Créer un objet animation-like pour la compatibilité
        const mockAnimation = this.createMockAnimation(element, options);
        
        return mockAnimation;
    }

    executeRAFAnimation(element, keyframes, options) {
        // Animation personnalisée avec requestAnimationFrame
        const duration = options.duration || 300;
        const easing = this.getEasingFunction(options.easing || 'ease-out');
        const startTime = performance.now();
        const startState = keyframes[0];
        const endState = keyframes[keyframes.length - 1];
        
        const mockAnimation = this.createMockAnimation(element, options);
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easing(progress);
            
            // Interpoler entre les états
            this.interpolateStates(element, startState, endState, easedProgress);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                mockAnimation.dispatchEvent(new Event('finish'));
            }
        };
        
        requestAnimationFrame(animate);
        return mockAnimation;
    }

    /**
     * 🎨 OPTIMISATIONS VISUELLES AVANCÉES
     */
    enableMotionBlur(element, animation) {
        if (!this.deviceCapabilities.hasGPU) return;
        
        // Ajouter un flou de mouvement pour les animations rapides
        element.style.filter = 'blur(0.5px)';
        
        animation.addEventListener('finish', () => {
            element.style.filter = '';
        });
    }

    enableBatchedAnimations(animations) {
        // Grouper les animations pour optimiser les reflows
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                const promises = animations.map(anim => this.animate(anim.element, anim.keyframes, anim.options));
                Promise.all(promises).then(resolve);
            });
        });
    }

    enableStaggeredAnimations(elements, keyframes, options, stagger = 100) {
        // Animer en série avec décalage optimisé
        const animations = [];
        
        elements.forEach((element, index) => {
            setTimeout(() => {
                const animation = this.animate(element, keyframes, options);
                animations.push(animation);
            }, index * stagger);
        });
        
        return animations;
    }

    /**
     * 🔧 UTILITAIRES D'OPTIMISATION
     */
    isElementVisible(element) {
        const rect = element.getBoundingClientRect();
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };
        
        return !(rect.bottom < 0 || rect.top > viewport.height ||
                rect.right < 0 || rect.left > viewport.width);
    }

    setupIntersectionObserver() {
        if (!this.deviceCapabilities.supportsIntersectionObserver) return;
        
        this.visibilityObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.processQueueForElement(entry.target);
                }
            });
        }, {
            rootMargin: '50px'
        });
    }

    convertToTransformKeyframes(keyframes) {
        return keyframes.map(frame => {
            const transformFrame = {};
            
            // Convertir les propriétés en transforms quand possible
            if (frame.x !== undefined || frame.y !== undefined) {
                const x = frame.x || 0;
                const y = frame.y || 0;
                transformFrame.transform = `translate3d(${x}px, ${y}px, 0)`;
            }
            
            if (frame.scale !== undefined) {
                const currentTransform = transformFrame.transform || '';
                transformFrame.transform = `${currentTransform} scale(${frame.scale})`;
            }
            
            if (frame.rotate !== undefined) {
                const currentTransform = transformFrame.transform || '';
                transformFrame.transform = `${currentTransform} rotate(${frame.rotate}deg)`;
            }
            
            // Garder les autres propriétés
            Object.keys(frame).forEach(key => {
                if (!['x', 'y', 'scale', 'rotate'].includes(key)) {
                    transformFrame[key] = frame[key];
                }
            });
            
            return transformFrame;
        });
    }

    getEasingFunction(easing) {
        const easingFunctions = {
            'linear': t => t,
            'ease-in': t => t * t,
            'ease-out': t => t * (2 - t),
            'ease-in-out': t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
        };
        
        return easingFunctions[easing] || easingFunctions['ease-out'];
    }

    /**
     * 📈 API PUBLIQUE AVANCÉE
     */
    getPerformanceReport() {
        return {
            metrics: this.metrics,
            activeAnimations: this.activeAnimations.size,
            queuedAnimations: this.animationQueue.length,
            deviceCapabilities: this.deviceCapabilities,
            configuration: this.config,
            recommendations: this.generateOptimizationRecommendations()
        };
    }

    generateOptimizationRecommendations() {
        const recommendations = [];
        
        if (this.metrics.droppedFrames / this.metrics.totalAnimations > 0.1) {
            recommendations.push('Consider reducing animation complexity or duration');
        }
        
        if (this.activeAnimations.size > this.config.maxConcurrentAnimations * 0.8) {
            recommendations.push('Implement animation queuing to prevent performance issues');
        }
        
        if (!this.config.enableHardwareAcceleration && this.deviceCapabilities.hasGPU) {
            recommendations.push('Enable hardware acceleration for better performance');
        }
        
        return recommendations;
    }

    /**
     * 🧹 NETTOYAGE ET GESTION MÉMOIRE
     */
    cleanupAnimation(id) {
        const animation = this.activeAnimations.get(id);
        if (animation) {
            // Nettoyer will-change
            if (animation.element.style.willChange !== 'auto') {
                animation.element.style.willChange = 'auto';
            }
            
            // Retourner les objets au pool
            this.returnToPool(animation);
            
            this.activeAnimations.delete(id);
        }
    }

    destroy() {
        // Arrêter toutes les animations actives
        this.activeAnimations.forEach((animation, id) => {
            animation.animation.cancel?.();
            this.cleanupAnimation(id);
        });
        
        // Nettoyer les observers
        this.visibilityObserver?.disconnect();
        
        // Vider les queues
        this.animationQueue = [];
        
        // console.log('🎬 Animation Optimizer destroyed');
    }

    getMetrics() {
        // Retourner les métriques d'animation
        return this.metrics;
    }

    getPerformanceReport() {
        // Retourner un rapport de performance complet
        return {
            metrics: this.metrics,
            activeAnimations: this.activeAnimations.size,
            queuedAnimations: this.animationQueue.length,
            deviceCapabilities: this.deviceCapabilities,
            configuration: this.config,
            recommendations: this.generateOptimizationRecommendations()
        };
    }
}

// Instance globale
const animationOptimizer = new AnimationOptimizer();

// Export pour ES6
export default animationOptimizer;

// Compatibilité globale
window.animationOptimizer = animationOptimizer;
