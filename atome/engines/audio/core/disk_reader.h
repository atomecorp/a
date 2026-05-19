#pragma once
#include <thread>
#include <atomic>
#include <string>

namespace atome {

class RingBuffer;

class DiskReader {
public:
  explicit DiskReader(RingBuffer& ring);
  ~DiskReader();

  bool open(const char* path, int sampleRate);
  void stop();

private:
  void threadFunc();

  RingBuffer& mRing;
  std::thread mThread;
  std::atomic<bool> mRunning{false};
  std::atomic<bool> mShouldStop{false};
  std::string mPath;
  int mSampleRate = 0;
};

} // namespace atome
