// Client pour communiquer avec le serveur de transpilation Squirrel
class SquirrelSaver {
    constructor(serverUrl = 'http://localhost:3001') {
        this.serverUrl = serverUrl;
        this.isConnected = false;
        this.checkConnection();
    }

    /**
     * Vérifier si le serveur est disponible
     */
    async checkConnection() {
        try {
            const response = await fetch(`${this.serverUrl}/health`);
            if (response.ok) {
                this.isConnected = true;
                return true;
            }
        } catch (error) {
            this.isConnected = false;
            console.warn('⚠️ Squirrel Transpiler Server not available:', error.message);
        }
        return false;
    }

    /**
     * Sauvegarder le code transpilé sur le disque
     * @param {Object} options - Options de sauvegarde
     * @param {string} options.transpiledCode - Code JavaScript transpilé
     * @param {string} [options.rubyCode] - Code Ruby original
     * @param {string} [options.filename] - Nom du fichier (défaut: 'transpiled.js')
     * @param {Object} [options.metadata] - Métadonnées additionnelles
     */
    async saveTranspiledCode(options) {
        const {
            transpiledCode,
            rubyCode = null,
            filename = 'transpiled.js',
            metadata = {}
        } = options;

        if (!transpiledCode) {
            throw new Error('transpiledCode is required');
        }

        // Vérifier la connexion avant d'essayer de sauvegarder
        if (!this.isConnected) {
            const connected = await this.checkConnection();
            if (!connected) {
                throw new Error('Squirrel Transpiler Server is not available');
            }
        }

        try {
            const response = await fetch(`${this.serverUrl}/transpile-and-save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    transpiledCode,
                    rubyCode,
                    filename,
                    metadata: {
                        ...metadata,
                        transpilerVersion: '1.0.0',
                        userAgent: navigator.userAgent,
                        timestamp: new Date().toISOString()
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save transpiled code');
            }

            const result = await response.json();
            return result;

        } catch (error) {
            console.error('❌ Error saving transpiled code:', error);
            throw error;
        }
    }

    /**
     * Lister les fichiers sauvegardés
     */
    async listFiles() {
        if (!this.isConnected && !(await this.checkConnection())) {
            throw new Error('Squirrel Transpiler Server is not available');
        }

        try {
            const response = await fetch(`${this.serverUrl}/files`);
            if (!response.ok) {
                throw new Error('Failed to fetch files list');
            }
            return await response.json();
        } catch (error) {
            console.error('❌ Error listing files:', error);
            throw error;
        }
    }

    /**
     * Récupérer le contenu d'un fichier spécifique
     * @param {string} filename - Nom du fichier
     */
    async getFile(filename) {
        if (!this.isConnected && !(await this.checkConnection())) {
            throw new Error('Squirrel Transpiler Server is not available');
        }

        try {
            const response = await fetch(`${this.serverUrl}/files/${encodeURIComponent(filename)}`);
            if (!response.ok) {
                throw new Error(`File not found: ${filename}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`❌ Error getting file ${filename}:`, error);
            throw error;
        }
    }

    /**
     * Supprimer un fichier
     * @param {string} filename - Nom du fichier à supprimer
     */
    async deleteFile(filename) {
        if (!this.isConnected && !(await this.checkConnection())) {
            throw new Error('Squirrel Transpiler Server is not available');
        }

        try {
            const response = await fetch(`${this.serverUrl}/files/${encodeURIComponent(filename)}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                throw new Error(`Failed to delete file: ${filename}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`❌ Error deleting file ${filename}:`, error);
            throw error;
        }
    }

    /**
     * Nettoyer tous les fichiers
     */
    async cleanAllFiles() {
        if (!this.isConnected && !(await this.checkConnection())) {
            throw new Error('Squirrel Transpiler Server is not available');
        }

        try {
            const response = await fetch(`${this.serverUrl}/files`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                throw new Error('Failed to clean files');
            }
            return await response.json();
        } catch (error) {
            console.error('❌ Error cleaning files:', error);
            throw error;
        }
    }

    /**
     * Auto-save: sauvegarde automatique après transpilation
     * @param {Object} transpilationResult - Résultat de la transpilation Squirrel
     */
    async autoSave(transpilationResult) {
        if (!transpilationResult || !transpilationResult.code) {
            console.warn('⚠️ No transpiled code to save');
            return null;
        }

        try {
            const options = {
                transpiledCode: transpilationResult.code,
                rubyCode: transpilationResult.originalCode || null,
                filename: transpilationResult.filename || 'auto-save.js',
                metadata: {
                    autoSave: true,
                    transpilationTime: transpilationResult.timestamp,
                    ...transpilationResult.metadata
                }
            };

            return await this.saveTranspiledCode(options);
        } catch (error) {
            console.error('❌ Auto-save failed:', error);
            return null;
        }
    }
}

// Instance globale
window.SquirrelSaver = new SquirrelSaver();

// Export pour utilisation en module
export { SquirrelSaver };
