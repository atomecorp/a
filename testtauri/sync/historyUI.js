export default class HistoryUI {
    constructor(synchronizer, container, options = {}) {
        this.synchronizer = synchronizer;
        this.container = container;
        this.options = {
            title: 'Version History',
            maxVersions: 50,
            showDetails: true,
            autoUpdate: true,
            ...options
        };
        
        // Create UI elements
        this._createUI();
        
        // Setup event listeners
        this._setupEventListeners();
        
        // Initial update
        this.update();
    }
    
    /**
     * Create the UI elements
     * @private
     */
    _createUI() {
        // Clear container and add base class
        this.container.innerHTML = '';
        this.container.className = 'version-history-container';
        
        // Create header
        const header = document.createElement('h3');
        header.textContent = this.options.title;
        this.container.appendChild(header);
        
        // Create version list
        this.versionList = document.createElement('ul');
        this.versionList.className = 'version-list';
        this.container.appendChild(this.versionList);
        
        // Create empty state message
        this.emptyMessage = document.createElement('p');
        this.emptyMessage.className = 'empty-message';
        this.emptyMessage.textContent = 'No versions yet. Make changes to create a version.';
        this.emptyMessage.style.fontStyle = 'italic';
        this.emptyMessage.style.color = '#666';
        this.emptyMessage.style.textAlign = 'center';
        this.emptyMessage.style.padding = '20px 0';
        this.emptyMessage.style.display = 'none';
        this.container.appendChild(this.emptyMessage);
        
        // Create loading indicator
        this.loadingIndicator = document.createElement('div');
        this.loadingIndicator.className = 'loading-indicator';
        this.loadingIndicator.innerHTML = '<div class="spinner"></div><span>Loading...</span>';
        this.loadingIndicator.style.display = 'none';
        this.container.appendChild(this.loadingIndicator);
        
        // Add action buttons
        this._createActionButtons();
        
        // Add styles if they don't exist
        this._addStyles();
    }
    
    /**
     * Create action buttons for the history UI
     * @private
     */
    _createActionButtons() {
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'history-actions';
        
        // Create Version button (only visible if there are pending changes)
        this.createVersionBtn = document.createElement('button');
        this.createVersionBtn.className = 'create-version-button';
        this.createVersionBtn.textContent = 'Create Version';
        this.createVersionBtn.disabled = true;
        this.createVersionBtn.addEventListener('click', () => {
            this.synchronizer.createVersion();
        });
        actionsContainer.appendChild(this.createVersionBtn);
        
        // Refresh button
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'refresh-button';
        refreshBtn.textContent = 'Refresh';
        refreshBtn.addEventListener('click', () => {
            this.update();
        });
        actionsContainer.appendChild(refreshBtn);
        
        this.container.appendChild(actionsContainer);
    }
    
    
       
    /**
     * Setup event listeners for synchronizer events
     * @private
     */
    _setupEventListeners() {
        if (!this.options.autoUpdate) return;
        
        // Listen for relevant events from synchronizer
        this.synchronizer.addEventListener('version-created', () => this.update());
        this.synchronizer.addEventListener('version-reverted', () => this.update());
        this.synchronizer.addEventListener('version-updated', () => this.update());
        this.synchronizer.addEventListener('sync-complete', () => this.update());
        
        // Update Create Version button when pending changes occur
        this._watchPendingChanges();
    }
    
    /**
     * Setup watcher for pending changes to update UI
     * @private
     */
    _watchPendingChanges() {
        // Update button state initially
        this._updateCreateVersionButton();
        
        // Setup interval to check for pending changes
        setInterval(() => {
            this._updateCreateVersionButton();
        }, 1000);
    }
    
    /**
     * Update create version button state based on pending changes
     * @private
     */
    _updateCreateVersionButton() {
        const hasPendingChanges = this.synchronizer.pendingChanges && 
                                 this.synchronizer.pendingChanges.length > 0;
        
        this.createVersionBtn.disabled = !hasPendingChanges;
        this.createVersionBtn.title = hasPendingChanges ? 
            `Create version with ${this.synchronizer.pendingChanges.length} pending changes` : 
            'Make changes to enable versioning';
    }
    
    /**
     * Update the version list display
     */
    update() {
        this._showLoading(true);
        
        // Use setTimeout to allow the loading indicator to render
        setTimeout(() => {
            this._updateVersionList();
            this._showLoading(false);
        }, 100);
    }
    
    /**
     * Show or hide the loading indicator
     * @private
     * @param {boolean} show - Whether to show the loading indicator
     */
    _showLoading(show) {
        this.loadingIndicator.style.display = show ? 'flex' : 'none';
        this.versionList.style.opacity = show ? '0.5' : '1';
    }
    
    /**
     * Update the version list with current data
     * @private
     */
    _updateVersionList() {
        this.versionList.innerHTML = '';
        
        // Get all versions and sort by timestamp (newest first)
        const versions = Object.entries(this.synchronizer.getVersions())
            .map(([id, data]) => ({ id: Number(id), ...data }))
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, this.options.maxVersions); // Limit number of displayed versions
        
        if (versions.length === 0) {
            this.emptyMessage.style.display = 'block';
            return;
        } else {
            this.emptyMessage.style.display = 'none';
        }
        
        versions.forEach(version => {
            const versionEl = this._createVersionElement(version);
            this.versionList.appendChild(versionEl);
        });
    }
    
    /**
     * Create an element for a single version
     * @private
     * @param {Object} version - The version data
     * @returns {HTMLElement} The created element
     */
    _createVersionElement(version) {
        const versionEl = document.createElement('li');
        versionEl.className = 'version-item';
        
        if (version.id === this.synchronizer.getCurrentVersion()) {
            versionEl.classList.add('current-version');
        }
        
        // Determine if this was created by the current user
        const isCurrentUser = version.userId === this.synchronizer.userId;
        
        // Format the date
        const date = new Date(version.timestamp);
        const formattedDate = date.toLocaleString();
        
        versionEl.innerHTML = `
            <div class="version-header">
                <span class="version-id">Version ${version.id}</span>
                <span class="version-time">${formattedDate}</span>
            </div>
            <div class="version-info">
                <span class="version-author">${isCurrentUser ? 'You' : 'Collaborator'}</span>
                <span class="version-changes">${version.changes.length} change${version.changes.length !== 1 ? 's' : ''}</span>
            </div>
        `;
        
        // Only allow reverting if you're the owner
        if (this.synchronizer.isOwner) {
            const revertBtn = document.createElement('button');
            revertBtn.className = 'revert-button';
            revertBtn.textContent = 'Revert to this version';
            revertBtn.addEventListener('click', () => {
                if (confirm(`Are you sure you want to revert to version ${version.id}? All newer changes will be undone.`)) {
                    this.synchronizer.revertToVersion(version.id);
                }
            });
            versionEl.appendChild(revertBtn);
        }
        
        // Only show details button if option is enabled
        if (this.options.showDetails) {
            // Show details button
            const detailsBtn = document.createElement('button');
            detailsBtn.className = 'details-button';
            detailsBtn.textContent = 'Show Changes';
            
            // Changes list (hidden by default)
            const changesList = document.createElement('ul');
            changesList.className = 'changes-list hidden';
            
            // Add each change to the list
            version.changes.forEach(change => {
                const changeEl = document.createElement('li');
                changeEl.className = 'change-item';
                
                // Format values for display
                const newValue = this._formatValueForDisplay(change.newValue);
                const oldValue = this._formatValueForDisplay(change.oldValue);
                
                changeEl.innerHTML = `
                    <span class="change-element">Element: ${change.elementId}</span>
                    <span class="change-property">Property: ${change.property}</span>
                    <span class="change-value">New Value: ${newValue}</span>
                    <span class="change-old-value">Old Value: ${oldValue}</span>
                `;
                changesList.appendChild(changeEl);
            });
            
            versionEl.appendChild(changesList);
            
            // Toggle changes list visibility
            detailsBtn.addEventListener('click', () => {
                changesList.classList.toggle('hidden');
                detailsBtn.textContent = changesList.classList.contains('hidden') 
                    ? 'Show Changes' : 'Hide Changes';
            });
            
            versionEl.appendChild(detailsBtn);
        }
        
        return versionEl;
    }
    
    /**
     * Format a value for display in the UI
     * @private
     * @param {*} value - The value to format
     * @returns {string} The formatted value
     */
    _formatValueForDisplay(value) {
        if (value === undefined) return '<em>undefined</em>';
        if (value === null) return '<em>null</em>';
        
        if (typeof value === 'object') {
            try {
                return JSON.stringify(value);
            } catch (e) {
                return '[Object]';
            }
        }
        
        return String(value);
    }
    
    /**
     * Hide the history UI
     */
    hide() {
        this.container.style.display = 'none';
    }
    
    /**
     * Show the history UI
     */
    show() {
        this.container.style.display = 'block';
    }
    
    /**
     * Destroy the history UI and clean up event listeners
     */
    destroy() {
        // Clean up event listeners if needed
        if (this.options.autoUpdate) {
            this.synchronizer.removeEventListener('version-created');
            this.synchronizer.removeEventListener('version-reverted');
            this.synchronizer.removeEventListener('version-updated');
            this.synchronizer.removeEventListener('sync-complete');
        }
        
        // Clear the container
        this.container.innerHTML = '';
        
        // Remove reference in synchronizer
        if (this.synchronizer.historyUI === this) {
            this.synchronizer.historyUI = null;
        }
    }
}