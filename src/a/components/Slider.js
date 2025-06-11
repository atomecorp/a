/**
 * 🎚️ Slider Web Component - Squirrel Framework
 * Version simplifiée et fonctionnelle
 */

class Slider extends HTMLElement {
    constructor(config = {}) {
        super();
        
        // Configuration par défaut qui sera écrasée si besoin
        this.defaultConfig = {
            attach: 'body',
            x: 0, y: 0,
            width: 300, height: 60,
            min: 0, max: 100, step: 1, value: 50,
            baseValue: undefined,
            type: 'horizontal',
            
            circularConfig: {
                startAngle: -90,
                endAngle: 270,
                clockwise: true
            },
            
            styling: {
                backgroundColor: '#ffffff',
                trackColor: '#e0e0e0',
                progressColor: '#2196f3',
                thumbColor: '#2196f3',
                borderRadius: '8px',
                boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                thumbSize: 20,
                trackHeight: 8,
                containerPadding: 8,
                
                // Advanced styling features
                progressVariation: null, // Array of {color, position: {x: '%'}} objects
                thumbBoxShadow: null,
                thumbHoverTransform: null,
                thumbDragTransform: null,
                progressDragTransform: null,
                trackBackground: null,
                progressBorderRadius: null,
                trackBorderRadius: null,
                thumbBorderRadius: null
            },
            
            callbacks: {}
        };

        // La config peut être fournie via le constructeur ou sera fournie plus tard
        this.config = this.config || { ...this.defaultConfig, ...config };
        this.currentValue = this.config.value;
        this.isDragging = false;
        
        this.attachShadow({ mode: 'open' });
        
        // Ne pas initialiser automatiquement dans le constructeur
        this.initialized = false;
    }
    
    connectedCallback() {
        // Si la config a été fournie par SliderCompatible, la fusionner
        if (this.config && !this.initialized) {
            this.currentValue = this.config.value;
            this._initialize();
            this.initialized = true;
        } else if (!this.initialized) {
            // Fallback si aucune config externe n'a été fournie
            this.config = this.defaultConfig;
            this.currentValue = this.config.value;
            this._initialize();
            this.initialized = true;
        }
    }

    _initialize() {
        this._createStructure();
        this._applyStyles();
        this._setupEvents();
        this._updateDisplay();
        this.setAttribute('tabindex', '0');
    }

    _createStructure() {
        const style = document.createElement('style');
        style.textContent = `
            :host {
                position: relative;
                display: inline-block;
                user-select: none;
                outline: none;
            }
            
            .container {
                position: relative;
                width: 100%;
                height: 100%;
                background: var(--bg-color, #ffffff);
                border-radius: var(--border-radius, 8px);
                box-shadow: var(--box-shadow, 0 4px 8px rgba(0,0,0,0.1));
                padding: var(--container-padding, 8px);
                box-sizing: border-box;
                cursor: pointer;
            }
            
            .track {
                position: absolute;
                background: var(--track-color, #e0e0e0);
                border-radius: var(--track-border-radius, 4px);
                transition: all 0.3s ease;
            }
            
            .progress {
                position: absolute;
                background: var(--progress-color, #2196f3);
                border-radius: var(--progress-border-radius, 4px);
                transition: background 0.2s ease;
            }
            
            .thumb {
                position: absolute;
                width: var(--thumb-size, 20px);
                height: var(--thumb-size, 20px);
                background: var(--thumb-color, #2196f3);
                border-radius: var(--thumb-border-radius, 50%);
                cursor: grab;
                box-shadow: var(--thumb-box-shadow, 0 2px 6px rgba(0,0,0,0.2));
                transform: translate(-50%, -50%);
                transition: box-shadow 0.2s ease;
                transform-origin: center;
            }
            
            .thumb:hover {
                transform: translate(-50%, -50%) var(--thumb-hover-transform, scale(1.05));
                transition: transform 0.2s ease, box-shadow 0.2s ease;
            }
            
            .thumb:active,
            .thumb.dragging {
                cursor: grabbing;
                transform: translate(-50%, -50%) var(--thumb-drag-transform, scale(1.1));
                transition: transform 0.1s ease;
            }
            
            .progress.dragging {
                /* Pas de transition pendant le drag pour éviter le lag */
            }
            
            /* Horizontal */
            .horizontal .track {
                top: 50%;
                left: var(--container-padding, 8px);
                right: var(--container-padding, 8px);
                height: var(--track-height, 8px);
                transform: translateY(-50%);
            }
            
            .horizontal .progress {
                top: 50%;
                left: var(--container-padding, 8px);
                height: var(--track-height, 8px);
                transform: translateY(-50%);
                width: 0%;
                max-width: calc(100% - 2 * var(--container-padding, 8px));
            }
            
            /* Vertical */
            .vertical .track {
                left: 50%;
                top: var(--container-padding, 8px);
                bottom: var(--container-padding, 8px);
                width: var(--track-height, 8px);
                transform: translateX(-50%);
            }
            
            .vertical .progress {
                left: 50%;
                bottom: var(--container-padding, 8px);
                width: var(--track-height, 8px);
                transform: translateX(-50%);
                height: 0%;
                max-height: calc(100% - 2 * var(--container-padding, 8px));
            }
            
            /* Circular */
            .circular svg {
                width: 100%;
                height: 100%;
            }
        `;
        
        this.shadowRoot.appendChild(style);
        
        this.container = document.createElement('div');
        this.container.className = `container ${this.config.type}`;
        
        if (this.config.type === 'circular') {
            this._createCircular();
        } else {
            this._createLinear();
        }
        
        this.shadowRoot.appendChild(this.container);
    }

