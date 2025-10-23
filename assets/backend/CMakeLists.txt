cmake_minimum_required(VERSION 3.25)
project(cpu_demo LANGUAGES CXX VERSION 0.1.0)

# Options
option(BUILD_STATIC "Link libc/libstdc++ statically (bigger binary, very portable)" ON)
option(ENABLE_LTO   "Enable link-time optimization if supported" ON)

# C++ standard
set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Sources (httplib.h is header-only)
add_executable(cpu-demo
  main.cpp
)

# Threads + libm
find_package(Threads REQUIRED)
target_link_libraries(cpu-demo PRIVATE Threads::Threads m)

# Compiler/linker flags
if (CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
  target_compile_options(cpu-demo PRIVATE -O2 -pipe)
  if (BUILD_STATIC)
    # Request static linking. On glibc this can grow the binary; you can turn it OFF if you prefer dynamic.
    target_link_options(cpu-demo PRIVATE -static)
  endif()
endif()

# LTO (IPO) if available
if (ENABLE_LTO)
  include(CheckIPOSupported)
  check_ipo_supported(RESULT lto_supported OUTPUT lto_msg)
  if (lto_supported)
    set_property(TARGET cpu-demo PROPERTY INTERPROCEDURAL_OPTIMIZATION TRUE)
  endif()
endif()

# Install rule (optional)
install(TARGETS cpu-demo RUNTIME DESTINATION bin)
