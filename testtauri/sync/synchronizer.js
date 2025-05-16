import VersionControl from './versionControl';
import SyncCommunication from './communication';
import HistoryUI from './historyUI';

export default class Synchronizer {
    constructor(options = {}) {
        // Core properties
        this.localData = {};
        this.pendingChanges = [];
        this.isOnline = navigator.onLine;
        this.userId = options.userId || this._generateUniqueId();
        this.isOwner = options.isOwner || false;
        this.serverEndpoint = options.serverEndpoint || '/api/sync';
        this.syncInterval = options.syncInterval || 5000; // 5 seconds
        this.versionControl = new VersionControl(this);
        this.communication = new SyncCommunication(this);
        this.historyUI = null;
        
        // Initialize event handlers
        this.eventListeners = {};
        
        // Setup listeners for online/offline status
        this._setupEventListeners();
        
        // Initialize by loading from local storage
        this._loadFromLocalStorage();
        
        // Start sync process if online
        if (this.isOnline) {
            this._startSyncInterval();
        }
        
        console.log(`Synchronizer initialized for user ${this.userId} (${this.isOwner ? 'Owner' : 'Collaborator'})`);
    }
    
    _generateUniqueId() {
        return 'user-' + Math.random().toString(36).substr(2, 9);
    }
    
    _setupEventListeners() {
        // Listen for online/offline events
        window.addEventListener('online', () => {
            this.isOnline = true;
            this._dispatchEvent('connection-change', { online: true });
            this._syncWithServer(); // Try to sync immediately when we come online
            this._startSyncInterval();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this._dispatchEvent('connection-change', { online: false });
            this._stopSyncInterval();
        });
        
        // Listen for beforeunload to save any pending changes
        window.addEventListener('beforeunload', () => {
            this._saveToLocalStorage();
        });
    }
    
    _startSyncInterval() {
        if (this._syncIntervalId) return;
        
        this._syncIntervalId = setInterval(() => {
            if (this.pendingChanges.length > 0) {
                this._syncWithServer();
            }
        }, this.syncInterval);
        
        console.log(`Started sync interval (${this.syncInterval}ms)`);
    }
    
    _stopSyncInterval() {
        if (this._syncIntervalId) {
            clearInterval(this._syncIntervalId);
            this._syncIntervalId = null;
            console.log('Stopped sync interval');
        }
    }
    
    // Event handling system
    addEventListener(event, callback) {
        if (!this.eventListeners[event]) {
            this.eventListeners[event] = [];
        }
        this.eventListeners[event].push(callback);
        return this;
    }
    
    removeEventListener(event, callback) {
        if (this.eventListeners[event]) {
            this.eventListeners[event] = this.eventListeners[event]
                .filter(cb => cb !== callback);
        }
        return this;
    }
    
