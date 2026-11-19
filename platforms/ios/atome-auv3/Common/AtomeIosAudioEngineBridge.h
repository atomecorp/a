#ifndef AtomeIosAudioEngineBridge_h
#define AtomeIosAudioEngineBridge_h

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

// Native Kira audio engine (Rust, atome-audio-engine): one command by name with
// its JSON arguments; the returned JSON string is released by the caller.
char *atome_ios_audio_command(const char *name, const char *args_json, const char *project_root);
void atome_ios_audio_string_free(char *text);
// A clip from its file's bytes as they are (never a JSON array); same reply as atome_ios_audio_command.
char *atome_ios_audio_load_clip_bytes(const char *id, const uint8_t *bytes, size_t count);
// A sound's length read from its container (never decoded); same reply as atome_ios_audio_command.
char *atome_ios_audio_probe_duration_bytes(const uint8_t *bytes, size_t count);

// Voice engine: 16 kHz mono PCM in [-1, 1] from the app's capture; false when no session runs
// or the library was built without the voice engine (AUv3, simulator).
bool atome_ios_voice_push(const float *samples, size_t count);

// AUv3: the engine runs on the plugin host's clock; the render block pulls it.
bool atome_ios_audio_host_start(uint32_t sample_rate);
uint32_t atome_ios_audio_host_render(float *left, float *right, uint32_t frames, int64_t host_ns);
// AUv3: the host's input to the strips whose IN is `host`; true when one listens.
bool atome_ios_audio_host_input(const float *left, const float *right, uint32_t frames, int64_t host_ns);

// AUv3: where a take of the host's input starts on the engine's clock (its first sample's host instant
// and the output anchor); false without an anchor yet.
typedef struct {
    int64_t first_capture_host_ns;
    uint64_t anchor_frame;
    int64_t anchor_host_ns;
    uint32_t output_sample_rate;
    uint32_t discontinuities;
} AtomeIosCaptureClock;
bool atome_ios_audio_host_capture_clock(int64_t first_capture_host_ns, AtomeIosCaptureClock *out);
uint32_t atome_ios_audio_host_latency_frames(void);
#endif
