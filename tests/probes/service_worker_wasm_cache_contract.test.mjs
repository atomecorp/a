import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../atome/src/sw.js', import.meta.url), 'utf8');

assert.match(source, /requestUsesHttp\s*&&\s*responseUsesHttp/, 'only HTTP(S) responses may be cached');
assert.match(
    source,
    /try\s*\{\s*await cache\.put\(event\.request, response\.clone\(\)\);\s*}\s*catch\s*\(_\)\s*\{/s,
    'a cache backend failure must be contained instead of rejecting the FetchEvent'
);
assert.match(source, /return response;/, 'a verified network response must still be served when cache storage fails');

console.log('service_worker_wasm_cache_contract.test: PASS');
