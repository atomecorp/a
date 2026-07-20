#include "recorder_core.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "../ring_buffer.h"

namespace {

constexpr uint32_t kDefaultSampleRate = 48000;
constexpr uint16_t kMaxChannels = 8;
constexpr uint32_t kChunkFrames = 1024;
constexpr uint32_t kRingSeconds = 4;

enum class RecorderSource { Mic, PluginOutput, PluginInput };

RecorderSource parse_source(const char* source) {
  if (!source) return RecorderSource::Mic;
  const std::string s(source);
  if (s == "plugin" || s == "plugin_output") return RecorderSource::PluginOutput;
  if (s == "plugin_input" || s == "input") return RecorderSource::PluginInput;
  return RecorderSource::Mic;
}

bool write_wav_header(std::FILE* file,
                      uint32_t sample_rate,
                      uint16_t channels,
                      uint32_t data_bytes) {
  if (!file || std::fseek(file, 0, SEEK_SET) != 0) return false;

  const uint16_t audio_format = 1; // PCM
  const uint16_t bits_per_sample = 16;
  const uint16_t block_align = static_cast<uint16_t>(channels * (bits_per_sample / 8));
  const uint32_t byte_rate = sample_rate * block_align;
  const uint32_t riff_size = 36 + data_bytes;
  const uint32_t fmt_chunk_size = 16;

  const bool written = std::fwrite("RIFF", 1, 4, file) == 4
      && std::fwrite(&riff_size, sizeof(riff_size), 1, file) == 1
      && std::fwrite("WAVE", 1, 4, file) == 4
      && std::fwrite("fmt ", 1, 4, file) == 4
      && std::fwrite(&fmt_chunk_size, sizeof(fmt_chunk_size), 1, file) == 1
      && std::fwrite(&audio_format, sizeof(audio_format), 1, file) == 1
      && std::fwrite(&channels, sizeof(channels), 1, file) == 1
      && std::fwrite(&sample_rate, sizeof(sample_rate), 1, file) == 1
      && std::fwrite(&byte_rate, sizeof(byte_rate), 1, file) == 1
      && std::fwrite(&block_align, sizeof(block_align), 1, file) == 1
      && std::fwrite(&bits_per_sample, sizeof(bits_per_sample), 1, file) == 1
      && std::fwrite("data", 1, 4, file) == 4
      && std::fwrite(&data_bytes, sizeof(data_bytes), 1, file) == 1;
  return written && std::fflush(file) == 0 && std::ferror(file) == 0;
}

char* dup_cstr(const std::string& s) {
  const size_t n = s.size();
  char* out = static_cast<char*>(std::malloc(n + 1));
  if (!out) return nullptr;
  std::memcpy(out, s.c_str(), n);
  out[n] = 0;
  return out;
}

class RecorderCore {
public:
  bool start(const char* abs_wav_path,
             uint32_t sample_rate,
             uint16_t channels,
             RecorderSource source,
             std::string& err) {
    std::lock_guard<std::mutex> lock(mMutex);
    if (mRunning.load()) {
      err = "Recorder already running";
      return false;
    }

    if (!abs_wav_path || std::strlen(abs_wav_path) == 0) {
      err = "Output path is empty";
      return false;
    }

    const uint32_t sr = sample_rate > 0 ? sample_rate : kDefaultSampleRate;
    uint16_t ch = channels == 0 ? 1 : channels;
    if (ch > kMaxChannels) ch = kMaxChannels;

    std::FILE* file = std::fopen(abs_wav_path, "wb");
    if (!file) {
      err = "Unable to open output file";
      return false;
    }

    if (!write_wav_header(file, sr, ch, 0)) {
      std::fclose(file);
      err = "Unable to write WAV header";
      return false;
    }

    const uint32_t ring_frames = std::max<uint32_t>(kChunkFrames * 2, sr * kRingSeconds);
    mRing.reset(new atome::RingBuffer(ch, static_cast<int>(ring_frames)));
    mFile = file;
    mSampleRate = sr;
    mChannels = ch;
    mSource = source;
    mTotalFrames = 0;
    mOverrunFrames.store(0, std::memory_order_relaxed);
    mDiscontinuityFrames.store(0, std::memory_order_relaxed);
    mWriteFailed.store(false, std::memory_order_relaxed);
    mActivePushes.store(0, std::memory_order_seq_cst);
    mProducerDrained.store(false, std::memory_order_release);
    mRunning.store(true, std::memory_order_seq_cst);
    mScratch.assign(ch, std::vector<float>(kChunkFrames, 0.0f));
    mScratchPtrs.assign(ch, nullptr);
    for (uint16_t c = 0; c < ch; ++c) mScratchPtrs[c] = mScratch[c].data();

    start_writer();
    return true;
  }

