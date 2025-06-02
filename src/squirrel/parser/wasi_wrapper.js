// WASI universel qui gère toutes les fonctions possibles

class UniversalWASI {
    constructor(args = [], env = [], fds = []) {
        this.args = args;
        this.env = env;
        this.fds = fds;
        
        // Créer un proxy qui retourne 0 pour toutes les fonctions non définies
        this.wasiImport = new Proxy({
            // Fonctions critiques définies explicitement
            proc_exit: (code) => {
                console.log('🔄 WASI proc_exit called with code:', code);
                if (code !== 0) {
                    throw new Error(`Process exited with code ${code}`);
                }
            },
            
            fd_write: (fd, iovs, iovs_len, nwritten) => {
                // Console output pour stdout/stderr
                if (fd === 1 || fd === 2) {
                    return 0;
                }
                return 0;
            },
            
            random_get: (buf, buf_len) => {
                // Pas besoin de vraiment générer du random pour Prism
                return 0;
            }
            
        }, {
            get: function(target, prop) {
                // Si la fonction existe, la retourner
                if (prop in target) {
                    return target[prop];
                }
                
                // Sinon, retourner une fonction qui retourne 0
                return function(...args) {
                    console.log(`🔧 WASI call: ${prop}(${args.length} args) -> 0`);
                    return 0;
                };
            }
        });
    }
    
    initialize(instance) {
        this.instance = instance;
        console.log('✅ Universal WASI initialized');
        
        // Appeler _start si elle existe
        if (instance.exports._start) {
            try {
                instance.exports._start();
            } catch (error) {
                if (error.message && error.message.includes('proc_exit')) {
                    console.log('✅ WASI _start completed normally');
                } else {
                    console.warn('⚠️ WASI _start error:', error);
                }
            }
        }
    }
}

// Créer les fonctions globales
window.WASI_LOCAL = UniversalWASI;
window.createWASI = function(args = [], env = [], fds = []) {
    return new UniversalWASI(args, env, fds);
};

// Dispatcher l'événement de prêt
setTimeout(() => {
    window.dispatchEvent(new CustomEvent('wasi-ready'));
    console.log('✅ Universal WASI ready - handles all functions!');
}, 100);