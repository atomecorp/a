#pragma once
// Minimal C++ API for Player to be used by AUv3 and Web bridge
// Note: Skeleton only; implement thread-safety and lock-free queues in .cpp

#include <cstdint>
#include <functional>

namespace SquirrelAudio {

struct EnvelopeADSR { float a{0.001f}, d{0.05f}, s{0.8f}, r{0.1f}; };

struct CreateClipOpts {
  const char* id;
  const char* path_or_bookmark;
  enum Mode { Preload, Stream } mode{Preload};
  float gain_db{0.f};
  float pan{0.f};
  EnvelopeADSR envelope_default{};
};

struct PlayOpts {
  const char* clip_id;
  int64_t start_frame{0};
  int64_t end_frame{-1};
  int xfade_samples{64};
  float velocity{1.f};
  float pitch_cents{0.f};
  float gain_db_delta{0.f};
  float pan_delta{0.f};
};

struct Event {
  enum Type { VoiceStarted, VoiceEnded, MarkerHit, FollowActionFired, ClipStreamXrun } type; 
  const char* clip_id; const char* voice_id; const char* marker; int64_t frame{0}; int underruns{0};
};

using EventSink = std::function<void(const Event&)>;

class PlayerAPI {
public:
  virtual ~PlayerAPI() {}
  virtual void setEventSink(EventSink sink) = 0;

  // UI thread (via bridge) -> schedule
  virtual bool create_clip(const CreateClipOpts& opts) = 0;
  virtual bool destroy_clip(const char* id) = 0;
  virtual bool play(const PlayOpts& opts) = 0; // returns voice created
  virtual bool stop(const char* voice_id, int release_ms) = 0;
  virtual bool stop_clip(const char* clip_id, int release_ms) = 0;
  virtual bool jump(const char* voice_id, int64_t toFrame, int xfade_samples) = 0;
  virtual bool set_param(const char* target, int id, const char* name, float value) = 0;
};

} // namespace SquirrelAudio
