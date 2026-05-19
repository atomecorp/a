cmake_minimum_required(VERSION 3.20)

project(atome_audio LANGUAGES C CXX)

option(ATOME_BUILD_WAM "Build Web WAM target (Emscripten)" OFF)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")

add_subdirectory(atome/engines/audio/core)

if(ATOME_BUILD_WAM)
  if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/atome/src/web/CMakeLists.txt")
    add_subdirectory(atome/src/web)
  else()
    message(STATUS "WAM target requested but atome/src/web missing; skipping (will relocate WAM glue later)")
  endif()
endif()
