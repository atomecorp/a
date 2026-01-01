add_library(atome_au STATIC
  Plugin.cpp
  ../native/iplug/recorder/RecorderCore.cpp
)

target_include_directories(atome_au PUBLIC ${CMAKE_CURRENT_SOURCE_DIR} ${CMAKE_CURRENT_SOURCE_DIR}/../core)

target_link_libraries(atome_au PRIVATE dsp_core iplug2_core)

# AU specific compile definitions can be added here later
