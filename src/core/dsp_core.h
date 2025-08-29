#pragma once
#include <cstdint>
#include <atomic>

namespace atome {

enum class ParamId : uint32_t {
  Gain = 0,
  Play = 1,
  PositionFrames = 2,
};

struct TransportState {
  double tempo = 120.0;
  double ppq = 0.0;
  bool playing = false;
};

class RingBuffer; // fwd
class DiskReader; // fwd

class DSPCore {
public:
  DSPCore();
  ~DSPCore();

  void init(double sampleRate, int maxChannels, int ringCapacityFrames);
  void setParameter(ParamId id, float value);
  void setTransport(double tempo, double ppq, bool playing);

  // Non-interleaved float32 planes
  void process(const float* const* in, float* const* out, int channels, int frames);

  // File control
  void loadFile(const char* path);
  void clear();

private:
  void processTimeStretch(const float* const* in, float* const* out, int frames);

  double mSampleRate = 48000.0;
  int mMaxChannels = 2;
  std::atomic<float> mGain{1.0f};
  std::atomic<int> mPlay{0};
  std::atomic<double> mPositionFrames{0.0};

  TransportState mTransport{};

  RingBuffer* mRing = nullptr;
  DiskReader* mReader = nullptr;
};

} // namespace atome
