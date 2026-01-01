#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>

#include "recorder.h"
#include "../../src/native/iplug/recorder/RecorderCore.h"

static char *dup_cstr(NSString *s) {
  if (!s) return nullptr;
  const char *utf8 = [s UTF8String];
  if (!utf8) return nullptr;
  size_t n = strlen(utf8);
  char *out = (char *)malloc(n + 1);
  if (!out) return nullptr;
  memcpy(out, utf8, n);
  out[n] = 0;
  return out;
}

@interface SquirrelNativeRecorder : NSObject
@property(nonatomic, strong) AVAudioEngine *engine;
@property(nonatomic, strong) AVAudioConverter *converter;
@property(nonatomic, strong) AVAudioFormat *targetFormat;
@property(nonatomic, assign) BOOL recording;
@end

@implementation SquirrelNativeRecorder

- (instancetype)init {
  self = [super init];
  if (self) {
    _engine = [[AVAudioEngine alloc] init];
    _recording = NO;
  }
  return self;
}

- (BOOL)startToPath:(NSString *)path
         sampleRate:(uint32_t)sampleRate
           channels:(uint16_t)channels
             source:(NSString *)source
              error:(NSString **)errorOut
          coreError:(char **)coreErrOut {
  if (self.recording) {
    if (errorOut) *errorOut = @"Recorder is already running";
    return NO;
  }

  NSString *src = (source && source.length > 0) ? [source lowercaseString] : @"mic";
  if ([src isEqualToString:@"plugin"] || [src isEqualToString:@"plugin_output"]) {
    if (errorOut) *errorOut = @"Plugin output recording is not available in Tauri";
    return NO;
  }

  AVAudioInputNode *input = self.engine.inputNode;
  if (!input) {
    if (errorOut) *errorOut = @"No audio input node available";
    return NO;
  }

  AVAudioFormat *inFormat = [input outputFormatForBus:0];
  if (!inFormat) {
    if (errorOut) *errorOut = @"Unable to get input format";
    return NO;
  }

  uint32_t targetSR = sampleRate > 0 ? sampleRate : (uint32_t)inFormat.sampleRate;
  uint16_t targetCh = channels > 0 ? channels : (uint16_t)inFormat.channelCount;
  if (targetCh < 1) targetCh = 1;
  if (targetCh > 2) targetCh = 2;

  AVAudioFormat *outFormat = [[AVAudioFormat alloc] initWithCommonFormat:AVAudioPCMFormatFloat32
                                                             sampleRate:(double)targetSR
                                                               channels:(AVAudioChannelCount)targetCh
                                                            interleaved:NO];
  if (!outFormat) {
    if (errorOut) *errorOut = @"Unable to create target audio format";
    return NO;
  }

  char *coreErr = nullptr;
  if (!squirrel_recorder_core_start([path UTF8String], targetSR, targetCh, "mic", &coreErr)) {
    if (coreErrOut) *coreErrOut = coreErr;
    return NO;
  }

  self.targetFormat = outFormat;
  self.converter = nil;
  if (![inFormat isEqual:outFormat]) {
    self.converter = [[AVAudioConverter alloc] initFromFormat:inFormat toFormat:outFormat];
    if (!self.converter) {
      char *stopErr = nullptr;
      double duration = 0.0;
      squirrel_recorder_core_stop(&stopErr, &duration);
      if (stopErr) squirrel_string_free(stopErr);
      if (errorOut) *errorOut = @"Unable to create audio converter";
      return NO;
    }
  }

  [input removeTapOnBus:0];

  __weak typeof(self) weakSelf = self;
  [input installTapOnBus:0
              bufferSize:1024
                  format:inFormat
                   block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
    (void)when;
    __strong typeof(weakSelf) strongSelf = weakSelf;
    if (!strongSelf || !strongSelf.recording) return;

    AVAudioPCMBuffer *useBuffer = buffer;
    AVAudioConverter *converter = strongSelf.converter;
    if (converter) {
      AVAudioFrameCount expected = buffer.frameLength;
      AVAudioPCMBuffer *outBuf = [[AVAudioPCMBuffer alloc] initWithPCMFormat:strongSelf.targetFormat
                                                              frameCapacity:expected];
      if (!outBuf) return;

      __block BOOL didSupply = NO;
      AVAudioConverterInputBlock inputBlock = ^AVAudioBuffer *(AVAudioPacketCount inNumberOfPackets, AVAudioConverterInputStatus *outStatus) {
        (void)inNumberOfPackets;
        if (didSupply) {
          *outStatus = AVAudioConverterInputStatus_NoDataNow;
          return nil;
        }
        didSupply = YES;
        *outStatus = AVAudioConverterInputStatus_HaveData;
        return buffer;
      };

      NSError *convErr = nil;
      [converter convertToBuffer:outBuf error:&convErr withInputFromBlock:inputBlock];
      if (convErr) return;
      useBuffer = outBuf;
    }

    const float *const *channels = (const float *const *)useBuffer.floatChannelData;
    if (!channels) return;

    squirrel_recorder_core_push((const float *const *)channels,
                                (uint16_t)useBuffer.format.channelCount,
                                (uint32_t)useBuffer.frameLength);
  }];

  NSError *startErr = nil;
  [self.engine startAndReturnError:&startErr];
  if (startErr) {
    char *stopErr = nullptr;
    double duration = 0.0;
    squirrel_recorder_core_stop(&stopErr, &duration);
    if (stopErr) squirrel_string_free(stopErr);
    if (errorOut) *errorOut = [NSString stringWithFormat:@"Unable to start audio engine: %@", startErr.localizedDescription];
    return NO;
  }

  self.recording = YES;
  return YES;
}

