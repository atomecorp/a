import { nowIso } from '../../../shared/scalars.js';
// Re-exported: the local duplicate now lives in the shared scalars module.
export { nowIso };
// Re-export of the single predicate defined in apis/serverUrls.js (a leaf
// module). The body used to be duplicated here, which is how it drifted from
// serverUrls.isTauri on the local Axum page.
export { isTauri as isTauriRuntime } from '../../serverUrls.js';
