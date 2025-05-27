/**
 * Squirel Ruby Parser - WASM Wrapper
 * Version: 1.0.0
 * 
 * Usage:
 *   const parser = new SquirelRubyParser();
 *   await parser.init();
 *   const result = parser.parse(rubyCode);
 */
class SquirelRubyParser {
	constructor() {
		this.module = null;
		this.initialized = false;
		this.parseFunction = null;
		this.testFunction = null;
		this.quickParseFunction = null;
		this.freeFunction = null;
	}
	
	/**
	 * Initialise le parser WASM
	 * @returns {Promise<Object>} Module WASM initialisé
	 */
	async init() {
		if (this.initialized) return this.module;
		
		try {
			console.log('[SquirelRubyParser] Initialisation...');
			
			this.module = await createRubyParser();
			
			// Wrapper les fonctions C
			this.parseFunction = this.module.cwrap('parse_ruby_code', 'string', ['string']);
			this.testFunction = this.module.cwrap('test_ruby_parser', 'string', []);
			this.quickParseFunction = this.module.cwrap('quick_ruby_parse', 'string', ['string']);
			this.freeFunction = this.module.cwrap('free_parser_result', null, ['number']);
			
			// Test de connectivité
			const testResult = this.testFunction();
			const testData = JSON.parse(testResult);
			
			if (testData.status !== 'operational') {
				throw new Error('Parser test failed');
			}
			
			this.initialized = true;
			console.log(`[SquirelRubyParser] Initialisé - Version ${testData.version}`);
			
			return this.module;
			
		} catch (error) {
			console.error('[SquirelRubyParser] Erreur d\'initialisation:', error);
			throw error;
		}
	}
	
	/**
	 * Parse le code Ruby et retourne une analyse complète
	 * @param {string} code - Code Ruby à analyser
	 * @returns {Object} Résultat de l'analyse
	 */
	parse(code) {
		if (!this.initialized || !this.parseFunction) {
			throw new Error('Parser non initialisé - appelez init() d\'abord');
		}
		
		if (!code || typeof code !== 'string') {
			return {
				success: false,
				error: 'Code Ruby requis (string)',
				parser: 'squirel_ruby_analyzer'
			};
		}
		
		try {
			const resultStr = this.parseFunction(code);
			
			// Parser le JSON retourné
			let parsedResult;
			try {
				parsedResult = JSON.parse(resultStr);
				
				// Ajouter des métadonnées supplémentaires
				parsedResult.parsed_at = new Date().toISOString();
				parsedResult.input_hash = this._simpleHash(code);
				
			} catch (e) {
				parsedResult = { 
					success: false,
					error: 'JSON parse error: ' + e.message,
					raw_result: resultStr,
					parser: 'squirel_ruby_analyzer'
				};
			}
			
			return parsedResult;
			
		} catch (error) {
			return {
				success: false,
				error: error.message,
				parser: 'squirel_ruby_analyzer',
				input_length: code.length
			};
		}
	}
	
	/**
	 * Parse rapide pour tests de performance
	 * @param {string} code - Code Ruby à analyser rapidement
	 * @returns {Object} Résultat de l'analyse rapide
	 */
	quickParse(code) {
		if (!this.quickParseFunction) {
			return { error: 'Quick parse not available', success: false };
		}
		
		try {
			const result = this.quickParseFunction(code || '');
			return JSON.parse(result);
		} catch (error) {
			return { error: error.message, success: false };
		}
	}
	
	/**
	 * Test de connectivité du parser
	 * @returns {Object} Statut du parser
	 */
	test() {
		if (!this.testFunction) {
			return { error: 'Test function not available', success: false };
		}
		
		try {
			const result = this.testFunction();
			return JSON.parse(result);
		} catch (error) {
			return { error: error.message, success: false };
		}
	}
	
	/**
	 * Informations sur le parser
	 * @returns {Object} Informations détaillées
	 */
	getInfo() {
		return {
			name: 'SquirelRubyParser',
			version: '1.0.0',
			initialized: this.initialized,
			parser_type: 'squirel_ruby_analyzer',
			capabilities: [
				'syntax_analysis',
				'structure_detection', 
				'complexity_calculation',
				'balance_checking',
				'oop_detection',
				'functional_detection'
			],
			functions: {
				parse: !!this.parseFunction,
				test: !!this.testFunction,
				quickParse: !!this.quickParseFunction
			},
			module_available: !!this.module
		};
	}
	
	/**
	 * Hash simple pour identifier les entrées
	 * @private
	 */
	_simpleHash(str) {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convertir en 32-bit integer
		}
		return Math.abs(hash).toString(16);
	}
}

// Export pour utilisation en module
if (typeof module !== 'undefined' && module.exports) {
	module.exports = SquirelRubyParser;
}

// Export global pour utilisation dans le navigateur
if (typeof window !== 'undefined') {
	window.SquirelRubyParser = SquirelRubyParser;
}

