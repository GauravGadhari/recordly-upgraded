cmake_minimum_required(VERSION 3.20)
project(cursor-monitor LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if (WIN32)
    add_executable(cursor-monitor src/main.cpp)
    target_link_libraries(cursor-monitor PRIVATE user32)
elseif (UNIX AND NOT APPLE)
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(DBUS REQUIRED dbus-1)
    pkg_check_modules(EVDEV REQUIRED libevdev)

    add_executable(cursor-monitor-linux src/linux_main.cpp)
    target_include_directories(cursor-monitor-linux PRIVATE ${DBUS_INCLUDE_DIRS} ${EVDEV_INCLUDE_DIRS})
    target_link_libraries(cursor-monitor-linux PRIVATE ${DBUS_LIBRARIES} ${EVDEV_LIBRARIES} pthread)
endif()
