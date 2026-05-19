#include "ring_buffer.h"
#include <algorithm>
#include <cstring>

namespace atome {

RingBuffer::RingBuffer(int channels, int capacityFrames)
: mChannels(channels), mCapacityFrames(capacityFrames), mData(channels) {
  for (int ch = 0; ch < channels; ++ch) mData[ch].assign(capacityFrames, 0.0f);
}

RingBuffer::~RingBuffer() = default;

void RingBuffer::clear() {
  mReadIndex.store(0, std::memory_order_relaxed);
  mWriteIndex.store(0, std::memory_order_relaxed);
  for (auto& v : mData) std::fill(v.begin(), v.end(), 0.0f);
}

int RingBuffer::push(const float* const* in, int channels, int frames) {
  const size_t write = mWriteIndex.load(std::memory_order_relaxed);
  const size_t read  = mReadIndex.load(std::memory_order_acquire);
  const size_t filled = write - read;
  const size_t freeSpace = (size_t)mCapacityFrames - filled;
  size_t toWrite = std::min<size_t>(frames, freeSpace);
  if (toWrite == 0) return 0;

  const size_t wmod = write % mCapacityFrames;
  const size_t first = std::min<size_t>(toWrite, mCapacityFrames - wmod);
  const size_t second = toWrite - first;

  for (int ch = 0; ch < std::min(channels, mChannels); ++ch) {
    std::memcpy(mData[ch].data() + wmod, in[ch], first * sizeof(float));
    if (second) std::memcpy(mData[ch].data(), in[ch] + first, second * sizeof(float));
  }

  mWriteIndex.store(write + toWrite, std::memory_order_release);
  return (int)toWrite;
}

int RingBuffer::pop(float* const* out, int channels, int frames) {
  const size_t write = mWriteIndex.load(std::memory_order_acquire);
  const size_t read  = mReadIndex.load(std::memory_order_relaxed);
  const size_t available = write - read;
  size_t toRead = std::min<size_t>(frames, available);
  if (toRead == 0) return 0;

  const size_t rmod = read % mCapacityFrames;
  const size_t first = std::min<size_t>(toRead, mCapacityFrames - rmod);
  const size_t second = toRead - first;

  for (int ch = 0; ch < std::min(channels, mChannels); ++ch) {
    std::memcpy(out[ch], mData[ch].data() + rmod, first * sizeof(float));
    if (second) std::memcpy(out[ch] + first, mData[ch].data(), second * sizeof(float));
  }

  mReadIndex.store(read + toRead, std::memory_order_release);
  return (int)toRead;
}

} // namespace atome
