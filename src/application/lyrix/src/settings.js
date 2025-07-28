// Settings management for Lyrix application
import { CONSTANTS } from './constants.js';
import { StorageManager } from './storage.js';

export class SettingsManager {
    
    // Set font size with persistence and DOM updates
    static setFontSize(size) {
        if (size >= CONSTANTS.UI.MIN_FONT_SIZE && size <= CONSTANTS.UI.MAX_FONT_SIZE) {
            StorageManager.saveFontSize(size);
            
            // Update all lyrics lines
            document.querySelectorAll('.lyrics-line').forEach(el => {
                el.style.fontSize = size + 'px';
            });
            
            // Update font size display
            const display = document.getElementById('font-size-display');
            if (display) display.textContent = size + 'px';
            
            const slider = document.getElementById('font-size-slider');
            if (slider) slider.value = size;
            
            console.log('✅ Font size changed to', size + 'px');
            return true;
        }
        return false;
    }
    
    // Get current font size from storage
    static getFontSize() {
        return StorageManager.loadFontSize() || CONSTANTS.UI.DEFAULT_FONT_SIZE;
    }
    
    // Apply saved settings on startup
    static applySavedSettings() {
        const savedFontSize = this.getFontSize();
        this.setFontSize(savedFontSize);
    }
    
    // Reset settings to defaults
    static resetToDefaults() {
        this.setFontSize(CONSTANTS.UI.DEFAULT_FONT_SIZE);
        console.log('🔄 Settings reset to defaults');
    }
}

export default SettingsManager;
