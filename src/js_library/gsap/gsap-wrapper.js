/**
 * 🎬 GSAP WRAPPER
 * High-performance animation library integration with advanced features
 */

class GSAPWrapper {
    constructor() {
        this.animations = new Map();
        this.timelines = new Map();
        this.initialized = false;
        this.plugins = new Set();
        
        // Don't initialize immediately, wait for GSAP to be loaded
        this.checkAndInit();
    }checkAndInit() {
        if (typeof gsap !== 'undefined') {
            this.init();
        } else {
            // Check periodically for GSAP
            let attempts = 0;
            const checkInterval = setInterval(() => {
                attempts++;
                if (typeof gsap !== 'undefined') {
                    clearInterval(checkInterval);
                    this.init();
                } else if (attempts > 50) { // 5 seconds max
                    clearInterval(checkInterval);
                    console.warn('🎬 GSAP not found after 5 seconds. Wrapper not initialized.');
                }
            }, 100);
        }
    }    init() {
        if (typeof gsap === 'undefined') {
            console.warn('GSAP not loaded. Please load GSAP first.');
            return;
        }

        this.initialized = true;
        this.detectPlugins();
        this.setupSquirrelIntegration();
        console.log(`🎬 GSAP Wrapper initialized with GSAP ${gsap.version}`);
        console.log(`🔌 Available plugins: ${Array.from(this.plugins).join(', ')}`);
    }

    /**
     * Detect available GSAP plugins
     */
    detectPlugins() {
        const pluginChecks = [
            { name: 'ScrollTrigger', check: () => typeof ScrollTrigger !== 'undefined' },
            { name: 'TextPlugin', check: () => typeof TextPlugin !== 'undefined' },
            { name: 'ScrollToPlugin', check: () => typeof ScrollToPlugin !== 'undefined' },
            { name: 'MotionPathPlugin', check: () => typeof MotionPathPlugin !== 'undefined' },
            { name: 'CustomEase', check: () => typeof CustomEase !== 'undefined' },
            { name: 'Draggable', check: () => typeof Draggable !== 'undefined' },
            { name: 'DrawSVGPlugin', check: () => typeof DrawSVGPlugin !== 'undefined' },
            { name: 'MorphSVGPlugin', check: () => typeof MorphSVGPlugin !== 'undefined' },
            { name: 'SplitText', check: () => typeof SplitText !== 'undefined' },
            { name: 'InertiaPlugin', check: () => typeof InertiaPlugin !== 'undefined' },
            { name: 'Observer', check: () => typeof Observer !== 'undefined' }
        ];

        pluginChecks.forEach(plugin => {
            if (plugin.check()) {
                this.plugins.add(plugin.name);
                // Auto-register plugins that need registration
                if (plugin.name === 'ScrollTrigger' && typeof gsap.registerPlugin === 'function') {
                    gsap.registerPlugin(ScrollTrigger);
                }
                if (plugin.name === 'TextPlugin' && typeof gsap.registerPlugin === 'function') {
                    gsap.registerPlugin(TextPlugin);
                }
                if (plugin.name === 'ScrollToPlugin' && typeof gsap.registerPlugin === 'function') {
                    gsap.registerPlugin(ScrollToPlugin);
                }
                if (plugin.name === 'MotionPathPlugin' && typeof gsap.registerPlugin === 'function') {
                    gsap.registerPlugin(MotionPathPlugin);
                }
                if (plugin.name === 'CustomEase' && typeof gsap.registerPlugin === 'function') {
                    gsap.registerPlugin(CustomEase);
                }
                if (plugin.name === 'Draggable' && typeof gsap.registerPlugin === 'function') {
                    gsap.registerPlugin(Draggable);
                }
            }
        });
    }

