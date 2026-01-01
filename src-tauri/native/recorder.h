#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C"
{
#endif

    // Starts recording into an absolute file path (WAV).
    // Returns true on success. On failure, returns false and sets *err_out to a malloc'ed C string.
    bool squirrel_recorder_start(const char *abs_wav_path,
                                 uint32_t sample_rate,
                                 uint16_t channels,
                                 const char *source,
                                 char **err_out);

    // Stops recording. Returns true on success and outputs duration in seconds.
    bool squirrel_recorder_stop(char **err_out, double *out_duration_sec);

    // Frees strings returned via err_out.
    void squirrel_string_free(char *s);

#ifdef __cplusplus
}
#endif
