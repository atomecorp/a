#import "AUv3NativeRecorderBackend.h"

#include "../../../../atome/engines/audio/core/recorder/recorder_core.cpp"
#include "../../../../atome/engines/audio/core/ring_buffer.cpp"
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstring>

namespace {

constexpr uint16_t kScopeBinCount = 64;
constexpr int kScopeSlotCount = 3;

struct ScopeSlot {
    std::atomic<uint32_t> readers{0};
    float minima[kScopeBinCount]{};
    float maxima[kScopeBinCount]{};
    uint64_t sequence = 0;
    uint32_t sampleRate = 0;
    uint16_t channels = 0;
    uint16_t binCount = 0;
    float rms = 0;
    float peak = 0;
};

class RecordingScopeState {
public:
    void reset(uint32_t sampleRate, uint16_t channels) noexcept {
        sampleRate_ = sampleRate;
        channels_ = channels;
        nextSequence_ = 0;
        published_.store(-1, std::memory_order_release);
    }

    void pushPlanar(const float *const *data, uint16_t channels, uint32_t frames) noexcept {
        if (data == nullptr || channels == 0 || frames == 0) return;
        publish(channels, frames, [data](uint16_t channel, uint32_t frame) noexcept {
            const float *samples = data[channel];
            return samples == nullptr ? 0.0f : samples[frame];
        });
    }

    void pushInterleaved(const float *data, uint16_t channels, uint32_t frames) noexcept {
        if (data == nullptr || channels == 0 || frames == 0) return;
        publish(channels, frames, [data, channels](uint16_t channel, uint32_t frame) noexcept {
            return data[(static_cast<size_t>(frame) * channels) + channel];
        });
    }

    bool copy(float *minima,
              float *maxima,
              uint16_t capacity,
              uint16_t *binCount,
              uint64_t *sequence,
              uint32_t *sampleRate,
              uint16_t *channels,
              float *rms,
              float *peak) noexcept {
        if (minima == nullptr || maxima == nullptr || binCount == nullptr
            || sequence == nullptr || sampleRate == nullptr || channels == nullptr
            || rms == nullptr || peak == nullptr) {
            return false;
        }
        for (int attempt = 0; attempt < kScopeSlotCount; ++attempt) {
            const int index = published_.load(std::memory_order_acquire);
            if (index < 0 || index >= kScopeSlotCount) return false;
            ScopeSlot &slot = slots_[index];
            slot.readers.fetch_add(1, std::memory_order_acq_rel);
            if (published_.load(std::memory_order_acquire) != index) {
                slot.readers.fetch_sub(1, std::memory_order_release);
                continue;
            }
            if (capacity < slot.binCount) {
                slot.readers.fetch_sub(1, std::memory_order_release);
                return false;
            }
            std::memcpy(minima, slot.minima, sizeof(float) * slot.binCount);
            std::memcpy(maxima, slot.maxima, sizeof(float) * slot.binCount);
            *binCount = slot.binCount;
            *sequence = slot.sequence;
            *sampleRate = slot.sampleRate;
            *channels = slot.channels;
            *rms = slot.rms;
            *peak = slot.peak;
            slot.readers.fetch_sub(1, std::memory_order_release);
            return true;
        }
        return false;
    }

private:
    template <typename SampleAt>
    void publish(uint16_t channels, uint32_t frames, SampleAt sampleAt) noexcept {
        const int current = published_.load(std::memory_order_acquire);
        int writeIndex = -1;
        for (int index = 0; index < kScopeSlotCount; ++index) {
            if (index != current && slots_[index].readers.load(std::memory_order_acquire) == 0) {
                writeIndex = index;
                break;
            }
        }
        if (writeIndex < 0) return;

        ScopeSlot &slot = slots_[writeIndex];
        for (uint16_t bin = 0; bin < kScopeBinCount; ++bin) {
            slot.minima[bin] = 1.0f;
            slot.maxima[bin] = -1.0f;
        }
        double squareSum = 0;
        float peak = 0;
        for (uint32_t frame = 0; frame < frames; ++frame) {
            float mono = 0;
            for (uint16_t channel = 0; channel < channels; ++channel) {
                const float sample = sampleAt(channel, frame);
                mono += std::isfinite(sample) ? sample : 0.0f;
            }
            mono /= static_cast<float>(channels);
            mono = std::clamp(mono, -1.0f, 1.0f);
            const uint16_t bin = static_cast<uint16_t>(
                std::min<uint64_t>(kScopeBinCount - 1,
                                   (static_cast<uint64_t>(frame) * kScopeBinCount) / frames)
            );
            slot.minima[bin] = std::min(slot.minima[bin], mono);
            slot.maxima[bin] = std::max(slot.maxima[bin], mono);
            peak = std::max(peak, std::abs(mono));
            squareSum += static_cast<double>(mono) * mono;
        }
        for (uint16_t bin = 0; bin < kScopeBinCount; ++bin) {
            if (slot.minima[bin] > slot.maxima[bin]) {
                slot.minima[bin] = 0;
                slot.maxima[bin] = 0;
            }
        }
        slot.sequence = ++nextSequence_;
        slot.sampleRate = sampleRate_;
        slot.channels = channels_;
        slot.binCount = kScopeBinCount;
        slot.rms = static_cast<float>(std::sqrt(squareSum / frames));
        slot.peak = peak;
        published_.store(writeIndex, std::memory_order_release);
    }

