#pragma once
#include <cstddef>
#include <vector>
#include <atomic>

namespace atome {

// Simple lock-free single-producer/single-consumer ring buffer of float32 non-interleaved planes
class RingBuffer {
public:
  RingBuffer(int channels, int capacityFrames);
  ~RingBuffer();

  int capacityFrames() const { return mCapacityFrames; }

  // Producer API: push up to frames, returns frames actually written
  int push(const float* const* in, int channels, int frames);

  // Consumer API: pop up to frames, returns frames actually read
  int pop(float* const* out, int channels, int frames);

  void clear();

private:
  int mChannels;
  int mCapacityFrames;
  std::vector<std::vector<float>> mData; // [ch][frame]
  std::atomic<size_t> mWriteIndex{0};
  std::atomic<size_t> mReadIndex{0};
};

} // namespace atome
