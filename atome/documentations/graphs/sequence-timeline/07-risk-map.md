# Risk Map - sequence-timeline

| Niveau | Type | Fichier | Fonction | Probleme | Impact possible | Preuve | Action recommandee |
|---|---|---|---|---|---|---|---|
| High | MULTI_SOURCE_OF_TRUTH | eVe/domains/mtrax/timeline/playback_frame_update_runtime.js / transport/host_follow_runtime.js | playhead sync | Plusieurs horloges peuvent piloter le playhead. | Desync audio/video/UI. | playback_frame_update_runtime.js:83-173; host_follow_runtime.js:186-247 | Identifier l'horloge canonique par mode. |
| High | CONFLICT | eVe/domains/mtrax/transport/transport_gestures_runtime.js | scrub/loop gestures | Gestures, host follow et API peuvent modifier transport. | Sauts de playhead ou persistence inattendue. | transport_gestures_runtime.js:730,1179 | Verrouiller les mutations pendant gestures critiques. |
| Medium | ASYNC_RISK | eVe/domains/mtrax/timeline/persist_runtime.js | `scheduleHmtracksNativeAudioIdlePrewarm` | Prewarm lance en microtask/timer. | Audio session modifiee apres mutation/panel close. | persist_runtime.js:140-156 | Annuler ou borner par generation active. |
| Medium | ASYNC_RISK | eVe/domains/mtrax/project/project_playback_timeline_runtime.js | RAF playback | RAF de playback projet independant. | Frame appliquee apres stop/close. | project_playback_timeline_runtime.js:177-180 | Verifier cancel RAF sur close/stop. |
| Medium | PARTIAL_LIFECYCLE | eVe/intuition/tools/timeline.js | timeline panel | Listeners window ajoutes, certains resets sur logout/clear-view seulement. | Refreshs apres fermeture. | timeline.js:237-247,350-378 | Confirmer cleanup complet ou limiter par `panelOpen`. |
| Unknown | PERFORMANCE_BLOCKER | eVe/domains/mtrax/timeline/playback_frame_update_runtime.js | frame update | Frame update peut evaluer runtime async + media positioning. | Jank playback. | playback_frame_update_runtime.js:163-173 | Mesurer duree par frame en scenario lourd. |
