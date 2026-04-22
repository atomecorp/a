add_library(dsp_core STATIC
  dsp_core.cpp
  ring_buffer.cpp
)

target_include_directories(dsp_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

# For Apple, we may use AVFoundation in disk_reader later
if(APPLE)
  find_library(AVFOUNDATION_FRAMEWORK AVFoundation)
  if(AVFOUNDATION_FRAMEWORK)
    target_link_libraries(dsp_core PUBLIC "${AVFOUNDATION_FRAMEWORK}")
  endif()
  target_sources(dsp_core PRIVATE disk_reader_apple.mm)
else()
  target_sources(dsp_core PRIVATE disk_reader.cpp)
endif()

# Consumers may add platform-specific I/O, keep this target lean