    _createLinear() {
        this.track = document.createElement('div');
        this.track.className = 'track';
        this.container.appendChild(this.track);
        
        this.progress = document.createElement('div');
        this.progress.className = 'progress';
        this.container.appendChild(this.progress);
        
        this.thumb = document.createElement('div');
        this.thumb.className = 'thumb';
        this.container.appendChild(this.thumb);
    }

    _createCircular() {
        const { width, height, styling, circularConfig } = this.config;
        const padding = styling.containerPadding || 8;
        const size = Math.min(width - 2 * padding, height - 2 * padding);
        
        const thumbSize = styling.thumbSize || 20;
        const strokeWidth = styling.trackHeight || 8;
        
        this.radius = (size - Math.max(thumbSize, strokeWidth)) / 2;
        this.circumference = 2 * Math.PI * this.radius;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
        
        const center = size / 2;
        
        // Calculer si c'est un cercle complet ou borné
        const startAngle = circularConfig.startAngle;
        const endAngle = circularConfig.endAngle;
        let totalRange;
        if (endAngle >= startAngle) {
            totalRange = endAngle - startAngle;
        } else {
            totalRange = (360 - startAngle) + endAngle;
        }
        
        const isFullCircle = (totalRange >= 360) || (startAngle === -90 && endAngle === 270);
        
        if (isFullCircle) {
            // Cercle complet - piste complète
            const trackCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            trackCircle.setAttribute('cx', center);
            trackCircle.setAttribute('cy', center);
            trackCircle.setAttribute('r', this.radius);
            trackCircle.setAttribute('fill', 'none');
            trackCircle.setAttribute('stroke', 'var(--track-color, #e0e0e0)');
            trackCircle.setAttribute('stroke-width', strokeWidth);
            svg.appendChild(trackCircle);
        } else {
            // Arc borné - piste partielle
            const trackArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            
            const startAngleRad = (startAngle * Math.PI) / 180;
            const endAngleRad = (endAngle * Math.PI) / 180;
            
            const startX = center + this.radius * Math.cos(startAngleRad);
            const startY = center + this.radius * Math.sin(startAngleRad);
            const endX = center + this.radius * Math.cos(endAngleRad);
            const endY = center + this.radius * Math.sin(endAngleRad);
            
            const largeArcFlag = totalRange > 180 ? 1 : 0;
            const sweepFlag = circularConfig.clockwise ? 1 : 0;
            
            const pathData = `M ${startX} ${startY} A ${this.radius} ${this.radius} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY}`;
            trackArc.setAttribute('d', pathData);
            trackArc.setAttribute('fill', 'none');
            trackArc.setAttribute('stroke', 'var(--track-color, #e0e0e0)');
            trackArc.setAttribute('stroke-width', strokeWidth);
            trackArc.setAttribute('stroke-linecap', 'round');
            svg.appendChild(trackArc);
        }
        
        // Progress circle (toujours un cercle pour la simplicité)
        this.progress = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        this.progress.setAttribute('cx', center);
        this.progress.setAttribute('cy', center);
        this.progress.setAttribute('r', this.radius);
        this.progress.setAttribute('fill', 'none');
        this.progress.setAttribute('stroke', 'var(--progress-color, #2196f3)');
        this.progress.setAttribute('stroke-width', strokeWidth);
        this.progress.setAttribute('stroke-linecap', 'round');
        this.progress.setAttribute('stroke-dasharray', this.circumference);
        this.progress.setAttribute('stroke-dashoffset', this.circumference);
        this.progress.setAttribute('transform', `rotate(${startAngle} ${center} ${center})`);
        svg.appendChild(this.progress);
        
        this.container.appendChild(svg);

        this.thumb = document.createElement('div');
        this.thumb.className = 'thumb';
        this.container.appendChild(this.thumb);
    }