  bool stop(std::string& err,
            double* out_duration,
            uint64_t* out_frame_count,
            uint64_t* out_overrun_frames,
            uint64_t* out_discontinuity_frames) {
    std::unique_lock<std::mutex> lock(mMutex);
    if (!mRunning.load()) {
      err = "Recorder is not running";
      return false;
    }

    mRunning.store(false, std::memory_order_seq_cst);
    lock.unlock();

    while (mActivePushes.load(std::memory_order_seq_cst) != 0) {
      std::this_thread::yield();
    }
    mProducerDrained.store(true, std::memory_order_release);

    if (mWriterThread.joinable()) {
      mWriterThread.join();
    }

    lock.lock();
    const uint64_t data_bytes_64 = mTotalFrames * mChannels * sizeof(int16_t);
    if (data_bytes_64 > UINT32_MAX) {
      mWriteFailed.store(true, std::memory_order_relaxed);
      err = "Recording exceeds the WAV 32-bit data limit";
    }
    if (mFile) {
      const uint32_t data_bytes = data_bytes_64 <= UINT32_MAX
          ? static_cast<uint32_t>(data_bytes_64)
          : 0;
      if (!write_wav_header(mFile, mSampleRate, mChannels, data_bytes)) {
        mWriteFailed.store(true, std::memory_order_relaxed);
      }
      if (std::fclose(mFile) != 0) {
        mWriteFailed.store(true, std::memory_order_relaxed);
      }
      mFile = nullptr;
    }

    const uint64_t frame_count = mTotalFrames;
    const uint64_t overrun_frames = mOverrunFrames.load(std::memory_order_relaxed);
    const uint64_t discontinuity_frames = mDiscontinuityFrames.load(std::memory_order_relaxed);
    if (out_duration) {
      *out_duration = mSampleRate > 0 ? static_cast<double>(frame_count) / static_cast<double>(mSampleRate) : 0.0;
    }
    if (out_frame_count) *out_frame_count = frame_count;
    if (out_overrun_frames) *out_overrun_frames = overrun_frames;
    if (out_discontinuity_frames) *out_discontinuity_frames = discontinuity_frames;

    if (mWriteFailed.load(std::memory_order_relaxed) && err.empty()) {
      err = "Recorder file write failed";
    }
    if (overrun_frames > 0 && err.empty()) {
      err = "Recorder input overrun: " + std::to_string(overrun_frames) + " frames lost";
    }
    if (discontinuity_frames > 0 && err.empty()) {
      err = "Recorder input discontinuity: " + std::to_string(discontinuity_frames) + " frames lost";
    }
    if (frame_count == 0 && err.empty()) {
      err = "Recording contains no audio frames";
    }
    const bool valid = err.empty();

    mRing.reset();
    mTotalFrames = 0;
    mOverrunFrames.store(0, std::memory_order_relaxed);
    mDiscontinuityFrames.store(0, std::memory_order_relaxed);
    mWriteFailed.store(false, std::memory_order_relaxed);
    mProducerDrained.store(false, std::memory_order_relaxed);
    return valid;
  }

  void push(const float* const* data, uint16_t channels, uint32_t frames) {
    if (!begin_input_operation()) return;
    if (!mRing || !data || frames == 0) return end_input_operation();
    if (channels != mChannels) {
      mDiscontinuityFrames.fetch_add(static_cast<uint64_t>(frames), std::memory_order_relaxed);
      return end_input_operation();
    }
    for (uint16_t channel = 0; channel < channels; ++channel) {
      if (!data[channel]) {
        mDiscontinuityFrames.fetch_add(static_cast<uint64_t>(frames), std::memory_order_relaxed);
        return end_input_operation();
      }
    }
    const int written = mRing->push(data, channels, static_cast<int>(frames));
    if (written < static_cast<int>(frames)) {
      mOverrunFrames.fetch_add(static_cast<uint64_t>(frames - written), std::memory_order_relaxed);
    }
    end_input_operation();
  }

  void push_interleaved(const float* data, uint16_t channels, uint32_t frames) {
    if (!begin_input_operation()) return;
    if (!mRing || !data || frames == 0) return end_input_operation();
    if (channels != mChannels) {
      mDiscontinuityFrames.fetch_add(static_cast<uint64_t>(frames), std::memory_order_relaxed);
      return end_input_operation();
    }

    if (mScratch.size() != channels || mScratchPtrs.size() != channels) {
      mDiscontinuityFrames.fetch_add(static_cast<uint64_t>(frames), std::memory_order_relaxed);
      return end_input_operation();
    }

    uint32_t offset = 0;
    while (offset < frames) {
      const uint32_t remaining = frames - offset;
      const uint32_t chunk = remaining > kChunkFrames ? kChunkFrames : remaining;

      const float* src = data + offset * channels;
      for (uint32_t f = 0; f < chunk; ++f) {
        for (uint16_t c = 0; c < channels; ++c) {
          mScratch[c][f] = src[f * channels + c];
        }
      }

      const int written = mRing->push(mScratchPtrs.data(), channels, static_cast<int>(chunk));
      if (written < static_cast<int>(chunk)) {
        mOverrunFrames.fetch_add(static_cast<uint64_t>(chunk - written), std::memory_order_relaxed);
      }
      offset += chunk;
    }
    end_input_operation();
  }

  void report_discontinuity(uint32_t frames) {
    if (frames == 0 || !begin_input_operation()) return;
    mDiscontinuityFrames.fetch_add(static_cast<uint64_t>(frames), std::memory_order_relaxed);
    end_input_operation();
  }

