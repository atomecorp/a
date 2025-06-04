/**
 * 🚀 SQUIRREL APPLICATION - ES6 MODULE ENTRY POINT
 * Preserves exact loading order and functionality
 */

// WASI Implementation (first - needed for WASM)
import '../squirrel/wasi_wrapper.js';

// Prism Parser Components (second - core parsing)
import '../squirrel/parser/deserialize.js';
import '../squirrel/prism_helper.js';
import '../squirrel/prism_parser.js';

// Utils (third - needed by A Framework)
import '../native/utils.js';

// A Framework (fourth - core framework)
import '../a/a.js';
import '../a/apis.js';
import '../a/particles/identity.js';
import '../a/particles/dimension.js';

// Squirrel Core - 4 modules in exact order (fifth - transpilation engine)
import '../squirrel/ruby_parser_manager.js';
import '../squirrel/native_code_generator.js';
import '../squirrel/transpiler_core_compliant.js';
import '../squirrel/squirrel_orchestrator.js';
import '../squirrel/squirrel_runner.js';

// Application entry point (sixth - user code)
import '../application/index.js';

