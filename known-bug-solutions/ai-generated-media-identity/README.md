# An AI generation shows an older image or speech

## Symptom

The assistant generates a new image, but the project displays an image
generated days earlier. The same stale media comes back after every attempt and
in every project. Synthesized speech had the same defect.

## Confirmed root cause

The assistant preview `File` carried one shared constant name per kind
(`openai-image.png`, `openai-speech.wav`), so every generation of that kind
produced the same media URL. The Node and Tauri storage owners already refused
to reuse an existing name (`server/fileStorage.js#resolveUserUploadPath`,
`platforms/desktop-tauri/src/server/mod.rs#resolve_user_upload_path`), but the
iOS local server wrote the new bytes onto that existing relative path, and the
assistant never derived its name in the first place. The URL therefore stayed
identical while its bytes changed, and every cache keyed by that URL served the
first decoded copy — `bevy_media_texture_cache.js` includes `source` in its key,
and the iOS media responses carry no cache directive.

## Durable correction

- A media asset is identified by its URL. `deriveGeneratedFileName`
  (`eVe/intuition/tools/ai_generators/media_import.js`) is the single owner that
  names generated media from its own request; the assistant uses it for images
  and for synthesized speech, like the audio, image and vector generators.
- The three storage owners keep one deduplication policy: a new upload never
  overwrites an existing name, it takes `stem_1.ext`, `stem_2.ext`…

## Rejected hypotheses

- Not a provider-side generation cache: `LocalAiProxy.swift` requests with
  `reloadIgnoringLocalCacheData` and neither `provider_broker.js` nor
  `server/wsAiProviderOperations.js` caches generations.
- Not the project/media identity migration of
  `project-state-media-identity-reconciliation`; that path reconciles owners and
  physical directories, not per-generation media identity.
- Never repair this by clearing the display caches or by marking every media
  response uncacheable: an immutable URL is what makes those caches correct.

## Regression coverage

- `node tests/probes/media_asset_identity_contract.probe.mjs` — the three
  storage owners share the suffix policy and the assistant holds no constant
  media name.
- `npx vitest run tests/eve/assistant_image_identity.test.mjs` — image and
  speech preview names derive from their request and survive `apply()`.

## Production acceptance

Rebuild the iOS app: its build phase runs `platforms/ios/package_ios_runtime.mjs`,
which repackages `eVe`, so the source fix alone changes nothing on the device.
Generate two images with different prompts in the same session, then a third in
another project; each one must display its own image. Atomes that already point
to the shared legacy name keep the last bytes written there: no automatic repair
is possible, regenerate them.
