#include "dsp_core.h"
#include "ring_buffer.h"
#include "disk_reader.h"
#include <cstring>

namespace atome {

DSPCore::DSPCore() = default;
DSPCore::~DSPCore() { clear(); }

void DSPCore::init(double sampleRate, int maxChannels, int ringCapacityFrames) {
  mSampleRate = sampleRate;
  mMaxChannels = maxChannels;
  if (!mRing) mRing = new RingBuffer(maxChannels, ringCapacityFrames);
  if (!mReader) mReader = new DiskReader(*mRing);
}

void DSPCore::setParameter(ParamId id, float value) {
  switch(id) {
    case ParamId::Gain: mGain.store(value, std::memory_order_relaxed); break;
    case ParamId::Play: mPlay.store(value > 0.5f ? 1 : 0, std::memory_order_relaxed); break;
    case ParamId::PositionFrames: mPositionFrames.store(static_cast<double>(value), std::memory_order_relaxed); /* TODO: seek */ break;
  }
}

void DSPCore::setTransport(double tempo, double ppq, bool playing) {
  mTransport.tempo = tempo;
  mTransport.ppq = ppq;
  mTransport.playing = playing;
}

void DSPCore::process(const float* const* in, float* const* out, int channels, int frames) {
  const float gain = mGain.load(std::memory_order_relaxed);
  const int play = mPlay.load(std::memory_order_relaxed);

  if (!mRing || channels <= 0 || frames <= 0) {
    // zero fill
    for (int ch = 0; ch < channels; ++ch) {
      std::memset(out[ch], 0, sizeof(float) * frames);
    }
    return;
  }

  if (!play) {
    // stopped -> zero fill
    for (int ch = 0; ch < channels; ++ch) {
      std::memset(out[ch], 0, sizeof(float) * frames);
    }
    return;
  }

  // Pop from ring; zero-fill on underrun
  int popped = mRing->pop(out, channels, frames);
  if (popped < frames) {
    for (int ch = 0; ch < channels; ++ch) {
      std::memset(out[ch] + popped, 0, sizeof(float) * (frames - popped));
    }
  }

  // apply gain
  for (int ch = 0; ch < channels; ++ch) {
    for (int n = 0; n < frames; ++n) {
      out[ch][n] *= gain;
    }
  }
}

void DSPCore::loadFile(const char* path) {
  if (!mReader) return;
  mReader->open(path, static_cast<int>(mSampleRate));
}

void DSPCore::clear() {
  if (mReader) { mReader->stop(); delete mReader; mReader = nullptr; }
  if (mRing) { delete mRing; mRing = nullptr; }
}

void DSPCore::processTimeStretch(const float* const* /*in*/, float* const* /*out*/, int /*frames*/) {
  // TODO: future time-stretch insertion point
}

} // namespace atome
