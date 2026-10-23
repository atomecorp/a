#ifndef AtomeIosAudioEngineBridge_h
#define AtomeIosAudioEngineBridge_h

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

// Native Kira audio engine (Rust, atome-audio-engine): one command by name with
// its JSON arguments; the returned JSON string is released by the caller.
char *atome_ios_audio_command(const char *name, const char *args_json, const char *project_root);
void atome_ios_audio_string_free(char *text);

// Voice engine: 16 kHz mono PCM in [-1, 1] from the app's capture; false when no session runs
// or the library was built without the voice engine (AUv3, simulator).
bool atome_ios_voice_push(const float *samples, size_t count);

// AUv3: the engine runs on the plugin host's clock; the render block pulls it.
bool atome_ios_audio_host_start(uint32_t sample_rate);
uint32_t atome_ios_audio_host_render(float *left, float *right, uint32_t frames, int64_t host_ns);

#endif