    ScopeSlot slots_[kScopeSlotCount];
    std::atomic<int> published_{-1};
    uint64_t nextSequence_ = 0;
    uint32_t sampleRate_ = 0;
    uint16_t channels_ = 0;
};

} // namespace

@interface AUv3NativeRecorderBackend ()
@property (nonatomic, copy, readwrite) NSString *lastErrorMessage;
@end

@implementation AUv3NativeRecorderBackend {
    RecordingScopeState *_recordingScope;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _lastErrorMessage = @"";
        _recordingScope = new RecordingScopeState();
    }
    return self;
}

- (void)dealloc {
    delete _recordingScope;
}

- (BOOL)startWithPath:(NSString *)path
           sampleRate:(uint32_t)sampleRate
             channels:(uint16_t)channels
               source:(NSString *)source {
    self.lastErrorMessage = @"";
    _recordingScope->reset(sampleRate, channels);

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

- (BOOL)stopWithDuration:(double *)duration
              frameCount:(uint64_t *)frameCount
           overrunFrames:(uint64_t *)overrunFrames
    discontinuityFrames:(uint64_t *)discontinuityFrames {
    self.lastErrorMessage = @"";

    char *coreError = nullptr;
    const BOOL ok = squirrel_recorder_core_stop(&coreError,
                                                duration,
                                                frameCount,
                                                overrunFrames,
                                                discontinuityFrames);
    if (!ok) {
        self.lastErrorMessage = coreError ? [NSString stringWithUTF8String:coreError] : @"Recorder stop failed";
    }
    squirrel_string_free(coreError);
    return ok;
}

- (void)reportDiscontinuityFrames:(uint32_t)frames {
    squirrel_recorder_core_report_discontinuity(frames);
}

- (void)pushPlanarFloat32:(const float *const *)data
                 channels:(uint16_t)channels
                   frames:(uint32_t)frames {
    squirrel_recorder_core_push(data, channels, frames);
    _recordingScope->pushPlanar(data, channels, frames);
}

- (void)pushInterleavedFloat32:(const float *)data
                      channels:(uint16_t)channels
                        frames:(uint32_t)frames {
    squirrel_recorder_core_push_interleaved(data, channels, frames);
    _recordingScope->pushInterleaved(data, channels, frames);
}

- (BOOL)copyScopeMinima:(float *)minima
                 maxima:(float *)maxima
               capacity:(uint16_t)capacity
               binCount:(uint16_t *)binCount
               sequence:(uint64_t *)sequence
             sampleRate:(uint32_t *)sampleRate
               channels:(uint16_t *)channels
                    rms:(float *)rms
                   peak:(float *)peak {
    return _recordingScope->copy(minima,
                                 maxima,
                                 capacity,
                                 binCount,
                                 sequence,
                                 sampleRate,
                                 channels,
                                 rms,
                                 peak);
}

@end
