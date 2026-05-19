#include "disk_reader.h"
#include "ring_buffer.h"

#import <AVFoundation/AVFoundation.h>
#include <vector>

namespace atome {

class AVReaderWrapper {
public:
  bool open(const char* cpath, int sampleRate) {
    @autoreleasepool {
      NSString* path = [NSString stringWithUTF8String:cpath];
      NSURL* url = [NSURL fileURLWithPath:path];
      NSError* err = nil;
      file = [[AVAudioFile alloc] initForReading:url error:&err];
      if (err || !file) return false;
      format = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:sampleRate channels:2];
      if (!format) return false;
      return true;
    }
  }
  bool read(float** out, int frames, int channels, int& outFrames) {
    @autoreleasepool {
      if (!file || !format) { outFrames = 0; return false; }
      AVAudioPCMBuffer* buf = [[AVAudioPCMBuffer alloc] initWithPCMFormat:format frameCapacity:frames];
      NSError* err = nil;
      bool ok = [file readIntoBuffer:buf error:&err];
      if (!ok || err) { outFrames = 0; return false; }
      outFrames = (int)buf.frameLength;
      if (outFrames <= 0) return true;
      for (int ch = 0; ch < channels && ch < buf.format.channelCount; ++ch) {
        float* src = buf.floatChannelData[ch];
        memcpy(out[ch], src, sizeof(float) * outFrames);
      }
      return true;
    }
  }
private:
  AVAudioFile* file = nil;
  AVAudioFormat* format = nil;
};

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
  AVReaderWrapper reader;
  if (!reader.open(mPath.c_str(), mSampleRate)) {
    mRunning.store(false, std::memory_order_release);
    return;
  }
  const int block = 2048;
  std::vector<float> ch0(block, 0.0f), ch1(block, 0.0f);
  std::vector<const float*> planes(2);
  planes[0] = ch0.data();
  planes[1] = ch1.data();

  while (!mShouldStop.load(std::memory_order_acquire)) {
    int readFrames = 0;
    float* outs[2] = { ch0.data(), ch1.data() };
    if (!reader.read(outs, block, 2, readFrames)) {
      // EOF or error -> stop pushing
      std::this_thread::sleep_for(std::chrono::milliseconds(5));
      continue;
    }
    if (readFrames <= 0) {
      std::this_thread::sleep_for(std::chrono::milliseconds(5));
      continue;
    }
    int wrote = 0;
    int offset = 0;
    while (offset < readFrames && !mShouldStop.load(std::memory_order_relaxed)) {
      const float* planePtrs[2] = { ch0.data() + offset, ch1.data() + offset };
      int w = mRing.push(planePtrs, 2, readFrames - offset);
      if (w == 0) {
        std::this_thread::sleep_for(std::chrono::milliseconds(2));
      }
      offset += w;
      wrote += w;
    }
  }
  mRunning.store(false, std::memory_order_release);
}

} // namespace atome
