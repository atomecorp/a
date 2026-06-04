#ifndef AtomeIosBevyRendererBridge_h
#define AtomeIosBevyRendererBridge_h

#include <stdint.h>

typedef struct AtomeIosBevyRendererStatus {
    uint32_t abi_version;
    uint8_t rust_compiled;
    uint8_t rust_linked;
    uint8_t bevy_core_linked;
    uint8_t presentable;
    const char *renderer_mode;
} AtomeIosBevyRendererStatus;

typedef struct AtomeIosBevySceneProbe {
    uint32_t abi_version;
    uint8_t success;
    uint8_t scene_decode_ok;
    uint8_t rust_compiled;
    uint8_t rust_linked;
    uint8_t bevy_core_linked;
    uint8_t presentable;
    uint32_t node_count;
    uint32_t media_node_count;
    uint32_t texture_node_count;
    uint32_t source_node_count;
    uint32_t text_node_count;
    double width;
    double height;
    uint32_t error_code;
    const char *renderer_mode;
} AtomeIosBevySceneProbe;

AtomeIosBevyRendererStatus atome_ios_bevy_renderer_status(void);
AtomeIosBevySceneProbe atome_ios_bevy_scene_probe(const char *scene_json, double width, double height);

#endif
