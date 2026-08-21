import { loadModulesSequentially } from '../utils/module_loader_runtime.js';

// Application entry point: load eVe. Nothing else runs here.
(async () => {
	await loadModulesSequentially({
		modules: [{ id: 'application.eVe', path: '../../../eVe/eVe.js' }],
		baseUrl: import.meta.url,
		logPrefix: '[Application]'
	});
})().catch((error) => {
	console.error('[Application] eve_module_load_failed', error);
});
