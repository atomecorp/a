import Synchronizer from '../sync/synchronizer';
let globalSynchronizer = null;

export default {
    synchronize: (el, v, _, __, instance) => {
        if (!v || typeof v !== 'object') return;
        
        // Initialize the global synchronizer if not already done
        if (!globalSynchronizer && v.enable !== false) {
            globalSynchronizer = new Synchronizer({
                userId: v.userId || `user-${Math.random().toString(36).substr(2, 9)}`,
                isOwner: v.isOwner !== false, // Default to true if not specified
                serverEndpoint: v.endpoint || '/api/sync',
                syncInterval: v.interval || 5000
            });
            
            // Initialize history UI if container is provided
            if (v.historyContainer) {
                const container = typeof v.historyContainer === 'string' 
                    ? document.querySelector(v.historyContainer) 
                    : v.historyContainer;
                    
                if (container) {
                    globalSynchronizer.initHistoryUI(container);
                }
            }
            
            console.log('Global synchronizer initialized');
        }
        
        // Only track this element if it has an ID and sync is enabled
        if (instance._data.id && v.enable !== false) {
            // Tag the element as synchronized
            el.dataset.synchronized = 'true';
            
            // Apply the synchronizer to this instance
            instance._syncEnabled = true;
            
            // Override the set method to track changes
            const originalSet = instance.set;
            instance.set = function(key, value) {
                const oldValue = this.get(key);
                
                // Call original set method
                const result = originalSet.call(this, key, value);
                
                // Track the change if the value actually changed and isn't a special property
                if (oldValue !== value && 
                    key !== 'synchronize' && 
                    globalSynchronizer && 
                    this._syncEnabled) {
                    globalSynchronizer.trackChange(
                        this._data.id,
                        key,
                        value,
                        oldValue
                    );
                }
                
                return result;
            };
            
            // Add special methods to the instance
            instance.disableSync = function() {
                this._syncEnabled = false;
                return this;
            };
            
            instance.enableSync = function() {
                this._syncEnabled = true;
                return this;
            };
            
            instance.createVersion = function() {
                if (globalSynchronizer) {
                    return globalSynchronizer.createVersion();
                }
                return null;
            };
        }
        
        return globalSynchronizer;
    }
};