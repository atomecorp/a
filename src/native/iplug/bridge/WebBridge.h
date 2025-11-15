#pragma once
// Bridge: decode UI messages and push to audio thread via ring buffer; emit events back.

#include <string>
#include <functional>
#include "../include/PlayerAPI.h"

namespace SquirrelAudio {

class WebBridge {
public:
  explicit WebBridge(PlayerAPI* api): mAPI(api){}
  void onUIMessage(const std::string& json); // parse and route
  void setEmit(std::function<void(const std::string& type, const std::string& payloadJSON)> emit){ mEmit = std::move(emit); }
private:
  PlayerAPI* mAPI{nullptr};
  std::function<void(const std::string&, const std::string&)> mEmit;
};

} // namespace SquirrelAudio
