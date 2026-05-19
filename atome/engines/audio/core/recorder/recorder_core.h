#pragma once
#include <cstdint>

#ifdef __cplusplus
extern "C" {
#endif

// Core recorder API (C ABI). Start/stop manage WAV writing on a worker thread.
bool squirrel_recorder_core_start(const char* abs_wav_path,
                                 uint32_t sample_rate,
                                 uint16_t channels,
                                 const char* source,
                                 char** err_out);

bool squirrel_recorder_core_stop(char** err_out, double* out_duration_sec);

bool squirrel_recorder_core_is_recording(void);

bool squirrel_recorder_core_source_is(const char* source);

// Push non-interleaved float32 audio (one plane per channel).
void squirrel_recorder_core_push(const float* const* data,
                                 uint16_t channels,
                                 uint32_t frames);

// Push interleaved float32 audio.
void squirrel_recorder_core_push_interleaved(const float* data,
                                             uint16_t channels,
                                             uint32_t frames);

void squirrel_string_free(char* s);

#ifdef __cplusplus
}
#endif