  bool is_recording() const {
    return mRunning.load();
  }

  bool source_is(RecorderSource source) const {
    return mRunning.load() && mSource == source;
  }

private:
  bool begin_input_operation() {
    mActivePushes.fetch_add(1, std::memory_order_seq_cst);
    if (mRunning.load(std::memory_order_seq_cst)) return true;
    mActivePushes.fetch_sub(1, std::memory_order_seq_cst);
    return false;
  }

  void end_input_operation() {
    mActivePushes.fetch_sub(1, std::memory_order_seq_cst);
  }

  void start_writer() {
    mWriterThread = std::thread([this]() {
      std::vector<std::vector<float>> buffers;
      std::vector<float*> buffer_ptrs;
      std::vector<int16_t> interleaved;

      buffers.assign(mChannels, std::vector<float>(kChunkFrames, 0.0f));
      buffer_ptrs.resize(mChannels);
      for (uint16_t c = 0; c < mChannels; ++c) buffer_ptrs[c] = buffers[c].data();
      interleaved.resize(static_cast<size_t>(kChunkFrames) * mChannels);

      while (true) {
        const int frames = mRing ? mRing->pop(buffer_ptrs.data(), mChannels, static_cast<int>(kChunkFrames)) : 0;
        if (frames > 0) {
          const int frame_count = frames;
          for (int f = 0; f < frame_count; ++f) {
            for (uint16_t c = 0; c < mChannels; ++c) {
              float v = buffers[c][f];
              if (v > 1.0f) v = 1.0f;
              if (v < -1.0f) v = -1.0f;
              interleaved[f * mChannels + c] = static_cast<int16_t>(v * 32767.0f);
            }
          }
          if (mFile) {
            const size_t written = std::fwrite(interleaved.data(), sizeof(int16_t),
                                              static_cast<size_t>(frame_count * mChannels), mFile);
            if (written != static_cast<size_t>(frame_count * mChannels)) {
              mWriteFailed.store(true, std::memory_order_relaxed);
            }
          }
          mTotalFrames += static_cast<uint64_t>(frame_count);
          continue;
        }

        if (mProducerDrained.load(std::memory_order_acquire)) {
          break;
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(2));
      }
    });
  }

  std::atomic<bool> mRunning{false};
  RecorderSource mSource{RecorderSource::Mic};
  uint32_t mSampleRate{0};
  uint16_t mChannels{0};
  std::unique_ptr<atome::RingBuffer> mRing;
  std::FILE* mFile{nullptr};
  std::thread mWriterThread;
  std::mutex mMutex;
  uint64_t mTotalFrames{0};
  std::atomic<uint64_t> mOverrunFrames{0};
  std::atomic<uint64_t> mDiscontinuityFrames{0};
  std::atomic<bool> mWriteFailed{false};
  std::atomic<uint32_t> mActivePushes{0};
  std::atomic<bool> mProducerDrained{false};
  std::vector<std::vector<float>> mScratch;
  std::vector<float*> mScratchPtrs;
};

RecorderCore& recorder() {
  static RecorderCore instance;
  return instance;
}

} // namespace

extern "C" {

bool squirrel_recorder_core_start(const char* abs_wav_path,
                                 uint32_t sample_rate,
                                 uint16_t channels,
                                 const char* source,
                                 char** err_out) {
  if (err_out) *err_out = nullptr;
  std::string err;
  const RecorderSource src = parse_source(source);
  const bool ok = recorder().start(abs_wav_path, sample_rate, channels, src, err);
  if (!ok && err_out) *err_out = dup_cstr(err.empty() ? "Recorder start failed" : err);
  return ok;
}

bool squirrel_recorder_core_stop(char** err_out,
                                 double* out_duration_sec,
                                 uint64_t* out_frame_count,
                                 uint64_t* out_overrun_frames,
                                 uint64_t* out_discontinuity_frames) {
  if (err_out) *err_out = nullptr;
  std::string err;
  const bool ok = recorder().stop(err,
                                  out_duration_sec,
                                  out_frame_count,
                                  out_overrun_frames,
                                  out_discontinuity_frames);
  if (!ok && err_out) *err_out = dup_cstr(err.empty() ? "Recorder stop failed" : err);
  return ok;
}

bool squirrel_recorder_core_is_recording(void) {
  return recorder().is_recording();
}

bool squirrel_recorder_core_source_is(const char* source) {
  return recorder().source_is(parse_source(source));
}

void squirrel_recorder_core_push(const float* const* data,
                                 uint16_t channels,
                                 uint32_t frames) {
  recorder().push(data, channels, frames);
}

void squirrel_recorder_core_push_interleaved(const float* data,
                                             uint16_t channels,
                                             uint32_t frames) {
  recorder().push_interleaved(data, channels, frames);
}

void squirrel_recorder_core_report_discontinuity(uint32_t frames) {
  recorder().report_discontinuity(frames);
}

void squirrel_string_free(char* s) {
  if (s) std::free(s);
}

} // extern "C"
