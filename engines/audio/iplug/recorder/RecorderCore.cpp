#include "RecorderCore.h"

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

#include "../../../core/ring_buffer.h"

namespace {

constexpr uint32_t kDefaultSampleRate = 48000;
constexpr uint16_t kMaxChannels = 8;
constexpr uint32_t kChunkFrames = 1024;
constexpr uint32_t kRingSeconds = 4;

enum class RecorderSource { Mic, Plugin };

RecorderSource parse_source(const char* source) {
  if (!source) return RecorderSource::Mic;
  const std::string s(source);
  if (s == "plugin" || s == "plugin_output") return RecorderSource::Plugin;
  return RecorderSource::Mic;
}

void write_wav_header(std::FILE* file,
                      uint32_t sample_rate,
                      uint16_t channels,
                      uint32_t data_bytes) {
  if (!file) return;

  const uint16_t audio_format = 1; // PCM
  const uint16_t bits_per_sample = 16;
  const uint16_t block_align = static_cast<uint16_t>(channels * (bits_per_sample / 8));
  const uint32_t byte_rate = sample_rate * block_align;
  const uint32_t riff_size = 36 + data_bytes;
  const uint32_t fmt_chunk_size = 16;

  std::fseek(file, 0, SEEK_SET);
  std::fwrite("RIFF", 1, 4, file);
  std::fwrite(&riff_size, sizeof(riff_size), 1, file);
  std::fwrite("WAVE", 1, 4, file);
  std::fwrite("fmt ", 1, 4, file);
  std::fwrite(&fmt_chunk_size, sizeof(fmt_chunk_size), 1, file);
  std::fwrite(&audio_format, sizeof(audio_format), 1, file);
  std::fwrite(&channels, sizeof(channels), 1, file);
  std::fwrite(&sample_rate, sizeof(sample_rate), 1, file);
  std::fwrite(&byte_rate, sizeof(byte_rate), 1, file);
  std::fwrite(&block_align, sizeof(block_align), 1, file);
  std::fwrite(&bits_per_sample, sizeof(bits_per_sample), 1, file);
  std::fwrite("data", 1, 4, file);
  std::fwrite(&data_bytes, sizeof(data_bytes), 1, file);
  std::fflush(file);
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

    write_wav_header(file, sr, ch, 0);

    const uint32_t ring_frames = std::max<uint32_t>(kChunkFrames * 2, sr * kRingSeconds);
    mRing.reset(new atome::RingBuffer(ch, static_cast<int>(ring_frames)));
    mFile = file;
    mSampleRate = sr;
    mChannels = ch;
    mSource = source;
    mTotalFrames = 0;
    mRunning.store(true);
    mScratch.assign(ch, std::vector<float>(kChunkFrames, 0.0f));
    mScratchPtrs.assign(ch, nullptr);
    for (uint16_t c = 0; c < ch; ++c) mScratchPtrs[c] = mScratch[c].data();

    start_writer();
    return true;
  }

  bool stop(std::string& err, double* out_duration) {
    std::unique_lock<std::mutex> lock(mMutex);
    if (!mRunning.load()) {
      err = "Recorder is not running";
      return false;
    }

    mRunning.store(false);
    lock.unlock();

    if (mWriterThread.joinable()) {
      mWriterThread.join();
    }

    lock.lock();
    if (mFile) {
      const uint32_t data_bytes = static_cast<uint32_t>(mTotalFrames * mChannels * sizeof(int16_t));
      write_wav_header(mFile, mSampleRate, mChannels, data_bytes);
      std::fclose(mFile);
      mFile = nullptr;
    }

    if (out_duration) {
      *out_duration = mSampleRate > 0 ? static_cast<double>(mTotalFrames) / static_cast<double>(mSampleRate) : 0.0;
    }

    mRing.reset();
    mTotalFrames = 0;
    return true;
  }

  void push(const float* const* data, uint16_t channels, uint32_t frames) {
    if (!mRunning.load() || !mRing || !data || frames == 0) return;
    const uint16_t ch = std::min<uint16_t>(channels, mChannels);
    const float* const* ptr = data;
    mRing->push(ptr, ch, static_cast<int>(frames));
  }

  void push_interleaved(const float* data, uint16_t channels, uint32_t frames) {
    if (!mRunning.load() || !mRing || !data || frames == 0) return;
    const uint16_t ch = std::min<uint16_t>(channels, mChannels);
    if (ch == 0) return;

    if (mScratch.size() != ch || mScratchPtrs.size() != ch) return;

    uint32_t offset = 0;
    while (offset < frames) {
      const uint32_t remaining = frames - offset;
      const uint32_t chunk = remaining > kChunkFrames ? kChunkFrames : remaining;

      const float* src = data + offset * ch;
      for (uint32_t f = 0; f < chunk; ++f) {
        for (uint16_t c = 0; c < ch; ++c) {
          mScratch[c][f] = src[f * ch + c];
        }
      }

      mRing->push(mScratchPtrs.data(), ch, static_cast<int>(chunk));
      offset += chunk;
    }
  }

  bool is_recording() const {
    return mRunning.load();
  }

  bool source_is(RecorderSource source) const {
    return mRunning.load() && mSource == source;
  }

private:
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
            (void)written;
          }
          mTotalFrames += static_cast<uint64_t>(frame_count);
          continue;
        }

        if (!mRunning.load()) {
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

bool squirrel_recorder_core_stop(char** err_out, double* out_duration_sec) {
  if (err_out) *err_out = nullptr;
  std::string err;
  const bool ok = recorder().stop(err, out_duration_sec);
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

void squirrel_string_free(char* s) {
  if (s) std::free(s);
}

} // extern "C"