    _applyStyles() {
        const { styling } = this.config;
        
        // Basic styling properties
        if (styling.backgroundColor) this.style.setProperty('--bg-color', styling.backgroundColor);
        if (styling.trackColor) this.style.setProperty('--track-color', styling.trackColor);
        if (styling.progressColor) this.style.setProperty('--progress-color', styling.progressColor);
        if (styling.thumbColor) this.style.setProperty('--thumb-color', styling.thumbColor);
        if (styling.borderRadius) this.style.setProperty('--border-radius', styling.borderRadius);
        if (styling.boxShadow) this.style.setProperty('--box-shadow', styling.boxShadow);
        if (styling.thumbSize) this.style.setProperty('--thumb-size', `${styling.thumbSize}px`);
        if (styling.trackHeight) this.style.setProperty('--track-height', `${styling.trackHeight}px`);
        if (styling.containerPadding) this.style.setProperty('--container-padding', `${styling.containerPadding}px`);
        
        // Advanced styling properties
        if (styling.thumbBoxShadow) this.style.setProperty('--thumb-box-shadow', styling.thumbBoxShadow);
        if (styling.thumbHoverTransform) this.style.setProperty('--thumb-hover-transform', styling.thumbHoverTransform);
        if (styling.thumbDragTransform) this.style.setProperty('--thumb-drag-transform', styling.thumbDragTransform);
        if (styling.progressDragTransform) this.style.setProperty('--progress-drag-transform', styling.progressDragTransform);
        if (styling.trackBackground) this.style.setProperty('--track-color', styling.trackBackground);
        if (styling.progressBorderRadius) this.style.setProperty('--progress-border-radius', styling.progressBorderRadius);
        if (styling.trackBorderRadius) this.style.setProperty('--track-border-radius', styling.trackBorderRadius);
        if (styling.thumbBorderRadius) this.style.setProperty('--thumb-border-radius', styling.thumbBorderRadius);
        
        // Dimensions
        this.style.width = `${this.config.width}px`;
        this.style.height = `${this.config.height}px`;
        
        // Appliquer le positionnement seulement si x et y sont spécifiés
        if (this.config.x !== undefined && this.config.y !== undefined) {
            this.style.position = 'absolute';
            this.style.left = `${this.config.x}px`;
            this.style.top = `${this.config.y}px`;
        }
    }

    _setupEvents() {
        this.container.addEventListener('mousedown', this._onStart.bind(this));
        this.container.addEventListener('touchstart', this._onStart.bind(this), { passive: false });
        this.container.addEventListener('dblclick', this._onDoubleClick.bind(this));
        
        document.addEventListener('mousemove', this._onMove.bind(this));
        document.addEventListener('touchmove', this._onMove.bind(this), { passive: false });
        document.addEventListener('mouseup', this._onEnd.bind(this));
        document.addEventListener('touchend', this._onEnd.bind(this));
    }

    _onStart(e) {
        e.preventDefault();
        this.isDragging = true;
        this._addDragClass();
        this._updateFromEvent(e);
        this._triggerCallback('onStart');
    }

