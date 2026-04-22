#pragma once
#include <IPlug_include_in_plug_hdr.h>
#include "../core/dsp_core.h"

class Plugin : public IPlugAPIBase
             , public IPlugProcessor
             , public IPlugVST3Controller
{
public:
  Plugin(const InstanceInfo& info);

  void ProcessBlock(sample** inputs, sample** outputs, int nFrames) override;
  void OnReset() override;
  void OnParamChange(int paramIdx) override;

  // Custom
  void LoadFile(const char* path);

private:
  atome::DSPCore mCore;
};
