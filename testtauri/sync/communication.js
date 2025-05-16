export default class SyncCommunication {
    constructor(synchronizer) {
        this.synchronizer = synchronizer;
        this.serverEndpoint = synchronizer.serverEndpoint;
    }
    
    syncWithServer() {
        if (!this.synchronizer.isOnline) {
            console.warn('Cannot sync: Offline');
            return Promise.reject('Offline');
        }
        
        const payload = {
            userId: this.synchronizer.userId,
            isOwner: this.synchronizer.isOwner,
            currentVersion: this.synchronizer.getCurrentVersion(),
            pendingChanges: this.synchronizer.pendingChanges,
            timestamp: Date.now()
        };
        
        console.log('Syncing with server...', {
            pendingChanges: payload.pendingChanges.length,
            currentVersion: payload.currentVersion
        });
        
        return fetch(this.serverEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Sync response:', data);
            
            if (data.success) {
                // Process the server response
                this._processServerResponse(data);
                return data;
            } else {
                throw new Error(data.error || 'Unknown sync error');
            }
        })
        .catch(error => {
            console.error('Sync error:', error);
            this.synchronizer._dispatchEvent('sync-error', { error });
            throw error;
        });
    }
    
    notifyRevert(versionId) {
        if (!this.synchronizer.isOnline) {
            console.warn('Cannot notify revert: Offline');
            return Promise.reject('Offline');
        }
        
        console.log(`Notifying server about revert to version ${versionId}`);
        
        return fetch(`${this.serverEndpoint}/revert`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: this.synchronizer.userId,
                versionId,
                timestamp: Date.now()
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Revert notification response:', data);
            return data;
        })
        .catch(error => {
            console.error('Error notifying revert:', error);
            return null;
        });
    }
    
    _processServerResponse(data) {
        // Clear pending changes that were successfully synced
        if (data.appliedChanges && data.appliedChanges.length > 0) {
            this.synchronizer.pendingChanges = this.synchronizer.pendingChanges.filter(
                change => !data.appliedChanges.includes(change.id)
            );
            console.log(`${data.appliedChanges.length} changes were successfully applied on server`);
        }
        
        // Apply incoming changes from other users
        if (data.incomingChanges && data.incomingChanges.length > 0) {
            console.log(`Received ${data.incomingChanges.length} changes from other users`);
            this._applyIncomingChanges(data.incomingChanges);
        }
        
        // Update versions if needed
        if (data.versions) {
            this.synchronizer.versionControl.mergeVersions(data.versions);
        }
        
        // Save updated state
        this.synchronizer._saveToLocalStorage();
        
        // Dispatch event
        this.synchronizer._dispatchEvent('sync-complete', { 
            success: true,
            appliedChanges: data.appliedChanges,
            incomingChanges: data.incomingChanges
        });
    }
    
    _applyIncomingChanges(changes) {
        // Group changes by version for proper organization
        const changesByVersion = {};
        
        changes.forEach(change => {
            // Only apply changes from other users
            if (change.userId !== this.synchronizer.userId) {
                // Apply the change
                this.synchronizer.applyChange(change);
                
                // Group by version for history
                const version = change.version || 'unversioned';
                if (!changesByVersion[version]) {
                    changesByVersion[version] = [];
                }
                changesByVersion[version].push(change);
            }
        });
        
        // Create versions for each group
        Object.entries(changesByVersion).forEach(([versionId, versionChanges]) => {
            if (versionId !== 'unversioned') {
                const numericId = Number(versionId);
                
                // Only create if we don't already have this version
                if (!this.synchronizer.versionControl.versions[numericId]) {
                    const version = {
                        id: numericId,
                        timestamp: versionChanges[0].timestamp,
                        changes: versionChanges,
                        userId: versionChanges[0].userId
                    };
                    
                    this.synchronizer.versionControl.versions[numericId] = version;
                    
                    // Update current version if needed
                    if (numericId > this.synchronizer.versionControl.currentVersion) {
                        this.synchronizer.versionControl.currentVersion = numericId;
                    }
                }
            }
        });
    }
}