    /**
     * Setup Squirrel framework integration
     */
    setupSquirrelIntegration() {
        // Add GSAP methods to Squirrel's $ function
        if (typeof $ !== 'undefined') {
            $.animate = this.animate.bind(this);
            $.timeline = this.createTimeline.bind(this);
            $.killAnimation = this.kill.bind(this);
        }

        // Add methods to A class instances
        if (typeof A !== 'undefined') {
            A.prototype.animate = function(vars, duration) {
                return gsapWrapper.animate(this.html_object, vars, duration);
            };

            A.prototype.fadeIn = function(duration = 0.3) {
                return gsapWrapper.fadeIn(this.html_object, duration);
            };

            A.prototype.fadeOut = function(duration = 0.3) {
                return gsapWrapper.fadeOut(this.html_object, duration);
            };

            A.prototype.slideIn = function(direction = 'left', duration = 0.5) {
                return gsapWrapper.slideIn(this.html_object, direction, duration);
            };

            A.prototype.slideOut = function(direction = 'left', duration = 0.5) {
                return gsapWrapper.slideOut(this.html_object, direction, duration);
            };
        }
    }

    /**
     * Animate an element
     */
    animate(element, vars, duration = 1) {
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }

        const animationId = `anim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const tween = gsap.to(element, {
            duration: duration,
            ...vars,
            onComplete: () => {
                this.animations.delete(animationId);
            }
        });

        this.animations.set(animationId, tween);
        return tween;
    }

    /**
     * Create animation timeline
     */
    createTimeline(vars = {}) {
        const timelineId = `timeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const timeline = gsap.timeline(vars);
        
