/**
 * 🔘 Toggle Button Web Component - Squirrel Framework
 * 
 * Bouton ON/OFF totalement skinnable avec syntaxe classe A
 * ✅ Web Component natif avec Shadow DOM et système de particules modernes
 * ✅ Même API que la classe A
 * ✅ Styling complet personnalisable
 * 
 * @version 2.0.0 - Modern Particle System Edition
 */

import { BaseComponent } from './BaseComponent.js';

class Button extends BaseComponent {
    constructor(config = {}) {
        super(); // Appeler le constructeur de BaseComponent
        
        // Traiter d'abord la configuration commune via BaseComponent
        this.processCommonConfig(config);
        
        // 🎯 MÊME SYNTAXE QUE LA CLASSE A
        this.config = {
            attach: config.attach || 'body',
            x: config.x || 0,
            y: config.y || 0,
            width: config.width || 80,
            height: config.height || 40,
            value: config.value || false, // true = ON, false = OFF
            text: config.text || { on: 'ON', off: 'OFF' },
            styling: {
                // Styles par défaut
                backgroundColor: '#e0e0e0',
                backgroundColorOn: '#4CAF50',
                backgroundColorOff: '#f44336',
                borderRadius: '20px',
                border: 'none',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                // Merge avec les styles personnalisés
                ...config.styling
            },
            callbacks: config.callbacks || {},
            ...config
        };
        
        // Shadow DOM pour isolation
        this.attachShadow({ mode: 'open' });
        
        // État interne
        this.isOn = this.config.value;
        
        // Initialisation
        this._init();
    }
    
    _init() {
        this._createButtonStructure();
        this._applyClassAStyling();
        this._attachToTarget();
        this._setupEvents();
        this._updateDisplay();
        
        console.log(`🔘 Toggle Button Web Component created - State: ${this.isOn ? 'ON' : 'OFF'}`);
    }
    
    _createButtonStructure() {
        // Structure HTML optimisée pour Web Component
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    position: absolute;
                    box-sizing: border-box;
                    user-select: none;
                }
                
                .toggle-container {
                    width: 100%;
                    height: 100%;
                    position: relative;
                    overflow: hidden;
                }
                
                .toggle-button {
                    width: 100%;
                    height: 100%;
                    border: none;
                    outline: none;
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: inherit;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                
                .toggle-button:active {
                    transform: scale(0.95);
                }
                
                .toggle-button.disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                
                .toggle-slider {
                    position: absolute;
                    top: 2px;
                    left: 2px;
                    width: calc(50% - 2px);
                    height: calc(100% - 4px);
                    background: rgba(255,255,255,0.9);
                    border-radius: inherit;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                }
                
                .toggle-button.on .toggle-slider {
                    transform: translateX(100%);
                }
                
                .toggle-text {
                    position: relative;
                    z-index: 10;
                    pointer-events: none;
                    transition: all 0.3s ease;
                }
                
                .ripple {
                    position: absolute;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.6);
                    transform: scale(0);
                    animation: ripple 0.6s linear;
                    pointer-events: none;
                }
                
                @keyframes ripple {
                    to {
                        transform: scale(4);
                        opacity: 0;
                    }
                }
            </style>
            
            <div class="toggle-container">
                <button class="toggle-button" type="button">
                    <div class="toggle-slider"></div>
                    <span class="toggle-text"></span>
                </button>
            </div>
        `;
        
        // Références aux éléments
        this.button = this.shadowRoot.querySelector('.toggle-button');
        this.slider = this.shadowRoot.querySelector('.toggle-slider');
        this.textElement = this.shadowRoot.querySelector('.toggle-text');
    }
    
    _applyClassAStyling() {
        // 🎨 APPLIQUE LE STYLING COMME LA CLASSE A
        const styling = this.config.styling;
        
        // Styles de base
        Object.keys(styling).forEach(property => {
            if (property.startsWith('background') && !property.includes('On') && !property.includes('Off')) {
                return; // Géré séparément
            }
            
            const cssProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();
            
            if (property === 'borderRadius') {
                this.button.style[property] = styling[property];
                this.slider.style[property] = styling[property];
            } else if (!property.includes('On') && !property.includes('Off')) {
                this.button.style[property] = styling[property];
            }
        });
        
        // Couleurs personnalisées
        if (styling.color) {
            this.textElement.style.color = styling[property];
        }
    }
    
    _attachToTarget() {
        // Auto-attachment si spécifié via BaseComponent
        if (this.config.attach && !this.parentElement) {
            this._performAttachment();
        }
    }
    
    _setupEvents() {
        this.button.addEventListener('click', (e) => {
            if (this.config.disabled) return;
            
            this._createRipple(e);
            this.toggle();
        });
        
        // Support clavier
        this.button.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.toggle();
            }
        });
    }
    
    _createRipple(e) {
        // Effet ripple au clic
        const rect = this.button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        
        const ripple = document.createElement('div');
        ripple.className = 'ripple';
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        
        this.button.appendChild(ripple);
        
        setTimeout(() => ripple.remove(), 600);
    }
    
    _updateDisplay() {
        const styling = this.config.styling;
        
        // État ON/OFF
        if (this.isOn) {
            this.button.classList.add('on');
            this.button.classList.remove('off');
            this.button.style.backgroundColor = styling.backgroundColorOn || '#4CAF50';
            this.textElement.textContent = this.config.text.on || 'ON';
        } else {
            this.button.classList.add('off');
            this.button.classList.remove('on');
            this.button.style.backgroundColor = styling.backgroundColorOff || '#f44336';
            this.textElement.textContent = this.config.text.off || 'OFF';
        }
        
        // Disabled state
        if (this.config.disabled) {
            this.button.classList.add('disabled');
        } else {
            this.button.classList.remove('disabled');
        }
    }
    
    // 🎯 MÊME API QUE LA CLASSE A
    setValue(value) {
        const oldValue = this.isOn;
        this.isOn = Boolean(value);
        this._updateDisplay();
        
        // Callback onChange si la valeur a changé
        if (oldValue !== this.isOn && this.config.callbacks.onChange) {
            this.config.callbacks.onChange(this.isOn, this);
        }
        
        return this;
    }
    
    getValue() {
        return this.isOn;
    }
    
    toggle() {
        const oldValue = this.isOn;
        this.isOn = !this.isOn;
        this._updateDisplay();
        
        // Callbacks
        if (this.config.callbacks.onChange) {
            this.config.callbacks.onChange(this.isOn, this);
        }
        
        if (this.config.callbacks.onToggle) {
            this.config.callbacks.onToggle(this.isOn, oldValue, this);
        }
        
        return this;
    }
    
    // Méthodes additionnelles
    enable() {
        this.config.disabled = false;
        this._updateDisplay();
        return this;
    }
    
    disable() {
        this.config.disabled = true;
        this._updateDisplay();
        return this;
    }
    
    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
        this._applyClassAStyling();
        this._updateDisplay();
        return this;
    }
    
    updateText(onText, offText) {
        this.config.text.on = onText;
        this.config.text.off = offText;
        this._updateDisplay();
        return this;
    }
    
    destroy() {
        this.remove();
    }
}

// Enregistrement du Web Component
customElements.define('squirrel-toggle-button', Button);

export default Button;