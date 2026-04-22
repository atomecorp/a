#pragma once
// Lock-free SPSC ring buffer skeleton (audio & command)
// Note: Implement proper memory barriers for realtime safety.

#include <atomic>
#include <cstddef>
#include <cstdint>

template<typename T>
class SPSCRingBuffer {
public:
  explicit SPSCRingBuffer(size_t capacity)
  : mCapacity(capacity), mMask(capacity-1), mWrite(0), mRead(0) {}

  bool push(const T& v){
    const size_t w = mWrite.load(std::memory_order_relaxed);
    const size_t r = mRead.load(std::memory_order_acquire);
    if(((w + 1) & mMask) == r) return false; // full
    mBuf[w & mMask] = v;
    mWrite.store((w + 1) & mMask, std::memory_order_release);
    return true;
  }
  bool pop(T& out){
    const size_t r = mRead.load(std::memory_order_relaxed);
    const size_t w = mWrite.load(std::memory_order_acquire);
    if(r == w) return false; // empty
    out = mBuf[r & mMask];
    mRead.store((r + 1) & mMask, std::memory_order_release);
    return true;
  }

  size_t capacity() const { return mCapacity; }

private:
  const size_t mCapacity;
  const size_t mMask;
  std::atomic<size_t> mWrite;
  std::atomic<size_t> mRead;
  T mBuf[1<<12]; // TODO: allocate power-of-two capacity externally
};
