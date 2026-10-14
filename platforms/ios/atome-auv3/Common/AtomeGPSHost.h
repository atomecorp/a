#pragma once
#include <stdbool.h>
typedef void (*AtomeGPSEffectCallback)(const char *json);
typedef bool (*AtomeGPSAuthorizationCallback)(const char *owner, const char *session);
void atome_gps_set_effect_callback(AtomeGPSEffectCallback callback);
void atome_gps_set_authorization_callback(AtomeGPSAuthorizationCallback callback);
char *atome_gps_invoke(const char *json, const char *engine_source);
void atome_gps_free(char *value);
