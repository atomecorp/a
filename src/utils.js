// AJS - Une bibliothèque JavaScript inspirée de Ruby
class AJS {
    static extend(obj) {
        // Ajoute toutes les méthodes de AJS à l'objet passé
        for (const key of Object.getOwnPropertyNames(AJS.prototype)) {
            if (key !== 'constructor') {
                obj[key] = AJS.prototype[key].bind(obj);
            }
        }

        // Ajoute la méthode define_method
        obj.define_method = function(name, fn) {
            this[name] = fn;
            return this;
        };

        // Ajoute les fonctionnalités d'inspection
        obj.inspect = function() {
            return AJS.inspect(this);
        };

        return obj;
    }

    static inspect(obj) {
        if (obj === null) return 'nil';
        if (obj === undefined) return 'nil';

        if (typeof obj === 'string') return `"${obj}"`;
        if (typeof obj === 'number') return obj.toString();
        if (typeof obj === 'boolean') return obj.toString();

        if (Array.isArray(obj)) {
            return `[${obj.map(item => AJS.inspect(item)).join(', ')}]`;
        }

        if (typeof obj === 'object') {
            const pairs = Object.entries(obj).map(([key, value]) =>
                `${key}: ${AJS.inspect(value)}`
            );
            return `{${pairs.join(', ')}}`;
        }

        return obj.toString();
    }

    // Crée un Hash comme celui de Ruby
    static Hash() {
        const hash = {};
        AJS.extend(hash);

        // Ajoute les méthodes de Hash de Ruby
        hash.define_method('keys', function() {
            return Object.keys(this);
        });

        hash.define_method('values', function() {
            return Object.values(this);
        });

        hash.define_method('each', function(callback) {
            Object.entries(this).forEach(([key, value]) => {
                callback(key, value);
            });
            return this;
        });

        hash.define_method('map', function(callback) {
            return Object.entries(this).map(([key, value]) => {
                return callback(key, value);
            });
        });

        hash.define_method('select', function(callback) {
            const result = AJS.Hash();
            this.each((key, value) => {
                if (callback(key, value)) {
                    result[key] = value;
                }
            });
            return result;
        });

        hash.define_method('merge', function(other) {
            const result = AJS.Hash();
            this.each((key, value) => {
                result[key] = value;
            });

            Object.entries(other).forEach(([key, value]) => {
                result[key] = value;
            });

            return result;
        });

        return hash;
    }
}

// Ajout d'extensions aux objets natifs de JavaScript (comme Ruby le fait)
Object.prototype.define_method = function(name, fn) {
    this[name] = fn;
    return this;
};

// Ajout de méthodes à Array pour le rendre plus Ruby-like
Array.prototype.each = function(callback) {
    this.forEach(callback);
    return this;
};

// Extension de la classe Object pour permettre l'inspection
Object.prototype.inspect = function() {
    return AJS.inspect(this);
};




// Ajout d'extensions aux objets natifs de JavaScript
Object.prototype.define_method = function(name, fn) {
    this[name] = fn;
    return this;
};

// Ajout de méthodes à Array pour le rendre plus Ruby-like
Array.prototype.each = function(callback) {
    this.forEach(callback);
    return this;
};

// Extension de la classe Object pour permettre l'inspection
Object.prototype.inspect = function() {
    return AJS.inspect(this);
};

console.log('AJS est chargé !');

// Exportez AJS pour qu'il soit disponible globalement
window.AJS = AJS;
// OU en utilisant export pour les modules ES6
export default AJS;