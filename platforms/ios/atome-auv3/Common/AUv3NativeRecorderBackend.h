#import <Foundation/Foundation.h>
#include <stdint.h>

NS_ASSUME_NONNULL_BEGIN

@interface AUv3NativeRecorderBackend : NSObject

@property (nonatomic, copy, readonly) NSString *lastErrorMessage;

- (BOOL)startWithPath:(NSString *)path
           sampleRate:(uint32_t)sampleRate
             channels:(uint16_t)channels
               source:(NSString *)source;

- (BOOL)stopWithDuration:(double *_Nonnull)duration;

- (void)pushPlanarFloat32:(const float *_Nullable const *_Nonnull)data
                 channels:(uint16_t)channels
                   frames:(uint32_t)frames;

- (void)pushInterleavedFloat32:(const float *_Nonnull)data
                      channels:(uint16_t)channels
                        frames:(uint32_t)frames;

@end

NS_ASSUME_NONNULL_END
