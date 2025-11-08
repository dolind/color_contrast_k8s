cmake_minimum_required(VERSION 3.25)
project(cpu-demo LANGUAGES CXX VERSION 0.1.0)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(cpu-demo
  main.cpp
)

find_package(Threads REQUIRED)
add_definitions(-DCPPHTTPLIB_OPENSSL_SUPPORT)
target_link_libraries(cpu-demo PRIVATE Threads::Threads ssl crypto)


target_compile_options(cpu-demo PRIVATE -O2 -pipe -Wall)

# use static linking to simplify docker image
target_link_options(cpu-demo PRIVATE -static)

# use link-time optimization to reduce file size of static build
include(CheckIPOSupported)
check_ipo_supported(RESULT lto_supported OUTPUT lto_msg)
set_property(TARGET cpu-demo PROPERTY INTERPROCEDURAL_OPTIMIZATION TRUE)

install(TARGETS cpu-demo RUNTIME DESTINATION bin)
