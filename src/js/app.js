/**
 * 🚀 SQUIRREL APPLICATION - OPTIMIZED ES6 MODULE ENTRY POINT
 * Version optimisée avec ordre de chargement simplifié
 */
const SQUIRREL_VERSION = '1.0.0';
const write_compiled_code = true; // Flag to control code writing

// Rendre les constantes disponibles globalement
window.SQUIRREL_VERSION = SQUIRREL_VERSION;
window.write_compiled_code = write_compiled_code;
// Core dependencies (first)
import '../squirrel/wasi_wrapper.js';
import '../squirrel/parser/deserialize.js';
import '../native/utils.js';

// Prism components
import '../squirrel/prism_helper.js';
import '../squirrel/prism_parser.js';

// Framework core
import '../a/a.js';
import '../a/apis.js';
import '../a/particles/identity.js';
import '../a/particles/dimension.js';

// Squirrel transpiler engine
import '../squirrel/ruby_parser_manager.js';
import '../squirrel/native_code_generator.js';
import '../squirrel/transpiler_core_compliant.js';
import '../squirrel/squirrel_orchestrator.js';
import '../squirrel/squirrel_saver.js';
import '../squirrel/squirrel_runner.js';

// Application entry point
import '../application/index.js';

