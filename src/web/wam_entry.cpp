#include "../core/dsp_core.h"

// Minimal glue stub for WAM build; actual iPlug2 WAM node hookup to be implemented
extern "C" {
  atome::DSPCore* atome_create_core(double sampleRate, int channels, int ringFrames) {
    auto* core = new atome::DSPCore();
    core->init(sampleRate, channels, ringFrames);
    return core;
  }
  void atome_destroy_core(atome::DSPCore* core) { delete core; }
  void atome_set_param(atome::DSPCore* core, int id, float value) {
    core->setParameter(static_cast<atome::ParamId>(id), value);
  }
  void atome_process(atome::DSPCore* core, const float* const* in, float* const* out, int ch, int n) {
    core->process(in, out, ch, n);
  }
}
