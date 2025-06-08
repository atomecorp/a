class Slider {
    constructor(config) {
        // Stocker la config originale pour vérifier quelles valeurs ont été explicitement définies
        this.originalConfig = config || {};
        
        // Configuration par défaut
        this.config = {
            attach: 'body',
            id: 'slider_' + Math.random().toString(36).substr(2, 9),
            x: 20,
            y: 20,
            width: 300,
            height: 60,
            trackWidth: 300,
            trackHeight: 8,
            thumbSize: 24,
            min: 0,
            max: 100,
            step: 1,
            value: 50,
            type: 'horizontal', // 'horizontal', 'vertical', 'circular'
            colors: {
                container: '#ffffff',
                track: '#e0e0e0',
                progress: '#2196f3',
                thumb: '#2196f3'
            },
            animations: {
                enabled: true,
                duration: 0.2,
                easing: 'ease-out'
            },
            callbacks: {
                onChange: null,
                onStart: null,
                onEnd: null,
                onDrag: null
            },
            theme: 'material',
            variation: null,
            circular: {
                radius: 80,
                strokeWidth: 8,
                startAngle: 0,
                endAngle: 270
            },
            ...config
        };

        this.currentValue = this.config.value;
        this.isDragging = false;
        this.elements = {};

        this._init();
    }

    _init() {
        if (this.config.type === 'circular') {
            this._createCircularSlider();
        } else {
            this._createLinearSlider();
            this._attachEvents();
        }
        this._applyStyles();
        this.setValue(this.config.value);
    }

    _createLinearSlider() {
        // Ajuster trackWidth et trackHeight selon le type et les dimensions
        if (this.config.type === 'vertical') {
            // Pour vertical: trackHeight = épaisseur, trackWidth = longueur utilisable
            if (!this.originalConfig.hasOwnProperty('trackHeight')) {
                this.config.trackHeight = 8; // Épaisseur par défaut
            }
            if (!this.originalConfig.hasOwnProperty('trackWidth')) {
                this.config.trackWidth = Math.max(100, this.config.height - 40); // Longueur utilisable
            }
        } else {
            // Pour horizontal: trackWidth = longueur utilisable, trackHeight = épaisseur
            if (!this.originalConfig.hasOwnProperty('trackWidth')) {
                this.config.trackWidth = Math.max(100, this.config.width - 40); // Longueur utilisable
            }
            if (!this.originalConfig.hasOwnProperty('trackHeight')) {
                this.config.trackHeight = 8; // Épaisseur par défaut
            }
        }
        
        this._createContainer();
        this._createTrack();
        this._createProgress();
        this._createThumb();
    }

    _createCircularSlider() {
        this._createCircularContainer();
        this._createCircularTrack();
        this._createCircularProgress();
        this._createCircularThumb();
    }

    _createContainer() {
        const isVertical = this.config.type === 'vertical';
        
        this.elements.container = new A({
            attach: this.config.attach,
            id: this.config.id + '_container',
            markup: 'div',
            role: 'slider-container',
            x: this.config.x,
            y: this.config.y,
            // CORRECTION: pour vertical, garder width=width et height=height (ne pas inverser)
            width: this.config.width,
            height: this.config.height,
            backgroundColor: this.config.colors.container,
            smooth: 12,
            padding: 15,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)',
            border: '1px solid rgba(0,0,0,0.04)',
            overflow: 'visible'
        });
    }

    _createTrack() {
        const isVertical = this.config.type === 'vertical';
        
        this.elements.track = new A({
            attach: `#${this.config.id}_container`,
            id: this.config.id + '_track',
            markup: 'div',
            // CORRECTION FINALE: pour vertical, centrer le track fine dans le conteneur
            x: isVertical ? (this.config.width - this.config.trackHeight) / 2 - 15 : 0,
            y: isVertical ? 15 : (this.config.height - this.config.trackHeight) / 2 - 15,
            width: isVertical ? this.config.trackHeight : this.config.trackWidth,
            height: isVertical ? this.config.trackWidth : this.config.trackHeight,
            backgroundColor: this.config.colors.track,
            smooth: 3,
            position: 'relative',
            cursor: 'pointer'
        });
    }

    _createProgress() {
        const isVertical = this.config.type === 'vertical';
        // CORRECTION FINALE: calculer la taille initiale correctement
        const initialSize = (this.currentValue / (this.config.max - this.config.min)) * 
                           (isVertical ? this.config.trackWidth : this.config.trackWidth);
        
        this.elements.progress = new A({
            attach: `#${this.config.id}_track`,
            id: this.config.id + '_progress',
            markup: 'div',
            x: 0,
            // CORRECTION FINALE: pour vertical, position depuis le bas du track
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
        const isVertical = this.config.type === 'vertical';
        // CORRECTION FINALE: calculer la position initiale correctement
        const trackSize = isVertical ? this.config.trackWidth : this.config.trackWidth;
        const initialPosition = (this.currentValue / (this.config.max - this.config.min)) * trackSize;
        
        this.elements.thumb = new A({
            attach: `#${this.config.id}_track`,
            id: this.config.id + '_thumb',
            markup: 'div',
            x: isVertical ? (this.config.trackHeight - this.config.thumbSize) / 2 : initialPosition - this.config.thumbSize / 2,
            // CORRECTION FINALE: pour vertical, partir du bas du track
            y: isVertical ? this.config.trackWidth - initialPosition - this.config.thumbSize / 2 : 
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
        if (theme.thumbShadow && this.elements.thumb) {
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
        // Seulement pour les sliders linéaires
        if (this.config.type !== 'circular') {
            this.elements.track.html_object.addEventListener('click', (e) => {
                if (!this.isDragging) {
                    const newValue = this._getValueFromEvent(e);
                    this.setValue(newValue);
                    this._createRipple(e);
                    this._triggerCallback('onChange', newValue);
                }
            });
        }
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
                const isVertical = this.config.type === 'vertical';
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
        const isVertical = this.config.type === 'vertical';
        const isCircular = this.config.type === 'circular';
        
        if (isCircular) {
            return this._getValueFromCircularEvent(e);
        }
        
        const trackRect = this.elements.track.html_object.getBoundingClientRect();
        
        let relativePosition;
        if (isVertical) {
            // CORRECTION: utiliser la hauteur réelle du track (trackWidth pour vertical)
            const trackHeight = trackRect.height;
            relativePosition = (trackRect.bottom - e.clientY) / trackHeight;
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
        const isVertical = this.config.type === 'vertical';
        
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
        
        if (this.config.type === 'circular') {
            this._setCircularValue(this.currentValue);
            return;
        }
        
        const isVertical = this.config.type === 'vertical';
        // CORRECTION FINALE: calculs cohérents pour le positionnement
        const trackSize = isVertical ? this.config.trackWidth : this.config.trackWidth;
        const percentage = (this.currentValue - this.config.min) / (this.config.max - this.config.min);
        const progressSize = percentage * trackSize;
        const thumbPosition = progressSize;

        // Mettre à jour la barre de progression
        if (isVertical) {
            this.elements.progress.height(progressSize);
            // CORRECTION FINALE: position depuis le bas du track
            this.elements.progress.y(trackSize - progressSize);
            // Position du thumb depuis le bas
            this.elements.thumb.y(trackSize - thumbPosition - this.config.thumbSize / 2);
        } else {
            this.elements.progress.width(progressSize);
            this.elements.thumb.x(thumbPosition - this.config.thumbSize / 2);
        }

        // Appliquer la variation de couleur basée sur la position
        this._updateVariationColors(percentage);
    }

    getValue() {
        return this.currentValue;
    }

    getCurrentValue() {
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

    // ===== MÉTHODES POUR LES SLIDERS CIRCULAIRES =====
    
    _createCircularContainer() {
        const size = this.config.circular.radius * 2 + this.config.thumbSize + 20;
        
        this.elements.container = new A({
            attach: this.config.attach,
            id: this.config.id + '_container',
            markup: 'div',
            role: 'circular-slider-container',
            x: this.config.x,
            y: this.config.y,
            width: size,
            height: size,
            backgroundColor: this.config.colors.container,
            smooth: 12,
            padding: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)',
            border: '1px solid rgba(0,0,0,0.04)',
            overflow: 'visible',
            position: 'relative'
        });
    }

    _createCircularTrack() {
        const { radius, strokeWidth, startAngle, endAngle } = this.config.circular;
        
        // Créer un SVG pour le track circulaire
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const svgSize = radius * 2 + strokeWidth + 20;
        svg.setAttribute('width', svgSize);
        svg.setAttribute('height', svgSize);
        svg.style.position = 'absolute';
        
        // SIMPLIFICATION: centrer le SVG dans le conteneur
        const containerSize = this.config.circular.radius * 2 + this.config.thumbSize + 20;
        const svgOffset = (containerSize - svgSize) / 2;
        svg.style.left = svgOffset + 'px';
        svg.style.top = svgOffset + 'px';
        
        svg.style.pointerEvents = 'auto';
        svg.style.cursor = 'pointer';
        svg.style.zIndex = '5';  // Z-index plus bas que le thumb

        const centerX = radius + strokeWidth / 2 + 10;
        const centerY = radius + strokeWidth / 2 + 10;

        // Track arc (seulement la partie utilisable entre startAngle et endAngle)
        const trackArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        
        // Calculer le path de l'arc pour le track
        const startRadians = (startAngle - 90) * Math.PI / 180;
        const endRadians = (endAngle - 90) * Math.PI / 180;
        
        const startX = centerX + radius * Math.cos(startRadians);
        const startY = centerY + radius * Math.sin(startRadians);
        const endX = centerX + radius * Math.cos(endRadians);
        const endY = centerY + radius * Math.sin(endRadians);
        
        const angleRange = Math.abs(endAngle - startAngle);
        const largeArcFlag = angleRange > 180 ? 1 : 0;
        const pathData = `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`;
        
        trackArc.setAttribute('d', pathData);
        trackArc.setAttribute('fill', 'none');
        trackArc.setAttribute('stroke', this.config.colors.track);
        trackArc.setAttribute('stroke-width', strokeWidth);
        trackArc.setAttribute('stroke-linecap', 'round');
        
        // Ajouter un événement de clic sur le track pour click-to-position
        trackArc.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // S'assurer qu'on n'est pas en train de dragger
            if (!this.isDragging) {
                const newValue = this._getValueFromCircularEvent(e);
                if (newValue !== this.currentValue) {
                    this.setValue(newValue);
                    this._triggerCallback('onChange', newValue);
                }
            }
        });
        
        // Ajouter aussi un gestionnaire sur le conteneur SVG pour capturer tous les clics
        svg.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Vérifier si le clic n'est pas sur le thumb lui-même
            if (!this.isDragging && e.target !== this.elements.thumb?.html_object) {
                const newValue = this._getValueFromCircularEvent(e);
                if (newValue !== this.currentValue) {
                    this.setValue(newValue);
                    this._triggerCallback('onChange', newValue);
                }
            }
        });
        
        // Améliorer l'accessibilité avec des événements de survol
        trackArc.addEventListener('mouseenter', () => {
            trackArc.style.opacity = '0.8';
        });
        
        trackArc.addEventListener('mouseleave', () => {
            trackArc.style.opacity = '1';
        });

        svg.appendChild(trackArc);
        
        this.elements.container.html_object.appendChild(svg);
        
        // Stocker une référence simple au SVG
        this.elements.track = { 
            html_object: svg, 
            arc: trackArc,
            radius: radius
        };
    }

    _createCircularProgress() {
        const { radius, strokeWidth } = this.config.circular;
        
        // Progress arc
        const progressArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        progressArc.setAttribute('fill', 'none');
        progressArc.setAttribute('stroke', this.config.colors.progress);
        progressArc.setAttribute('stroke-width', strokeWidth);
        progressArc.setAttribute('stroke-linecap', 'round');
        
        this.elements.track.html_object.appendChild(progressArc);
        this.elements.progress = { html_object: progressArc };
    }

    _createCircularThumb() {
        const { radius, strokeWidth, startAngle, endAngle } = this.config.circular;
        
        // Calculer la position initiale basée sur la valeur courante
        const percentage = (this.currentValue - this.config.min) / (this.config.max - this.config.min);
        const angleRange = endAngle - startAngle;
        const currentAngle = startAngle + (percentage * angleRange);
        
        // SIMPLIFICATION: utiliser les dimensions du conteneur
        const containerSize = this.config.circular.radius * 2 + this.config.thumbSize + 20;
        const centerX = containerSize / 2;
        const centerY = containerSize / 2;
        
        // Convertir l'angle en radians avec la même correction que dans _setCircularValue
        const radians = (currentAngle - 90) * Math.PI / 180;
        
        // Position du thumb exactement sur la track (même rayon que le path SVG)
        const thumbX = centerX + radius * Math.cos(radians) - this.config.thumbSize / 2;
        const thumbY = centerY + radius * Math.sin(radians) - this.config.thumbSize / 2;
        
        this.elements.thumb = new A({
            attach: `#${this.config.id}_container`,
            id: this.config.id + '_thumb',
            markup: 'div',
            x: thumbX,
            y: thumbY,
            width: this.config.thumbSize,
            height: this.config.thumbSize,
            backgroundColor: this.config.colors.thumb,
            smooth: this.config.thumbSize / 2,
            position: 'absolute',
            cursor: 'grab',
            boxShadow: '0 4px 12px rgba(33, 150, 243, 0.4), 0 2px 4px rgba(0,0,0,0.1)',
            border: '3px solid white',
            transition: this.config.animations.enabled ? 
                       `transform ${this.config.animations.duration}s ${this.config.animations.easing}` : 'none',
            zIndex: 20,  // Z-index plus élevé que le SVG
            pointerEvents: 'auto'  // S'assurer que le thumb capture les événements
        });

        // Empêcher que les clics sur le thumb se propagent au track
        this.elements.thumb.html_object.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        // Ajouter les événements de drag spécifiques aux sliders circulaires
        this.elements.thumb.html_object.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.isDragging = true;
            this.elements.thumb.html_object.style.cursor = 'grabbing';
            
            // Désactiver les transitions pendant le drag pour éviter les conflits
            const originalTransition = this.elements.thumb.html_object.style.transition;
            this.elements.thumb.html_object.style.transition = 'none';
            
            // Déclencher le callback onStart
            this._triggerCallback('onStart', this.currentValue);
            
            const handleCircularDrag = (moveEvent) => {
                if (!this.isDragging) return;
                
                moveEvent.preventDefault();
                moveEvent.stopPropagation();
                
                // Calculer et appliquer la nouvelle valeur de manière fluide
                const newValue = this._getValueFromCircularEvent(moveEvent);
                if (newValue !== this.currentValue) {
                    this.setValue(newValue);
                    this._triggerCallback('onDrag', newValue);
                }
            };

            const handleCircularDragEnd = (endEvent) => {
                if (this.isDragging) {
                    this.isDragging = false;
                    this.elements.thumb.html_object.style.cursor = 'grab';
                    
                    // Réactiver les transitions
                    this.elements.thumb.html_object.style.transition = originalTransition;
                    
                    this._triggerCallback('onEnd', this.currentValue);
                    this._triggerCallback('onChange', this.currentValue);
                }
                
                // Nettoyer les événements
                document.removeEventListener('pointermove', handleCircularDrag);
                document.removeEventListener('pointerup', handleCircularDragEnd);
                document.removeEventListener('pointercancel', handleCircularDragEnd);
            };

            // Attacher les événements de mouvement et de fin
            document.addEventListener('pointermove', handleCircularDrag, { passive: false });
            document.addEventListener('pointerup', handleCircularDragEnd);
            document.addEventListener('pointercancel', handleCircularDragEnd);
        });
    }

    _getValueFromCircularEvent(e) {
        const { radius, strokeWidth, startAngle, endAngle } = this.config.circular;
        
        // SIMPLIFICATION: calcul direct du centre du conteneur
        const containerRect = this.elements.container.html_object.getBoundingClientRect();
        const centerX = containerRect.left + containerRect.width / 2;
        const centerY = containerRect.top + containerRect.height / 2;
        
        // Calculer l'angle de la souris par rapport au centre
        const deltaX = e.clientX - centerX;
        const deltaY = e.clientY - centerY;
        let mouseDegrees = Math.atan2(deltaY, deltaX) * 180 / Math.PI + 90;
        
        // Normaliser l'angle entre 0 et 360
        while (mouseDegrees < 0) mouseDegrees += 360;
        while (mouseDegrees >= 360) mouseDegrees -= 360;
        
        // Calculer la position sur l'arc avec gestion bidirectionnelle améliorée
        let relativePosition = this._getRelativePositionOnArc(mouseDegrees, startAngle, endAngle);
        
        // Convertir en valeur et appliquer le step
        const rawValue = this.config.min + (relativePosition * (this.config.max - this.config.min));
        const steppedValue = Math.round(rawValue / this.config.step) * this.config.step;
        return Math.max(this.config.min, Math.min(this.config.max, steppedValue));
    }

    _getRelativePositionOnArc(mouseDegrees, startAngle, endAngle) {
        // Normaliser les angles de l'arc
        let arcStart = startAngle % 360;
        let arcEnd = endAngle % 360;
        if (arcStart < 0) arcStart += 360;
        if (arcEnd < 0) arcEnd += 360;
        
        let relativePosition;
        
        if (arcStart <= arcEnd) {
            // Arc simple qui ne traverse pas 0°
            const arcRange = arcEnd - arcStart;
            
            if (mouseDegrees >= arcStart && mouseDegrees <= arcEnd) {
                // Directement sur l'arc
                relativePosition = (mouseDegrees - arcStart) / arcRange;
            } else {
                // Hors de l'arc - trouver le côté le plus proche avec logique bidirectionnelle
                const currentValue = this.getCurrentValue();
                const currentPercentage = (currentValue - this.config.min) / (this.config.max - this.config.min);
                
                // Calculer les distances angulaires avec wrap-around
                const distToStart = this._getAngularDistance(mouseDegrees, arcStart);
                const distToEnd = this._getAngularDistance(mouseDegrees, arcEnd);
                
                // Si on clique plus près du début ou si on veut descendre en valeur
                if (distToStart < distToEnd || (distToStart === distToEnd && mouseDegrees < arcStart + arcRange / 2)) {
                    relativePosition = 0;
                } else {
                    relativePosition = 1;
                }
            }
        } else {
            // Arc qui traverse 0° (ex: de 300° à 60°)
            const totalRange = (360 - arcStart) + arcEnd;
            
            if (mouseDegrees >= arcStart || mouseDegrees <= arcEnd) {
                // Sur l'arc
                if (mouseDegrees >= arcStart) {
                    relativePosition = (mouseDegrees - arcStart) / totalRange;
                } else {
                    relativePosition = ((360 - arcStart) + mouseDegrees) / totalRange;
                }
            } else {
                // Hors de l'arc - logique bidirectionnelle améliorée
                const gapStart = arcEnd;
                const gapEnd = arcStart;
                const middleOfGap = (gapStart + gapEnd) / 2;
                
                if (mouseDegrees <= middleOfGap) {
                    relativePosition = 1; // Plus près de la fin
                } else {
                    relativePosition = 0; // Plus près du début
                }
            }
        }
        
        return Math.max(0, Math.min(1, relativePosition));
    }

    _getAngularDistance(angle1, angle2) {
        const diff = Math.abs(angle1 - angle2);
        return Math.min(diff, 360 - diff);
    }

    _setCircularValue(value) {
        // S'assurer que la valeur est dans les limites
        this.currentValue = Math.max(this.config.min, Math.min(this.config.max, value));
        
        const percentage = (this.currentValue - this.config.min) / (this.config.max - this.config.min);
        const { radius, strokeWidth, startAngle, endAngle } = this.config.circular;
        
        // Calculer l'angle pour le thumb
        const angleRange = endAngle - startAngle;
        const currentAngle = startAngle + (percentage * angleRange);
        
        // SIMPLIFICATION: utiliser les dimensions du conteneur
        const containerSize = this.config.circular.radius * 2 + this.config.thumbSize + 20;
        const centerX = containerSize / 2;
        const centerY = containerSize / 2;
        
        // Convertir l'angle en radians (correction de l'offset de -90°)
        const radians = (currentAngle - 90) * Math.PI / 180;
        
        // Position du thumb exactement sur la track (même rayon que le path SVG)
        const thumbX = centerX + radius * Math.cos(radians) - this.config.thumbSize / 2;
        const thumbY = centerY + radius * Math.sin(radians) - this.config.thumbSize / 2;
        
        // Mettre à jour la position du thumb de manière fluide
        if (this.elements.thumb) {
            this.elements.thumb.x(thumbX);
            this.elements.thumb.y(thumbY);
        }
        
        // Mettre à jour l'arc de progression
        this._updateCircularProgress(percentage);
        
        // Appliquer la variation de couleur
        this._updateVariationColors(percentage);
    }

    _updateCircularProgress(percentage) {
        if (!this.elements.progress || !this.elements.progress.html_object) return;
        
        const { radius, strokeWidth, startAngle, endAngle } = this.config.circular;
        // SIMPLIFICATION: utiliser le centre du SVG directement
        const centerX = radius + strokeWidth / 2 + 10;
        const centerY = radius + strokeWidth / 2 + 10;
        
        const angleRange = endAngle - startAngle;
        const progressAngle = startAngle + (percentage * angleRange);
        
        const startRadians = (startAngle - 90) * Math.PI / 180;
        const endRadians = (progressAngle - 90) * Math.PI / 180;
        
        const startX = centerX + radius * Math.cos(startRadians);
        const startY = centerY + radius * Math.sin(startRadians);
        const endX = centerX + radius * Math.cos(endRadians);
        const endY = centerY + radius * Math.sin(endRadians);
        
        // Calculer si on a besoin d'un grand arc
        const progressAngleRange = Math.abs(progressAngle - startAngle);
        const largeArcFlag = progressAngleRange > 180 ? 1 : 0;
        
        let pathData;
        if (percentage <= 0.001) {
            // Pas de progression visible - utiliser un point
            pathData = `M ${startX} ${startY} L ${startX} ${startY}`;
        } else {
            pathData = `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`;
        }
        
        this.elements.progress.html_object.setAttribute('d', pathData);
    }
}

// Export pour utilisation globale
window.Slider = Slider;
export default Slider;
