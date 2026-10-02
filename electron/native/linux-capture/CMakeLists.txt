cmake_minimum_required(VERSION 3.20)
project(linux-capture LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(PkgConfig REQUIRED)
pkg_check_modules(DBUS REQUIRED dbus-1)
pkg_check_modules(GST REQUIRED gstreamer-1.0)

add_executable(linux-capture src/main.cpp)
target_include_directories(linux-capture PRIVATE
    ${DBUS_INCLUDE_DIRS}
    ${GST_INCLUDE_DIRS}
)
target_link_libraries(linux-capture PRIVATE
    ${DBUS_LIBRARIES}
    ${GST_LIBRARIES}
    pthread
)
