/**
 * 🎯 SVELTE INTEGRATION FOR SQUIRREL FRAMEWORK
 * Entry point pour l'intégration Svelte locale
 */

// Import des composants Svelte
import Dashboard from './components/Dashboard.svelte';
import SettingsPanel from './components/SettingsPanel.svelte';
import { mount, unmount } from 'svelte';

// Fonctions globales pour la démo
window.createSquirrelDashboard = function(targetId, props = {}) {
    const target = document.getElementById(targetId);
    if (!target) {
        throw new Error(`Target element ${targetId} not found`);
    }
    
    return mount(Dashboard, {
        target,
        props
    });
};

window.createSquirrelSettings = function(targetId, props = {}) {
    const target = document.getElementById(targetId);
    if (!target) {
        throw new Error(`Target element ${targetId} not found`);
    }
    
    return mount(SettingsPanel, {
        target,
        props
    });
};

export class SvelteIntegration {
    constructor(squirrel) {
        this.squirrel = squirrel;
        this.components = new Map();
        this.availableComponents = {
            Dashboard,
            SettingsPanel
        };
    }
    
    /**
     * Monte un composant Svelte dans un élément DOM
     */
    async mountComponent(componentName, target, props = {}) {
        try {
            const Component = this.availableComponents[componentName];
            
            if (!Component) {
                throw new Error(`Component ${componentName} not found`);
            }
            
            // Démonte le composant existant s'il y en a un
            this.unmountComponent(target);
            
            // Monte le nouveau composant avec l'API Svelte 5
            const instance = mount(Component, {
                target,
                props: { 
                    ...props, 
                    squirrel: this.squirrel // Inject Squirrel instance
                }
            });
            
            this.components.set(target, {
                instance,
                componentName
            });
            
            console.log(`✅ Svelte component ${componentName} mounted`);
            return instance;
            
        } catch (error) {
            console.error(`❌ Failed to mount Svelte component ${componentName}:`, error);
            return null;
        }
    }
    
    /**
     * Démonte un composant Svelte
     */
    unmountComponent(target) {
        const existing = this.components.get(target);
        if (existing) {
            // Utilise l'API Svelte 5 pour démonter
            unmount(existing.instance);
            this.components.delete(target);
            console.log(`🗑️ Svelte component ${existing.componentName} unmounted`);
        }
    }
    
    /**
     * Crée et monte un dashboard Squirrel
     */
    createDashboard(containerId = 'squirrel-dashboard') {
        const container = document.getElementById(containerId) || this.createContainer(containerId);
        return this.mountComponent('Dashboard', container);
    }
    
    /**
     * Crée et monte un panneau de settings
     */
    createSettingsPanel(containerId = 'squirrel-settings') {
        const container = document.getElementById(containerId) || this.createContainer(containerId);
        return this.mountComponent('SettingsPanel', container);
    }
    
    /**
     * Crée un conteneur DOM si nécessaire
     */
    createContainer(id) {
        const container = document.createElement('div');
        container.id = id;
        container.className = 'squirrel-svelte-container';
        document.body.appendChild(container);
        return container;
    }
    
    /**
     * Nettoyage complet
     */
    destroy() {
        this.components.forEach((component, target) => {
            this.unmountComponent(target);
        });
        
        console.log('🧹 Svelte integration cleaned up');
    }
    
    /**
     * Liste les composants montés
     */
    listMountedComponents() {
        return Array.from(this.components.entries()).map(([target, component]) => ({
            target: target.id || target.tagName,
            component: component.componentName
        }));
    }
}

// Export par défaut pour l'intégration avec Squirrel
export default function createSvelteIntegration(squirrel) {
    return new SvelteIntegration(squirrel);
}

// Export des composants pour usage direct si nécessaire
export {
    Dashboard,
    SettingsPanel
};