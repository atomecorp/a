// UI management for Lyrix application using Squirrel components
import { default_theme } from './style.js';

export class UIManager {
    
    // Create a button using Squirrel Button component
    static createButton(config) {
        // Use default_theme.button as base configuration
        const defaultConfig = {
            css: {
                ...default_theme.button
            }
        };
        
        // Merge with default configuration
        const buttonConfig = {
            ...defaultConfig,
            ...config,
            css: {
                ...defaultConfig.css,
                ...config.css
            }
        };
        
        // Use Squirrel Button if available, fallback to DOM creation
        if (typeof Button === 'function') {
            return Button(buttonConfig);
        } else {
            // Fallback DOM creation using Squirrel $ syntax
            return $('button', buttonConfig);
        }
    }
    
    // Create primary button (green)
    static createPrimaryButton(config) {
        return this.createButton({
            ...config,
            css: {
                backgroundColor: default_theme.primaryColor || default_theme.button.backgroundColor || '#27ae60',
                color: 'white',
                ...config.css
            }
        });
    }
    
    // Create secondary button (blue)
    static createSecondaryButton(config) {
        return this.createButton({
            ...config,
            css: {
                backgroundColor: default_theme.secondaryColor || default_theme.button.backgroundColor || '#3498db',
                color: 'white',
                ...config.css
            }
        });
    }

    // Create standardized interface button with icon
    static createInterfaceButton(icon, config = {}) {
        return $('button', {
            text: icon,
            ...config,
            css: {
                // Utilise le style de bouton unifié (y compris width/height)
                ...default_theme.button,
                fontSize: '16px', // Icônes un peu plus grandes
                ...config.css
            },
            onmouseover: (e) => {
                // Only apply transform and shadow effects, no color change
                e.target.style.transform = 'translateY(-1px)';
                e.target.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                if (config.onmouseover) config.onmouseover(e);
            },
            onmouseout: (e) => {
                // Only reset transform and shadow, no color change
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                if (config.onmouseout) config.onmouseout(e);
            },
            onmousedown: (e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
                if (config.onmousedown) config.onmousedown(e);
            },
            onmouseup: (e) => {
                e.target.style.transform = 'translateY(-1px)';
                e.target.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                if (config.onmouseup) config.onmouseup(e);
            }
        });
    }
    
    // Create danger button (red)
    static createDangerButton(config) {
        return this.createButton({
            ...config,
            css: {
                backgroundColor: default_theme.dangerColor || default_theme.button.backgroundColor || '#e74c3c',
                color: 'white',
                ...config.css
            }
        });
    }
    
    // Create warning button (orange)
    static createWarningButton(config) {
        return this.createButton({
            ...config,
            css: {
                backgroundColor: default_theme.warningColor || default_theme.button.backgroundColor || '#f39c12',
                color: 'white',
                ...config.css
            }
        });
    }
    
    // Create container div
    static createContainer(id, css = {}) {
        return $('div', {
            id: id,
            css: {
                padding: '10px',
                borderRadius: '4px',
                ...css
            }
        });
    }
    
    // Create input field
    static createInput(config) {
        return $('input', {
            type: 'text',
            css: {
                width: '100%',
                padding: '8px',
                border: '1px solid #555',
                borderRadius: '4px',
                backgroundColor: '#2c3e50',
                color: 'white',
                fontSize: '14px'
            },
            ...config
        });
    }
    
    // Create slider using Squirrel Slider component
    static createSlider(config) {
        const defaultConfig = {
            min: 0,
            max: 100,
            value: 50,
            css: {
                width: '100px'
            }
        };
        
        const sliderConfig = {
            ...defaultConfig,
            ...config
        };
        
        // Use Squirrel Slider if available
        if (typeof Slider === 'function') {
            return Slider(sliderConfig);
        } else {
            // Fallback to range input
            return $('input', {
                type: 'range',
                min: sliderConfig.min,
                max: sliderConfig.max,
                value: sliderConfig.value,
                css: sliderConfig.css
            });
        }
    }
    
    // Create header section
    static createHeader(containerId) {
        return $('div', {
            id: containerId + '-header',
            css: {
                padding: '10px',
                background: '#333',
                color: 'white',
                borderRadius: '4px 4px 0 0'
            }
        });
    }
    
    // Create controls section
    static createControls(containerId) {
        return $('div', {
            id: containerId + '-controls',
            css: {
                padding: '10px',
                background: '#444',
                color: 'white',
                display: 'flex',
                gap: '10px',
                alignItems: 'center',
                flexWrap: 'wrap'
            }
        });
    }
    
