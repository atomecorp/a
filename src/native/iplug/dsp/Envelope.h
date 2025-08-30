#pragma once
// Simple per-voice envelope (attack/decay/sustain/release) skeleton

#include <cstdint>

struct EnvelopeADSR { float a{0.001f}, d{0.05f}, s{0.8f}, r{0.1f}; };

class Envelope {
public:
  void set(const EnvelopeADSR& e){ env = e; }
  void noteOn(){ state=Attack; t=0; }
  void noteOff(){ state=Release; t=0; }
  float process(float sr){
    // naive linear segments (skeleton)
    switch(state){
      case Attack: { float g = (env.a<=0? 1.f : (t/env.a)); if(g>=1){g=1; state=Decay; t=0;} t+=1.f/sr; return g; }
      case Decay:  { float g = 1.f - (env.s) * (t/env.d); if(t>=env.d){ g=env.s; state=Sustain; } t+=1.f/sr; return g; }
      case Sustain:{ return env.s; }
      case Release:{ float g = env.s * (1.f - (t/env.r)); if(t>=env.r){ g=0.f; state=Idle; } t+=1.f/sr; return g; }
      default: return 0.f;
    }
  }
private:
  enum { Idle, Attack, Decay, Sustain, Release } state{Idle};
  float t{0};
  EnvelopeADSR env{};
};
