#include <iostream>
#include <vector>
#include <string>
#include <thread>
#include <atomic>
#include <chrono>
#include <cstring>
#include <cstdlib>
#include <cstdio>
#include <mutex>
#include <unordered_map>
#include <unordered_set>
#include <unistd.h>
#include <fcntl.h>
#include <dirent.h>
#include <poll.h>
#include <spawn.h>
#include <sys/wait.h>
#include <csignal>
#include <libevdev/libevdev.h>
#include <linux/input-event-codes.h>

extern char** environ;

static std::atomic<bool> g_running{true};
static std::atomic<bool> g_has_activity{true};
static std::atomic<int64_t> g_last_activity_ms{0};
static std::atomic<double> g_last_x{-1.0};
static std::atomic<double> g_last_y{-1.0};

static std::atomic<int64_t> g_last_typing_ms{0};
static std::atomic<double> g_typing_origin_x{-1.0};
static std::atomic<double> g_typing_origin_y{-1.0};

static std::atomic<bool> g_is_left_down{false};
static std::atomic<double> g_drag_start_x{-1.0};
static std::atomic<double> g_drag_start_y{-1.0};
static std::atomic<bool> g_is_dragging{false};
static std::atomic<int64_t> g_click_pointer_until_ms{0};

static std::mutex g_window_cache_mutex;
static std::unordered_map<std::string, std::string> g_window_class_cache;
static std::unordered_set<std::string> g_in_flight_queries;
static std::string g_current_window_class;

static int64_t now_ms() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now().time_since_epoch()
    ).count();
}

static bool is_text_typing_key(unsigned int code) {
    if (code >= KEY_1 && code <= KEY_EQUAL) return true;
    if (code == KEY_BACKSPACE || code == KEY_TAB) return true;
    if (code >= KEY_Q && code <= KEY_RIGHTBRACE) return true;
    if (code == KEY_ENTER) return true;
    if (code >= KEY_A && code <= KEY_GRAVE) return true;
    if (code >= KEY_BACKSLASH && code <= KEY_SLASH) return true;
    if (code == KEY_SPACE) return true;
    if (code >= KEY_KP7 && code <= KEY_KPDOT) return true;
    if (code == KEY_KPENTER) return true;
    if (code == KEY_DELETE) return true;
    if (code >= KEY_HOME && code <= KEY_PAGEDOWN) return true;
    return false;
}

static bool is_terminal_window(const std::string& cls) {
    if (cls.empty()) return false;
    static const char* terminals[] = {
        "konsole", "kitty", "alacritty", "xterm", "gnome-terminal",
        "wezterm", "terminal", "urxvt", "tilix", "terminator", "foot"
    };
    for (const char* t : terminals) {
        if (cls.find(t) != std::string::npos) return true;
    }
    return false;
}

