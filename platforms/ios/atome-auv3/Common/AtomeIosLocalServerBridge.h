#ifndef AtomeIosLocalServerBridge_h
#define AtomeIosLocalServerBridge_h

#include <stdint.h>

// The local server (Rust, atome_server::local), run in this process on the app-group vault.
// Returned strings are released with atome_ios_audio_string_free.

// Swift's verifier of a device-key signature: 1 valid, 0 invalid, -1 key unavailable.
typedef int32_t (*AtomeIosVerifyDeviceSignature)(const char *scope, const char *message, const char *signature);

// Starts the server once per process; its port, or 0 with the reason in *error_out.
uint16_t atome_ios_local_server_start(const char *static_dir, const char *storage_dir, const char *data_dir,
                                      const char *session_secret, AtomeIosVerifyDeviceSignature verify,
                                      uint16_t preferred_port, char **error_out);
// Serves it again on a new listening socket (the same port when free); its port, or 0.
uint16_t atome_ios_local_server_rebind(uint16_t preferred_port, char **error_out);
// One /ws/api frame answered for a native controller, as the page's socket would.
char *atome_ios_local_server_answer(const char *frame_json);
// {"user_id":…} for a valid local session token, {"user_id":null} otherwise.
char *atome_ios_local_server_verify(const char *token);
// The background time of one unit of work on the vault: its id, or -1 when none is left.
typedef int64_t (*AtomeIosBeginBackgroundTime)(void);
typedef void (*AtomeIosEndBackgroundTime)(int64_t identifier);
// On the way to the background: from now on a unit of work on the vault starts only under the
// background time `begin` grants it (else it is refused); returns once the units under way are over.
void atome_ios_local_server_quiesce(AtomeIosBeginBackgroundTime begin, AtomeIosEndBackgroundTime end);
// Back in the foreground: the units start freely again and the background loops go on.
void atome_ios_local_server_resume(void);
// A unit's background time ran out: the running statement stops and rolls back.
void atome_ios_local_server_interrupt(void);

#endif
