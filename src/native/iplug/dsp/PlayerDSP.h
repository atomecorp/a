#pragma once
// PlayerDSP skeleton: poly voices, sample-accurate scheduler, short crossfades on jumps/loops

#include <cstdint>
#include <vector>
#include <string>
#include <functional>
#include "Envelope.h"
#include "RingBuffer.h"

namespace SquirrelAudio {

struct Voice { std::string id; int clipIndex{-1}; int64_t pos{0}; Envelope env; bool active{false}; };

class PlayerDSP {
public:
  PlayerDSP();
  void setSampleRate(double sr) { mSR = sr; }
  void process(float** outputs, int nChans, int nFrames);
  // TODO: preload/stream decode integration
private:
  double mSR{48000.0};
  std::vector<Voice> mVoices; // pre-allocated pool
  // TODO: ring buffer for commands from UI thread
};

} // namespace SquirrelAudio