static void update_window_class(const std::string& wid) {
    if (wid.size() < 36 || wid.front() != '{' || wid.back() != '}') {
        std::lock_guard<std::mutex> lock(g_window_cache_mutex);
        g_current_window_class = "desktop";
        return;
    }

    {
        std::lock_guard<std::mutex> lock(g_window_cache_mutex);
        auto it = g_window_class_cache.find(wid);
        if (it != g_window_class_cache.end()) {
            g_current_window_class = it->second;
            return;
        }
        if (g_in_flight_queries.count(wid)) {
            return;
        }
        g_in_flight_queries.insert(wid);
    }

    std::thread([wid]() {
        int p[2];
        if (pipe(p) < 0) {
            std::lock_guard<std::mutex> lock(g_window_cache_mutex);
            g_in_flight_queries.erase(wid);
            return;
        }

        posix_spawn_file_actions_t actions;
        posix_spawn_file_actions_init(&actions);
        posix_spawn_file_actions_adddup2(&actions, p[1], STDOUT_FILENO);
        posix_spawn_file_actions_addclose(&actions, p[0]);
        posix_spawn_file_actions_addclose(&actions, p[1]);

        const char* argv[] = {"kdotool", "getwindowclassname", wid.c_str(), nullptr};
        pid_t pid;
        int status = posix_spawnp(&pid, "kdotool", &actions, nullptr, const_cast<char* const*>(argv), environ);
        posix_spawn_file_actions_destroy(&actions);
        close(p[1]);

        if (status == 0) {
            char buf[128];
            ssize_t n = read(p[0], buf, sizeof(buf) - 1);
            close(p[0]);
            waitpid(pid, nullptr, 0);

            if (n > 0) {
                while (n > 0 && (buf[n - 1] == '\n' || buf[n - 1] == '\r' || buf[n - 1] == ' ')) {
                    n--;
                }
                buf[n] = '\0';
                std::string cls(buf);
                for (char& c : cls) c = tolower(c);

                std::lock_guard<std::mutex> lock(g_window_cache_mutex);
                g_window_class_cache[wid] = cls;
                g_current_window_class = cls;
                g_in_flight_queries.erase(wid);
                return;
            }
        } else {
            close(p[0]);
        }

        std::lock_guard<std::mutex> lock(g_window_cache_mutex);
        g_in_flight_queries.erase(wid);
    }).detach();
}

static bool query_kdotool(double& x, double& y, std::string& wid) {
    int p[2];
    if (pipe(p) < 0) return false;

    posix_spawn_file_actions_t actions;
    posix_spawn_file_actions_init(&actions);
    posix_spawn_file_actions_adddup2(&actions, p[1], STDOUT_FILENO);
    posix_spawn_file_actions_addclose(&actions, p[0]);
    posix_spawn_file_actions_addclose(&actions, p[1]);

    const char* argv[] = {"kdotool", "getmouselocation", nullptr};
    pid_t pid;
    int status = posix_spawnp(&pid, "kdotool", &actions, nullptr, const_cast<char* const*>(argv), environ);
    posix_spawn_file_actions_destroy(&actions);
    close(p[1]);

    if (status != 0) {
        close(p[0]);
        return false;
    }

    char buf[256];
    ssize_t n = read(p[0], buf, sizeof(buf) - 1);
    close(p[0]);
    waitpid(pid, nullptr, 0);

    if (n > 0) {
        buf[n] = '\0';
        char* px = strstr(buf, "x:");
        char* py = strstr(buf, "y:");
        if (px && py) {
            x = atof(px + 2);
            y = atof(py + 2);

            char* pw = strstr(buf, "window:");
            if (pw) {
                char* w_start = pw + 7;
                char* w_end = w_start;
                while (*w_end && *w_end != ' ' && *w_end != '\n' && *w_end != '\r') {
                    w_end++;
                }
                wid.assign(w_start, w_end - w_start);
            } else {
                wid.clear();
            }
            return true;
        }
    }
    return false;
}

struct EvDevice {
    int fd;
    struct libevdev* dev;
};