    _dispatchEvent(event, data) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }
    
    // Track change
    trackChange(elementId, property, newValue, oldValue) {
        const timestamp = Date.now();
        const change = {
            id: this._generateUniqueId(),
            elementId,
            property,
            newValue,
            oldValue,
            timestamp,
            userId: this.userId,
            applied: false,
            version: this.versionControl.getCurrentVersion() + 1
        };
        
        console.log(`Tracking change for ${elementId}.${property}: ${oldValue} -> ${newValue}`);
        this.pendingChanges.push(change);
        
        // Store in local storage immediately
        this._saveToLocalStorage();
        
        // If online, try to sync
        if (this.isOnline) {
            this._syncWithServer();
        }
        
        return change;
    }

    applyChange(change) {
        // Get the element
        const element = document.getElementById(change.elementId);
        if (!element) {
            console.warn(`Cannot apply change: Element with ID ${change.elementId} not found`);
            return false;
        }
        
        console.log(`Applying change to ${change.elementId}.${change.property}: ${change.oldValue} -> ${change.newValue}`);
        
        // For A library elements, use the specialized handler
        if (window.A && window.A.getById) {
            const aElement = window.A.getById(change.elementId);
            if (aElement) {
                // Temporarily disable sync to avoid infinite loops
                if (typeof aElement.disableSync === 'function') {
                    aElement.disableSync();
                }
                
                // Use the setter function pattern from A library
                if (typeof aElement[change.property] === 'function') {
                    aElement[change.property](change.newValue);
                } else if (typeof aElement.set === 'function') {
                    aElement.set(change.property, change.newValue);
                }
                
                // Re-enable sync
                if (typeof aElement.enableSync === 'function') {
                    aElement.enableSync();
                }
                
                change.applied = true;
                return true;
            }
        }
        
        // Fallback for regular DOM elements
        if (change.property in element.style) {
            element.style[change.property] = change.newValue;
            change.applied = true;
            return true;
        } else if (change.property in element) {
            element[change.property] = change.newValue;
            change.applied = true;
            return true;
        }
        
        console.warn(`Cannot apply change: Unknown property ${change.property}`);
        return false;
    }

    createVersion() {
        // Only create a version if there are pending changes
        if (this.pendingChanges.length === 0) {
            console.warn('No pending changes to create a version from');
            return null;
        }
        
        // Create a version with all pending changes
        const version = this.versionControl.createVersion(this.pendingChanges);
        
        // Clear pending changes as they're now part of a version
        this.pendingChanges = [];
        
        // Save to local storage
        this._saveToLocalStorage();
        
        // Update the history UI if available
        if (this.historyUI) {
            this.historyUI.update();
        }
        
        return version;
    }

    revertToVersion(versionId) {
        return this.versionControl.revertToVersion(versionId);
    }

    getVersions() {
        return this.versionControl.getVersions();
    }

    getCurrentVersion() {
        return this.versionControl.getCurrentVersion();
    }
    
    _syncWithServer() {
        return this.communication.syncWithServer();
    }
    
    _notifyRevert(versionId) {
        return this.communication.notifyRevert(versionId);
    }
    
    /**
     * Initialize the history UI
     * @param {HTMLElement|string} container - Container element or selector for the history UI
     * @param {Object} options - Options for the history UI
     * @returns {Object} The history UI controller
     */
    initHistoryUI(container, options = {}) {
        if (!container) {
            console.warn('Cannot initialize history UI: No container provided');
            return null;
        }
        
        // Find the container if a selector was provided
        const containerElement = typeof container === 'string' 
            ? document.querySelector(container) 
            : container;
            
        if (!containerElement) {
            console.warn(`Cannot initialize history UI: Container not found`);
            return null;
        }
        
        // Create the history UI
        try {
            this.historyUI = new HistoryUI(this, containerElement, options);
            console.log('History UI initialized');
            return this.historyUI;
        } catch (error) {
            console.error('Error initializing history UI:', error);
            return null;
        }
    }
    
    /**
     * Save synchronization data to localStorage
     * @private
     */
    _saveToLocalStorage() {
        try {
            const data = {
                userId: this.userId,
                isOwner: this.isOwner,
                currentVersion: this.versionControl.getCurrentVersion(),
                versions: this.versionControl.getVersions(),
                pendingChanges: this.pendingChanges,
                timestamp: Date.now()
            };
            
            localStorage.setItem('a-sync-data', JSON.stringify(data));
            console.log('Saved sync data to localStorage');
        } catch (error) {
            console.error('Error saving to localStorage:', error);
        }
    }

    /**
     * Load synchronization data from localStorage
     * @private
     * @returns {boolean} Whether loading was successful
     */
    _loadFromLocalStorage() {
        try {
            const data = localStorage.getItem('a-sync-data');
            if (data) {
                const parsed = JSON.parse(data);
                
                this.userId = parsed.userId;
                this.isOwner = parsed.isOwner;
                this.pendingChanges = parsed.pendingChanges || [];
                
                // Load versions
                if (parsed.versions && parsed.currentVersion !== undefined) {
                    this.versionControl.versions = parsed.versions;
                    this.versionControl.currentVersion = parsed.currentVersion;
                }
                
                // Apply any pending changes that weren't synced
                this.pendingChanges.forEach(change => {
                    if (!change.applied) {
                        this.applyChange(change);
                    }
                });
                
                console.log(`Loaded data from localStorage for user ${this.userId}`);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error loading from localStorage:', error);
            return false;
        }
    }
}