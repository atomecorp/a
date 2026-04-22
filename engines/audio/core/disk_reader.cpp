#include "disk_reader.h"
#include "ring_buffer.h"
#include <vector>
#include <chrono>

#if defined(__APPLE__)
// Placeholder: AVAudioFile/AVAssetReader implementation to be added
#endif

namespace atome {

DiskReader::DiskReader(RingBuffer& ring) : mRing(ring) {}
DiskReader::~DiskReader() { stop(); }

bool DiskReader::open(const char* path, int sampleRate) {
  mPath = path ? path : "";
  mSampleRate = sampleRate;
  mShouldStop.store(false, std::memory_order_relaxed);
  if (mRunning.load(std::memory_order_acquire)) return true;
  mRunning.store(true, std::memory_order_release);
  mThread = std::thread(&DiskReader::threadFunc, this);
  return true;
}

void DiskReader::stop() {
  mShouldStop.store(true, std::memory_order_release);
  if (mRunning.exchange(false)) {
    if (mThread.joinable()) mThread.join();
  }
}

void DiskReader::threadFunc() {
  // TODO: Replace with real file decoding on Apple/other platforms
  // For now, generate silence to exercise the ring-buffer and scheduling
  constexpr int block = 1024;
  std::vector<float> tmp(block, 0.0f);
  std::vector<const float*> planes(2);
  planes[0] = tmp.data();
  planes[1] = tmp.data();

  while (!mShouldStop.load(std::memory_order_acquire)) {
    int written = mRing.push(planes.data(), 2, block);
    if (written == 0) {
      std::this_thread::sleep_for(std::chrono::milliseconds(2));
    }
  }
}

} // namespace atome
