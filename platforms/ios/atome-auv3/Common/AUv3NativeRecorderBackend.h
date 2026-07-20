#import <Foundation/Foundation.h>
#include <stdint.h>

NS_ASSUME_NONNULL_BEGIN

@interface AUv3NativeRecorderBackend : NSObject

@property (nonatomic, copy, readonly) NSString *lastErrorMessage;

- (BOOL)startWithPath:(NSString *)path
           sampleRate:(uint32_t)sampleRate
             channels:(uint16_t)channels
               source:(NSString *)source;

- (BOOL)stopWithDuration:(double *_Nonnull)duration
              frameCount:(uint64_t *_Nonnull)frameCount
           overrunFrames:(uint64_t *_Nonnull)overrunFrames
    discontinuityFrames:(uint64_t *_Nonnull)discontinuityFrames;

- (void)reportDiscontinuityFrames:(uint32_t)frames;

- (void)pushPlanarFloat32:(const float *_Nullable const *_Nonnull)data
                 channels:(uint16_t)channels
                   frames:(uint32_t)frames;

- (void)pushInterleavedFloat32:(const float *_Nonnull)data
                      channels:(uint16_t)channels
                        frames:(uint32_t)frames;

- (BOOL)copyScopeMinima:(float *_Nonnull)minima
                 maxima:(float *_Nonnull)maxima
               capacity:(uint16_t)capacity
               binCount:(uint16_t *_Nonnull)binCount
               sequence:(uint64_t *_Nonnull)sequence
             sampleRate:(uint32_t *_Nonnull)sampleRate
               channels:(uint16_t *_Nonnull)channels
                    rms:(float *_Nonnull)rms
                   peak:(float *_Nonnull)peak;

@end

NS_ASSUME_NONNULL_END