    // Create modal dialog
    static createModal(title, content, onClose) {
        const overlay = $('div', {
            css: {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100vw',
                height: '100vh',
                background: 'rgba(0, 0, 0, 0.7)',
                zIndex: '10000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }
        });
        
        const modal = $('div', {
            css: {
                background: '#2c3e50',
                borderRadius: '10px',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
                maxWidth: '400px',
                width: '90%',
                padding: '0',
                color: 'white',
                textAlign: 'center',
                border: '1px solid #34495e'
            }
        });
        
        const header = $('div', {
            css: {
                background: '#34495e',
                padding: '15px',
                borderRadius: '10px 10px 0 0',
                borderBottom: '1px solid #1a252f'
            }
        });
        
        const headerTitle = $('h3', {
            text: title,
            css: {
                margin: '0',
                fontSize: '18px',
                color: '#ecf0f1'
            }
        });
        
        const contentDiv = $('div', {
            css: {
                padding: '20px',
                fontSize: '16px',
                lineHeight: '1.4',
                color: '#bdc3c7'
            }
        });
        
        if (typeof content === 'string') {
            contentDiv.textContent = content;
        } else {
            contentDiv.appendChild(content);
        }
        
        const buttonContainer = $('div', {
            css: {
                display: 'flex',
                gap: '10px',
                padding: '15px 20px 20px',
                justifyContent: 'center'
            }
        });
        
        const closeButton = this.createSecondaryButton({
            text: 'Close',
            onClick: () => {
                document.body.removeChild(overlay);
                if (onClose) onClose();
            }
        });
        
        // Build modal structure
        header.appendChild(headerTitle);
        buttonContainer.appendChild(closeButton);
        modal.appendChild(header);
        modal.appendChild(contentDiv);
        modal.appendChild(buttonContainer);
        overlay.appendChild(modal);
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
                if (onClose) onClose();
            }
        });
        
        // Close on Escape key
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(overlay);
                document.removeEventListener('keydown', escapeHandler);
                if (onClose) onClose();
            }
        };
        document.addEventListener('keydown', escapeHandler);
        
        // Add to DOM and focus
        document.body.appendChild(overlay);
        setTimeout(() => closeButton.focus(), 100);
        
        return overlay;
    }
    
    // Create confirmation dialog
    static createConfirmDialog(title, message, onConfirm, onCancel) {
        const overlay = $('div', {
            css: {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100vw',
                height: '100vh',
                background: 'rgba(0, 0, 0, 0.7)',
                zIndex: '10000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }
        });
        
        const modal = $('div', {
            css: {
                background: '#2c3e50',
                borderRadius: '10px',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
                maxWidth: '400px',
                width: '90%',
                padding: '0',
                color: 'white',
                textAlign: 'center',
                border: '1px solid #34495e'
            }
        });
        
        const header = $('div', {
            css: {
                background: '#e74c3c',
                padding: '15px',
                borderRadius: '10px 10px 0 0',
                borderBottom: '1px solid #c0392b'
            }
        });
        
        const headerTitle = $('h3', {
            text: '⚠️ ' + title,
            css: {
                margin: '0',
                fontSize: '18px',
                color: 'white'
            }
        });
        
        const contentDiv = $('div', {
            text: message,
            css: {
                padding: '20px',
                fontSize: '16px',
                lineHeight: '1.4',
                color: '#bdc3c7'
            }
        });
        
        const buttonContainer = $('div', {
            css: {
                display: 'flex',
                gap: '10px',
                padding: '15px 20px 20px',
                justifyContent: 'center'
            }
        });
        
        const cancelButton = this.createButton({
            text: 'Cancel',
            css: {
                backgroundColor: '#7f8c8d',
                color: 'white'
            },
            onClick: () => {
                document.body.removeChild(overlay);
                if (onCancel) onCancel();
            }
        });
        
        const confirmButton = this.createDangerButton({
            text: 'Confirm',
            onClick: () => {
                document.body.removeChild(overlay);
                if (onConfirm) onConfirm();
            }
        });
        
        // Build modal structure
        header.appendChild(headerTitle);
        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(confirmButton);
        modal.appendChild(header);
        modal.appendChild(contentDiv);
        modal.appendChild(buttonContainer);
        overlay.appendChild(modal);
        
        // Close on overlay click (cancel)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
                if (onCancel) onCancel();
            }
        });
        
        // Close on Escape key (cancel)
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(overlay);
                document.removeEventListener('keydown', escapeHandler);
                if (onCancel) onCancel();
            }
        };
        document.addEventListener('keydown', escapeHandler);
        
        // Add to DOM and focus cancel button
        document.body.appendChild(overlay);
        setTimeout(() => cancelButton.focus(), 100);
        
        return overlay;
    }
    
    // Show alert dialog
    static showAlert(title, message, onOk) {
        return this.createModal(title, message, onOk);
    }
    
    // Show confirm dialog
    static showConfirm(title, message, onConfirm, onCancel) {
        return this.createConfirmDialog(title, message, onConfirm, onCancel);
    }

    // Create timecode display
    static createTimecodeDisplay() {
        return $('div', {
            id: 'timecode',
            css: {
                // Utilise le style de bouton unifié (y compris width/height)
                ...default_theme.button,
                // Spécificités du timecode
                fontFamily: 'monospace'
            },
            text: '0.000s'
        });
    }
    
    // Format time for display (convert seconds to mm:ss.sss format)
    static formatTimeDisplay(seconds) {
        if (seconds === null || seconds === undefined || isNaN(seconds)) {
            return '--:--';
        }
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        
        // Format as mm:ss.sss
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toFixed(3).padStart(6, '0')}`;
    }

    // ===== CENTRALIZED UI CREATION SYSTEM =====
    // All UI creation methods centralized here to avoid code duplication
    
    // ===== THEME AND STYLES =====
    static THEME = {
        colors: {
            primary: '#4a6fa5',
            secondary: '#16213e', 
            background: '#1a1a2e',
            surface: '#0f3460',
            accent: '#f39c12',
            success: '#27ae60',
            warning: '#f39c12', 
            danger: '#e74c3c',
            text: '#ecf0f1',
            textSecondary: '#bdc3c7',
            border: '#34495e'
        },
        
        spacing: {
            xs: '4px',
            sm: '8px',
            md: '15px',
            lg: '20px',
            xl: '33px'
        },
        
        borderRadius: {
            sm: '4px',
            md: '8px',
            lg: '12px'
        },
        
        fontSize: {
            xs: '12px',
            sm: '14px',
            md: '16px',
            lg: '18px',
            xl: '24px',
            xxl: '32px'
        }
    };

    // ===== LAYOUT COMPONENTS =====
    
    // Create a div container with common styling
    static createCentralizedContainer(config = {}) {
        const defaultConfig = {
            css: {
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: this.THEME.colors.surface,
                borderRadius: this.THEME.borderRadius.md,
                padding: this.THEME.spacing.md
            }
        };
        
        return $('div', {
            ...defaultConfig,
            ...config,
            css: {
                ...defaultConfig.css,
                ...config.css
            }
        });
    }

    // Create a panel with header
    static createPanel(config = {}) {
        const { title, children = [], ...rest } = config;
        
        const panel = this.createCentralizedContainer({
            ...rest,
            css: {
                border: `1px solid ${this.THEME.colors.border}`,
                margin: this.THEME.spacing.sm,
                ...rest.css
            }
        });

        if (title) {
            const header = this.createCentralizedHeader({ text: title });
            panel.appendChild(header);
        }

        children.forEach(child => {
            if (child) panel.appendChild(child);
        });

        return panel;
    }

    // Create a flexible layout container
    static createLayout(config = {}) {
        const { direction = 'row', gap = this.THEME.spacing.md, ...rest } = config;
        
        return $('div', {
            ...rest,
            css: {
                display: 'flex',
                flexDirection: direction,
                gap: gap,
                width: '100%',
                height: '100%',
                ...rest.css
            }
        });
    }

    // ===== ENHANCED BUTTONS =====
    
    // Icon button
    static createIconButton(config = {}) {
        return this.createButton({
            ...config,
            css: {
                backgroundColor: 'transparent',
                border: 'none',
                color: this.THEME.colors.text,
                padding: this.THEME.spacing.sm,
                borderRadius: this.THEME.borderRadius.sm,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                ...config.css
            }
        });
    }

    // Toolbar button
    static createToolbarButton(config = {}) {
        return this.createIconButton({
            ...config,
            css: {
                backgroundColor: this.THEME.colors.surface,
                border: `1px solid ${this.THEME.colors.border}`,
                margin: `0 ${this.THEME.spacing.xs}`,
                minWidth: '40px',
                height: '40px',
                ...config.css
            }
        });
    }

    // ===== TEXT ELEMENTS =====
    
    // Create headers (renamed to avoid conflict)
    static createCentralizedHeader(config = {}) {
        const { level = 3, ...rest } = config;
        
        return $(`h${level}`, {
            ...rest,
            css: {
                color: this.THEME.colors.text,
                fontSize: this.THEME.fontSize[level <= 2 ? 'xl' : 'lg'],
                fontWeight: 'bold',
                margin: `${this.THEME.spacing.sm} 0`,
                ...rest.css
            }
        });
    }

    // Create text spans
    static createText(config = {}) {
        return $('span', {
            ...config,
            css: {
                color: this.THEME.colors.text,
                fontSize: this.THEME.fontSize.sm,
                ...config.css
            }
        });
    }

    // Create labels
    static createLabel(config = {}) {
        return $('label', {
            ...config,
            css: {
                color: this.THEME.colors.text,
                fontSize: this.THEME.fontSize.sm,
                fontWeight: '500',
                marginBottom: this.THEME.spacing.xs,
                display: 'block',
                ...config.css
            }
        });
    }

    // ===== ENHANCED FORM ELEMENTS =====
    
    // Create enhanced inputs
    static createCentralizedInput(config = {}) {
        return $('input', {
            ...config,
            css: {
                backgroundColor: this.THEME.colors.background,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.sm,
                color: this.THEME.colors.text,
                padding: this.THEME.spacing.sm,
                fontSize: this.THEME.fontSize.sm,
                width: '100%',
                ...config.css
            }
        });
    }

    // Create textareas
    static createTextarea(config = {}) {
        return $('textarea', {
            ...config,
            css: {
                backgroundColor: this.THEME.colors.background,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.sm,
                color: this.THEME.colors.text,
                padding: this.THEME.spacing.sm,
                fontSize: this.THEME.fontSize.sm,
                width: '100%',
                resize: 'vertical',
                minHeight: '80px',
                ...config.css
            }
        });
    }

    // Create selects
    static createSelect(config = {}) {
        return $('select', {
            ...config,
            css: {
                backgroundColor: this.THEME.colors.background,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.sm,
                color: this.THEME.colors.text,
                padding: this.THEME.spacing.sm,
                fontSize: this.THEME.fontSize.sm,
                width: '100%',
                ...config.css
            }
        });
    }

    // ===== SPECIALIZED COMPONENTS =====
    
    // Create toolbar
    static createCentralizedToolbar(config = {}) {
        return $('div', {
            ...config,
            css: {
                display: 'flex',
                alignItems: 'center',
                backgroundColor: this.THEME.colors.surface,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.sm,
                padding: this.THEME.spacing.sm,
                gap: this.THEME.spacing.xs,
                ...config.css
            }
        });
    }

    // Create control group
    static createControlGroup(config = {}) {
        return $('div', {
            ...config,
            css: {
                display: 'flex',
                alignItems: 'center',
                gap: this.THEME.spacing.sm,
                marginBottom: this.THEME.spacing.md,
                ...config.css
            }
        });
    }

    // Create time display
    static createTimeDisplay(config = {}) {
        return $('div', {
            ...config,
            css: {
                backgroundColor: this.THEME.colors.background,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.sm,
                padding: this.THEME.spacing.sm,
                fontFamily: 'monospace',
                fontSize: this.THEME.fontSize.md,
                color: this.THEME.colors.accent,
                textAlign: 'center',
                minWidth: '80px',
                ...config.css
            }
        });
    }

    // ===== LYRIX-SPECIFIC COMPONENTS =====

    // Create lyrics line
    static createLyricsLine(config = {}) {
        return $('div', {
            ...config,
            css: {
                backgroundColor: this.THEME.colors.surface,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.sm,
                padding: this.THEME.spacing.md,
                margin: `${this.THEME.spacing.xs} 0`,
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                ...config.css
            }
        });
    }

    // Create metadata display
    static createMetadata(config = {}) {
        return $('div', {
            ...config,
            css: {
                backgroundColor: this.THEME.colors.surface,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.sm,
                padding: this.THEME.spacing.lg,
                marginBottom: this.THEME.spacing.lg,
                textAlign: 'center',
                ...config.css
            }
        });
    }

    // Create audio controls container
    static createAudioControls(config = {}) {
        return $('div', {
            ...config,
            css: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: this.THEME.spacing.md,
                backgroundColor: this.THEME.colors.surface,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.sm,
                padding: this.THEME.spacing.lg,
                ...config.css
            }
        });
    }

    // Create sidebar panel
    static createSidebar(config = {}) {
        return $('div', {
            ...config,
            css: {
                width: '300px',
                minWidth: '300px',
                height: '100%',
                backgroundColor: this.THEME.colors.surface,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.sm,
                padding: this.THEME.spacing.md,
                overflow: 'auto',
                ...config.css
            }
        });
    }

    // ===== MODAL COMPONENTS =====
    
    // Create modal overlay
    static createModalOverlay(config = {}) {
        return $('div', {
            ...config,
            css: {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: '1000',
                ...config.css
            }
        });
    }

    // Create modal container
    static createModalContainer(config = {}) {
        return $('div', {
            ...config,
            css: {
                backgroundColor: this.THEME.colors.surface,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.lg,
                padding: this.THEME.spacing.xl,
                maxWidth: '600px',
                maxHeight: '80vh',
                overflow: 'auto',
                position: 'relative',
                ...config.css
            }
        });
    }

    // ===== UTILITY METHODS =====
    
    // Create spacer
    static createSpacer(size = this.THEME.spacing.md) {
        return $('div', {
            css: {
                height: size,
                width: size,
                flexShrink: 0
            }
        });
    }

    // Create separator
    static createSeparator(config = {}) {
        return $('div', {
            ...config,
            css: {
                height: '1px',
                backgroundColor: this.THEME.colors.border,
                margin: `${this.THEME.spacing.md} 0`,
                ...config.css
            }
        });
    }

    // ===== SPECIALIZED LYRIX COMPONENTS =====
    // All specific UI components used throughout the application

    // Main application container
    static createMainApp(config = {}) {
        return $('div', {
            id: 'lyrix-app',
            ...config,
            css: {
                width: '100vw',
                height: '100vh',
                backgroundColor: this.THEME.colors.background,
                color: this.THEME.colors.text,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                ...config.css
            }
        });
    }

    // Main layout container
    static createMainLayout(config = {}) {
        return $('div', {
            id: 'main-layout',
            ...config,
            css: {
                display: 'flex',
                flex: '1',
                height: '100%',
                gap: this.THEME.spacing.md,
                padding: this.THEME.spacing.md,
                ...config.css
            }
        });
    }

    // Left panel container
    static createLeftPanel(config = {}) {
        return $('div', {
            id: 'left-panel',
            ...config,
            css: {
                width: '300px',
                minWidth: '300px',
                backgroundColor: this.THEME.colors.surface,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.lg,
                padding: this.THEME.spacing.lg,
                display: 'flex',
                flexDirection: 'column',
                gap: this.THEME.spacing.md,
                overflow: 'auto',
                ...config.css
            }
        });
    }

    // Right panel container
    static createRightPanel(config = {}) {
        return $('div', {
            id: 'right-panel',
            ...config,
            css: {
                flex: '1',
                backgroundColor: this.THEME.colors.surface,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.lg,
                padding: this.THEME.spacing.lg,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                ...config.css
            }
        });
    }

    // Settings content container
    static createSettingsContent(config = {}) {
        return $('div', {
            ...config,
            css: {
                padding: this.THEME.spacing.lg,
                backgroundColor: this.THEME.colors.surface,
                borderRadius: this.THEME.borderRadius.md,
                border: `1px solid ${this.THEME.colors.border}`,
                ...config.css
            }
        });
    }

    // Settings section
    static createSettingsSection(config = {}) {
        return $('div', {
            ...config,
            css: {
                marginBottom: this.THEME.spacing.lg,
                padding: this.THEME.spacing.md,
                backgroundColor: this.THEME.colors.background,
                borderRadius: this.THEME.borderRadius.sm,
                border: `1px solid ${this.THEME.colors.border}`,
                ...config.css
            }
        });
    }

    // Settings title
    static createSettingsTitle(config = {}) {
        return $('div', {
            ...config,
            css: {
                fontSize: this.THEME.fontSize.lg,
                fontWeight: 'bold',
                color: this.THEME.colors.text,
                marginBottom: this.THEME.spacing.sm,
                paddingBottom: this.THEME.spacing.sm,
                borderBottom: `1px solid ${this.THEME.colors.border}`,
                ...config.css
            }
        });
    }

    // Settings input container
    static createSettingsContainer(config = {}) {
        return $('div', {
            ...config,
            css: {
                display: 'flex',
                alignItems: 'center',
                gap: this.THEME.spacing.sm,
                marginBottom: this.THEME.spacing.sm,
                ...config.css
            }
        });
    }

    // MIDI note input
    static createMidiInput(config = {}) {
        return $('input', {
            type: 'number',
            min: '0',
            max: '127',
            ...config,
            css: {
                width: '80px',
                backgroundColor: this.THEME.colors.background,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.sm,
                color: this.THEME.colors.text,
                padding: this.THEME.spacing.sm,
                fontSize: this.THEME.fontSize.sm,
                ...config.css
            }
        });
    }

    // Audio controls container
    static createAudioControlsContainer(config = {}) {
        return $('div', {
            id: 'audio-controls-container',
            ...config,
            css: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: this.THEME.spacing.lg,
                padding: this.THEME.spacing.lg,
                backgroundColor: this.THEME.colors.surface,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.md,
                marginBottom: this.THEME.spacing.lg,
                ...config.css
            }
        });
    }

    // Scrub container for audio timeline
    static createScrubContainer(config = {}) {
        return $('div', {
            id: 'scrub-container',
            ...config,
            css: {
                display: 'flex',
                flexDirection: 'column',
                gap: this.THEME.spacing.sm,
                padding: this.THEME.spacing.md,
                backgroundColor: this.THEME.colors.background,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.sm,
                ...config.css
            }
        });
    }

    // Time labels container
    static createTimeLabels(config = {}) {
        return $('div', {
            id: 'time-labels-container',
            ...config,
            css: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: this.THEME.fontSize.sm,
                color: this.THEME.colors.textSecondary,
                ...config.css
            }
        });
    }

    // Current time label
    static createCurrentTimeLabel(config = {}) {
        return $('span', {
            id: 'current-time',
            text: '0:00',
            ...config,
            css: {
                fontFamily: 'monospace',
                color: this.THEME.colors.accent,
                ...config.css
            }
        });
    }

    // Total time label
    static createTotalTimeLabel(config = {}) {
        return $('span', {
            id: 'total-time',
            text: '0:00',
            ...config,
            css: {
                fontFamily: 'monospace',
                color: this.THEME.colors.textSecondary,
                ...config.css
            }
        });
    }

    // Enhanced timecode display
    static createEnhancedTimecodeDisplay(config = {}) {
        const element = $('div', {
            id: 'timecode-display',
            ...config,
            css: {
                // Utilise le style de bouton unifié SAUF la largeur
                ...default_theme.button,
                // Spécificités du timecode
                fontFamily: 'monospace',
                textAlign: 'center',
                // Largeur adaptative pour le timecode
                width: 'auto',
                minWidth: '80px', // Plus large que les boutons normaux
                paddingLeft: '12px',
                paddingRight: '12px',
                ...config.css
            }
        });
        
        // Ajouter la classe CSS pour que styleModeToolsForToolbar puisse l'identifier
        element.classList.add('timecode-display');
        
        return element;
    }

    // Display container for lyrics
    static createDisplayContainer(config = {}) {
        return $('div', {
            id: 'display-container',
            ...config,
            css: {
                flex: '1',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: this.THEME.colors.surface,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.md,
                overflow: 'hidden',
                ...config.css
            }
        });
    }

    // Lyrics toolbar
    static createLyricsToolbar(config = {}) {
        return $('div', {
            id: 'lyrics-toolbar',
            ...config,
            css: {
                display: 'flex',
                alignItems: 'center',
                gap: this.THEME.spacing.sm,
                padding: this.THEME.spacing.md,
                backgroundColor: this.THEME.colors.background,
                borderBottom: `1px solid ${this.THEME.colors.border}`,
                borderRadius: `${this.THEME.borderRadius.md} ${this.THEME.borderRadius.md} 0 0`,
                // Rendre la barre d'outils sticky pour qu'elle reste en haut lors du scroll
                position: 'sticky',
                top: '0',
                zIndex: '100', // S'assurer qu'elle reste au-dessus du contenu
                ...config.css
            }
        });
    }

    // Lyrics content area
    static createLyricsContent(config = {}) {
        return $('div', {
            id: 'lyrics-content',
            ...config,
            css: {
                flex: '1',
                padding: this.THEME.spacing.lg,
                backgroundColor: this.THEME.colors.surface,
                overflow: 'auto',
                ...config.css
            }
        });
    }

    // Font size container
    static createFontSizeContainer(config = {}) {
        return $('div', {
            id: 'font-size-container',
            ...config,
            css: {
                display: 'flex',
                alignItems: 'center',
                gap: this.THEME.spacing.sm,
                padding: this.THEME.spacing.sm,
                backgroundColor: this.THEME.colors.background,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.sm,
                ...config.css
            }
        });
    }

    // Font size label
    static createFontSizeLabel(config = {}) {
        return $('span', {
            id: 'font-size-display',
            ...config,
            css: {
                fontSize: this.THEME.fontSize.sm,
                color: this.THEME.colors.text,
                fontWeight: '500',
                minWidth: '40px',
                textAlign: 'center',
                ...config.css
            }
        });
    }

    // Lyrics metadata container
    static createLyricsMetadata(config = {}) {
        return $('div', {
            ...config,
            css: {
                padding: this.THEME.spacing.lg,
                backgroundColor: this.THEME.colors.surface,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.md,
                marginBottom: this.THEME.spacing.lg,
                textAlign: 'center',
                ...config.css
            }
        });
    }

    // Album display
    static createAlbumDisplay(config = {}) {
        return $('div', {
            ...config,
            css: {
                fontSize: this.THEME.fontSize.sm,
                color: this.THEME.colors.textSecondary,
                fontStyle: 'italic',
                marginTop: this.THEME.spacing.xs,
                ...config.css
            }
        });
    }

    // Lyrics lines container
    static createLyricsLinesContainer(config = {}) {
        return $('div', {
            id: 'lyrics-lines-container',
            ...config,
            css: {
                display: 'flex',
                flexDirection: 'column',
                gap: this.THEME.spacing.sm,
                ...config.css
            }
        });
    }

    // Individual lyrics line
    static createLyricsLineDiv(config = {}) {
        return $('div', {
            className: 'lyrics-line',
            ...config,
            css: {
                padding: this.THEME.spacing.md,
                backgroundColor: this.THEME.colors.background,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.sm,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: this.THEME.spacing.md,
                ...config.css
            }
        });
    }

    // Lyrics line content
    static createLyricsLineContent(config = {}) {
        return $('div', {
            id: 'lyrics-line-content',
            ...config,
            css: {
                display: 'flex',
                alignItems: 'center',
                gap: this.THEME.spacing.md,
                flex: '1',
                ...config.css
            }
        });
    }

    // Time span for lyrics
    static createTimeSpan(config = {}) {
        return $('span', {
            className: 'time-display',
            ...config,
            css: {
                fontFamily: 'monospace',
                fontSize: this.THEME.fontSize.sm,
                color: this.THEME.colors.accent,
                backgroundColor: this.THEME.colors.surface,
                padding: `${this.THEME.spacing.xs} ${this.THEME.spacing.sm}`,
                borderRadius: this.THEME.borderRadius.sm,
                border: `1px solid ${this.THEME.colors.border}`,
                minWidth: '80px',
                textAlign: 'center',
                ...config.css
            }
        });
    }

    // Text span for lyrics
    static createTextSpan(config = {}) {
        return $('span', {
            className: 'lyrics-text',
            ...config,
            css: {
                flex: '1',
                fontSize: this.THEME.fontSize.md,
                color: this.THEME.colors.text,
                lineHeight: '1.4',
                ...config.css
            }
        });
    }

    // Line controls container
    static createLineControls(config = {}) {
        return $('div', {
            id: 'line-controls',
            ...config,
            css: {
                display: 'flex',
                gap: this.THEME.spacing.xs,
                alignItems: 'center',
                ...config.css
            }
        });
    }

    // Bulk edit controls
    static createBulkEditControls(config = {}) {
        return $('div', {
            id: 'bulk-edit-controls',
            ...config,
            css: {
                display: 'flex',
                justifyContent: 'center',
                gap: this.THEME.spacing.md,
                padding: this.THEME.spacing.lg,
                backgroundColor: this.THEME.colors.background,
                borderTop: `1px solid ${this.THEME.colors.border}`,
                borderRadius: `0 0 ${this.THEME.borderRadius.md} ${this.THEME.borderRadius.md}`,
                ...config.css
            }
        });
    }

    // Save button for bulk edit
    static createSaveButton(config = {}) {
        return $('button', {
            text: 'Save Changes',
            ...config,
            css: {
                backgroundColor: this.THEME.colors.success,
                color: 'white',
                border: 'none',
                borderRadius: this.THEME.borderRadius.sm,
                padding: `${this.THEME.spacing.sm} ${this.THEME.spacing.lg}`,
                fontSize: this.THEME.fontSize.sm,
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                ...config.css
            }
        });
    }

    // Cancel button for bulk edit
    static createCancelButton(config = {}) {
        return $('button', {
            text: 'Cancel',
            ...config,
            css: {
                backgroundColor: this.THEME.colors.border,
                color: this.THEME.colors.text,
                border: 'none',
                borderRadius: this.THEME.borderRadius.sm,
                padding: `${this.THEME.spacing.sm} ${this.THEME.spacing.lg}`,
                fontSize: this.THEME.fontSize.sm,
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                ...config.css
            }
        });
    }

    // ===== MODAL SYSTEM COMPONENTS =====

    // Enhanced modal overlay
    static createEnhancedModalOverlay(config = {}) {
        return $('div', {
            ...config,
            css: {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: '1000',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                ...config.css
            }
        });
    }

    // Enhanced modal container
    static createEnhancedModalContainer(config = {}) {
        return $('div', {
            ...config,
            css: {
                backgroundColor: this.THEME.colors.surface,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.lg,
                maxWidth: '600px',
                maxHeight: '80vh',
                overflow: 'auto',
                position: 'relative',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
                ...config.css
            }
        });
    }

    // Modal header
    static createModalHeader(config = {}) {
        return $('div', {
            ...config,
            css: {
                padding: this.THEME.spacing.lg,
                backgroundColor: this.THEME.colors.primary,
                borderRadius: `${this.THEME.borderRadius.lg} ${this.THEME.borderRadius.lg} 0 0`,
                borderBottom: `1px solid ${this.THEME.colors.border}`,
                color: 'white',
                ...config.css
            }
        });
    }

    // Modal content area
    static createModalContent(config = {}) {
        return $('div', {
            ...config,
            css: {
                padding: this.THEME.spacing.lg,
                color: this.THEME.colors.text,
                maxHeight: '400px',
                overflow: 'auto',
                ...config.css
            }
        });
    }

    // Modal footer
    static createModalFooter(config = {}) {
        return $('div', {
            ...config,
            css: {
                display: 'flex',
                justifyContent: 'flex-end',
                gap: this.THEME.spacing.md,
                padding: this.THEME.spacing.lg,
                backgroundColor: this.THEME.colors.background,
                borderTop: `1px solid ${this.THEME.colors.border}`,
                borderRadius: `0 0 ${this.THEME.borderRadius.lg} ${this.THEME.borderRadius.lg}`,
                ...config.css
            }
        });
    }

    // Input field container for forms
    static createInputFieldContainer(config = {}) {
        return $('div', {
            ...config,
            css: {
                marginBottom: this.THEME.spacing.md,
                ...config.css
            }
        });
    }

    // Form label
    static createFormLabel(config = {}) {
        return $('label', {
            ...config,
            css: {
                display: 'block',
                fontSize: this.THEME.fontSize.sm,
                fontWeight: '500',
                color: this.THEME.colors.text,
                marginBottom: this.THEME.spacing.xs,
                ...config.css
            }
        });
    }

    // Form input
    static createFormInput(config = {}) {
        return $('input', {
            ...config,
            css: {
                width: '100%',
                padding: this.THEME.spacing.sm,
                backgroundColor: this.THEME.colors.background,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.sm,
                color: this.THEME.colors.text,
                fontSize: this.THEME.fontSize.sm,
                ...config.css
            }
        });
    }

    // Search input
    static createSearchInput(config = {}) {
        return $('input', {
            type: 'text',
            placeholder: 'Search...',
            ...config,
            css: {
                width: '100%',
                padding: this.THEME.spacing.sm,
                backgroundColor: this.THEME.colors.background,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.sm,
                color: this.THEME.colors.text,
                fontSize: this.THEME.fontSize.sm,
                marginBottom: this.THEME.spacing.md,
                ...config.css
            }
        });
    }

    // List container for modals
    static createListContainer(config = {}) {
        return $('div', {
            ...config,
            css: {
                maxHeight: '300px',
                overflow: 'auto',
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.sm,
                backgroundColor: this.THEME.colors.background,
                ...config.css
            }
        });
    }

    // List item element
    static createListItem(config = {}) {
        return $('div', {
            ...config,
            css: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: this.THEME.spacing.md,
                borderBottom: `1px solid ${this.THEME.colors.border}`,
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
                ...config.css
            }
        });
    }

    // List item text
    static createListItemText(config = {}) {
        return $('span', {
            ...config,
            css: {
                flex: '1',
                fontSize: this.THEME.fontSize.sm,
                color: this.THEME.colors.text,
                ...config.css
            }
        });
    }

    // MIDI container for controls
    static createMidiContainer(config = {}) {
        return $('div', {
            ...config,
            css: {
                display: 'flex',
                alignItems: 'center',
                gap: this.THEME.spacing.sm,
                marginLeft: this.THEME.spacing.md,
                ...config.css
            }
        });
    }

    // MIDI learn button
    static createMidiLearnButton(config = {}) {
        return $('button', {
            text: 'Learn',
            ...config,
            css: {
                backgroundColor: this.THEME.colors.accent,
                color: 'white',
                border: 'none',
                borderRadius: this.THEME.borderRadius.sm,
                padding: `${this.THEME.spacing.xs} ${this.THEME.spacing.sm}`,
                fontSize: this.THEME.fontSize.xs,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                ...config.css
            }
        });
    }

    // Delete button for items
    static createDeleteButton(config = {}) {
        return $('button', {
            text: '🗑️',
            ...config,
            css: {
                backgroundColor: this.THEME.colors.danger,
                color: 'white',
                border: 'none',
                borderRadius: this.THEME.borderRadius.sm,
                padding: this.THEME.spacing.xs,
                fontSize: this.THEME.fontSize.sm,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...config.css
            }
        });
    }

    // No items message
    static createNoItemsMessage(config = {}) {
        return $('div', {
            text: 'No items found',
            ...config,
            css: {
                padding: this.THEME.spacing.lg,
                textAlign: 'center',
                color: this.THEME.colors.textSecondary,
                fontStyle: 'italic',
                ...config.css
            }
        });
    }

    // ===== MIDI UTILITIES COMPONENTS =====

    // MIDI main container
    static createMidiMainContainer(config = {}) {
        return $('div', {
            id: 'midi-container',
            ...config,
            css: {
                backgroundColor: this.THEME.colors.surface,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.md,
                padding: this.THEME.spacing.lg,
                marginBottom: this.THEME.spacing.md,
                ...config.css
            }
        });
    }

    // MIDI title
    static createMidiTitle(config = {}) {
        return $('div', {
            text: '🎛️ MIDI Controller',
            ...config,
            css: {
                fontSize: this.THEME.fontSize.lg,
                fontWeight: 'bold',
                color: this.THEME.colors.text,
                marginBottom: this.THEME.spacing.md,
                textAlign: 'center',
                ...config.css
            }
        });
    }

    // MIDI clear button
    static createMidiClearButton(config = {}) {
        return $('div', {
            text: '🧹 Clear Log',
            ...config,
            css: {
                backgroundColor: this.THEME.colors.warning,
                color: 'white',
                padding: `${this.THEME.spacing.sm} ${this.THEME.spacing.md}`,
                borderRadius: this.THEME.borderRadius.sm,
                cursor: 'pointer',
                textAlign: 'center',
                fontSize: this.THEME.fontSize.sm,
                fontWeight: '500',
                transition: 'all 0.2s ease',
                ...config.css
            }
        });
    }

    // MIDI test button
    static createMidiTestButton(config = {}) {
        return $('div', {
            text: '🎵 Test MIDI',
            ...config,
            css: {
                backgroundColor: this.THEME.colors.primary,
                color: 'white',
                padding: `${this.THEME.spacing.sm} ${this.THEME.spacing.md}`,
                borderRadius: this.THEME.borderRadius.sm,
                cursor: 'pointer',
                textAlign: 'center',
                fontSize: this.THEME.fontSize.sm,
                fontWeight: '500',
                transition: 'all 0.2s ease',
                ...config.css
            }
        });
    }

    // MIDI status line
    static createMidiStatusLine(config = {}) {
        return $('div', {
            text: 'MIDI Status: Initializing...',
            ...config,
            css: {
                fontSize: this.THEME.fontSize.sm,
                color: this.THEME.colors.textSecondary,
                textAlign: 'center',
                marginBottom: this.THEME.spacing.md,
                ...config.css
            }
        });
    }

    // MIDI log content
    static createMidiLogContent(config = {}) {
        return $('div', {
            ...config,
            css: {
                backgroundColor: this.THEME.colors.background,
                border: `1px solid ${this.THEME.colors.border}`,
                borderRadius: this.THEME.borderRadius.sm,
                padding: this.THEME.spacing.md,
                maxHeight: '200px',
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: this.THEME.fontSize.xs,
                ...config.css
            }
        });
    }

    // MIDI log header
    static createMidiLogHeader(config = {}) {
        return $('div', {
            text: 'MIDI Messages Log',
            ...config,
            css: {
                fontSize: this.THEME.fontSize.sm,
                fontWeight: 'bold',
                color: this.THEME.colors.text,
                marginBottom: this.THEME.spacing.sm,
                ...config.css
            }
        });
    }

    // MIDI button container
    static createMidiButtonContainer(config = {}) {
        return $('div', {
            ...config,
            css: {
                display: 'flex',
                gap: this.THEME.spacing.sm,
                justifyContent: 'center',
                marginBottom: this.THEME.spacing.md,
                ...config.css
            }
        });
    }

    // MIDI message div
    static createMidiMessageDiv(config = {}) {
        return $('div', {
            ...config,
            css: {
                padding: `${this.THEME.spacing.xs} 0`,
                borderBottom: `1px solid ${this.THEME.colors.border}`,
                fontSize: this.THEME.fontSize.xs,
                ...config.css
            }
        });
    }

    // MIDI time span
    static createMidiTimeSpan(config = {}) {
        return $('span', {
            ...config,
            css: {
                color: this.THEME.colors.textSecondary,
                marginRight: this.THEME.spacing.sm,
                fontSize: this.THEME.fontSize.xs,
                ...config.css
            }
        });
    }

    // MIDI message span
    static createMidiMessageSpan(config = {}) {
        return $('span', {
            ...config,
            css: {
                color: this.THEME.colors.accent,
                marginRight: this.THEME.spacing.sm,
                fontWeight: '500',
                ...config.css
            }
        });
    }

    // MIDI raw data span
    static createMidiRawSpan(config = {}) {
        return $('span', {
            ...config,
            css: {
                color: this.THEME.colors.textSecondary,
                fontSize: this.THEME.fontSize.xs,
                ...config.css
            }
        });
    }

    // ===== DRAG & DROP COMPONENTS =====

    // Drop zone container
    static createDropZone(config = {}) {
        return $('div', {
            id: 'drop-zone',
            ...config,
            css: {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(74, 111, 165, 0.9)',
                display: 'none',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: '1000',
                flexDirection: 'column',
                gap: this.THEME.spacing.lg,
                ...config.css
            }
        });
    }

    // Drop text
    static createDropText(config = {}) {
        return $('div', {
            text: '📁 Drop your files here',
            ...config,
            css: {
                fontSize: this.THEME.fontSize.xxl,
                fontWeight: 'bold',
                color: 'white',
                textAlign: 'center',
                ...config.css
            }
        });
    }

    // Drop subtext
    static createDropSubText(config = {}) {
        return $('div', {
            text: 'Audio files (.mp3, .wav, .ogg) and Lyrics files (.lrc, .txt)',
            ...config,
            css: {
                fontSize: this.THEME.fontSize.lg,
                color: 'rgba(255, 255, 255, 0.8)',
                textAlign: 'center',
                ...config.css
            }
        });
    }

    // Drop hint
    static createDropHint(config = {}) {
        return $('div', {
            text: 'Release to upload',
            ...config,
            css: {
                fontSize: this.THEME.fontSize.md,
                color: 'rgba(255, 255, 255, 0.6)',
                textAlign: 'center',
                fontStyle: 'italic',
                ...config.css
            }
        });
    }
}

// ===== SIMPLIFIED UI CLASS ALIAS =====
// Shorter name for easier usage: UI.createButton() instead of UIManager.createButton()
export class UI extends UIManager {
    // Inherits all methods from UIManager
    // Can add additional shorthand methods here if needed
}

// Export both for maximum compatibility
export default UI;