    _onMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();
        this._updateFromEvent(e);
        this._triggerCallback('onDrag');
    }

    _onEnd(e) {
        if (!this.isDragging) return;
        this.isDragging = false;
        this._removeDragClass();
        this._triggerCallback('onEnd');
    }

    _onDoubleClick(e) {
        e.preventDefault();
        
        // Déterminer la valeur de reset intelligente
        let resetValue;
        
        if (this.config.baseValue !== undefined) {
            // Si baseValue est défini, l'utiliser
            resetValue = this.config.baseValue;
        } else if (this.config.min < 0 && this.config.max > 0) {
            // Pour un slider bipolaire (ex: -100 à +100), retourner à 0
            resetValue = 0;
        } else {
            // Pour un slider normal, retourner au minimum
            resetValue = this.config.min;
        }
        
        this.setValue(resetValue);
        this._triggerCallback('onDoubleClick');
    }

    _updateFromEvent(e) {
        const rect = this.container.getBoundingClientRect();
        let percentage = this._getPercentage(e, rect);
        
        let newValue = this.config.min + (percentage * (this.config.max - this.config.min));
        
        if (this.config.step > 0) {
            newValue = Math.round(newValue / this.config.step) * this.config.step;
        }
        
        newValue = Math.max(this.config.min, Math.min(this.config.max, newValue));
        
        if (newValue !== this.currentValue) {
            this.currentValue = newValue;
            this._updateDisplay();
            this._triggerCallback('onChange');
        }
    }

    _getPercentage(e, rect) {
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        if (this.config.type === 'circular') {
            return this._getCircularPercentage(e, rect);
        } else if (this.config.type === 'vertical') {
            const y = clientY - rect.top;
            const padding = this.config.styling.containerPadding || 8;
            const adjustedY = y - padding;
            const trackHeight = rect.height - 2 * padding;
            return Math.max(0, Math.min(1, 1 - (adjustedY / trackHeight)));
        } else {
            const x = clientX - rect.left;
            const padding = this.config.styling.containerPadding || 8;
            const adjustedX = x - padding;
            const trackWidth = rect.width - 2 * padding;
            return Math.max(0, Math.min(1, adjustedX / trackWidth));
        }
    }

    _getCircularPercentage(e, rect) {
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const deltaX = clientX - centerX;
        const deltaY = clientY - centerY;
        
        // Calculer l'angle en degrés
        let angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
        
        const { circularConfig } = this.config;
        const startAngle = circularConfig.startAngle;
        const endAngle = circularConfig.endAngle;
        
        // Calculer la plage totale
        let totalRange;
        if (endAngle >= startAngle) {
            totalRange = endAngle - startAngle;
        } else {
            totalRange = (360 - startAngle) + endAngle;
        }
        
        const isFullCircle = (totalRange >= 360) || (startAngle === -90 && endAngle === 270);
        
        if (isFullCircle) {
            // Logique simple pour cercle complet
            angle = (angle + 90 + 360) % 360;
            return angle / 360;
        }
        
        // Logique avec bornes pour arc partiel
        angle = (angle + 360) % 360;
        
        // Normaliser les angles
        const normalizedStart = (startAngle + 360) % 360;
        const normalizedEnd = (endAngle + 360) % 360;
        
        let relativeAngle;
        let isInBounds = false;
        
        if (normalizedEnd >= normalizedStart) {
            // Plage simple
            isInBounds = (angle >= normalizedStart && angle <= normalizedEnd);
            if (isInBounds) {
                relativeAngle = angle - normalizedStart;
            }
        } else {
            // Plage traversant 0°
            isInBounds = (angle >= normalizedStart || angle <= normalizedEnd);
            if (isInBounds) {
                if (angle >= normalizedStart) {
                    relativeAngle = angle - normalizedStart;
                } else {
                    relativeAngle = (360 - normalizedStart) + angle;
                }
            }
        }
        
        // Si en dehors des bornes, contraindre au plus proche
        if (!isInBounds) {
            const distToStart = Math.min(
                Math.abs(angle - normalizedStart),
                Math.abs(angle - normalizedStart + 360),
                Math.abs(angle - normalizedStart - 360)
            );
            const distToEnd = Math.min(
                Math.abs(angle - normalizedEnd),
                Math.abs(angle - normalizedEnd + 360),
                Math.abs(angle - normalizedEnd - 360)
            );
            
            if (distToStart < distToEnd) {
                relativeAngle = 0;
            } else {
                relativeAngle = totalRange;
            }
        }
        
        // Contraindre et normaliser
        relativeAngle = Math.max(0, Math.min(totalRange, relativeAngle));
        
        if (!circularConfig.clockwise) {
            relativeAngle = totalRange - relativeAngle;
        }
        
        return Math.max(0, Math.min(1, relativeAngle / totalRange));
    }

    _updateDisplay() {
        const percentage = (this.currentValue - this.config.min) / (this.config.max - this.config.min);
        
        // Apply progress variation if configured
        this._applyProgressVariation(percentage);
        
        if (this.config.type === 'circular') {
            this._updateCircularDisplay(percentage);
        } else {
            this._updateLinearDisplay(percentage);
        }
    }

    _applyProgressVariation(percentage) {
        const { progressVariation } = this.config.styling;
        if (!progressVariation || !Array.isArray(progressVariation)) return;
        
        // Convertir les positions en pourcentages
        const stops = progressVariation.map(item => ({
            color: item.color,
            position: parseFloat(item.position.x.replace('%', '')) / 100
        })).sort((a, b) => a.position - b.position);
        
        let color;
        
        // Trouver les deux couleurs entre lesquelles interpoler
        if (percentage <= stops[0].position) {
            color = stops[0].color;
        } else if (percentage >= stops[stops.length - 1].position) {
            color = stops[stops.length - 1].color;
        } else {
            // Trouver les deux stops entre lesquels on se trouve
            for (let i = 0; i < stops.length - 1; i++) {
                if (percentage >= stops[i].position && percentage <= stops[i + 1].position) {
                    const startStop = stops[i];
                    const endStop = stops[i + 1];
                    
                    // Calculer le ratio d'interpolation
                    const ratio = (percentage - startStop.position) / (endStop.position - startStop.position);
                    
                    // Interpoler entre les deux couleurs
                    color = this._interpolateColors(startStop.color, endStop.color, ratio);
                    break;
                }
            }
        }
        
        if (color && this.progress) {
            this.progress.style.background = color;
        }
    }

    _interpolateColors(color1, color2, ratio) {
        // Convertir les couleurs hex en RGB
        const rgb1 = this._hexToRgb(color1);
        const rgb2 = this._hexToRgb(color2);
        
        if (!rgb1 || !rgb2) return color1;
        
        // Interpoler chaque composante RGB
        const r = Math.round(rgb1.r + (rgb2.r - rgb1.r) * ratio);
        const g = Math.round(rgb1.g + (rgb2.g - rgb1.g) * ratio);
        const b = Math.round(rgb1.b + (rgb2.b - rgb1.b) * ratio);
        
        return `rgb(${r}, ${g}, ${b})`;
    }

    _hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    _addDragClass() {
        if (this.thumb) this.thumb.classList.add('dragging');
        if (this.progress) this.progress.classList.add('dragging');
    }

    _removeDragClass() {
        if (this.thumb) this.thumb.classList.remove('dragging');
        if (this.progress) this.progress.classList.remove('dragging');
    }

    _updateLinearDisplay(percentage) {
        const padding = this.config.styling.containerPadding || 8;
        
        // S'assurer que le pourcentage est dans les limites
        percentage = Math.max(0, Math.min(1, percentage));
        
        if (this.config.type === 'vertical') {
            const maxHeight = this.container.offsetHeight - 2 * padding;
            const progressHeight = Math.min(maxHeight, percentage * maxHeight);
            this.progress.style.height = `${progressHeight}px`;
            
            const thumbPosition = padding + (1 - percentage) * maxHeight;
            this.thumb.style.top = `${thumbPosition}px`;
            this.thumb.style.left = '50%';
        } else {
            const maxWidth = this.container.offsetWidth - 2 * padding;
            const progressWidth = Math.min(maxWidth, percentage * maxWidth);
            this.progress.style.width = `${progressWidth}px`;
            
            const thumbPosition = padding + percentage * maxWidth;
            this.thumb.style.left = `${thumbPosition}px`;
            this.thumb.style.top = '50%';
        }
    }
    
    _updateCircularDisplay(percentage) {
        const { circularConfig } = this.config;
        const startAngle = circularConfig.startAngle;
        const endAngle = circularConfig.endAngle;
        
        // Calculer la plage totale
        let totalRange;
        if (endAngle >= startAngle) {
            totalRange = endAngle - startAngle;
        } else {
            totalRange = (360 - startAngle) + endAngle;
        }
        
        const isFullCircle = (totalRange >= 360) || (startAngle === -90 && endAngle === 270);
        
        if (isFullCircle) {
            // Logique simple pour cercle complet
            const offset = this.circumference * (1 - percentage);
            this.progress.style.strokeDashoffset = offset;
            
            const angle = percentage * 360 - 90;
            const radians = (angle * Math.PI) / 180;
            
            const padding = this.config.styling.containerPadding || 8;
            const centerX = (this.container.offsetWidth - 2 * padding) / 2 + padding;
            const centerY = (this.container.offsetHeight - 2 * padding) / 2 + padding;
            
            const thumbX = centerX + this.radius * Math.cos(radians);
            const thumbY = centerY + this.radius * Math.sin(radians);
            
            this.thumb.style.left = `${thumbX}px`;
            this.thumb.style.top = `${thumbY}px`;
        } else {
            // Logique avec bornes pour arc partiel
            const progressLength = (percentage * totalRange) / 360 * this.circumference;
            const offset = this.circumference - progressLength;
            this.progress.style.strokeDashoffset = offset;
            
            // Calculer l'angle du thumb selon les bornes
            let thumbAngle;
            if (circularConfig.clockwise) {
                thumbAngle = startAngle + (percentage * totalRange);
            } else {
                thumbAngle = startAngle + ((1 - percentage) * totalRange);
            }
            
            const radians = (thumbAngle * Math.PI) / 180;
            
            const padding = this.config.styling.containerPadding || 8;
            const centerX = (this.container.offsetWidth - 2 * padding) / 2 + padding;
            const centerY = (this.container.offsetHeight - 2 * padding) / 2 + padding;
            
            const thumbX = centerX + this.radius * Math.cos(radians);
            const thumbY = centerY + this.radius * Math.sin(radians);
            
            this.thumb.style.left = `${thumbX}px`;
            this.thumb.style.top = `${thumbY}px`;
        }
    }

    _triggerCallback(name) {
        const callback = this.config.callbacks[name];
        if (typeof callback === 'function') {
            callback(this.currentValue, this);
        }
    }

    // API publique
    setValue(value) {
        const oldValue = this.currentValue;
        this.currentValue = Math.max(this.config.min, Math.min(this.config.max, value));
        
        if (this.currentValue !== oldValue) {
            this._updateDisplay();
            this._triggerCallback('onChange');
        }
        return this;
    }

    getValue() {
        return this.currentValue;
    }

    enable() {
        this.style.pointerEvents = 'auto';
        this.style.opacity = '1';
        return this;
    }

    disable() {
        this.style.pointerEvents = 'none';
        this.style.opacity = '0.5';
        return this;
    }

    destroy() {
        if (this.parentNode) {
            this.parentNode.removeChild(this);
        }
    }
}

