/**
 * 🎚️ SLIDER COMPONENT - PARAMÉTRIQUE ET RÉUTILISABLE
 * Compatible avec le framework A
 */

class Slider {
    constructor(config = {}) {
        // Configuration par défaut
        this.config = {
            attach: 'body',
            id: `slider_${Date.now()}`,
            orientation: 'horizontal', // 'horizontal' | 'vertical'
            x: 50,
            y: 100,
            width: 400,
            height: 120,
            trackWidth: 360,
            trackHeight: 6,
            thumbSize: 24,
            value: 30,
            min: 0,
            max: 100,
            step: 1,
            theme: 'material', // 'material' | 'flat' | 'custom'
            colors: {
                container: '#ffffff',
                track: '#e3f2fd',
                progress: '#2196f3',
                thumb: '#2196f3',
                text: '#424242'
            },
            variation: null, // Tableau de couleurs pour interpolation dynamique
            animations: {
                enabled: true,
                duration: 0.2,
                easing: 'cubic-bezier(0.4, 0.0, 0.2, 1)'
            },
            callbacks: {
                onChange: null,
                onStart: null,
                onEnd: null
            },
            ...config
        };

        this.isDragging = false;
        this.currentValue = this.config.value;
        this.elements = {};
        
        this._init();
    }

    _init() {
        this._createContainer();
        this._createTrack();
        this._createProgress();
        this._createThumb();
        this._attachEvents();
        this._applyStyles();
        this.setValue(this.config.value);
    }

