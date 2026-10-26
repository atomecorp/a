#pragma once
// The internal page of a service (France TV, a subscription service): its own site in a
// web view of its own, laid BEHIND the app page, seen through the cut-out the canvas
// leaves at the rectangle the page gives (eVe/domains/media/streaming_view.js). Shared by
// the iOS application and Tauri macOS; Android has its Kotlin twin (StreamingView.kt).
// `host` is the app page's WKWebView. Main thread only; `reply` is called once.
typedef void (*AtomeStreamingViewReply)(void *context, const char *json);
void atome_streaming_view_invoke(void *host, const char *command, const char *payload_json,
                                 void *context, AtomeStreamingViewReply reply);