// Enregistrer le Web Component
customElements.define('squirrel-slider', Slider);

// Fonction de compatibilité
function SliderCompatible(config = {}) {
    const sliderElement = document.createElement('squirrel-slider');
    
    // Configuration par défaut complète
    const defaultConfig = {
        attach: 'body',
        x: 0, y: 0,
        width: 300, height: 60,
        min: 0, max: 100, step: 1, value: 50,
        baseValue: undefined,
        type: 'horizontal',
        
        circularConfig: {
            startAngle: -90,
            endAngle: 270,
            clockwise: true
        },
        
        styling: {
            backgroundColor: '#ffffff',
            trackColor: '#e0e0e0',
            progressColor: '#2196f3',
            thumbColor: '#2196f3',
            borderRadius: '8px',
            boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
            thumbSize: 20,
            trackHeight: 8,
            containerPadding: 8
        },
        
        callbacks: {}
    };
    
    // Fusionner correctement les configurations (deep merge)
    sliderElement.config = {
        ...defaultConfig,
        ...config,
        styling: {
            ...defaultConfig.styling,
            ...(config.styling || {})
        },
        circularConfig: {
            ...defaultConfig.circularConfig,
            ...(config.circularConfig || {})
        },
        callbacks: {
            ...defaultConfig.callbacks,
            ...(config.callbacks || {})
        }
    };
    
    sliderElement.currentValue = sliderElement.config.value;
    
    const attachTarget = config.attach || 'body';
    let container;
    
    if (typeof attachTarget === 'string') {
        container = document.querySelector(attachTarget);
        if (!container) {
            console.error(`Conteneur introuvable: ${attachTarget}`);
            return null;
        }
    } else {
        container = attachTarget;
    }
    
    container.appendChild(sliderElement);
    return sliderElement;
}

// Export par défaut pour compatibilité avec app.js
export default SliderCompatible;

// Export nommé pour flexibilité
export { Slider, SliderCompatible };

// Export global pour navigateur
if (typeof window !== 'undefined') {
    window.Slider = Slider;
    window.SliderCompatible = SliderCompatible;
}

// Export CommonJS pour Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Slider, SliderCompatible };
    module.exports.default = SliderCompatible;
}
