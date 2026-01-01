#include "Plugin.h"
#include <IPlug_include_in_plug_src.h>
#include <IPlugConstants.h>
#include "../native/iplug/recorder/RecorderCore.h"

enum EParams {
  kParamGain = 0,
  kParamPlay,
  kParamPosition,
  kNumParams
};

Plugin::Plugin(const InstanceInfo& info)
: IPlugAPIBase(info), IPlugProcessor(info), IPlugVST3Controller(info) {
  // Parameters
  GetParam(kParamGain)->InitDouble("gain", 1.0, 0.0, 2.0, 0.01, "");
  GetParam(kParamPlay)->InitBool("play", false);
  GetParam(kParamPosition)->InitDouble("positionFrames", 0.0, 0.0, 1e12, 1.0, "frames");
}

void Plugin::OnReset() {
  const double sr = GetSampleRate();
  const int ch = std::max(1, NOutChansConnected());
  const int ringFrames = 4 * GetBlockSize();
  mCore.init(sr, ch, ringFrames);
}

void Plugin::OnParamChange(int paramIdx) {
  using atome::ParamId;
  switch(paramIdx) {
    case kParamGain: mCore.setParameter(ParamId::Gain, (float) GetParam(kParamGain)->Value()); break;
    case kParamPlay: mCore.setParameter(ParamId::Play, (float) GetParam(kParamPlay)->Value()); break;
    case kParamPosition: mCore.setParameter(ParamId::PositionFrames, (float) GetParam(kParamPosition)->Value()); break;
    default: break;
  }
}

void Plugin::ProcessBlock(sample** inputs, sample** outputs, int nFrames) {
  const int chans = NOutChansConnected();
  mCore.process((const float* const*) inputs, (float* const*) outputs, chans, nFrames);
  if (squirrel_recorder_core_source_is("plugin")) {
    squirrel_recorder_core_push((const float* const*) outputs,
                                static_cast<uint16_t>(chans),
                                static_cast<uint32_t>(nFrames));
  }
}

void Plugin::LoadFile(const char* path) {
  mCore.loadFile(path);
}
