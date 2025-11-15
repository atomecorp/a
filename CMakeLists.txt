cmake_minimum_required(VERSION 3.20)

project(atome_audio LANGUAGES C CXX)

option(ATOME_BUILD_AU "Build AUv3 target (iOS/macOS)" ON)
option(ATOME_BUILD_WAM "Build Web WAM target (Emscripten)" OFF)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")

# Fetch or expose iPlug2
include(${CMAKE_CURRENT_SOURCE_DIR}/cmake/deps/iplug2_fetch.cmake OPTIONAL)

add_subdirectory(src/core)

if(ATOME_BUILD_AU)
  add_subdirectory(src/au)
endif()

if(ATOME_BUILD_WAM)
  if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/src/web/CMakeLists.txt")
    add_subdirectory(src/web)
  else()
    message(STATUS "WAM target requested but src/web missing; skipping (will relocate WAM glue later)")
  endif()
endif()