        this.timelines.set(timelineId, timeline);
        return timeline;
    }

    /**
     * Fade in animation
     */
    fadeIn(element, duration = 0.3) {
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }

        gsap.set(element, { opacity: 0 });
        return this.animate(element, { opacity: 1 }, duration);
    }

    /**
     * Fade out animation
     */
    fadeOut(element, duration = 0.3) {
        return this.animate(element, { opacity: 0 }, duration);
    }

    /**
     * Slide in animation
     */
    slideIn(element, direction = 'left', duration = 0.5) {
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }

        const startProps = {};
        const endProps = {};

        switch (direction) {
            case 'left':
                startProps.x = -100;
                endProps.x = 0;
                break;
            case 'right':
                startProps.x = 100;
                endProps.x = 0;
                break;
            case 'top':
                startProps.y = -100;
                endProps.y = 0;
                break;
            case 'bottom':
                startProps.y = 100;
                endProps.y = 0;
                break;
        }

        gsap.set(element, { ...startProps, opacity: 0 });
        return this.animate(element, { ...endProps, opacity: 1 }, duration);
    }

    /**
     * Slide out animation
     */
    slideOut(element, direction = 'left', duration = 0.5) {
        const endProps = { opacity: 0 };

        switch (direction) {
            case 'left':
                endProps.x = -100;
                break;
            case 'right':
                endProps.x = 100;
                break;
            case 'top':
                endProps.y = -100;
                break;
            case 'bottom':
                endProps.y = 100;
                break;
        }

        return this.animate(element, endProps, duration);
    }

    /**
     * Scale animation
     */
    scale(element, scale = 1.2, duration = 0.3) {
        return this.animate(element, { scale }, duration);
    }

    /**
     * Rotation animation
     */
    rotate(element, rotation = 360, duration = 1) {
        return this.animate(element, { rotation }, duration);
    }

    /**
     * Bounce effect
     */
    bounce(element, intensity = 1.2, duration = 0.6) {
        return this.animate(element, {
            scale: intensity,
            duration: duration / 2,
            yoyo: true,
            repeat: 1,
            ease: "power2.out"
        });
    }

    /**
     * Shake effect
     */
    shake(element, intensity = 10, duration = 0.5) {
        const timeline = this.createTimeline();
        
        timeline
            .to(element, { duration: 0.1, x: intensity })
            .to(element, { duration: 0.1, x: -intensity })
            .to(element, { duration: 0.1, x: intensity })
            .to(element, { duration: 0.1, x: -intensity })
            .to(element, { duration: 0.1, x: 0 });

        return timeline;
    }

    /**
     * Kill specific animation
     */
    kill(animationId) {
        if (this.animations.has(animationId)) {
            this.animations.get(animationId).kill();
            this.animations.delete(animationId);
        }
    }

    /**
     * Kill all animations
     */
    killAll() {
        gsap.killTweensOf("*");
        this.animations.clear();
        this.timelines.clear();
    }    /**
     * Get animation info
     */
    getAnimationInfo() {
        return {
            activeAnimations: this.animations.size,
            activeTimelines: this.timelines.size,
            gsapVersion: gsap.version,
            availablePlugins: Array.from(this.plugins)
        };
    }

    /**
     * Advanced animation methods
     */

    /**
     * Stagger animation
     */
    stagger(elements, vars, staggerAmount = 0.1) {
        return gsap.to(elements, {
            ...vars,
            stagger: staggerAmount
        });
    }

    /**
     * Morphing animation (if MorphSVG is available)
     */
    morph(element, target, duration = 1) {
        if (this.plugins.has('MorphSVGPlugin')) {
            return gsap.to(element, {
                duration,
                morphSVG: target
            });
        } else {
            console.warn('MorphSVG plugin not available');
            return null;
        }
    }

    /**
     * Text animation (if TextPlugin is available)
     */
    animateText(element, newText, duration = 2) {
        if (this.plugins.has('TextPlugin')) {
            return gsap.to(element, {
                duration,
                text: newText,
                ease: "none"
            });
        } else {
            // Fallback to manual text animation
            return this.typewriterEffect(element, newText, duration);
        }
    }

    /**
     * Typewriter effect fallback
     */
    typewriterEffect(element, text, duration = 2) {
        const chars = text.split('');
        const timeline = this.createTimeline();
        
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }
        
        element.textContent = '';
        
        chars.forEach((char, i) => {
            timeline.call(() => {
                element.textContent += char;
            }, [], i * (duration / chars.length));
        });
        
        return timeline;
    }

    /**
     * Split text animation (if SplitText is available)
     */
    splitTextAnimation(element, animationType = 'chars', vars = {}) {
        if (this.plugins.has('SplitText')) {
            const split = new SplitText(element, { type: animationType });
            return gsap.from(split[animationType], {
                duration: 1,
                opacity: 0,
                y: 50,
                stagger: 0.1,
                ...vars
            });
        } else {
            console.warn('SplitText plugin not available');
            return this.animate(element, vars);
        }
    }

    /**
     * Scroll-based animation (if ScrollTrigger is available)
     */
    scrollAnimation(element, vars, triggerOptions = {}) {
        if (this.plugins.has('ScrollTrigger')) {
            return gsap.to(element, {
                ...vars,
                scrollTrigger: {
                    trigger: element,
                    start: "top 80%",
                    end: "bottom 20%",
                    ...triggerOptions
                }
            });
        } else {
            console.warn('ScrollTrigger plugin not available');
            return this.animate(element, vars);
        }
    }

    /**
     * Motion path animation (if MotionPathPlugin is available)
     */
    motionPath(element, path, duration = 3, vars = {}) {
        if (this.plugins.has('MotionPathPlugin')) {
            return gsap.to(element, {
                duration,
                motionPath: {
                    path: path,
                    autoRotate: true,
                    ...vars
                }
            });
        } else {
            console.warn('MotionPath plugin not available');
            return null;
        }
    }

    /**
     * Make element draggable (if Draggable is available)
     */
    makeDraggable(element, options = {}) {
        if (this.plugins.has('Draggable')) {
            return Draggable.create(element, {
                type: "x,y",
                edgeResistance: 0.65,
                bounds: "body",
                ...options
            });
        } else {
            console.warn('Draggable plugin not available');
            return null;
        }
    }

    /**
     * Custom ease animation (if CustomEase is available)
     */
    customEase(element, vars, easePath, duration = 1) {
        if (this.plugins.has('CustomEase')) {
            const customEaseName = `custom_${Date.now()}`;
            CustomEase.create(customEaseName, easePath);
            return this.animate(element, {
                ...vars,
                duration,
                ease: customEaseName
            });
        } else {
            console.warn('CustomEase plugin not available');
            return this.animate(element, vars, duration);
        }
    }

    /**
     * Color animation with utility functions
     */
    colorAnimation(element, colors, duration = 2) {
        if (Array.isArray(colors)) {
            return gsap.to(element, {
                duration,
                backgroundColor: gsap.utils.wrap(colors),
                repeat: -1,
                yoyo: true
            });
        } else {
            return this.animate(element, { backgroundColor: colors }, duration);
        }
    }

    /**
     * Physics-based animations
     */
    physics(element, options = {}) {
        const { gravity = 980, bounce = 0.7, friction = 0.95 } = options;
        
        // Simple physics simulation
        let velocityY = options.velocityY || 0;
        let velocityX = options.velocityX || 0;
        let y = gsap.getProperty(element, "y") || 0;
        let x = gsap.getProperty(element, "x") || 0;
        
        const timeline = this.createTimeline({ repeat: -1 });
        
        timeline.to(element, {
            duration: 0.016, // ~60fps
            repeat: -1,
            ease: "none",
            onUpdate: () => {
                velocityY += gravity * 0.016;
                y += velocityY * 0.016;
                x += velocityX * 0.016;
                
                // Bounce off bottom
                if (y > window.innerHeight - 50) {
                    y = window.innerHeight - 50;
                    velocityY *= -bounce;
                }
                
                // Apply friction
                velocityX *= friction;
                
                gsap.set(element, { x, y });
            }
        });
        
        return timeline;
    }

    /**
     * Particle system animation
     */
    particles(container, count = 50, options = {}) {
        const particles = [];
        const containerEl = typeof container === 'string' ? 
            document.querySelector(container) : container;
        
        for (let i = 0; i < count; i++) {
            const particle = document.createElement('div');
            particle.style.cssText = `
                position: absolute;
                width: ${options.size || 4}px;
                height: ${options.size || 4}px;
                background: ${options.color || '#ffffff'};
                border-radius: 50%;
                pointer-events: none;
            `;
            
            containerEl.appendChild(particle);
            particles.push(particle);
            
            // Animate particle
            gsap.set(particle, {
                x: Math.random() * containerEl.offsetWidth,
                y: Math.random() * containerEl.offsetHeight
            });
            
            gsap.to(particle, {
                duration: options.duration || 5 + Math.random() * 5,
                x: Math.random() * containerEl.offsetWidth,
                y: Math.random() * containerEl.offsetHeight,
                opacity: 0,
                scale: 0,
                ease: "power2.out",
                repeat: -1,
                yoyo: true
            });
        }
        
        return particles;
    }

    /**
     * Utility methods
     */

    /**
     * Get GSAP utilities
     */
    get utils() {
        return gsap.utils;
    }

    /**
     * Check if plugin is available
     */
    hasPlugin(pluginName) {
        return this.plugins.has(pluginName);
    }

    /**
     * Batch animation
     */
    batch(elements, vars, stagger = 0.1) {
        return gsap.to(elements, {
            ...vars,
            stagger: stagger
        });
    }

    /**
     * Quick set properties
     */
    set(element, vars) {
        return gsap.set(element, vars);
    }

    /**
     * From animation (animate from specified values to current)
     */
    from(element, vars, duration = 1) {
        return gsap.from(element, {
            duration,
            ...vars
        });
    }

    /**
     * FromTo animation (animate from specified values to specified values)
     */
    fromTo(element, fromVars, toVars, duration = 1) {
        return gsap.fromTo(element, fromVars, {
            duration,
            ...toVars
        });
    }
}

// Create wrapper instance
const gsapWrapper = new GSAPWrapper();

// Export for ES6 modules
export default gsapWrapper;

// Global access
window.gsapWrapper = gsapWrapper;
