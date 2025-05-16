export default class VersionControl {
    constructor(synchronizer) {
        this.synchronizer = synchronizer;
        this.versions = {};
        this.currentVersion = 0;
    }
    
    createVersion(changes) {
        this.currentVersion++;
        const version = {
            id: this.currentVersion,
            timestamp: Date.now(),
            changes: Array.isArray(changes) ? [...changes] : [],
            userId: this.synchronizer.userId
        };
        
        this.versions[this.currentVersion] = version;
        
        console.log(`Created version ${this.currentVersion} with ${version.changes.length} changes`);
        this.synchronizer._dispatchEvent('version-created', { version });
        
        return version;
    }
    
    revertToVersion(versionId) {
        if (!this.versions[versionId]) {
            console.warn(`Cannot revert: Version ${versionId} not found`);
            return false;
        }
        
        // Find all versions newer than the target
        const versionsToRevert = Object.keys(this.versions)
            .map(Number)
            .filter(v => v > versionId)
            .sort((a, b) => b - a); // Sort descending
        
        console.log(`Reverting to version ${versionId}, removing ${versionsToRevert.length} newer versions`);
        
        // Revert changes in reverse order (newest first)
        for (const vid of versionsToRevert) {
            const version = this.versions[vid];
            
            // Revert each change in reverse order
            for (let i = version.changes.length - 1; i >= 0; i--) {
                const change = version.changes[i];
                this._revertChange(change);
            }
            
            // Remove this version
            delete this.versions[vid];
        }
        
        // Update current version
        this.currentVersion = versionId;
        
        // Notify listeners about the revert
        this.synchronizer._dispatchEvent('version-reverted', { 
            versionId, 
            newCurrentVersion: this.currentVersion 
        });
        
        // Notify server about revert if owner
        if (this.synchronizer.isOnline && this.synchronizer.isOwner) {
            this.synchronizer._notifyRevert(versionId);
        }
        
        return true;
    }
    
    getVersions() {
        return {...this.versions};
    }
    
    getCurrentVersion() {
        return this.currentVersion;
    }
    
    _revertChange(change) {
        // Create a new change that reverts the original
        const revertChange = {
            id: this.synchronizer._generateUniqueId(),
            elementId: change.elementId,
            property: change.property,
            newValue: change.oldValue, // Use the old value as the new value
            oldValue: change.newValue, // Use the new value as the old value
            timestamp: Date.now(),
            userId: this.synchronizer.userId,
            applied: false
        };
        
        console.log(`Reverting change: ${change.elementId}.${change.property} back to ${change.oldValue}`);
        
        // Apply the revert change
        this.synchronizer.applyChange(revertChange);
        
        // Track the revert in pending changes
        this.synchronizer.pendingChanges.push(revertChange);
        
        return revertChange;
    }
    
    mergeVersions(newVersions) {
        // Process and merge incoming versions
        let versionUpdated = false;
        
        for (const [versionId, version] of Object.entries(newVersions)) {
            const numericId = Number(versionId);
            
            // Only process versions we don't already have
            if (!this.versions[numericId]) {
                this.versions[numericId] = version;
                
                // Update current version if this is newer
                if (numericId > this.currentVersion) {
                    this.currentVersion = numericId;
                    versionUpdated = true;
                }
            }
        }
        
        if (versionUpdated) {
            console.log(`Updated to version ${this.currentVersion}`);
            this.synchronizer._dispatchEvent('version-updated', { 
                currentVersion: this.currentVersion 
            });
        }
        
        return versionUpdated;
    }
}