- (BOOL)stopWithError:(NSString **)errorOut duration:(double *)durationOut {
  if (!self.recording) {
    if (errorOut) *errorOut = @"Recorder is not running";
    return NO;
  }

  AVAudioInputNode *input = self.engine.inputNode;
  if (input) {
    [input removeTapOnBus:0];
  }

  [self.engine stop];
  self.converter = nil;
  self.targetFormat = nil;
  self.recording = NO;

  char *coreErr = nullptr;
  double duration = 0.0;
  if (!squirrel_recorder_core_stop(&coreErr, &duration)) {
    if (coreErr) {
      if (errorOut) *errorOut = [NSString stringWithUTF8String:coreErr];
      squirrel_string_free(coreErr);
    } else if (errorOut) {
      *errorOut = @"Recorder stop failed";
    }
    return NO;
  }

  if (durationOut) *durationOut = duration;
  return YES;
}

@end

static SquirrelNativeRecorder *g_recorder = nil;
static dispatch_queue_t g_queue;

static void ensure_globals() {
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    g_queue = dispatch_queue_create("squirrel.native.recorder", DISPATCH_QUEUE_SERIAL);
    g_recorder = [[SquirrelNativeRecorder alloc] init];
  });
}

bool squirrel_recorder_start(const char *abs_wav_path,
                            uint32_t sample_rate,
                            uint16_t channels,
                            const char *source,
                            char **err_out) {
  ensure_globals();
  if (err_out) *err_out = nullptr;

  __block BOOL ok = NO;
  __block NSString *err = nil;
  __block char *coreErr = nullptr;

  NSString *path = abs_wav_path ? [NSString stringWithUTF8String:abs_wav_path] : @"";
  NSString *src = source ? [NSString stringWithUTF8String:source] : @"mic";

  dispatch_sync(g_queue, ^{
    NSString *e = nil;
    ok = [g_recorder startToPath:path
                      sampleRate:sample_rate
                        channels:channels
                          source:src
                           error:&e
                       coreError:&coreErr];
    err = e;
  });

  if (!ok && err_out) {
    if (coreErr) {
      *err_out = coreErr;
    } else {
      *err_out = dup_cstr(err ?: @"Unknown error");
    }
  }

  return ok ? true : false;
}

bool squirrel_recorder_stop(char **err_out, double *out_duration_sec) {
  ensure_globals();
  if (err_out) *err_out = nullptr;
  if (out_duration_sec) *out_duration_sec = 0.0;

  __block BOOL ok = NO;
  __block NSString *err = nil;
  __block double duration = 0.0;

  dispatch_sync(g_queue, ^{
    NSString *e = nil;
    ok = [g_recorder stopWithError:&e duration:&duration];
    err = e;
  });

  if (!ok && err_out) {
    *err_out = dup_cstr(err ?: @"Unknown error");
  }
  if (ok && out_duration_sec) {
    *out_duration_sec = duration;
  }

  return ok ? true : false;
}
