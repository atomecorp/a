#import "AUv3NativeRecorderBackend.h"

#include "../../../../atome/engines/audio/core/recorder/recorder_core.cpp"
#include "../../../../atome/engines/audio/core/ring_buffer.cpp"

@interface AUv3NativeRecorderBackend ()
@property (nonatomic, copy, readwrite) NSString *lastErrorMessage;
@end

@implementation AUv3NativeRecorderBackend

- (instancetype)init {
    self = [super init];
    if (self) {
        _lastErrorMessage = @"";
    }
    return self;
}

- (BOOL)startWithPath:(NSString *)path
           sampleRate:(uint32_t)sampleRate
             channels:(uint16_t)channels
               source:(NSString *)source {
    self.lastErrorMessage = @"";

    char *coreError = nullptr;
    const BOOL ok = squirrel_recorder_core_start(path.UTF8String,
                                                 sampleRate,
                                                 channels,
                                                 source.UTF8String,
                                                 &coreError);
    if (!ok) {
        self.lastErrorMessage = coreError ? [NSString stringWithUTF8String:coreError] : @"Recorder start failed";
    }
    squirrel_string_free(coreError);
    return ok;
}

- (BOOL)stopWithDuration:(double *)duration {
    self.lastErrorMessage = @"";

    char *coreError = nullptr;
    const BOOL ok = squirrel_recorder_core_stop(&coreError, duration);
    if (!ok) {
        self.lastErrorMessage = coreError ? [NSString stringWithUTF8String:coreError] : @"Recorder stop failed";
    }
    squirrel_string_free(coreError);
    return ok;
}

- (void)pushPlanarFloat32:(const float *const *)data
                 channels:(uint16_t)channels
                   frames:(uint32_t)frames {
    squirrel_recorder_core_push(data, channels, frames);
}

- (void)pushInterleavedFloat32:(const float *)data
                      channels:(uint16_t)channels
                        frames:(uint32_t)frames {
    squirrel_recorder_core_push_interleaved(data, channels, frames);
}

@end