static void evdev_thread_func() {
    std::vector<EvDevice> devices;
    DIR* dir = opendir("/dev/input");
    if (dir) {
        struct dirent* entry;
        while ((entry = readdir(dir)) != nullptr) {
            if (strncmp(entry->d_name, "event", 5) == 0) {
                std::string path = std::string("/dev/input/") + entry->d_name;
                int fd = open(path.c_str(), O_RDONLY | O_NONBLOCK);
                if (fd >= 0) {
                    struct libevdev* dev = nullptr;
                    if (libevdev_new_from_fd(fd, &dev) == 0) {
                        bool is_pointer = false;
                        if (libevdev_has_event_type(dev, EV_KEY) &&
                            (libevdev_has_event_code(dev, EV_KEY, BTN_LEFT) ||
                             libevdev_has_event_code(dev, EV_KEY, BTN_MOUSE) ||
                             libevdev_has_event_code(dev, EV_KEY, BTN_TOUCH))) {
                            is_pointer = true;
                        }
                        if (libevdev_has_event_type(dev, EV_REL) &&
                            (libevdev_has_event_code(dev, EV_REL, REL_X) ||
                             libevdev_has_event_code(dev, EV_REL, REL_Y))) {
                            is_pointer = true;
                        }
                        if (libevdev_has_event_type(dev, EV_ABS) &&
                            (libevdev_has_event_code(dev, EV_ABS, ABS_X) ||
                             libevdev_has_event_code(dev, EV_ABS, ABS_MT_POSITION_X))) {
                            is_pointer = true;
                        }

                        bool is_keyboard = false;
                        if (libevdev_has_event_type(dev, EV_KEY) &&
                            libevdev_has_event_code(dev, EV_KEY, KEY_A) &&
                            libevdev_has_event_code(dev, EV_KEY, KEY_SPACE)) {
                            is_keyboard = true;
                        }

                        if (is_pointer || is_keyboard) {
                            devices.push_back({fd, dev});
                            continue;
                        }
                        libevdev_free(dev);
                    }
                    close(fd);
                }
            }
        }
        closedir(dir);
    }

    if (devices.empty()) return;

    std::vector<struct pollfd> fds(devices.size());
    for (size_t i = 0; i < devices.size(); ++i) {
        fds[i].fd = devices[i].fd;
        fds[i].events = POLLIN;
        fds[i].revents = 0;
    }

    while (g_running.load()) {
        int ret = poll(fds.data(), fds.size(), 20);
        if (ret > 0) {
            for (size_t i = 0; i < devices.size(); ++i) {
                if (fds[i].revents & POLLIN) {
                    struct input_event ev;
                    while (libevdev_next_event(devices[i].dev, LIBEVDEV_READ_FLAG_NORMAL, &ev) == LIBEVDEV_READ_STATUS_SUCCESS) {
                        g_has_activity.store(true);
                        g_last_activity_ms.store(now_ms());

                        if (ev.type == EV_REL || ev.type == EV_ABS) {
                            // Activity is recorded
                        } else if (ev.type == EV_KEY) {
                            if (ev.code < 0x100) {
                                if (ev.value == 1) {
                                    std::cout << "KEY:down:" << ev.code << "\n";
                                    std::cout.flush();
                                } else if (ev.value == 0) {
                                    std::cout << "KEY:up:" << ev.code << "\n";
                                    std::cout.flush();
                                }
                            }

                            if ((ev.value == 1 || ev.value == 2) && is_text_typing_key(ev.code)) {
                                g_last_typing_ms.store(now_ms());
                                g_typing_origin_x.store(g_last_x.load());
                                g_typing_origin_y.store(g_last_y.load());
                            }

                            // Handle touchpad tap-to-drag gesture
                            static int64_t s_last_touch_down_ms = 0;
                            static int64_t s_last_touch_up_ms = 0;
                            static bool s_is_tap_drag = false;

                            if (ev.code == BTN_TOUCH) {
                                int64_t now = now_ms();
                                if (ev.value == 1) {
                                    int64_t tap_duration = s_last_touch_up_ms - s_last_touch_down_ms;
                                    int64_t tap_gap = now - s_last_touch_up_ms;
                                    if (tap_duration > 15 && tap_duration < 320 && tap_gap < 350) {
                                        s_is_tap_drag = true;
                                        g_is_left_down.store(true);
                                        g_drag_start_x.store(g_last_x.load());
                                        g_drag_start_y.store(g_last_y.load());
                                        g_is_dragging.store(false);
                                        std::cout << "INTERACTION:mousedown:1\n";
                                        std::cout.flush();
                                    } else {
                                        s_is_tap_drag = false;
                                    }
                                    s_last_touch_down_ms = now;
                                } else if (ev.value == 0) {
                                    int64_t tap_duration = now - s_last_touch_down_ms;
                                    s_last_touch_up_ms = now;
                                    if (s_is_tap_drag) {
                                        s_is_tap_drag = false;
                                        g_is_left_down.store(false);
                                        g_is_dragging.store(false);
                                        std::cout << "INTERACTION:mouseup\n";
                                        std::cout.flush();
                                    } else if (tap_duration >= 15 && tap_duration <= 350) {
                                        // Standard touchpad tap click
                                        double x = g_last_x.load();
                                        double y = g_last_y.load();
                                        if (x >= 0 && y >= 0) {
                                            std::cout << "POSITION:" << x << ":" << y << "\n";
                                        }
                                        std::cout << "INTERACTION:mousedown:1\n";
                                        std::cout << "INTERACTION:mouseup\n";
                                        std::cout.flush();
                                    }
                                }
                            }

                            int btn = -1;
                            if (ev.code == BTN_LEFT || ev.code == BTN_MOUSE) btn = 1;
                            else if (ev.code == BTN_RIGHT) btn = 2;
                            else if (ev.code == BTN_MIDDLE) btn = 3;
                            else if (ev.code == BTN_SIDE || ev.code == BTN_EXTRA || ev.code == BTN_FORWARD || ev.code == BTN_BACK) btn = 1;

                            if (btn > 0) {
                                if (btn == 1) {
                                    if (ev.value == 1) {
                                        g_is_left_down.store(true);
                                        g_drag_start_x.store(g_last_x.load());
                                        g_drag_start_y.store(g_last_y.load());
                                        g_is_dragging.store(false);
                                        g_click_pointer_until_ms.store(now_ms() + 180);
                                    } else if (ev.value == 0) {
                                        g_is_left_down.store(false);
                                        g_is_dragging.store(false);
                                    }
                                }

                                if (ev.value == 1) {
                                    double x = g_last_x.load();
                                    double y = g_last_y.load();
                                    if (x >= 0 && y >= 0) {
                                        std::cout << "POSITION:" << x << ":" << y << "\n";
                                    }
                                    std::cout << "INTERACTION:mousedown:" << btn << "\n";
                                    std::cout.flush();
                                } else if (ev.value == 0) {
                                    std::cout << "INTERACTION:mouseup\n";
                                    std::cout.flush();
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    for (auto& d : devices) {
        libevdev_free(d.dev);
        close(d.fd);
    }
}

static void tracking_thread_func() {
    double last_emitted_x = -1;
    double last_emitted_y = -1;
    std::string last_emitted_state = "arrow";
    std::string last_window_id;

    // Initial query on startup
    double x = 0, y = 0;
    std::string wid;
    if (query_kdotool(x, y, wid)) {
        g_last_x.store(x);
        g_last_y.store(y);
        last_emitted_x = x;
        last_emitted_y = y;
        last_window_id = wid;
        update_window_class(wid);
        std::cout << "POSITION:" << x << ":" << y << "\n";
        std::cout << "STATE:arrow\n";
        std::cout.flush();
    }

    while (g_running.load()) {
        int64_t current = now_ms();
        if (g_has_activity.load() || (current - g_last_activity_ms.load() < 250)) {
            g_has_activity.store(false);
            auto t0 = std::chrono::steady_clock::now();
            if (query_kdotool(x, y, wid)) {
                g_last_x.store(x);
                g_last_y.store(y);
                if (x != last_emitted_x || y != last_emitted_y) {
                    last_emitted_x = x;
                    last_emitted_y = y;
                    std::cout << "POSITION:" << x << ":" << y << "\n";
                    std::cout.flush();
                }

                if (!wid.empty() && wid != last_window_id) {
                    last_window_id = wid;
                    update_window_class(wid);
                }

                if (g_is_left_down.load() && !g_is_dragging.load()) {
                    double sx = g_drag_start_x.load();
                    double sy = g_drag_start_y.load();
                    if (sx >= 0 && sy >= 0 && x >= 0 && y >= 0) {
                        double d2 = (x - sx) * (x - sx) + (y - sy) * (y - sy);
                        if (d2 > 25.0) {
                            g_is_dragging.store(true);
                        }
                    }
                }
            }

            std::string current_state = "arrow";
            int64_t now = now_ms();
            bool is_dragging = g_is_dragging.load();
            int64_t last_typing = g_last_typing_ms.load();
            bool recently_typed = (now - last_typing < 2200);

            double cur_x = g_last_x.load();
            double cur_y = g_last_y.load();
            double orig_x = g_typing_origin_x.load();
            double orig_y = g_typing_origin_y.load();
            double dist_sq = (cur_x - orig_x) * (cur_x - orig_x) + (cur_y - orig_y) * (cur_y - orig_y);

            std::string current_win_class;
            {
                std::lock_guard<std::mutex> lock(g_window_cache_mutex);
                current_win_class = g_current_window_class;
            }
            bool in_terminal = is_terminal_window(current_win_class);

            if (is_dragging) {
                if (recently_typed || in_terminal) {
                    current_state = "text";
                } else {
                    current_state = "closed-hand";
                }
            } else if (recently_typed && (orig_x < 0 || dist_sq < 3600.0)) {
                current_state = "text";
            } else if (in_terminal) {
                current_state = "text";
            } else if (now < g_click_pointer_until_ms.load()) {
                current_state = "pointer";
            } else {
                current_state = "arrow";
            }

            if (current_state != last_emitted_state) {
                last_emitted_state = current_state;
                std::cout << "STATE:" << current_state << "\n";
                std::cout.flush();
            }

            auto query_time = std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::steady_clock::now() - t0
            ).count();
            if (query_time < 16) {
                std::this_thread::sleep_for(std::chrono::milliseconds(16 - query_time));
            }
        } else {
            std::string current_state = "arrow";
            int64_t now = now_ms();
            int64_t last_typing = g_last_typing_ms.load();
            bool recently_typed = (now - last_typing < 2200);
            std::string current_win_class;
            {
                std::lock_guard<std::mutex> lock(g_window_cache_mutex);
                current_win_class = g_current_window_class;
            }
            bool in_terminal = is_terminal_window(current_win_class);

            if (recently_typed) {
                current_state = "text";
            } else if (in_terminal) {
                current_state = "text";
            } else if (now < g_click_pointer_until_ms.load()) {
                current_state = "pointer";
            } else {
                current_state = "arrow";
            }

            if (current_state != last_emitted_state) {
                last_emitted_state = current_state;
                std::cout << "STATE:" << current_state << "\n";
                std::cout.flush();
            }

            std::this_thread::sleep_for(std::chrono::milliseconds(20));
        }
    }
}

static void heartbeat_thread_func() {
    while (g_running.load()) {
        std::this_thread::sleep_for(std::chrono::milliseconds(300));
        int64_t current = now_ms();
        if (current - g_last_activity_ms.load() >= 250) {
            double x = g_last_x.load();
            double y = g_last_y.load();
            if (x >= 0 && y >= 0) {
                std::cout << "POSITION:" << x << ":" << y << "\n";
                std::cout.flush();
            }
        }
    }
}

static void sig_handler(int) {
    g_running.store(false);
}

int main() {
    std::setvbuf(stdout, nullptr, _IONBF, 0);

    signal(SIGINT, sig_handler);
    signal(SIGTERM, sig_handler);
    signal(SIGHUP, sig_handler);

    g_last_activity_ms.store(now_ms());

    std::thread tracking_t(tracking_thread_func);
    std::thread evdev_t(evdev_thread_func);
    std::thread heartbeat_t(heartbeat_thread_func);

    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.find("stop") != std::string::npos) {
            break;
        }
    }
    g_running.store(false);

    if (tracking_t.joinable()) tracking_t.join();
    if (evdev_t.joinable()) evdev_t.join();
    if (heartbeat_t.joinable()) heartbeat_t.join();

    return 0;
}