    _createContainer() {
        const isVertical = this.config.orientation === 'vertical';
        
        this.elements.container = new A({
            attach: this.config.attach,
            id: this.config.id + '_container',
            markup: 'div',
            role: 'slider-container',
            x: this.config.x,
            y: this.config.y,
            width: isVertical ? this.config.height : this.config.width,
            height: isVertical ? this.config.width : this.config.height,
            backgroundColor: this.config.colors.container,
            smooth: 12,
            padding: 15,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)',
            border: '1px solid rgba(0,0,0,0.04)',
            overflow: 'visible'
        });
    }

    _createTrack() {
        const isVertical = this.config.orientation === 'vertical';
        
        this.elements.track = new A({
            attach: `#${this.config.id}_container`,
            id: this.config.id + '_track',
            markup: 'div',
            x: isVertical ? (this.config.height - this.config.trackHeight) / 2 : 0,
            y: isVertical ? 0 : (this.config.height - this.config.trackHeight) / 2 - 15,
            width: isVertical ? this.config.trackHeight : this.config.trackWidth,
            height: isVertical ? this.config.trackWidth : this.config.trackHeight,
            backgroundColor: this.config.colors.track,
            smooth: 3,
            position: 'relative',
            cursor: 'pointer'
        });
    }

    _createProgress() {
        const isVertical = this.config.orientation === 'vertical';
        const initialSize = (this.currentValue / (this.config.max - this.config.min)) * 
                           (isVertical ? this.config.trackWidth : this.config.trackWidth);
        
        this.elements.progress = new A({
            attach: `#${this.config.id}_track`,
            id: this.config.id + '_progress',
            markup: 'div',
            x: 0,
            y: isVertical ? this.config.trackWidth - initialSize : 0,
            width: isVertical ? this.config.trackHeight : initialSize,
            height: isVertical ? initialSize : this.config.trackHeight,
            backgroundColor: this.config.colors.progress,
            smooth: 3,
            position: 'absolute',
            transition: this.config.animations.enabled ? 
                       `${isVertical ? 'height' : 'width'} ${this.config.animations.duration}s ${this.config.animations.easing}` : 'none',
            boxShadow: '0 2px 4px rgba(33, 150, 243, 0.3)'
        });
    }

    _createThumb() {
        const isVertical = this.config.orientation === 'vertical';
        const trackSize = isVertical ? this.config.trackWidth : this.config.trackWidth;
        const initialPosition = (this.currentValue / (this.config.max - this.config.min)) * trackSize - this.config.thumbSize / 2;
        
        this.elements.thumb = new A({
            attach: `#${this.config.id}_track`,
            id: this.config.id + '_thumb',
            markup: 'div',
            x: isVertical ? (this.config.trackHeight - this.config.thumbSize) / 2 : initialPosition,
            y: isVertical ? this.config.trackWidth - initialPosition - this.config.thumbSize : 
               (this.config.trackHeight - this.config.thumbSize) / 2,
            width: this.config.thumbSize,
            height: this.config.thumbSize,
            backgroundColor: this.config.colors.thumb,
            smooth: '50%',
            position: 'absolute',
            cursor: 'pointer',
            transition: this.config.animations.enabled ? 
                       `transform ${this.config.animations.duration}s ${this.config.animations.easing}, box-shadow ${this.config.animations.duration}s ${this.config.animations.easing}` : 'none',
            boxShadow: '0 4px 12px rgba(33, 150, 243, 0.4)',
            border: '3px solid #ffffff'
        });
    }

    _applyStyles() {
        // Appliquer le thème
        this._applyTheme();

        // Ajouter les styles CSS pour les animations
        if (!document.getElementById('slider-animations')) {
            const style = document.createElement('style');
            style.id = 'slider-animations';
            style.textContent = `
                @keyframes ripple {
                    to {
                        transform: translate(-50%, -50%) scale(4);
                        opacity: 0;
                    }
                }
                
                .slider-thumb:focus {
                    outline: 2px solid #2196f3;
                    outline-offset: 2px;
                }
            `;
            document.head.appendChild(style);
        }
    }

    _updateVariationColors(percentage) {
        if (!this.config.variation || !Array.isArray(this.config.variation)) {
            // Couleur dynamique par défaut (rouge vers vert)
            const hue = percentage * 120; // 0 (rouge) à 120 (vert)
            const color = `hsl(${hue}, 70%, 50%)`;
            this.elements.progress.html_object.style.backgroundColor = color;
            this.elements.thumb.html_object.style.backgroundColor = color;
            this.elements.thumb.html_object.style.boxShadow = `0 4px 12px hsla(${hue}, 70%, 50%, 0.4)`;
            return;
        }

        // Interpolation entre les couleurs du tableau variation
        const colors = this.config.variation;
        if (colors.length === 0) return;

        // Si on a qu'une couleur, l'utiliser
        if (colors.length === 1) {
            const color = colors[0].color;
            this.elements.progress.html_object.style.backgroundColor = color;
            this.elements.thumb.html_object.style.backgroundColor = color;
            return;
        }

        // Trouver les deux couleurs entre lesquelles interpoler
        let color1 = colors[0];
        let color2 = colors[colors.length - 1];
        
        for (let i = 0; i < colors.length - 1; i++) {
            const currentPos = this._parsePosition(colors[i].position) / 100;
            const nextPos = this._parsePosition(colors[i + 1].position) / 100;
            
            if (percentage >= currentPos && percentage <= nextPos) {
                color1 = colors[i];
                color2 = colors[i + 1];
                break;
            }
        }

        // Calculer le facteur d'interpolation entre les deux couleurs
        const pos1 = this._parsePosition(color1.position) / 100;
        const pos2 = this._parsePosition(color2.position) / 100;
        const factor = pos1 === pos2 ? 0 : (percentage - pos1) / (pos2 - pos1);

        // Interpoler entre les deux couleurs
        const interpolatedColor = this._interpolateColors(color1.color, color2.color, factor);
        
        this.elements.progress.html_object.style.backgroundColor = interpolatedColor;
        this.elements.thumb.html_object.style.backgroundColor = interpolatedColor;
        
        // Ajouter une ombre avec la même couleur
        const shadowColor = this._addAlphaToColor(interpolatedColor, 0.4);
        this.elements.thumb.html_object.style.boxShadow = `0 4px 12px ${shadowColor}`;
    }

    _parsePosition(position) {
        if (typeof position === 'string') {
            return parseFloat(position.replace('%', ''));
        }
        if (typeof position === 'object' && position.x) {
            return parseFloat(position.x.replace('%', ''));
        }
        return 0;
    }

    _interpolateColors(color1, color2, factor) {
        // Convertir les couleurs en RGB
        const rgb1 = this._hexToRgb(color1);
        const rgb2 = this._hexToRgb(color2);
        
        if (!rgb1 || !rgb2) return color1;

        // Interpoler chaque composant RGB
        const r = Math.round(rgb1.r + factor * (rgb2.r - rgb1.r));
        const g = Math.round(rgb1.g + factor * (rgb2.g - rgb1.g));
        const b = Math.round(rgb1.b + factor * (rgb2.b - rgb1.b));

        return `rgb(${r}, ${g}, ${b})`;
    }

    _hexToRgb(hex) {
        // Support pour les couleurs hex (#rrggbb) et nommées
        if (hex.startsWith('#')) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : null;
        }
        
        // Pour les couleurs nommées, créer un élément temporaire pour obtenir la valeur RGB
        const tempDiv = document.createElement('div');
        tempDiv.style.color = hex;
        document.body.appendChild(tempDiv);
        const rgbColor = window.getComputedStyle(tempDiv).color;
        document.body.removeChild(tempDiv);
        
        const match = rgbColor.match(/\d+/g);
        return match ? {
            r: parseInt(match[0]),
            g: parseInt(match[1]),
            b: parseInt(match[2])
        } : null;
    }

    _addAlphaToColor(color, alpha) {
        if (color.startsWith('rgb(')) {
            return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
        }
        return color;
    }

    _applyTheme() {
        const themes = {
            material: {
                containerShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)',
                thumbShadow: '0 4px 12px rgba(33, 150, 243, 0.4)',
                borderRadius: '12px'
            },
            flat: {
                containerShadow: 'none',
                thumbShadow: 'none',
                borderRadius: '0px'
            },
            custom: {} // L'utilisateur peut définir ses propres styles
        };

        const theme = themes[this.config.theme] || themes.material;
        
        if (theme.containerShadow) {
            this.elements.container.html_object.style.boxShadow = theme.containerShadow;
        }
        if (theme.thumbShadow) {
            this.elements.thumb.html_object.style.boxShadow = theme.thumbShadow;
        }
        if (theme.borderRadius) {
            this.elements.container.html_object.style.borderRadius = theme.borderRadius;
        }
    }

    _attachEvents() {
        this._attachHoverEvents();
        this._attachClickEvents();
        this._attachDragEvents();
        this._attachKeyboardEvents();
    }

    _attachHoverEvents() {
        this.elements.thumb.html_object.addEventListener('mouseenter', () => {
            if (!this.isDragging) {
                this.elements.thumb.html_object.style.transform = 'scale(1.2)';
            }
        });

        this.elements.thumb.html_object.addEventListener('mouseleave', () => {
            if (!this.isDragging) {
                this.elements.thumb.html_object.style.transform = 'scale(1)';
            }
        });
    }

    _attachClickEvents() {
        this.elements.track.html_object.addEventListener('click', (e) => {
            if (!this.isDragging) {
                const newValue = this._getValueFromEvent(e);
                this.setValue(newValue);
                this._createRipple(e);
                this._triggerCallback('onChange', newValue);
            }
        });
    }

    _attachDragEvents() {
        this.elements.thumb.html_object.addEventListener('mousedown', (e) => {
            this._startDrag(e);
        });
    }

    _attachKeyboardEvents() {
        this.elements.thumb.html_object.setAttribute('tabindex', '0');
        this.elements.thumb.html_object.classList.add('slider-thumb');
        
        this.elements.thumb.html_object.addEventListener('keydown', (e) => {
            let newValue = this.currentValue;
            
            switch(e.key) {
                case 'ArrowLeft':
                case 'ArrowDown':
                    newValue -= this.config.step;
                    break;
                case 'ArrowRight':
                case 'ArrowUp':
                    newValue += this.config.step;
                    break;
                case 'Home':
                    newValue = this.config.min;
                    break;
                case 'End':
                    newValue = this.config.max;
                    break;
                default:
                    return;
            }
            
            this.setValue(newValue);
            this._triggerCallback('onChange', newValue);
            e.preventDefault();
        });
    }

    _startDrag(e) {
        this.isDragging = true;
        this.elements.thumb.html_object.style.transform = 'scale(1.3)';
        this.elements.thumb.html_object.style.zIndex = '1000';
        document.body.style.userSelect = 'none';

        // Désactiver les transitions pendant le drag
        this.elements.progress.html_object.style.transition = 'none';

        this._triggerCallback('onStart', this.currentValue);

        const handleMouseMove = (e) => {
            if (this.isDragging) {
                const newValue = this._getValueFromEvent(e);
                this.setValue(newValue);
                this._triggerCallback('onChange', newValue);
            }
        };

        const handleMouseUp = () => {
            this.isDragging = false;
            this.elements.thumb.html_object.style.transform = 'scale(1)';
            this.elements.thumb.html_object.style.zIndex = '';
            document.body.style.userSelect = '';

            // Réactiver les transitions
            if (this.config.animations.enabled) {
                const isVertical = this.config.orientation === 'vertical';
                this.elements.progress.html_object.style.transition = 
                    `${isVertical ? 'height' : 'width'} ${this.config.animations.duration}s ${this.config.animations.easing}`;
            }

            this._triggerCallback('onEnd', this.currentValue);

            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        e.preventDefault();
    }

    _getValueFromEvent(e) {
        const isVertical = this.config.orientation === 'vertical';
        const trackRect = this.elements.track.html_object.getBoundingClientRect();
        
        let relativePosition;
        if (isVertical) {
            relativePosition = (trackRect.bottom - e.clientY) / trackRect.height;
        } else {
            relativePosition = (e.clientX - trackRect.left) / trackRect.width;
        }
        
        const value = this.config.min + (relativePosition * (this.config.max - this.config.min));
        return Math.max(this.config.min, Math.min(this.config.max, value));
    }

    _createRipple(e) {
        const ripple = document.createElement('div');
        ripple.style.cssText = `
            position: absolute;
            width: 20px;
            height: 20px;
            background: rgba(33, 150, 243, 0.3);
            border-radius: 50%;
            pointer-events: none;
            transform: translate(-50%, -50%) scale(0);
            animation: ripple 0.6s ease-out;
        `;

        const trackRect = this.elements.track.html_object.getBoundingClientRect();
        const isVertical = this.config.orientation === 'vertical';
        
        if (isVertical) {
            ripple.style.left = '50%';
            ripple.style.top = (e.clientY - trackRect.top) + 'px';
        } else {
            ripple.style.left = (e.clientX - trackRect.left) + 'px';
            ripple.style.top = '50%';
        }

        this.elements.track.html_object.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    }

    _triggerCallback(callbackName, value) {
        const callback = this.config.callbacks[callbackName];
        if (typeof callback === 'function') {
            callback(value, this);
        }
    }

    // API publique
    setValue(value) {
        this.currentValue = Math.max(this.config.min, Math.min(this.config.max, value));
        
        const isVertical = this.config.orientation === 'vertical';
        const trackSize = isVertical ? this.config.trackWidth : this.config.trackWidth;
        const percentage = (this.currentValue - this.config.min) / (this.config.max - this.config.min);
        const progressSize = percentage * trackSize;
        const thumbPosition = progressSize - this.config.thumbSize / 2;

        // Mettre à jour la barre de progression
        if (isVertical) {
            this.elements.progress.height(progressSize);
            this.elements.progress.y(trackSize - progressSize);
            this.elements.thumb.y(trackSize - progressSize - this.config.thumbSize / 2);
        } else {
            this.elements.progress.width(progressSize);
            this.elements.thumb.x(thumbPosition);
        }

        // Appliquer la variation de couleur basée sur la position
        this._updateVariationColors(percentage);
    }

    getValue() {
        return this.currentValue;
    }

    setConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this._applyStyles();
    }

    destroy() {
        if (this.elements.container) {
            this.elements.container.html_object.remove();
        }
    }
}

// Export pour utilisation globale
window.Slider = Slider;
export default Slider;
