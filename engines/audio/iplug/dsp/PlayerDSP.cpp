#include "PlayerDSP.h"

namespace SquirrelAudio {

PlayerDSP::PlayerDSP(){
  mVoices.resize(32); // pre-allocate voice pool
}

void PlayerDSP::process(float** outputs, int nChans, int nFrames){
  // Skeleton: zero output
  for(int c=0;c<nChans;++c){ for(int i=0;i<nFrames;++i){ outputs[c][i]=0.f; } }
  // TODO: mix active voices, apply envelopes, handle jumps/loops with short crossfade
}

} // namespace SquirrelAudio
