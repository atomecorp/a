add_library(atome_wam STATIC
  wam_entry.cpp
)

target_include_directories(atome_wam PUBLIC ${CMAKE_CURRENT_SOURCE_DIR} ${CMAKE_CURRENT_SOURCE_DIR}/../core)

target_link_libraries(atome_wam PRIVATE dsp_core iplug2_core)

# Emscripten/WAM flags will be set by the toolchain
