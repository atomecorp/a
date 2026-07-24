/* @ts-self-types="./squirrel_bevy_renderer.d.ts" */

/**
 * @param {string} id
 */
export function apply_atome_bevy_despawn(id) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.apply_atome_bevy_despawn(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @param {any} patch
 */
export function apply_atome_bevy_layer(patch) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.apply_atome_bevy_layer(retptr, addHeapObject(patch));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @param {any} ops
 */
export function apply_atome_bevy_ops(ops) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.apply_atome_bevy_ops(retptr, addHeapObject(ops));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @param {any} patch
 */
export function apply_atome_bevy_reparent(patch) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.apply_atome_bevy_reparent(retptr, addHeapObject(patch));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @param {any} patch
 */
export function apply_atome_bevy_resource(patch) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.apply_atome_bevy_resource(retptr, addHeapObject(patch));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @param {any} patch
 */
export function apply_atome_bevy_scene_effects(patch) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.apply_atome_bevy_scene_effects(retptr, addHeapObject(patch));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @param {any} node
 */
export function apply_atome_bevy_spawn(node) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.apply_atome_bevy_spawn(retptr, addHeapObject(node));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @param {any} patch
 */
export function apply_atome_bevy_style(patch) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.apply_atome_bevy_style(retptr, addHeapObject(patch));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @param {any} patch
 */
export function apply_atome_bevy_surface(patch) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.apply_atome_bevy_surface(retptr, addHeapObject(patch));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @param {any} patch
 */
export function apply_atome_bevy_surface_background(patch) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.apply_atome_bevy_surface_background(retptr, addHeapObject(patch));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @param {any} patch
 */
export function apply_atome_bevy_text_metadata(patch) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.apply_atome_bevy_text_metadata(retptr, addHeapObject(patch));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @param {any} patch
 */
export function apply_atome_bevy_transform(patch) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.apply_atome_bevy_transform(retptr, addHeapObject(patch));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @param {any} ops
 */
export function apply_atome_bevy_ui_ops(ops) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.apply_atome_bevy_ui_ops(retptr, addHeapObject(ops));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @param {any} patch
 */
export function apply_atome_bevy_visibility(patch) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.apply_atome_bevy_visibility(retptr, addHeapObject(patch));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @returns {any}
 */
export function drain_atome_bevy_ui_events() {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.drain_atome_bevy_ui_events(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        if (r2) {
            throw takeObject(r1);
        }
        return takeObject(r0);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @param {string} id
 * @param {number} frame_version
 */
export function notify_atome_bevy_video_frame(id, frame_version) {
    const ptr0 = passStringToWasm0(id, wasm.__wbindgen_export, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    wasm.notify_atome_bevy_video_frame(ptr0, len0, frame_version);
}

/**
 * @param {any} events
 */
export function queue_atome_bevy_ui_events(events) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.queue_atome_bevy_ui_events(retptr, addHeapObject(events));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @returns {any}
 */
export function read_atome_bevy_ui_diagnostics() {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.read_atome_bevy_ui_diagnostics(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        if (r2) {
            throw takeObject(r1);
        }
        return takeObject(r0);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @returns {any}
 */
export function read_atome_bevy_video_backend_capabilities() {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.read_atome_bevy_video_backend_capabilities(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        if (r2) {
            throw takeObject(r1);
        }
        return takeObject(r0);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @returns {any}
 */
export function read_atome_bevy_video_copy_diagnostics() {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.read_atome_bevy_video_copy_diagnostics(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        if (r2) {
            throw takeObject(r1);
        }
        return takeObject(r0);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @returns {any}
 */
export function read_atome_bevy_web_diagnostics() {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.read_atome_bevy_web_diagnostics(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        if (r2) {
            throw takeObject(r1);
        }
        return takeObject(r0);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @param {number} weight
 * @param {Uint8Array} bytes
 */
export function register_atome_bevy_font(weight, bytes) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_export);
    const len0 = WASM_VECTOR_LEN;
    wasm.register_atome_bevy_font(weight, ptr0, len0);
}

export function request_atome_bevy_redraw() {
    wasm.request_atome_bevy_redraw();
}

/**
 * @returns {any}
 */
export function reset_atome_bevy_video_copy_diagnostics() {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.reset_atome_bevy_video_copy_diagnostics(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        if (r2) {
            throw takeObject(r1);
        }
        return takeObject(r0);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @returns {any}
 */
export function reset_atome_bevy_web_diagnostics() {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.reset_atome_bevy_web_diagnostics(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        if (r2) {
            throw takeObject(r1);
        }
        return takeObject(r0);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @param {string} canvas_selector
 * @param {number} width
 * @param {number} height
 * @param {any} surface_metrics
 * @param {any} initial_scene
 */
export function run_atome_bevy_preview_renderer(canvas_selector, width, height, surface_metrics, initial_scene) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(canvas_selector, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.run_atome_bevy_preview_renderer(retptr, ptr0, len0, width, height, addHeapObject(surface_metrics), addHeapObject(initial_scene));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @param {string} canvas_selector
 * @param {number} width
 * @param {number} height
 * @param {any} surface_metrics
 * @param {any} initial_scene
 */
export function run_atome_bevy_renderer(canvas_selector, width, height, surface_metrics, initial_scene) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(canvas_selector, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.run_atome_bevy_renderer(retptr, ptr0, len0, width, height, addHeapObject(surface_metrics), addHeapObject(initial_scene));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_8c4e43fe74559d73: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return addHeapObject(ret);
        },
        __wbg_Number_04624de7d0e8332d: function(arg0) {
            const ret = Number(getObject(arg0));
            return ret;
        },
        __wbg_String_8f0eb39a4a4c2f66: function(arg0, arg1) {
            const ret = String(getObject(arg1));
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_Window_17e9b99e29a86025: function(arg0) {
            const ret = getObject(arg0).Window;
            return addHeapObject(ret);
        },
        __wbg_Window_3a8a4334fa969e5e: function(arg0) {
            const ret = getObject(arg0).Window;
            return addHeapObject(ret);
        },
        __wbg_Window_9246d148fa46990d: function(arg0) {
            const ret = getObject(arg0).Window;
            return addHeapObject(ret);
        },
        __wbg_WorkerGlobalScope_85d7c1fe3f056c73: function(arg0) {
            const ret = getObject(arg0).WorkerGlobalScope;
            return addHeapObject(ret);
        },
        __wbg_WorkerGlobalScope_f390bbf30043f6cf: function(arg0) {
            const ret = getObject(arg0).WorkerGlobalScope;
            return addHeapObject(ret);
        },
        __wbg___wbindgen_bigint_get_as_i64_8fcf4ce7f1ca72a2: function(arg0, arg1) {
            const v = getObject(arg1);
            const ret = typeof(v) === 'bigint' ? v : undefined;
            getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_boolean_get_bbbb1c18aa2f5e25: function(arg0) {
            const v = getObject(arg0);
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_debug_string_0bc8482c6e3508ae: function(arg0, arg1) {
            const ret = debugString(getObject(arg1));
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_in_47fa6863be6f2f25: function(arg0, arg1) {
            const ret = getObject(arg0) in getObject(arg1);
            return ret;
        },
        __wbg___wbindgen_is_bigint_31b12575b56f32fc: function(arg0) {
            const ret = typeof(getObject(arg0)) === 'bigint';
            return ret;
        },
        __wbg___wbindgen_is_function_0095a73b8b156f76: function(arg0) {
            const ret = typeof(getObject(arg0)) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_null_ac34f5003991759a: function(arg0) {
            const ret = getObject(arg0) === null;
            return ret;
        },
        __wbg___wbindgen_is_object_5ae8e5880f2c1fbd: function(arg0) {
            const val = getObject(arg0);
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_undefined_9e4d92534c42d778: function(arg0) {
            const ret = getObject(arg0) === undefined;
            return ret;
        },
        __wbg___wbindgen_jsval_eq_11888390b0186270: function(arg0, arg1) {
            const ret = getObject(arg0) === getObject(arg1);
            return ret;
        },
        __wbg___wbindgen_jsval_loose_eq_9dd77d8cd6671811: function(arg0, arg1) {
            const ret = getObject(arg0) == getObject(arg1);
            return ret;
        },
        __wbg___wbindgen_number_get_8ff4255516ccad3e: function(arg0, arg1) {
            const obj = getObject(arg1);
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_72fb696202c56729: function(arg0, arg1) {
            const obj = getObject(arg1);
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_be289d5034ed271b: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_d9b87ff7982e3b21: function(arg0) {
            getObject(arg0)._wbg_cb_unref();
        },
        __wbg_abort_2f0584e03e8e3950: function(arg0) {
            getObject(arg0).abort();
        },
        __wbg_activeElement_1554b6917654f8d6: function(arg0) {
            const ret = getObject(arg0).activeElement;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_addEventListener_3acb0aad4483804c: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            getObject(arg0).addEventListener(getStringFromWasm0(arg1, arg2), getObject(arg3));
        }, arguments); },
        __wbg_addListener_03e8162d7e03c823: function() { return handleError(function (arg0, arg1) {
            getObject(arg0).addListener(getObject(arg1));
        }, arguments); },
        __wbg_altKey_73c1173ba53073d5: function(arg0) {
            const ret = getObject(arg0).altKey;
            return ret;
        },
        __wbg_altKey_8155c319c215e3aa: function(arg0) {
            const ret = getObject(arg0).altKey;
            return ret;
        },
        __wbg_animate_18f9c90c91cf5187: function(arg0, arg1, arg2) {
            const ret = getObject(arg0).animate(getObject(arg1), getObject(arg2));
            return addHeapObject(ret);
        },
        __wbg_appendChild_dea38765a26d346d: function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).appendChild(getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_arrayBuffer_bb54076166006c39: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).arrayBuffer();
            return addHeapObject(ret);
        }, arguments); },
        __wbg_beginComputePass_208fbf787bba84a6: function(arg0, arg1) {
            const ret = getObject(arg0).beginComputePass(getObject(arg1));
            return addHeapObject(ret);
        },
        __wbg_beginRenderPass_f426b2c97f0348ef: function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).beginRenderPass(getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_blockSize_ef9a626745d7dfac: function(arg0) {
            const ret = getObject(arg0).blockSize;
            return ret;
        },
        __wbg_body_f67922363a220026: function(arg0) {
            const ret = getObject(arg0).body;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_brand_0cf991e6f515204f: function(arg0, arg1) {
            const ret = getObject(arg1).brand;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_brands_8d08d99f0ee8539b: function(arg0) {
            const ret = getObject(arg0).brands;
            return addHeapObject(ret);
        },
        __wbg_button_d86841d0a03adc44: function(arg0) {
            const ret = getObject(arg0).button;
            return ret;
        },
        __wbg_buttons_a158a0cad3175f24: function(arg0) {
            const ret = getObject(arg0).buttons;
            return ret;
        },
        __wbg_call_389efe28435a9388: function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).call(getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_call_4708e0c13bdc8e95: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_call_812d25f1510c13c8: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = getObject(arg0).call(getObject(arg1), getObject(arg2), getObject(arg3));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_cancelAnimationFrame_cd35895d78cf4510: function() { return handleError(function (arg0, arg1) {
            getObject(arg0).cancelAnimationFrame(arg1);
        }, arguments); },
        __wbg_cancelIdleCallback_fdfaaf4ca585e729: function(arg0, arg1) {
            getObject(arg0).cancelIdleCallback(arg1 >>> 0);
        },
        __wbg_cancel_5bef4eece77c0bc8: function(arg0) {
            getObject(arg0).cancel();
        },
        __wbg_catch_c1f8c7623b458214: function(arg0, arg1) {
            const ret = getObject(arg0).catch(getObject(arg1));
            return addHeapObject(ret);
        },
        __wbg_clearTimeout_df03cf00269bc442: function(arg0, arg1) {
            getObject(arg0).clearTimeout(arg1);
        },
        __wbg_clipboard_98c5a32249fa8416: function(arg0) {
            const ret = getObject(arg0).clipboard;
            return addHeapObject(ret);
        },
        __wbg_close_fad2f0ee451926ed: function(arg0) {
            getObject(arg0).close();
        },
        __wbg_code_dee0dae4730408e1: function(arg0, arg1) {
            const ret = getObject(arg1).code;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_configure_05b19ec7d1968e6d: function() { return handleError(function (arg0, arg1) {
            getObject(arg0).configure(getObject(arg1));
        }, arguments); },
        __wbg_contains_1056459c33f961e8: function(arg0, arg1) {
            const ret = getObject(arg0).contains(getObject(arg1));
            return ret;
        },
        __wbg_contentRect_79b98e4d4f4728a4: function(arg0) {
            const ret = getObject(arg0).contentRect;
            return addHeapObject(ret);
        },
        __wbg_copyBufferToBuffer_09482d1e1ebf0fc1: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            getObject(arg0).copyBufferToBuffer(getObject(arg1), arg2, getObject(arg3), arg4);
        }, arguments); },
        __wbg_copyBufferToBuffer_2de9e5f3b06219cd: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5) {
            getObject(arg0).copyBufferToBuffer(getObject(arg1), arg2, getObject(arg3), arg4, arg5);
        }, arguments); },
        __wbg_copyTextureToBuffer_c0f938786a08dd42: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            getObject(arg0).copyTextureToBuffer(getObject(arg1), getObject(arg2), getObject(arg3));
        }, arguments); },
        __wbg_copyTextureToTexture_63f6e1341ce12021: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            getObject(arg0).copyTextureToTexture(getObject(arg1), getObject(arg2), getObject(arg3));
        }, arguments); },
        __wbg_createBindGroupLayout_d3b19da28bbc896d: function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).createBindGroupLayout(getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_createBindGroup_d745b7a285587ef1: function(arg0, arg1) {
            const ret = getObject(arg0).createBindGroup(getObject(arg1));
            return addHeapObject(ret);
        },
        __wbg_createBuffer_ca1d2ac98c8ccc75: function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).createBuffer(getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_createCommandEncoder_c4dfe55ada0f6bbd: function(arg0, arg1) {
            const ret = getObject(arg0).createCommandEncoder(getObject(arg1));
            return addHeapObject(ret);
        },
        __wbg_createComputePipeline_0a3535edbefb5241: function(arg0, arg1) {
            const ret = getObject(arg0).createComputePipeline(getObject(arg1));
            return addHeapObject(ret);
        },
        __wbg_createElement_49f60fdcaae809c8: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).createElement(getStringFromWasm0(arg1, arg2));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_createObjectURL_918185db6a10a0c8: function() { return handleError(function (arg0, arg1) {
            const ret = URL.createObjectURL(getObject(arg1));
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        }, arguments); },
        __wbg_createPipelineLayout_7ba604477c891bff: function(arg0, arg1) {
            const ret = getObject(arg0).createPipelineLayout(getObject(arg1));
            return addHeapObject(ret);
        },
        __wbg_createRenderPipeline_f43d0aa6dd9f23c3: function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).createRenderPipeline(getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_createSampler_9df3971cd4aef806: function(arg0, arg1) {
            const ret = getObject(arg0).createSampler(getObject(arg1));
            return addHeapObject(ret);
        },
        __wbg_createShaderModule_a01e8eaf1af3292d: function(arg0, arg1) {
            const ret = getObject(arg0).createShaderModule(getObject(arg1));
            return addHeapObject(ret);
        },
        __wbg_createTexture_d177c70d99fe0bc6: function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).createTexture(getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_createView_ce0d405d3159247c: function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).createView(getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_ctrlKey_09a1b54d77dea92b: function(arg0) {
            const ret = getObject(arg0).ctrlKey;
            return ret;
        },
        __wbg_ctrlKey_96ff94f8b18636a3: function(arg0) {
            const ret = getObject(arg0).ctrlKey;
            return ret;
        },
        __wbg_deltaMode_a1d1df711e44cefc: function(arg0) {
            const ret = getObject(arg0).deltaMode;
            return ret;
        },
        __wbg_deltaX_f0ca9116db5f7bc1: function(arg0) {
            const ret = getObject(arg0).deltaX;
            return ret;
        },
        __wbg_deltaY_eb94120160ac821c: function(arg0) {
            const ret = getObject(arg0).deltaY;
            return ret;
        },
        __wbg_description_ff873694a60959ed: function(arg0, arg1) {
            const ret = getObject(arg1).description;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_devicePixelContentBoxSize_8f39437eab7f03ea: function(arg0) {
            const ret = getObject(arg0).devicePixelContentBoxSize;
            return addHeapObject(ret);
        },
        __wbg_devicePixelRatio_5c458affc89fc209: function(arg0) {
            const ret = getObject(arg0).devicePixelRatio;
            return ret;
        },
        __wbg_disconnect_0a2d26237dfc1e9e: function(arg0) {
            getObject(arg0).disconnect();
        },
        __wbg_disconnect_5202f399852258c0: function(arg0) {
            getObject(arg0).disconnect();
        },
        __wbg_dispatchWorkgroups_ee972ed6e8d21c80: function(arg0, arg1, arg2, arg3) {
            getObject(arg0).dispatchWorkgroups(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0);
        },
        __wbg_document_ee35a3d3ae34ef6c: function(arg0) {
            const ret = getObject(arg0).document;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_done_57b39ecd9addfe81: function(arg0) {
            const ret = getObject(arg0).done;
            return ret;
        },
        __wbg_drawIndexed_799dd825604aa8f6: function(arg0, arg1, arg2, arg3, arg4, arg5) {
            getObject(arg0).drawIndexed(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4, arg5 >>> 0);
        },
        __wbg_draw_a27717945e207218: function(arg0, arg1, arg2, arg3, arg4) {
            getObject(arg0).draw(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4 >>> 0);
        },
        __wbg_end_60706514217082df: function(arg0) {
            getObject(arg0).end();
        },
        __wbg_end_e77884829ba8012d: function(arg0) {
            getObject(arg0).end();
        },
        __wbg_entries_58c7934c745daac7: function(arg0) {
            const ret = Object.entries(getObject(arg0));
            return addHeapObject(ret);
        },
        __wbg_error_548b3f743731467e: function(arg0) {
            const ret = getObject(arg0).error;
            return addHeapObject(ret);
        },
        __wbg_error_7534b8e9a36f1ab4: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_export4(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_error_f852e41c69b0bd84: function(arg0, arg1) {
            console.error(getObject(arg0), getObject(arg1));
        },
        __wbg_exitFullscreen_a15f439a0e27b307: function(arg0) {
            getObject(arg0).exitFullscreen();
        },
        __wbg_exitPointerLock_faff71a5e2d467ea: function(arg0) {
            getObject(arg0).exitPointerLock();
        },
        __wbg_features_0581c731d3db85fa: function(arg0) {
            const ret = getObject(arg0).features;
            return addHeapObject(ret);
        },
        __wbg_features_0d8c4483a6acbbda: function(arg0) {
            const ret = getObject(arg0).features;
            return addHeapObject(ret);
        },
        __wbg_fetch_4f06ca81d87798ba: function(arg0, arg1, arg2) {
            const ret = getObject(arg0).fetch(getStringFromWasm0(arg1, arg2));
            return addHeapObject(ret);
        },
        __wbg_fetch_d1488f40cef1e210: function(arg0, arg1, arg2) {
            const ret = getObject(arg0).fetch(getStringFromWasm0(arg1, arg2));
            return addHeapObject(ret);
        },
        __wbg_finish_6b1767154cba568f: function(arg0) {
            const ret = getObject(arg0).finish();
            return addHeapObject(ret);
        },
        __wbg_finish_fafac8fded9a7a6c: function(arg0, arg1) {
            const ret = getObject(arg0).finish(getObject(arg1));
            return addHeapObject(ret);
        },
        __wbg_focus_128ff465f65677cc: function() { return handleError(function (arg0) {
            getObject(arg0).focus();
        }, arguments); },
        __wbg_fullscreenElement_25b445e2961e68ba: function(arg0) {
            const ret = getObject(arg0).fullscreenElement;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_getBoundingClientRect_b5c8c34d07878818: function(arg0) {
            const ret = getObject(arg0).getBoundingClientRect();
            return addHeapObject(ret);
        },
        __wbg_getCoalescedEvents_1d15f63b6a879063: function(arg0) {
            const ret = getObject(arg0).getCoalescedEvents;
            return addHeapObject(ret);
        },
        __wbg_getCoalescedEvents_8d19e426e1461e96: function(arg0) {
            const ret = getObject(arg0).getCoalescedEvents();
            return addHeapObject(ret);
        },
        __wbg_getComputedStyle_2d1f9dfe4ee7e0b9: function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).getComputedStyle(getObject(arg1));
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        }, arguments); },
        __wbg_getContext_2966500392030d63: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).getContext(getStringFromWasm0(arg1, arg2));
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        }, arguments); },
        __wbg_getContext_2a5764d48600bc43: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).getContext(getStringFromWasm0(arg1, arg2));
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        }, arguments); },
        __wbg_getCurrentTexture_3a4b16a6b369e6ba: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).getCurrentTexture();
            return addHeapObject(ret);
        }, arguments); },
        __wbg_getMappedRange_71548a7a8647cdbc: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).getMappedRange(arg1, arg2);
            return addHeapObject(ret);
        }, arguments); },
        __wbg_getOwnPropertyDescriptor_03ccfd856865081b: function(arg0, arg1) {
            const ret = Object.getOwnPropertyDescriptor(getObject(arg0), getObject(arg1));
            return addHeapObject(ret);
        },
        __wbg_getPreferredCanvasFormat_89b70c1556d04f62: function(arg0) {
            const ret = getObject(arg0).getPreferredCanvasFormat();
            return (__wbindgen_enum_GpuTextureFormat.indexOf(ret) + 1 || 96) - 1;
        },
        __wbg_getPropertyValue_d6911b2a1f9acba9: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = getObject(arg1).getPropertyValue(getStringFromWasm0(arg2, arg3));
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        }, arguments); },
        __wbg_get_9b94d73e6221f75c: function(arg0, arg1) {
            const ret = getObject(arg0)[arg1 >>> 0];
            return addHeapObject(ret);
        },
        __wbg_get_b3ed3ad4be2bc8ac: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(getObject(arg0), getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_get_d8db2ad31d529ff8: function(arg0, arg1) {
            const ret = getObject(arg0)[arg1 >>> 0];
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_get_with_ref_key_1dc361bd10053bfe: function(arg0, arg1) {
            const ret = getObject(arg0)[getObject(arg1)];
            return addHeapObject(ret);
        },
        __wbg_gpu_a7e205c0e261fdab: function(arg0) {
            const ret = getObject(arg0).gpu;
            return addHeapObject(ret);
        },
        __wbg_has_d4e53238966c12b6: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.has(getObject(arg0), getObject(arg1));
            return ret;
        }, arguments); },
        __wbg_has_fee50598a6a9b7c4: function(arg0, arg1, arg2) {
            const ret = getObject(arg0).has(getStringFromWasm0(arg1, arg2));
            return ret;
        },
        __wbg_height_c2027cf67d1c9b11: function(arg0) {
            const ret = getObject(arg0).height;
            return ret;
        },
        __wbg_importExternalTexture_08e24f7c4d00e3cc: function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).importExternalTexture(getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_info_533484e27c0f0992: function(arg0) {
            const ret = getObject(arg0).info;
            return addHeapObject(ret);
        },
        __wbg_inlineSize_3e4e7e8c813884fd: function(arg0) {
            const ret = getObject(arg0).inlineSize;
            return ret;
        },
        __wbg_instanceof_ArrayBuffer_c367199e2fa2aa04: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof ArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_GpuAdapter_fc7b89fc546de0bc: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof GPUAdapter;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_GpuCanvasContext_1a39fd0621603553: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof GPUCanvasContext;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_GpuDeviceLostInfo_c0ebce29b32e81e8: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof GPUDeviceLostInfo;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_GpuOutOfMemoryError_5ac5c50ce9ee21d2: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof GPUOutOfMemoryError;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_GpuValidationError_77b97d666afabac1: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof GPUValidationError;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_HtmlCanvasElement_3f2f6e1edb1c9792: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof HTMLCanvasElement;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_HtmlVideoElement_215cc19443d76f27: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof HTMLVideoElement;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Map_53af74335dec57f4: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Map;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Object_1c6af87502b733ed: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Object;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Response_ee1d54d79ae41977: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Response;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint8Array_9b9075935c74707c: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Uint8Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Window_ed49b2db8df90359: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Window;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isArray_d314bb98fcf08331: function(arg0) {
            const ret = Array.isArray(getObject(arg0));
            return ret;
        },
        __wbg_isIntersecting_6807d592d68e059e: function(arg0) {
            const ret = getObject(arg0).isIntersecting;
            return ret;
        },
        __wbg_isSafeInteger_bfbc7332a9768d2a: function(arg0) {
            const ret = Number.isSafeInteger(getObject(arg0));
            return ret;
        },
        __wbg_is_f29129f676e5410c: function(arg0, arg1) {
            const ret = Object.is(getObject(arg0), getObject(arg1));
            return ret;
        },
        __wbg_iterator_6ff6560ca1568e55: function() {
            const ret = Symbol.iterator;
            return addHeapObject(ret);
        },
        __wbg_key_d41e8e825e6bb0e9: function(arg0, arg1) {
            const ret = getObject(arg1).key;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_label_d36b84c584875481: function(arg0, arg1) {
            const ret = getObject(arg1).label;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_length_32ed9a279acd054c: function(arg0) {
            const ret = getObject(arg0).length;
            return ret;
        },
        __wbg_length_35a7bace40f36eac: function(arg0) {
            const ret = getObject(arg0).length;
            return ret;
        },
        __wbg_limits_2c812d1e79df92b3: function(arg0) {
            const ret = getObject(arg0).limits;
            return addHeapObject(ret);
        },
        __wbg_limits_5c69d73b7be48e2a: function(arg0) {
            const ret = getObject(arg0).limits;
            return addHeapObject(ret);
        },
        __wbg_location_22bcb1a188a96eb1: function(arg0) {
            const ret = getObject(arg0).location;
            return ret;
        },
        __wbg_log_0cc1b7768397bcfe: function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.log(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3), getStringFromWasm0(arg4, arg5), getStringFromWasm0(arg6, arg7));
            } finally {
                wasm.__wbindgen_export4(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_log_cb9e190acc5753fb: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.log(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_export4(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_lost_090f218119d0b35e: function(arg0) {
            const ret = getObject(arg0).lost;
            return addHeapObject(ret);
        },
        __wbg_mapAsync_fa1204eb5e5842fc: function(arg0, arg1, arg2, arg3) {
            const ret = getObject(arg0).mapAsync(arg1 >>> 0, arg2, arg3);
            return addHeapObject(ret);
        },
        __wbg_mark_7438147ce31e9d4b: function(arg0, arg1) {
            performance.mark(getStringFromWasm0(arg0, arg1));
        },
        __wbg_matchMedia_91d4fc9729dc3c84: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).matchMedia(getStringFromWasm0(arg1, arg2));
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        }, arguments); },
        __wbg_matches_4b5c22bd830f7bb3: function(arg0) {
            const ret = getObject(arg0).matches;
            return ret;
        },
        __wbg_maxBindGroups_17abf70a837ed8a7: function(arg0) {
            const ret = getObject(arg0).maxBindGroups;
            return ret;
        },
        __wbg_maxBindingsPerBindGroup_f6017e97815ecc91: function(arg0) {
            const ret = getObject(arg0).maxBindingsPerBindGroup;
            return ret;
        },
        __wbg_maxBufferSize_73fe1121c1bdcd77: function(arg0) {
            const ret = getObject(arg0).maxBufferSize;
            return ret;
        },
        __wbg_maxColorAttachmentBytesPerSample_24470e0357682210: function(arg0) {
            const ret = getObject(arg0).maxColorAttachmentBytesPerSample;
            return ret;
        },
        __wbg_maxColorAttachments_82ae210f4cc71697: function(arg0) {
            const ret = getObject(arg0).maxColorAttachments;
            return ret;
        },
        __wbg_maxComputeInvocationsPerWorkgroup_26408201662615a2: function(arg0) {
            const ret = getObject(arg0).maxComputeInvocationsPerWorkgroup;
            return ret;
        },
        __wbg_maxComputeWorkgroupSizeX_a7295125edcce83b: function(arg0) {
            const ret = getObject(arg0).maxComputeWorkgroupSizeX;
            return ret;
        },
        __wbg_maxComputeWorkgroupSizeY_95de3aeb7c022e5b: function(arg0) {
            const ret = getObject(arg0).maxComputeWorkgroupSizeY;
            return ret;
        },
        __wbg_maxComputeWorkgroupSizeZ_9a69ff48e0383e3c: function(arg0) {
            const ret = getObject(arg0).maxComputeWorkgroupSizeZ;
            return ret;
        },
        __wbg_maxComputeWorkgroupStorageSize_17045a3346d3c7b1: function(arg0) {
            const ret = getObject(arg0).maxComputeWorkgroupStorageSize;
            return ret;
        },
        __wbg_maxComputeWorkgroupsPerDimension_6eff49c0725acb71: function(arg0) {
            const ret = getObject(arg0).maxComputeWorkgroupsPerDimension;
            return ret;
        },
        __wbg_maxDynamicStorageBuffersPerPipelineLayout_afaa49a2c90365e2: function(arg0) {
            const ret = getObject(arg0).maxDynamicStorageBuffersPerPipelineLayout;
            return ret;
        },
        __wbg_maxDynamicUniformBuffersPerPipelineLayout_aa5476babff6d3e3: function(arg0) {
            const ret = getObject(arg0).maxDynamicUniformBuffersPerPipelineLayout;
            return ret;
        },
        __wbg_maxInterStageShaderVariables_cd671a02a27f64e4: function(arg0) {
            const ret = getObject(arg0).maxInterStageShaderVariables;
            return ret;
        },
        __wbg_maxSampledTexturesPerShaderStage_e79c66248abd8529: function(arg0) {
            const ret = getObject(arg0).maxSampledTexturesPerShaderStage;
            return ret;
        },
        __wbg_maxSamplersPerShaderStage_f78a82728d3bb10b: function(arg0) {
            const ret = getObject(arg0).maxSamplersPerShaderStage;
            return ret;
        },
        __wbg_maxStorageBufferBindingSize_b9375eeb5da8d186: function(arg0) {
            const ret = getObject(arg0).maxStorageBufferBindingSize;
            return ret;
        },
        __wbg_maxStorageBuffersPerShaderStage_ebb5ac5ab2bf0eea: function(arg0) {
            const ret = getObject(arg0).maxStorageBuffersPerShaderStage;
            return ret;
        },
        __wbg_maxStorageTexturesPerShaderStage_e69dc225cbe512cc: function(arg0) {
            const ret = getObject(arg0).maxStorageTexturesPerShaderStage;
            return ret;
        },
        __wbg_maxTextureArrayLayers_5620b8d2aed68e82: function(arg0) {
            const ret = getObject(arg0).maxTextureArrayLayers;
            return ret;
        },
        __wbg_maxTextureDimension1D_710a0170714d6602: function(arg0) {
            const ret = getObject(arg0).maxTextureDimension1D;
            return ret;
        },
        __wbg_maxTextureDimension2D_8de368449518acc2: function(arg0) {
            const ret = getObject(arg0).maxTextureDimension2D;
            return ret;
        },
        __wbg_maxTextureDimension3D_0eed4a6c648f775d: function(arg0) {
            const ret = getObject(arg0).maxTextureDimension3D;
            return ret;
        },
        __wbg_maxUniformBufferBindingSize_aad70a451550775d: function(arg0) {
            const ret = getObject(arg0).maxUniformBufferBindingSize;
            return ret;
        },
        __wbg_maxUniformBuffersPerShaderStage_8ff5d6c3032a1453: function(arg0) {
            const ret = getObject(arg0).maxUniformBuffersPerShaderStage;
            return ret;
        },
        __wbg_maxVertexAttributes_d6d697214f13e6c5: function(arg0) {
            const ret = getObject(arg0).maxVertexAttributes;
            return ret;
        },
        __wbg_maxVertexBufferArrayStride_26e138bc04b84b00: function(arg0) {
            const ret = getObject(arg0).maxVertexBufferArrayStride;
            return ret;
        },
        __wbg_maxVertexBuffers_7e0d70745d26f12e: function(arg0) {
            const ret = getObject(arg0).maxVertexBuffers;
            return ret;
        },
        __wbg_measure_fb7825c11612c823: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            let deferred0_0;
            let deferred0_1;
            let deferred1_0;
            let deferred1_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                deferred1_0 = arg2;
                deferred1_1 = arg3;
                performance.measure(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3));
            } finally {
                wasm.__wbindgen_export4(deferred0_0, deferred0_1, 1);
                wasm.__wbindgen_export4(deferred1_0, deferred1_1, 1);
            }
        }, arguments); },
        __wbg_media_7bcde781569bca4c: function(arg0, arg1) {
            const ret = getObject(arg1).media;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_message_c89307ce0c7deb8c: function(arg0, arg1) {
            const ret = getObject(arg1).message;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_message_f2adb109a8cf83d8: function(arg0, arg1) {
            const ret = getObject(arg1).message;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_metaKey_374999c340f70626: function(arg0) {
            const ret = getObject(arg0).metaKey;
            return ret;
        },
        __wbg_metaKey_67113fb40365d736: function(arg0) {
            const ret = getObject(arg0).metaKey;
            return ret;
        },
        __wbg_minStorageBufferOffsetAlignment_555abfcd0f418ac1: function(arg0) {
            const ret = getObject(arg0).minStorageBufferOffsetAlignment;
            return ret;
        },
        __wbg_minUniformBufferOffsetAlignment_0e4bf85b0a22d0f7: function(arg0) {
            const ret = getObject(arg0).minUniformBufferOffsetAlignment;
            return ret;
        },
        __wbg_movementX_ff6524e06bc35b6a: function(arg0) {
            const ret = getObject(arg0).movementX;
            return ret;
        },
        __wbg_movementY_4cec81d9850ad239: function(arg0) {
            const ret = getObject(arg0).movementY;
            return ret;
        },
        __wbg_navigator_43be698ba96fc088: function(arg0) {
            const ret = getObject(arg0).navigator;
            return addHeapObject(ret);
        },
        __wbg_navigator_4478931f32ebca57: function(arg0) {
            const ret = getObject(arg0).navigator;
            return addHeapObject(ret);
        },
        __wbg_new_2e2be9617c4407d5: function() { return handleError(function (arg0) {
            const ret = new ResizeObserver(getObject(arg0));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_new_361308b2356cecd0: function() {
            const ret = new Object();
            return addHeapObject(ret);
        },
        __wbg_new_3eb36ae241fe6f44: function() {
            const ret = new Array();
            return addHeapObject(ret);
        },
        __wbg_new_4f8f3c123e474358: function() { return handleError(function (arg0, arg1) {
            const ret = new Worker(getStringFromWasm0(arg0, arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_new_6f0524fbfa300c47: function() { return handleError(function () {
            const ret = new MessageChannel();
            return addHeapObject(ret);
        }, arguments); },
        __wbg_new_8a6f238a6ece86ea: function() {
            const ret = new Error();
            return addHeapObject(ret);
        },
        __wbg_new_8c6e67a40cee1f83: function() { return handleError(function (arg0) {
            const ret = new IntersectionObserver(getObject(arg0));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_new_b949e7f56150a5d1: function() { return handleError(function () {
            const ret = new AbortController();
            return addHeapObject(ret);
        }, arguments); },
        __wbg_new_dd2b680c8bf6ae29: function(arg0) {
            const ret = new Uint8Array(getObject(arg0));
            return addHeapObject(ret);
        },
        __wbg_new_no_args_1c7c842f08d00ebb: function(arg0, arg1) {
            const ret = new Function(getStringFromWasm0(arg0, arg1));
            return addHeapObject(ret);
        },
        __wbg_new_with_byte_offset_and_length_aa261d9c9da49eb1: function(arg0, arg1, arg2) {
            const ret = new Uint8Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
            return addHeapObject(ret);
        },
        __wbg_new_with_str_sequence_and_options_9b8b0bee99ec6b0f: function() { return handleError(function (arg0, arg1) {
            const ret = new Blob(getObject(arg0), getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_next_3482f54c49e8af19: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).next();
            return addHeapObject(ret);
        }, arguments); },
        __wbg_next_418f80d8f5303233: function(arg0) {
            const ret = getObject(arg0).next;
            return addHeapObject(ret);
        },
        __wbg_now_2c95c9de01293173: function(arg0) {
            const ret = getObject(arg0).now();
            return ret;
        },
        __wbg_observe_1ae37077cf10b11b: function(arg0, arg1, arg2) {
            getObject(arg0).observe(getObject(arg1), getObject(arg2));
        },
        __wbg_observe_2a9d63459970a2c1: function(arg0, arg1) {
            getObject(arg0).observe(getObject(arg1));
        },
        __wbg_observe_b9abc08d6d829e56: function(arg0, arg1) {
            getObject(arg0).observe(getObject(arg1));
        },
        __wbg_of_9ab14f9d4bfb5040: function(arg0, arg1) {
            const ret = Array.of(getObject(arg0), getObject(arg1));
            return addHeapObject(ret);
        },
        __wbg_of_f915f7cd925b21a5: function(arg0) {
            const ret = Array.of(getObject(arg0));
            return addHeapObject(ret);
        },
        __wbg_offsetX_7e1bd16a1970c819: function(arg0) {
            const ret = getObject(arg0).offsetX;
            return ret;
        },
        __wbg_offsetY_f6dc441d8b53726f: function(arg0) {
            const ret = getObject(arg0).offsetY;
            return ret;
        },
        __wbg_onSubmittedWorkDone_5e69d1a2d41637f5: function(arg0) {
            const ret = getObject(arg0).onSubmittedWorkDone();
            return addHeapObject(ret);
        },
        __wbg_performance_7a3ffd0b17f663ad: function(arg0) {
            const ret = getObject(arg0).performance;
            return addHeapObject(ret);
        },
        __wbg_persisted_de98357e1aaf6546: function(arg0) {
            const ret = getObject(arg0).persisted;
            return ret;
        },
        __wbg_play_aa04d90e93029b82: function(arg0) {
            getObject(arg0).play();
        },
        __wbg_pointerId_466b1bdcaf2fe835: function(arg0) {
            const ret = getObject(arg0).pointerId;
            return ret;
        },
        __wbg_pointerType_ba53c6f18634a26d: function(arg0, arg1) {
            const ret = getObject(arg1).pointerType;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_popDebugGroup_12fda70d5ad1f8c9: function(arg0) {
            getObject(arg0).popDebugGroup();
        },
        __wbg_popErrorScope_9a49684576a0941d: function(arg0) {
            const ret = getObject(arg0).popErrorScope();
            return addHeapObject(ret);
        },
        __wbg_port1_6251ddc5cf5c9287: function(arg0) {
            const ret = getObject(arg0).port1;
            return addHeapObject(ret);
        },
        __wbg_port2_b2a294b0ede1e13c: function(arg0) {
            const ret = getObject(arg0).port2;
            return addHeapObject(ret);
        },
        __wbg_postMessage_46eeeef39934b448: function() { return handleError(function (arg0, arg1) {
            getObject(arg0).postMessage(getObject(arg1));
        }, arguments); },
        __wbg_postMessage_e45c89e4826cf2ef: function() { return handleError(function (arg0, arg1, arg2) {
            getObject(arg0).postMessage(getObject(arg1), getObject(arg2));
        }, arguments); },
        __wbg_postTask_86399b3ade66efd6: function(arg0, arg1, arg2) {
            const ret = getObject(arg0).postTask(getObject(arg1), getObject(arg2));
            return addHeapObject(ret);
        },
        __wbg_pressure_f01a99684f7a6cf3: function(arg0) {
            const ret = getObject(arg0).pressure;
            return ret;
        },
        __wbg_preventDefault_cdcfcd7e301b9702: function(arg0) {
            getObject(arg0).preventDefault();
        },
        __wbg_prototype_ef9abc01a5a5761a: function() {
            const ret = ResizeObserverEntry.prototype;
            return addHeapObject(ret);
        },
        __wbg_prototypesetcall_bdcdcc5842e4d77d: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), getObject(arg2));
        },
        __wbg_pushDebugGroup_726e2b3ea05c58c2: function(arg0, arg1, arg2) {
            getObject(arg0).pushDebugGroup(getStringFromWasm0(arg1, arg2));
        },
        __wbg_pushErrorScope_2de184cf568ebfe2: function(arg0, arg1) {
            getObject(arg0).pushErrorScope(__wbindgen_enum_GpuErrorFilter[arg1]);
        },
        __wbg_push_8ffdcb2063340ba5: function(arg0, arg1) {
            const ret = getObject(arg0).push(getObject(arg1));
            return ret;
        },
        __wbg_querySelectorAll_1283aae52043a951: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).querySelectorAll(getStringFromWasm0(arg1, arg2));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_querySelector_c3b0df2d58eec220: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).querySelector(getStringFromWasm0(arg1, arg2));
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        }, arguments); },
        __wbg_queueMicrotask_0aa0a927f78f5d98: function(arg0) {
            const ret = getObject(arg0).queueMicrotask;
            return addHeapObject(ret);
        },
        __wbg_queueMicrotask_2df11def12129343: function(arg0) {
            queueMicrotask(getObject(arg0));
        },
        __wbg_queueMicrotask_5bb536982f78a56f: function(arg0) {
            queueMicrotask(getObject(arg0));
        },
        __wbg_queueMicrotask_885fd8605352e25d: function(arg0, arg1) {
            getObject(arg0).queueMicrotask(getObject(arg1));
        },
        __wbg_queue_2035c273ad2c9f88: function(arg0) {
            const ret = getObject(arg0).queue;
            return addHeapObject(ret);
        },
        __wbg_readText_b9ac81623f153a62: function(arg0) {
            const ret = getObject(arg0).readText();
            return addHeapObject(ret);
        },
        __wbg_readyState_ce115112bd7cd7fd: function(arg0) {
            const ret = getObject(arg0).readyState;
            return ret;
        },
        __wbg_reason_6bc7a14f1e6a4f23: function(arg0) {
            const ret = getObject(arg0).reason;
            return (__wbindgen_enum_GpuDeviceLostReason.indexOf(ret) + 1 || 3) - 1;
        },
        __wbg_removeEventListener_e63328781a5b9af9: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            getObject(arg0).removeEventListener(getStringFromWasm0(arg1, arg2), getObject(arg3));
        }, arguments); },
        __wbg_removeListener_e2a199028636dcf5: function() { return handleError(function (arg0, arg1) {
            getObject(arg0).removeListener(getObject(arg1));
        }, arguments); },
        __wbg_removeProperty_a0d2ff8a76ffd2b1: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = getObject(arg1).removeProperty(getStringFromWasm0(arg2, arg3));
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        }, arguments); },
        __wbg_repeat_375aae5c5c6a0258: function(arg0) {
            const ret = getObject(arg0).repeat;
            return ret;
        },
        __wbg_requestAdapter_b3d5d432fb568d5e: function(arg0, arg1) {
            const ret = getObject(arg0).requestAdapter(getObject(arg1));
            return addHeapObject(ret);
        },
        __wbg_requestAnimationFrame_43682f8e1c5e5348: function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).requestAnimationFrame(getObject(arg1));
            return ret;
        }, arguments); },
        __wbg_requestDevice_56943edf8f39bded: function(arg0, arg1) {
            const ret = getObject(arg0).requestDevice(getObject(arg1));
            return addHeapObject(ret);
        },
        __wbg_requestFullscreen_027b36a20e306926: function(arg0) {
            const ret = getObject(arg0).requestFullscreen();
            return addHeapObject(ret);
        },
        __wbg_requestFullscreen_9c961d6e62570de6: function(arg0) {
            const ret = getObject(arg0).requestFullscreen;
            return addHeapObject(ret);
        },
        __wbg_requestIdleCallback_9ef3e0b06a30c34b: function(arg0) {
            const ret = getObject(arg0).requestIdleCallback;
            return addHeapObject(ret);
        },
        __wbg_requestIdleCallback_c9c643f8210d435b: function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).requestIdleCallback(getObject(arg1));
            return ret;
        }, arguments); },
        __wbg_requestPointerLock_f619fbb4f5d11204: function(arg0) {
            getObject(arg0).requestPointerLock();
        },
        __wbg_resolve_002c4b7d9d8f6b64: function(arg0) {
            const ret = Promise.resolve(getObject(arg0));
            return addHeapObject(ret);
        },
        __wbg_revokeObjectURL_ba5712ef5af8bc9a: function() { return handleError(function (arg0, arg1) {
            URL.revokeObjectURL(getStringFromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_scheduler_0015ba42cdfb7d46: function(arg0) {
            const ret = getObject(arg0).scheduler;
            return addHeapObject(ret);
        },
        __wbg_scheduler_4cb3592db49b35bf: function(arg0) {
            const ret = getObject(arg0).scheduler;
            return addHeapObject(ret);
        },
        __wbg_setAttribute_cc8e4c8a2a008508: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            getObject(arg0).setAttribute(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
        }, arguments); },
        __wbg_setBindGroup_1a72f40c21e0ac2b: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
            getObject(arg0).setBindGroup(arg1 >>> 0, getObject(arg2), getArrayU32FromWasm0(arg3, arg4), arg5, arg6 >>> 0);
        }, arguments); },
        __wbg_setBindGroup_71cbc540f7a07abe: function(arg0, arg1, arg2) {
            getObject(arg0).setBindGroup(arg1 >>> 0, getObject(arg2));
        },
        __wbg_setBindGroup_98232ce4c00d8fa6: function(arg0, arg1, arg2) {
            getObject(arg0).setBindGroup(arg1 >>> 0, getObject(arg2));
        },
        __wbg_setBindGroup_fe7438c353e34c21: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
            getObject(arg0).setBindGroup(arg1 >>> 0, getObject(arg2), getArrayU32FromWasm0(arg3, arg4), arg5, arg6 >>> 0);
        }, arguments); },
        __wbg_setIndexBuffer_847f80cb89b4ed82: function(arg0, arg1, arg2, arg3, arg4) {
            getObject(arg0).setIndexBuffer(getObject(arg1), __wbindgen_enum_GpuIndexFormat[arg2], arg3, arg4);
        },
        __wbg_setIndexBuffer_9f58d6811c4d2940: function(arg0, arg1, arg2, arg3) {
            getObject(arg0).setIndexBuffer(getObject(arg1), __wbindgen_enum_GpuIndexFormat[arg2], arg3);
        },
        __wbg_setPipeline_540d9e62bf8cc4a2: function(arg0, arg1) {
            getObject(arg0).setPipeline(getObject(arg1));
        },
        __wbg_setPipeline_f547540daea5e419: function(arg0, arg1) {
            getObject(arg0).setPipeline(getObject(arg1));
        },
        __wbg_setPointerCapture_420db6f6826eb74b: function() { return handleError(function (arg0, arg1) {
            getObject(arg0).setPointerCapture(arg1);
        }, arguments); },
        __wbg_setProperty_cbb25c4e74285b39: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            getObject(arg0).setProperty(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
        }, arguments); },
        __wbg_setScissorRect_7cf1582783b9dd38: function(arg0, arg1, arg2, arg3, arg4) {
            getObject(arg0).setScissorRect(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4 >>> 0);
        },
        __wbg_setTimeout_681abd84926a4da3: function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).setTimeout(getObject(arg1));
            return ret;
        }, arguments); },
        __wbg_setTimeout_eff32631ea138533: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).setTimeout(getObject(arg1), arg2);
            return ret;
        }, arguments); },
        __wbg_setVertexBuffer_6f08f530486e57ea: function(arg0, arg1, arg2, arg3, arg4) {
            getObject(arg0).setVertexBuffer(arg1 >>> 0, getObject(arg2), arg3, arg4);
        },
        __wbg_setVertexBuffer_8ea8eca21aa3c7f2: function(arg0, arg1, arg2, arg3) {
            getObject(arg0).setVertexBuffer(arg1 >>> 0, getObject(arg2), arg3);
        },
        __wbg_setViewport_c48f688be8303318: function(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
            getObject(arg0).setViewport(arg1, arg2, arg3, arg4, arg5, arg6);
        },
        __wbg_set_25cf9deff6bf0ea8: function(arg0, arg1, arg2) {
            getObject(arg0).set(getObject(arg1), arg2 >>> 0);
        },
        __wbg_set_3f1d0b984ed272ed: function(arg0, arg1, arg2) {
            getObject(arg0)[takeObject(arg1)] = takeObject(arg2);
        },
        __wbg_set_6cb8631f80447a67: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(getObject(arg0), getObject(arg1), getObject(arg2));
            return ret;
        }, arguments); },
        __wbg_set_a_a7335e49d7f16b66: function(arg0, arg1) {
            getObject(arg0).a = arg1;
        },
        __wbg_set_access_d6bc5ac400f1c0df: function(arg0, arg1) {
            getObject(arg0).access = __wbindgen_enum_GpuStorageTextureAccess[arg1];
        },
        __wbg_set_address_mode_u_192934653a48ca33: function(arg0, arg1) {
            getObject(arg0).addressModeU = __wbindgen_enum_GpuAddressMode[arg1];
        },
        __wbg_set_address_mode_v_7794ac5bc2b81f31: function(arg0, arg1) {
            getObject(arg0).addressModeV = __wbindgen_enum_GpuAddressMode[arg1];
        },
        __wbg_set_address_mode_w_8f6c6afb44b7224b: function(arg0, arg1) {
            getObject(arg0).addressModeW = __wbindgen_enum_GpuAddressMode[arg1];
        },
        __wbg_set_alpha_36a5c2779d899eb1: function(arg0, arg1) {
            getObject(arg0).alpha = getObject(arg1);
        },
        __wbg_set_alpha_mode_637b2d98e797dc0d: function(arg0, arg1) {
            getObject(arg0).alphaMode = __wbindgen_enum_GpuCanvasAlphaMode[arg1];
        },
        __wbg_set_alpha_to_coverage_enabled_27c00543801dacb3: function(arg0, arg1) {
            getObject(arg0).alphaToCoverageEnabled = arg1 !== 0;
        },
        __wbg_set_array_layer_count_ce7db056c37f6b7f: function(arg0, arg1) {
            getObject(arg0).arrayLayerCount = arg1 >>> 0;
        },
        __wbg_set_array_stride_d4a5dd17fbd0d5d5: function(arg0, arg1) {
            getObject(arg0).arrayStride = arg1;
        },
        __wbg_set_aspect_2ac3ce90bbcf69c5: function(arg0, arg1) {
            getObject(arg0).aspect = __wbindgen_enum_GpuTextureAspect[arg1];
        },
        __wbg_set_aspect_663014aadd503491: function(arg0, arg1) {
            getObject(arg0).aspect = __wbindgen_enum_GpuTextureAspect[arg1];
        },
        __wbg_set_attributes_145c94e93092dbee: function(arg0, arg1) {
            getObject(arg0).attributes = getObject(arg1);
        },
        __wbg_set_b_067a026699559ff9: function(arg0, arg1) {
            getObject(arg0).b = arg1;
        },
        __wbg_set_base_array_layer_1ff57bf7d68dac66: function(arg0, arg1) {
            getObject(arg0).baseArrayLayer = arg1 >>> 0;
        },
        __wbg_set_base_mip_level_e7a8beda708f368c: function(arg0, arg1) {
            getObject(arg0).baseMipLevel = arg1 >>> 0;
        },
        __wbg_set_beginning_of_pass_write_index_c5e699417adc4788: function(arg0, arg1) {
            getObject(arg0).beginningOfPassWriteIndex = arg1 >>> 0;
        },
        __wbg_set_beginning_of_pass_write_index_cd4c6f932f2e41a9: function(arg0, arg1) {
            getObject(arg0).beginningOfPassWriteIndex = arg1 >>> 0;
        },
        __wbg_set_bind_group_layouts_75f8287ca8296d8e: function(arg0, arg1) {
            getObject(arg0).bindGroupLayouts = getObject(arg1);
        },
        __wbg_set_binding_06e3240e78668aba: function(arg0, arg1) {
            getObject(arg0).binding = arg1 >>> 0;
        },
        __wbg_set_binding_c43b74985665dd5c: function(arg0, arg1) {
            getObject(arg0).binding = arg1 >>> 0;
        },
        __wbg_set_blend_15454933dc2e7f0c: function(arg0, arg1) {
            getObject(arg0).blend = getObject(arg1);
        },
        __wbg_set_box_73d3355c6f95f24d: function(arg0, arg1) {
            getObject(arg0).box = __wbindgen_enum_ResizeObserverBoxOptions[arg1];
        },
        __wbg_set_buffer_76599dc97ede1dc5: function(arg0, arg1) {
            getObject(arg0).buffer = getObject(arg1);
        },
        __wbg_set_buffer_82e8bf15ee6abb59: function(arg0, arg1) {
            getObject(arg0).buffer = getObject(arg1);
        },
        __wbg_set_buffer_e31c2c188553737e: function(arg0, arg1) {
            getObject(arg0).buffer = getObject(arg1);
        },
        __wbg_set_buffers_ea1fb484db3ace5a: function(arg0, arg1) {
            getObject(arg0).buffers = getObject(arg1);
        },
        __wbg_set_bytes_per_row_11598a946a6cce61: function(arg0, arg1) {
            getObject(arg0).bytesPerRow = arg1 >>> 0;
        },
        __wbg_set_bytes_per_row_472a60c847ac2ee3: function(arg0, arg1) {
            getObject(arg0).bytesPerRow = arg1 >>> 0;
        },
        __wbg_set_clear_value_03ff3c8b2c12da71: function(arg0, arg1) {
            getObject(arg0).clearValue = getObject(arg1);
        },
        __wbg_set_code_51e12b4452f850fa: function(arg0, arg1, arg2) {
            getObject(arg0).code = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_color_692be7e821bccc30: function(arg0, arg1) {
            getObject(arg0).color = getObject(arg1);
        },
        __wbg_set_color_attachments_26828f057f1fe6ff: function(arg0, arg1) {
            getObject(arg0).colorAttachments = getObject(arg1);
        },
        __wbg_set_compare_1e7ab92e856f9af0: function(arg0, arg1) {
            getObject(arg0).compare = __wbindgen_enum_GpuCompareFunction[arg1];
        },
        __wbg_set_compare_c9fc33df128b64c4: function(arg0, arg1) {
            getObject(arg0).compare = __wbindgen_enum_GpuCompareFunction[arg1];
        },
        __wbg_set_compute_2c5d992d2738c2a2: function(arg0, arg1) {
            getObject(arg0).compute = getObject(arg1);
        },
        __wbg_set_count_78af5a7a7ac046a5: function(arg0, arg1) {
            getObject(arg0).count = arg1 >>> 0;
        },
        __wbg_set_cull_mode_1a2f78656bacbcc0: function(arg0, arg1) {
            getObject(arg0).cullMode = __wbindgen_enum_GpuCullMode[arg1];
        },
        __wbg_set_depth_bias_clamp_f75c0d6e9c39c8ce: function(arg0, arg1) {
            getObject(arg0).depthBiasClamp = arg1;
        },
        __wbg_set_depth_bias_f204ac10d557ec17: function(arg0, arg1) {
            getObject(arg0).depthBias = arg1;
        },
        __wbg_set_depth_bias_slope_scale_b1ee1353b2eac931: function(arg0, arg1) {
            getObject(arg0).depthBiasSlopeScale = arg1;
        },
        __wbg_set_depth_clear_value_dc9b77173f544010: function(arg0, arg1) {
            getObject(arg0).depthClearValue = arg1;
        },
        __wbg_set_depth_compare_3cff8987a6c09cc2: function(arg0, arg1) {
            getObject(arg0).depthCompare = __wbindgen_enum_GpuCompareFunction[arg1];
        },
        __wbg_set_depth_fail_op_7edef6578ad906d2: function(arg0, arg1) {
            getObject(arg0).depthFailOp = __wbindgen_enum_GpuStencilOperation[arg1];
        },
        __wbg_set_depth_load_op_0f6382d61f9ca68f: function(arg0, arg1) {
            getObject(arg0).depthLoadOp = __wbindgen_enum_GpuLoadOp[arg1];
        },
        __wbg_set_depth_or_array_layers_ad21ba97f3b1b72e: function(arg0, arg1) {
            getObject(arg0).depthOrArrayLayers = arg1 >>> 0;
        },
        __wbg_set_depth_read_only_2764e4f1a985fb58: function(arg0, arg1) {
            getObject(arg0).depthReadOnly = arg1 !== 0;
        },
        __wbg_set_depth_stencil_a238a3ac63d7f404: function(arg0, arg1) {
            getObject(arg0).depthStencil = getObject(arg1);
        },
        __wbg_set_depth_stencil_attachment_79bdb798cac611ef: function(arg0, arg1) {
            getObject(arg0).depthStencilAttachment = getObject(arg1);
        },
        __wbg_set_depth_store_op_7e5a08ea8301580e: function(arg0, arg1) {
            getObject(arg0).depthStoreOp = __wbindgen_enum_GpuStoreOp[arg1];
        },
        __wbg_set_depth_write_enabled_a142652dadcfda3c: function(arg0, arg1) {
            getObject(arg0).depthWriteEnabled = arg1 !== 0;
        },
        __wbg_set_device_27ced79bd0cd2d72: function(arg0, arg1) {
            getObject(arg0).device = getObject(arg1);
        },
        __wbg_set_dimension_06a1501370911328: function(arg0, arg1) {
            getObject(arg0).dimension = __wbindgen_enum_GpuTextureViewDimension[arg1];
        },
        __wbg_set_dimension_539e7a903f29512a: function(arg0, arg1) {
            getObject(arg0).dimension = __wbindgen_enum_GpuTextureDimension[arg1];
        },
        __wbg_set_dst_factor_83c4474050ccf6ad: function(arg0, arg1) {
            getObject(arg0).dstFactor = __wbindgen_enum_GpuBlendFactor[arg1];
        },
        __wbg_set_end_of_pass_write_index_4b125fc60323bcac: function(arg0, arg1) {
            getObject(arg0).endOfPassWriteIndex = arg1 >>> 0;
        },
        __wbg_set_end_of_pass_write_index_7963105aee41262e: function(arg0, arg1) {
            getObject(arg0).endOfPassWriteIndex = arg1 >>> 0;
        },
        __wbg_set_entries_2fa0693447a637f8: function(arg0, arg1) {
            getObject(arg0).entries = getObject(arg1);
        },
        __wbg_set_entries_346af1cd58c9938d: function(arg0, arg1) {
            getObject(arg0).entries = getObject(arg1);
        },
        __wbg_set_entry_point_8a98d6824a7ee426: function(arg0, arg1, arg2) {
            getObject(arg0).entryPoint = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_entry_point_cc648f12ac60b92d: function(arg0, arg1, arg2) {
            getObject(arg0).entryPoint = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_entry_point_dfffa4dde9ab0b6f: function(arg0, arg1, arg2) {
            getObject(arg0).entryPoint = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_external_texture_32326f6bdc4589e7: function(arg0, arg1) {
            getObject(arg0).externalTexture = getObject(arg1);
        },
        __wbg_set_f43e577aea94465b: function(arg0, arg1, arg2) {
            getObject(arg0)[arg1 >>> 0] = takeObject(arg2);
        },
        __wbg_set_fail_op_e9b562ceccd610c0: function(arg0, arg1) {
            getObject(arg0).failOp = __wbindgen_enum_GpuStencilOperation[arg1];
        },
        __wbg_set_format_0f5d7d7f3af07079: function(arg0, arg1) {
            getObject(arg0).format = __wbindgen_enum_GpuTextureFormat[arg1];
        },
        __wbg_set_format_6f94eb64d26a3b55: function(arg0, arg1) {
            getObject(arg0).format = __wbindgen_enum_GpuTextureFormat[arg1];
        },
        __wbg_set_format_700c7e8b0bffde3f: function(arg0, arg1) {
            getObject(arg0).format = __wbindgen_enum_GpuTextureFormat[arg1];
        },
        __wbg_set_format_737b424c03c82b2e: function(arg0, arg1) {
            getObject(arg0).format = __wbindgen_enum_GpuTextureFormat[arg1];
        },
        __wbg_set_format_8e1643dcfe6921b6: function(arg0, arg1) {
            getObject(arg0).format = __wbindgen_enum_GpuTextureFormat[arg1];
        },
        __wbg_set_format_9d2c4c6369fd2f40: function(arg0, arg1) {
            getObject(arg0).format = __wbindgen_enum_GpuTextureFormat[arg1];
        },
        __wbg_set_format_d910f5a8b7d73054: function(arg0, arg1) {
            getObject(arg0).format = __wbindgen_enum_GpuVertexFormat[arg1];
        },
        __wbg_set_fragment_7aef94bba1205078: function(arg0, arg1) {
            getObject(arg0).fragment = getObject(arg1);
        },
        __wbg_set_front_face_a588bbbf89baeece: function(arg0, arg1) {
            getObject(arg0).frontFace = __wbindgen_enum_GpuFrontFace[arg1];
        },
        __wbg_set_g_fffd3dc35492d2ff: function(arg0, arg1) {
            getObject(arg0).g = arg1;
        },
        __wbg_set_has_dynamic_offset_aa78c8e6405c5c75: function(arg0, arg1) {
            getObject(arg0).hasDynamicOffset = arg1 !== 0;
        },
        __wbg_set_height_0cf03f9ffce057d8: function(arg0, arg1) {
            getObject(arg0).height = arg1 >>> 0;
        },
        __wbg_set_height_b386c0f603610637: function(arg0, arg1) {
            getObject(arg0).height = arg1 >>> 0;
        },
        __wbg_set_height_f21f985387070100: function(arg0, arg1) {
            getObject(arg0).height = arg1 >>> 0;
        },
        __wbg_set_label_0578668b429dcee8: function(arg0, arg1, arg2) {
            getObject(arg0).label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_22974dd888c9abd0: function(arg0, arg1, arg2) {
            getObject(arg0).label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_268b21ede258d977: function(arg0, arg1, arg2) {
            getObject(arg0).label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_4f2e12ef89bb4950: function(arg0, arg1, arg2) {
            getObject(arg0).label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_4fba995dedf2dfd4: function(arg0, arg1, arg2) {
            getObject(arg0).label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_5748f89ddd05c244: function(arg0, arg1, arg2) {
            getObject(arg0).label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_5efad6c00a4a018b: function(arg0, arg1, arg2) {
            getObject(arg0).label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_71f78c8a57167061: function(arg0, arg1, arg2) {
            getObject(arg0).label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_7a2177678e7b6fb2: function(arg0, arg1, arg2) {
            getObject(arg0).label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_84fd508accbba7e3: function(arg0, arg1, arg2) {
            getObject(arg0).label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_8791c57d3e2a9202: function(arg0, arg1, arg2) {
            getObject(arg0).label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_9098eb5f6430c295: function(arg0, arg1, arg2) {
            getObject(arg0).label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_a0230a5e6f5e0426: function(arg0, arg1, arg2) {
            getObject(arg0).label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_a2545fcc1274c301: function(arg0, arg1, arg2) {
            getObject(arg0).label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_bb0515904ceaf09a: function(arg0, arg1, arg2) {
            getObject(arg0).label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_bf8c37e0b3d8741d: function(arg0, arg1, arg2) {
            getObject(arg0).label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_layout_2eadfa095236acea: function(arg0, arg1) {
            getObject(arg0).layout = getObject(arg1);
        },
        __wbg_set_layout_4d927a47f018d44f: function(arg0, arg1) {
            getObject(arg0).layout = getObject(arg1);
        },
        __wbg_set_layout_6b13f15fd4c31734: function(arg0, arg1) {
            getObject(arg0).layout = getObject(arg1);
        },
        __wbg_set_load_op_3667c7bd23ddf3bd: function(arg0, arg1) {
            getObject(arg0).loadOp = __wbindgen_enum_GpuLoadOp[arg1];
        },
        __wbg_set_lod_max_clamp_60612ba7ea578232: function(arg0, arg1) {
            getObject(arg0).lodMaxClamp = arg1;
        },
        __wbg_set_lod_min_clamp_29ce90ff90ddf8c1: function(arg0, arg1) {
            getObject(arg0).lodMinClamp = arg1;
        },
        __wbg_set_mag_filter_0d00fc45f4f71f97: function(arg0, arg1) {
            getObject(arg0).magFilter = __wbindgen_enum_GpuFilterMode[arg1];
        },
        __wbg_set_mapped_at_creation_c9cfe513ebca6388: function(arg0, arg1) {
            getObject(arg0).mappedAtCreation = arg1 !== 0;
        },
        __wbg_set_mask_538f960400bbe9a5: function(arg0, arg1) {
            getObject(arg0).mask = arg1 >>> 0;
        },
        __wbg_set_max_anisotropy_753108fafc68103c: function(arg0, arg1) {
            getObject(arg0).maxAnisotropy = arg1;
        },
        __wbg_set_min_binding_size_41de338b8bc618b2: function(arg0, arg1) {
            getObject(arg0).minBindingSize = arg1;
        },
        __wbg_set_min_filter_4b97afed1d4f8e92: function(arg0, arg1) {
            getObject(arg0).minFilter = __wbindgen_enum_GpuFilterMode[arg1];
        },
        __wbg_set_mip_level_2e1fcc9cda39f91f: function(arg0, arg1) {
            getObject(arg0).mipLevel = arg1 >>> 0;
        },
        __wbg_set_mip_level_count_33f6ed9a1bdacdd3: function(arg0, arg1) {
            getObject(arg0).mipLevelCount = arg1 >>> 0;
        },
        __wbg_set_mip_level_count_6c063629741d6416: function(arg0, arg1) {
            getObject(arg0).mipLevelCount = arg1 >>> 0;
        },
        __wbg_set_mipmap_filter_ba43d8c86de1d980: function(arg0, arg1) {
            getObject(arg0).mipmapFilter = __wbindgen_enum_GpuMipmapFilterMode[arg1];
        },
        __wbg_set_module_04035dfed6a6b7a9: function(arg0, arg1) {
            getObject(arg0).module = getObject(arg1);
        },
        __wbg_set_module_e593bfb3b7572e7e: function(arg0, arg1) {
            getObject(arg0).module = getObject(arg1);
        },
        __wbg_set_module_f485d9e53c154b03: function(arg0, arg1) {
            getObject(arg0).module = getObject(arg1);
        },
        __wbg_set_multisample_b5d503b088e14657: function(arg0, arg1) {
            getObject(arg0).multisample = getObject(arg1);
        },
        __wbg_set_multisampled_687169eb01f2f3bd: function(arg0, arg1) {
            getObject(arg0).multisampled = arg1 !== 0;
        },
        __wbg_set_offset_0801ed1721e56a1e: function(arg0, arg1) {
            getObject(arg0).offset = arg1;
        },
        __wbg_set_offset_26d9e4462642124a: function(arg0, arg1) {
            getObject(arg0).offset = arg1;
        },
        __wbg_set_offset_509f47232c17bc53: function(arg0, arg1) {
            getObject(arg0).offset = arg1;
        },
        __wbg_set_offset_f700b1e056cff9ff: function(arg0, arg1) {
            getObject(arg0).offset = arg1;
        },
        __wbg_set_onmessage_0e1ffb1c0d91d2ad: function(arg0, arg1) {
            getObject(arg0).onmessage = getObject(arg1);
        },
        __wbg_set_onuncapturederror_9ae1707d6b5c9b42: function(arg0, arg1) {
            getObject(arg0).onuncapturederror = getObject(arg1);
        },
        __wbg_set_operation_d29b96b7cb7c96dd: function(arg0, arg1) {
            getObject(arg0).operation = __wbindgen_enum_GpuBlendOperation[arg1];
        },
        __wbg_set_origin_cc475535b8a1eeb5: function(arg0, arg1) {
            getObject(arg0).origin = getObject(arg1);
        },
        __wbg_set_pass_op_73dfb5d042b65fd7: function(arg0, arg1) {
            getObject(arg0).passOp = __wbindgen_enum_GpuStencilOperation[arg1];
        },
        __wbg_set_power_preference_a7d493168a7a0850: function(arg0, arg1) {
            getObject(arg0).powerPreference = __wbindgen_enum_GpuPowerPreference[arg1];
        },
        __wbg_set_primitive_5e53ad14f7c93292: function(arg0, arg1) {
            getObject(arg0).primitive = getObject(arg1);
        },
        __wbg_set_query_set_01643d11341aa978: function(arg0, arg1) {
            getObject(arg0).querySet = getObject(arg1);
        },
        __wbg_set_query_set_08a14e729a01a284: function(arg0, arg1) {
            getObject(arg0).querySet = getObject(arg1);
        },
        __wbg_set_r_bf467b92323417e2: function(arg0, arg1) {
            getObject(arg0).r = arg1;
        },
        __wbg_set_required_features_76e08503716c42e4: function(arg0, arg1) {
            getObject(arg0).requiredFeatures = getObject(arg1);
        },
        __wbg_set_required_limits_970b07cee3a8f20e: function(arg0, arg1) {
            getObject(arg0).requiredLimits = getObject(arg1);
        },
        __wbg_set_resolve_target_47b021baaeb69894: function(arg0, arg1) {
            getObject(arg0).resolveTarget = getObject(arg1);
        },
        __wbg_set_resource_f42dc2236e193b63: function(arg0, arg1) {
            getObject(arg0).resource = getObject(arg1);
        },
        __wbg_set_rows_per_image_2284f7a3e1cc43a4: function(arg0, arg1) {
            getObject(arg0).rowsPerImage = arg1 >>> 0;
        },
        __wbg_set_rows_per_image_cf2bad0dee18f163: function(arg0, arg1) {
            getObject(arg0).rowsPerImage = arg1 >>> 0;
        },
        __wbg_set_sample_count_df90f59c6f37fe8e: function(arg0, arg1) {
            getObject(arg0).sampleCount = arg1 >>> 0;
        },
        __wbg_set_sample_type_ba12f831c2629f4f: function(arg0, arg1) {
            getObject(arg0).sampleType = __wbindgen_enum_GpuTextureSampleType[arg1];
        },
        __wbg_set_sampler_fc660cb6d898083d: function(arg0, arg1) {
            getObject(arg0).sampler = getObject(arg1);
        },
        __wbg_set_shader_location_e6a75dfe16f73473: function(arg0, arg1) {
            getObject(arg0).shaderLocation = arg1 >>> 0;
        },
        __wbg_set_size_1478896217d690d1: function(arg0, arg1) {
            getObject(arg0).size = getObject(arg1);
        },
        __wbg_set_size_363cc69c168190f5: function(arg0, arg1) {
            getObject(arg0).size = arg1;
        },
        __wbg_set_size_f3f86185fff29d4e: function(arg0, arg1) {
            getObject(arg0).size = arg1;
        },
        __wbg_set_source_83d58e96cad00357: function(arg0, arg1) {
            getObject(arg0).source = getObject(arg1);
        },
        __wbg_set_src_factor_c2b7e449a375360a: function(arg0, arg1) {
            getObject(arg0).srcFactor = __wbindgen_enum_GpuBlendFactor[arg1];
        },
        __wbg_set_stencil_back_8d6b16d701ac6ccc: function(arg0, arg1) {
            getObject(arg0).stencilBack = getObject(arg1);
        },
        __wbg_set_stencil_clear_value_9026797a05f682b9: function(arg0, arg1) {
            getObject(arg0).stencilClearValue = arg1 >>> 0;
        },
        __wbg_set_stencil_front_6c688b88f3b08435: function(arg0, arg1) {
            getObject(arg0).stencilFront = getObject(arg1);
        },
        __wbg_set_stencil_load_op_2b48e52f9913f2bb: function(arg0, arg1) {
            getObject(arg0).stencilLoadOp = __wbindgen_enum_GpuLoadOp[arg1];
        },
        __wbg_set_stencil_read_mask_b07a83e0bfe3b377: function(arg0, arg1) {
            getObject(arg0).stencilReadMask = arg1 >>> 0;
        },
        __wbg_set_stencil_read_only_6771fb0d38b16e1b: function(arg0, arg1) {
            getObject(arg0).stencilReadOnly = arg1 !== 0;
        },
        __wbg_set_stencil_store_op_5d22b09fb6bdc295: function(arg0, arg1) {
            getObject(arg0).stencilStoreOp = __wbindgen_enum_GpuStoreOp[arg1];
        },
        __wbg_set_stencil_write_mask_8bbbeaab181d2947: function(arg0, arg1) {
            getObject(arg0).stencilWriteMask = arg1 >>> 0;
        },
        __wbg_set_step_mode_079b147e18946388: function(arg0, arg1) {
            getObject(arg0).stepMode = __wbindgen_enum_GpuVertexStepMode[arg1];
        },
        __wbg_set_storage_texture_557c24fb41108302: function(arg0, arg1) {
            getObject(arg0).storageTexture = getObject(arg1);
        },
        __wbg_set_store_op_59e6ea8b2c1fa149: function(arg0, arg1) {
            getObject(arg0).storeOp = __wbindgen_enum_GpuStoreOp[arg1];
        },
        __wbg_set_strip_index_format_097e1e23da342de0: function(arg0, arg1) {
            getObject(arg0).stripIndexFormat = __wbindgen_enum_GpuIndexFormat[arg1];
        },
        __wbg_set_targets_8ec589d3171e6bc8: function(arg0, arg1) {
            getObject(arg0).targets = getObject(arg1);
        },
        __wbg_set_texture_8712c0b9ffbbeeec: function(arg0, arg1) {
            getObject(arg0).texture = getObject(arg1);
        },
        __wbg_set_texture_d1548c0e1869dbfa: function(arg0, arg1) {
            getObject(arg0).texture = getObject(arg1);
        },
        __wbg_set_timestamp_writes_4b4f50c8fb2bb7ff: function(arg0, arg1) {
            getObject(arg0).timestampWrites = getObject(arg1);
        },
        __wbg_set_timestamp_writes_b243edb96c866ee2: function(arg0, arg1) {
            getObject(arg0).timestampWrites = getObject(arg1);
        },
        __wbg_set_topology_145f764db099a468: function(arg0, arg1) {
            getObject(arg0).topology = __wbindgen_enum_GpuPrimitiveTopology[arg1];
        },
        __wbg_set_type_148de20768639245: function(arg0, arg1, arg2) {
            getObject(arg0).type = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_type_497256fffa922eae: function(arg0, arg1) {
            getObject(arg0).type = __wbindgen_enum_GpuBufferBindingType[arg1];
        },
        __wbg_set_type_fcd92a6eccfd9681: function(arg0, arg1) {
            getObject(arg0).type = __wbindgen_enum_GpuSamplerBindingType[arg1];
        },
        __wbg_set_unclipped_depth_18674163dde2b828: function(arg0, arg1) {
            getObject(arg0).unclippedDepth = arg1 !== 0;
        },
        __wbg_set_usage_2d98b9f495236f57: function(arg0, arg1) {
            getObject(arg0).usage = arg1 >>> 0;
        },
        __wbg_set_usage_7067c25777cec573: function(arg0, arg1) {
            getObject(arg0).usage = arg1 >>> 0;
        },
        __wbg_set_usage_adee497ce84dcc93: function(arg0, arg1) {
            getObject(arg0).usage = arg1 >>> 0;
        },
        __wbg_set_usage_f6546913b1638dd1: function(arg0, arg1) {
            getObject(arg0).usage = arg1 >>> 0;
        },
        __wbg_set_vertex_9e3e3b7404bf1832: function(arg0, arg1) {
            getObject(arg0).vertex = getObject(arg1);
        },
        __wbg_set_view_23e097090724b455: function(arg0, arg1) {
            getObject(arg0).view = getObject(arg1);
        },
        __wbg_set_view_92db7ba56ba7ad84: function(arg0, arg1) {
            getObject(arg0).view = getObject(arg1);
        },
        __wbg_set_view_dimension_a4cd50471bdaff15: function(arg0, arg1) {
            getObject(arg0).viewDimension = __wbindgen_enum_GpuTextureViewDimension[arg1];
        },
        __wbg_set_view_dimension_e0107812beed3e8d: function(arg0, arg1) {
            getObject(arg0).viewDimension = __wbindgen_enum_GpuTextureViewDimension[arg1];
        },
        __wbg_set_view_formats_537dd2641827aa7e: function(arg0, arg1) {
            getObject(arg0).viewFormats = getObject(arg1);
        },
        __wbg_set_view_formats_b9dc7125e16adeb8: function(arg0, arg1) {
            getObject(arg0).viewFormats = getObject(arg1);
        },
        __wbg_set_visibility_e9d720275f4a8e6a: function(arg0, arg1) {
            getObject(arg0).visibility = arg1 >>> 0;
        },
        __wbg_set_width_0d2e94c1f827504b: function(arg0, arg1) {
            getObject(arg0).width = arg1 >>> 0;
        },
        __wbg_set_width_7f07715a20503914: function(arg0, arg1) {
            getObject(arg0).width = arg1 >>> 0;
        },
        __wbg_set_width_d60bc4f2f20c56a4: function(arg0, arg1) {
            getObject(arg0).width = arg1 >>> 0;
        },
        __wbg_set_write_mask_c4421d670e155eb1: function(arg0, arg1) {
            getObject(arg0).writeMask = arg1 >>> 0;
        },
        __wbg_set_x_85af56ed93645654: function(arg0, arg1) {
            getObject(arg0).x = arg1 >>> 0;
        },
        __wbg_set_y_dd715a5a6f9d1777: function(arg0, arg1) {
            getObject(arg0).y = arg1 >>> 0;
        },
        __wbg_set_z_ac3e5f59ae9b407b: function(arg0, arg1) {
            getObject(arg0).z = arg1 >>> 0;
        },
        __wbg_shiftKey_5558a3288542c985: function(arg0) {
            const ret = getObject(arg0).shiftKey;
            return ret;
        },
        __wbg_shiftKey_564be91ec842bcc4: function(arg0) {
            const ret = getObject(arg0).shiftKey;
            return ret;
        },
        __wbg_signal_d1285ecab4ebc5ad: function(arg0) {
            const ret = getObject(arg0).signal;
            return addHeapObject(ret);
        },
        __wbg_size_c51a2378d5f4dd0c: function(arg0) {
            const ret = getObject(arg0).size;
            return ret;
        },
        __wbg_stack_0ed75d68575b0f3c: function(arg0, arg1) {
            const ret = getObject(arg1).stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_start_ffb4b426b1e661bd: function(arg0) {
            getObject(arg0).start();
        },
        __wbg_static_accessor_GLOBAL_12837167ad935116: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_e628e89ab3b1c95f: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_static_accessor_SELF_a621d3dfbb60d0ce: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_static_accessor_WINDOW_f8727f0cf888e0bd: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_status_89d7e803db911ee7: function(arg0) {
            const ret = getObject(arg0).status;
            return ret;
        },
        __wbg_stringify_8d1cc6ff383e8bae: function() { return handleError(function (arg0) {
            const ret = JSON.stringify(getObject(arg0));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_style_0b7c9bd318f8b807: function(arg0) {
            const ret = getObject(arg0).style;
            return addHeapObject(ret);
        },
        __wbg_submit_5dfd388a79d73630: function(arg0, arg1) {
            getObject(arg0).submit(getObject(arg1));
        },
        __wbg_then_0d9fe2c7b1857d32: function(arg0, arg1, arg2) {
            const ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
            return addHeapObject(ret);
        },
        __wbg_then_b9e7b3b5f1a9e1b5: function(arg0, arg1) {
            const ret = getObject(arg0).then(getObject(arg1));
            return addHeapObject(ret);
        },
        __wbg_unmap_ace1c77782dbb98c: function(arg0) {
            getObject(arg0).unmap();
        },
        __wbg_unobserve_b4eb8d945252124f: function(arg0, arg1) {
            getObject(arg0).unobserve(getObject(arg1));
        },
        __wbg_usage_7af258286790393e: function(arg0) {
            const ret = getObject(arg0).usage;
            return ret;
        },
        __wbg_userAgentData_b04b3a87ba2eaa94: function(arg0) {
            const ret = getObject(arg0).userAgentData;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_userAgent_34463fd660ba4a2a: function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg1).userAgent;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        }, arguments); },
        __wbg_valueOf_3c28600026e653c4: function(arg0) {
            const ret = getObject(arg0).valueOf();
            return addHeapObject(ret);
        },
        __wbg_value_0546255b415e96c1: function(arg0) {
            const ret = getObject(arg0).value;
            return addHeapObject(ret);
        },
        __wbg_videoHeight_a90b6b6ebd4132de: function(arg0) {
            const ret = getObject(arg0).videoHeight;
            return ret;
        },
        __wbg_videoWidth_4b450aa64c85eaa4: function(arg0) {
            const ret = getObject(arg0).videoWidth;
            return ret;
        },
        __wbg_visibilityState_43b7b74940e07d22: function(arg0) {
            const ret = getObject(arg0).visibilityState;
            return (__wbindgen_enum_VisibilityState.indexOf(ret) + 1 || 3) - 1;
        },
        __wbg_webkitExitFullscreen_8a70718129b220d1: function(arg0) {
            getObject(arg0).webkitExitFullscreen();
        },
        __wbg_webkitFullscreenElement_bb1afbecf2a8bde4: function(arg0) {
            const ret = getObject(arg0).webkitFullscreenElement;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_webkitRequestFullscreen_1d1f26d5cf30b02f: function(arg0) {
            getObject(arg0).webkitRequestFullscreen();
        },
        __wbg_width_7444cca5dfea0645: function(arg0) {
            const ret = getObject(arg0).width;
            return ret;
        },
        __wbg_writeBuffer_42f58c55bbe7651d: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
            getObject(arg0).writeBuffer(getObject(arg1), arg2, getArrayU8FromWasm0(arg3, arg4), arg5, arg6);
        }, arguments); },
        __wbg_writeText_be1c3b83a3e46230: function(arg0, arg1, arg2) {
            const ret = getObject(arg0).writeText(getStringFromWasm0(arg1, arg2));
            return addHeapObject(ret);
        },
        __wbg_writeTexture_5ba4c14cdbeedfed: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5) {
            getObject(arg0).writeTexture(getObject(arg1), getArrayU8FromWasm0(arg2, arg3), getObject(arg4), getObject(arg5));
        }, arguments); },
        __wbg_x_95222ef76724a332: function(arg0) {
            const ret = getObject(arg0).x;
            return ret;
        },
        __wbg_y_0b4e7ff7d5c0a5d7: function(arg0) {
            const ret = getObject(arg0).y;
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 2692, function: Function { arguments: [NamedExternref("Array<any>"), NamedExternref("ResizeObserver")], shim_idx: 2693, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm.__wasm_bindgen_func_elem_9049, __wasm_bindgen_func_elem_9264);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 2692, function: Function { arguments: [NamedExternref("Array<any>")], shim_idx: 2694, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm.__wasm_bindgen_func_elem_9049, __wasm_bindgen_func_elem_9263);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 2692, function: Function { arguments: [NamedExternref("Event")], shim_idx: 2694, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm.__wasm_bindgen_func_elem_9049, __wasm_bindgen_func_elem_9263);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000004: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 2692, function: Function { arguments: [NamedExternref("FocusEvent")], shim_idx: 2694, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm.__wasm_bindgen_func_elem_9049, __wasm_bindgen_func_elem_9263);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000005: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 2692, function: Function { arguments: [NamedExternref("KeyboardEvent")], shim_idx: 2694, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm.__wasm_bindgen_func_elem_9049, __wasm_bindgen_func_elem_9263);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000006: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 2692, function: Function { arguments: [NamedExternref("PageTransitionEvent")], shim_idx: 2694, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm.__wasm_bindgen_func_elem_9049, __wasm_bindgen_func_elem_9263);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000007: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 2692, function: Function { arguments: [NamedExternref("PointerEvent")], shim_idx: 2694, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm.__wasm_bindgen_func_elem_9049, __wasm_bindgen_func_elem_9263);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000008: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 2692, function: Function { arguments: [NamedExternref("WheelEvent")], shim_idx: 2694, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm.__wasm_bindgen_func_elem_9049, __wasm_bindgen_func_elem_9263);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000009: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 2692, function: Function { arguments: [], shim_idx: 2695, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm.__wasm_bindgen_func_elem_9049, __wasm_bindgen_func_elem_9262);
            return addHeapObject(ret);
        },
        __wbindgen_cast_000000000000000a: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 30024, function: Function { arguments: [NamedExternref("GPUUncapturedErrorEvent")], shim_idx: 30025, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm.__wasm_bindgen_func_elem_65996, __wasm_bindgen_func_elem_66057);
            return addHeapObject(ret);
        },
        __wbindgen_cast_000000000000000b: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 60618, function: Function { arguments: [Externref], shim_idx: 60619, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm.__wasm_bindgen_func_elem_127666, __wasm_bindgen_func_elem_127671);
            return addHeapObject(ret);
        },
        __wbindgen_cast_000000000000000c: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 67854, function: Function { arguments: [Externref], shim_idx: 67855, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm.__wasm_bindgen_func_elem_141622, __wasm_bindgen_func_elem_141637);
            return addHeapObject(ret);
        },
        __wbindgen_cast_000000000000000d: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return addHeapObject(ret);
        },
        __wbindgen_cast_000000000000000e: function(arg0) {
            // Cast intrinsic for `I64 -> Externref`.
            const ret = arg0;
            return addHeapObject(ret);
        },
        __wbindgen_cast_000000000000000f: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000010: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000011: function(arg0) {
            // Cast intrinsic for `U64 -> Externref`.
            const ret = BigInt.asUintN(64, arg0);
            return addHeapObject(ret);
        },
        __wbindgen_object_clone_ref: function(arg0) {
            const ret = getObject(arg0);
            return addHeapObject(ret);
        },
        __wbindgen_object_drop_ref: function(arg0) {
            takeObject(arg0);
        },
    };
    return {
        __proto__: null,
        "./squirrel_bevy_renderer_bg.js": import0,
    };
}

function __wasm_bindgen_func_elem_9262(arg0, arg1) {
    wasm.__wasm_bindgen_func_elem_9262(arg0, arg1);
}

function __wasm_bindgen_func_elem_9263(arg0, arg1, arg2) {
    wasm.__wasm_bindgen_func_elem_9263(arg0, arg1, addHeapObject(arg2));
}

function __wasm_bindgen_func_elem_66057(arg0, arg1, arg2) {
    wasm.__wasm_bindgen_func_elem_66057(arg0, arg1, addHeapObject(arg2));
}

function __wasm_bindgen_func_elem_127671(arg0, arg1, arg2) {
    wasm.__wasm_bindgen_func_elem_127671(arg0, arg1, addHeapObject(arg2));
}

function __wasm_bindgen_func_elem_141637(arg0, arg1, arg2) {
    wasm.__wasm_bindgen_func_elem_141637(arg0, arg1, addHeapObject(arg2));
}

function __wasm_bindgen_func_elem_9264(arg0, arg1, arg2, arg3) {
    wasm.__wasm_bindgen_func_elem_9264(arg0, arg1, addHeapObject(arg2), addHeapObject(arg3));
}


const __wbindgen_enum_GpuAddressMode = ["clamp-to-edge", "repeat", "mirror-repeat"];


const __wbindgen_enum_GpuBlendFactor = ["zero", "one", "src", "one-minus-src", "src-alpha", "one-minus-src-alpha", "dst", "one-minus-dst", "dst-alpha", "one-minus-dst-alpha", "src-alpha-saturated", "constant", "one-minus-constant", "src1", "one-minus-src1", "src1-alpha", "one-minus-src1-alpha"];


const __wbindgen_enum_GpuBlendOperation = ["add", "subtract", "reverse-subtract", "min", "max"];


const __wbindgen_enum_GpuBufferBindingType = ["uniform", "storage", "read-only-storage"];


const __wbindgen_enum_GpuCanvasAlphaMode = ["opaque", "premultiplied"];


const __wbindgen_enum_GpuCompareFunction = ["never", "less", "equal", "less-equal", "greater", "not-equal", "greater-equal", "always"];


const __wbindgen_enum_GpuCullMode = ["none", "front", "back"];


const __wbindgen_enum_GpuDeviceLostReason = ["unknown", "destroyed"];


const __wbindgen_enum_GpuErrorFilter = ["validation", "out-of-memory", "internal"];


const __wbindgen_enum_GpuFilterMode = ["nearest", "linear"];


const __wbindgen_enum_GpuFrontFace = ["ccw", "cw"];


const __wbindgen_enum_GpuIndexFormat = ["uint16", "uint32"];


const __wbindgen_enum_GpuLoadOp = ["load", "clear"];


const __wbindgen_enum_GpuMipmapFilterMode = ["nearest", "linear"];


const __wbindgen_enum_GpuPowerPreference = ["low-power", "high-performance"];


const __wbindgen_enum_GpuPrimitiveTopology = ["point-list", "line-list", "line-strip", "triangle-list", "triangle-strip"];


const __wbindgen_enum_GpuSamplerBindingType = ["filtering", "non-filtering", "comparison"];


const __wbindgen_enum_GpuStencilOperation = ["keep", "zero", "replace", "invert", "increment-clamp", "decrement-clamp", "increment-wrap", "decrement-wrap"];


const __wbindgen_enum_GpuStorageTextureAccess = ["write-only", "read-only", "read-write"];


const __wbindgen_enum_GpuStoreOp = ["store", "discard"];


const __wbindgen_enum_GpuTextureAspect = ["all", "stencil-only", "depth-only"];


const __wbindgen_enum_GpuTextureDimension = ["1d", "2d", "3d"];


const __wbindgen_enum_GpuTextureFormat = ["r8unorm", "r8snorm", "r8uint", "r8sint", "r16uint", "r16sint", "r16float", "rg8unorm", "rg8snorm", "rg8uint", "rg8sint", "r32uint", "r32sint", "r32float", "rg16uint", "rg16sint", "rg16float", "rgba8unorm", "rgba8unorm-srgb", "rgba8snorm", "rgba8uint", "rgba8sint", "bgra8unorm", "bgra8unorm-srgb", "rgb9e5ufloat", "rgb10a2uint", "rgb10a2unorm", "rg11b10ufloat", "rg32uint", "rg32sint", "rg32float", "rgba16uint", "rgba16sint", "rgba16float", "rgba32uint", "rgba32sint", "rgba32float", "stencil8", "depth16unorm", "depth24plus", "depth24plus-stencil8", "depth32float", "depth32float-stencil8", "bc1-rgba-unorm", "bc1-rgba-unorm-srgb", "bc2-rgba-unorm", "bc2-rgba-unorm-srgb", "bc3-rgba-unorm", "bc3-rgba-unorm-srgb", "bc4-r-unorm", "bc4-r-snorm", "bc5-rg-unorm", "bc5-rg-snorm", "bc6h-rgb-ufloat", "bc6h-rgb-float", "bc7-rgba-unorm", "bc7-rgba-unorm-srgb", "etc2-rgb8unorm", "etc2-rgb8unorm-srgb", "etc2-rgb8a1unorm", "etc2-rgb8a1unorm-srgb", "etc2-rgba8unorm", "etc2-rgba8unorm-srgb", "eac-r11unorm", "eac-r11snorm", "eac-rg11unorm", "eac-rg11snorm", "astc-4x4-unorm", "astc-4x4-unorm-srgb", "astc-5x4-unorm", "astc-5x4-unorm-srgb", "astc-5x5-unorm", "astc-5x5-unorm-srgb", "astc-6x5-unorm", "astc-6x5-unorm-srgb", "astc-6x6-unorm", "astc-6x6-unorm-srgb", "astc-8x5-unorm", "astc-8x5-unorm-srgb", "astc-8x6-unorm", "astc-8x6-unorm-srgb", "astc-8x8-unorm", "astc-8x8-unorm-srgb", "astc-10x5-unorm", "astc-10x5-unorm-srgb", "astc-10x6-unorm", "astc-10x6-unorm-srgb", "astc-10x8-unorm", "astc-10x8-unorm-srgb", "astc-10x10-unorm", "astc-10x10-unorm-srgb", "astc-12x10-unorm", "astc-12x10-unorm-srgb", "astc-12x12-unorm", "astc-12x12-unorm-srgb"];


const __wbindgen_enum_GpuTextureSampleType = ["float", "unfilterable-float", "depth", "sint", "uint"];


const __wbindgen_enum_GpuTextureViewDimension = ["1d", "2d", "2d-array", "cube", "cube-array", "3d"];


const __wbindgen_enum_GpuVertexFormat = ["uint8", "uint8x2", "uint8x4", "sint8", "sint8x2", "sint8x4", "unorm8", "unorm8x2", "unorm8x4", "snorm8", "snorm8x2", "snorm8x4", "uint16", "uint16x2", "uint16x4", "sint16", "sint16x2", "sint16x4", "unorm16", "unorm16x2", "unorm16x4", "snorm16", "snorm16x2", "snorm16x4", "float16", "float16x2", "float16x4", "float32", "float32x2", "float32x3", "float32x4", "uint32", "uint32x2", "uint32x3", "uint32x4", "sint32", "sint32x2", "sint32x3", "sint32x4", "unorm10-10-10-2", "unorm8x4-bgra"];


const __wbindgen_enum_GpuVertexStepMode = ["vertex", "instance"];


const __wbindgen_enum_ResizeObserverBoxOptions = ["border-box", "content-box", "device-pixel-content-box"];


const __wbindgen_enum_VisibilityState = ["hidden", "visible"];

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => state.dtor(state.a, state.b));

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function dropObject(idx) {
    if (idx < 132) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getObject(idx) { return heap[idx]; }

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        wasm.__wbindgen_export3(addHeapObject(e));
    }
}

let heap = new Array(128).fill(undefined);
heap.push(undefined, null, true, false);

let heap_next = heap.length;

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, dtor, f) {
    const state = { a: arg0, b: arg1, cnt: 1, dtor };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            state.dtor(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('squirrel_bevy_renderer_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
