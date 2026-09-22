// A media asset is identified by its URL: a new upload must never overwrite the
// bytes of an existing name. Reusing one path silently rewrites the content of
// every Atome that already points there, and every cache keyed by that URL
// (Bevy media texture, WKWebView HTTP, first-match sandbox root lookup) keeps
// serving the previous image. The three storage owners must therefore share the
// same `stem_1.ext` deduplication policy, and generated media must derive their
// name from their request instead of one shared constant.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const nodeServer = read('server/fileStorage.js');
const tauriServer = read('platforms/desktop-tauri/src/server/mod.rs');
const iosServer = read('platforms/ios/atome-auv3/Common/LocalHTTPServer.swift');
const assistant = read('eVe/voice/assistant/assistant_media_session.js');
const generators = read('eVe/intuition/tools/ai_generators/media_import.js');

assert.match(nodeServer, /export async function resolveUserUploadPath/, 'le serveur Node possède la politique de déduplication');
assert.ok(nodeServer.includes('candidate = `${stem}_${counter}${ext}`;'), 'le serveur Node suffixe plutôt que d\'écraser');

assert.ok(tauriServer.includes('async fn resolve_user_upload_path'), 'le serveur Tauri possède la même politique');
assert.ok(tauriServer.includes('candidate = format!("{}_{}.{}", stem, counter, ext);'), 'le serveur Tauri suffixe plutôt que d\'écraser');

assert.ok(iosServer.includes('func availableUploadName'), 'le serveur local iOS déduplique le nom dérivé');
assert.ok(iosServer.includes('"\\(stem)_\\(counter).\\(ext)"'), 'le serveur local iOS suffixe plutôt que d\'écraser');
assert.ok(iosServer.includes('availableUploadName(baseName, in: relativeFolder)'), 'le chemin dérivé passe par la déduplication');
assert.ok(iosServer.includes('let fileURL = root.appendingPathComponent(safeRelativePath)'), 'le chemin écrit est celui qui a été dédupliqué');

assert.ok(generators.includes('export const deriveGeneratedFileName'), 'le nom des médias générés vient d\'un propriétaire unique');
assert.ok(assistant.includes('deriveGeneratedFileName'), 'l\'assistant réutilise ce propriétaire');
assert.ok(!assistant.includes("'openai-image.png'"), 'l\'assistant ne partage plus un nom de média constant pour l\'image');
assert.ok(!assistant.includes("'openai-speech.wav'"), 'l\'assistant ne partage plus un nom de média constant pour la synthèse vocale');
assert.ok(assistant.includes("prompt: text, mime: 'audio/wav'"), 'la synthèse vocale dérive son nom de la demande');

console.log('media asset identity contract: OK');
