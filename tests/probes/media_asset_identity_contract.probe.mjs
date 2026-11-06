// A media asset is identified by its URL: a new upload must never overwrite the
// bytes of an existing name. Reusing one path silently rewrites the content of
// every Atome that already points there, and every cache keyed by that URL
// (Bevy media texture, WKWebView HTTP, first-match sandbox root lookup) keeps
// serving the previous image. The storage owners (Fastify, and the one local host of
// Tauri and iOS, `atome-server::local`) must therefore share the same `stem_1.ext`
// deduplication policy, and generated media must derive their
// name from their request instead of one shared constant.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const nodeServer = read('server/fileStorage.js');
const localServer = read('atome/servers/atome-server/src/local/local_paths.rs');
const iosServer = read('platforms/ios/bevy-renderer/src/local_server.rs');
const assistant = read('eVe/voice/assistant/assistant_media_session.js');
const generators = read('eVe/intuition/tools/ai_generators/media_import.js');

assert.match(nodeServer, /export async function resolveUserUploadPath/, 'le serveur Node possède la politique de déduplication');
assert.ok(nodeServer.includes('candidate = `${stem}_${counter}${ext}`;'), 'le serveur Node suffixe plutôt que d\'écraser');

assert.ok(localServer.includes('pub async fn resolve_user_upload_path'), 'le serveur local (Tauri, iOS) possède la même politique');
assert.ok(localServer.includes('candidate = format!("{}_{}.{}", stem, counter, ext);'), 'le serveur local suffixe plutôt que d\'écraser');
assert.ok(iosServer.includes('local::prepare('), 'le serveur local iOS est ce même hôte, sans copie de la politique');

assert.ok(generators.includes('export const deriveGeneratedFileName'), 'le nom des médias générés vient d\'un propriétaire unique');
assert.ok(assistant.includes('deriveGeneratedFileName'), 'l\'assistant réutilise ce propriétaire');
assert.ok(!assistant.includes("'openai-image.png'"), 'l\'assistant ne partage plus un nom de média constant pour l\'image');
assert.ok(!assistant.includes("'openai-speech.wav'"), 'l\'assistant ne partage plus un nom de média constant pour la synthèse vocale');
assert.ok(assistant.includes("prompt: text, mime: 'audio/wav'"), 'la synthèse vocale dérive son nom de la demande');

console.log('media asset identity contract: OK');
