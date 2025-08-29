include(FetchContent)

set(IPLUG2_GIT_REPO "https://github.com/iPlug2/iPlug2.git" CACHE STRING "iPlug2 repo")
set(IPLUG2_GIT_TAG "HEAD" CACHE STRING "iPlug2 ref (tag/commit)")

if(NOT TARGET iplug2_core)
  FetchContent_Declare(
    iplug2
    GIT_REPOSITORY ${IPLUG2_GIT_REPO}
    GIT_TAG        ${IPLUG2_GIT_TAG}
    GIT_SHALLOW    TRUE
  )
  FetchContent_MakeAvailable(iplug2)

  # Provide a minimal interface target exposing include dirs only
  add_library(iplug2_core INTERFACE)
  target_include_directories(iplug2_core INTERFACE
    ${iplug2_SOURCE_DIR}/IPlug
    ${iplug2_SOURCE_DIR}/IGraphics
    ${iplug2_SOURCE_DIR}/WAM
  )
  target_compile_definitions(iplug2_core INTERFACE
    -DIPLUG_NO_UI=1
  )
endif()
