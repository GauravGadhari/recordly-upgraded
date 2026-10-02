/**
 * Recordly Native Linux Capture Helper (C++)
 *
 * Communicates with org.freedesktop.portal.ScreenCast via D-Bus requesting
 * cursor_mode=1 (Hidden), obtains a PipeWire FD + node_id, and records
 * clean 60fps video using GStreamer with hardware acceleration (VA-API).
 *
 * Protocol (matches windows-capture):
 *   - Config: JSON in argv[1] with { outputPath, fps }
 *   - stdout: "Recording started\n" / "Recording stopped. Output path: <path>\n"
 *   - stdin:  "stop\n" / "pause\n" / "resume\n"
 *
 * Build: cmake -B build && cmake --build build
 * Deps:  libdbus-1-dev libgstreamer1.0-dev
 */

#include <dbus/dbus.h>
#include <gst/gst.h>

#include <atomic>
#include <cerrno>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <mutex>
#include <condition_variable>
#include <random>
#include <sstream>
#include <string>
#include <thread>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/types.h>

// ─── Global stop/pause state ───────────────────────────────────────────────
static std::atomic<bool> g_stopRequested{false};
static std::atomic<bool> g_pauseRequested{false};
static std::mutex g_stopMutex;
static std::condition_variable g_stopCv;

// ─── D-Bus constants ───────────────────────────────────────────────────────
static const char* PORTAL_BUS     = "org.freedesktop.portal.Desktop";
static const char* PORTAL_PATH    = "/org/freedesktop/portal/desktop";
static const char* SCREENCAST_IF  = "org.freedesktop.portal.ScreenCast";
static const char* REQUEST_IF     = "org.freedesktop.portal.Request";
static const char* SESSION_IF     = "org.freedesktop.portal.Session";

// ─── Config ────────────────────────────────────────────────────────────────
struct CaptureConfig {
    std::string outputPath;
    int fps = 60;
    int cursorMode = 1; // 1=Hidden, 2=Embedded
};

// ─── Minimal JSON parser (matches windows-capture style) ───────────────────
static bool parseConfig(const std::string& json, CaptureConfig& cfg) {
    auto findString = [&](const std::string& key) -> std::string {
        auto pos = json.find("\"" + key + "\"");
        if (pos == std::string::npos) return "";
        pos = json.find(':', pos);
        if (pos == std::string::npos) return "";
        pos++;
        while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
        if (pos >= json.size() || json[pos] != '"') return "";
        pos++;
        std::string result;
        while (pos < json.size() && json[pos] != '"') {
            if (json[pos] == '\\' && pos + 1 < json.size()) {
                pos++;
                if (json[pos] == 'n') result += '\n';
                else if (json[pos] == 't') result += '\t';
                else if (json[pos] == '\\') result += '\\';
                else if (json[pos] == '"') result += '"';
                else if (json[pos] == '/') result += '/';
                else result += json[pos];
            } else {
                result += json[pos];
            }
            pos++;
        }
        return result;
    };

    auto findInt = [&](const std::string& key) -> int {
        auto pos = json.find("\"" + key + "\"");
        if (pos == std::string::npos) return -1;
        pos = json.find(':', pos);
        if (pos == std::string::npos) return -1;
        pos++;
        while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
        try {
            return std::stoi(json.substr(pos));
        } catch (...) {
            return -1;
        }
    };

    cfg.outputPath = findString("outputPath");
    if (cfg.outputPath.empty()) return false;

    int fps = findInt("fps");
    if (fps > 0) cfg.fps = fps;

    int cm = findInt("cursorMode");
    if (cm > 0) cfg.cursorMode = cm;

    return true;
}

// ─── Random token generator ────────────────────────────────────────────────
static std::string randomToken(const std::string& prefix) {
    static std::mt19937 rng(std::random_device{}());
    static const char hex[] = "0123456789abcdef";
    std::string tok = prefix;
    for (int i = 0; i < 8; i++) tok += hex[rng() % 16];
    return tok;
}

// ─── Ensure output directory exists ────────────────────────────────────────
static void ensureParentDirExists(const std::string& path) {
    auto slash = path.rfind('/');
    if (slash != std::string::npos && slash > 0) {
        std::string dir = path.substr(0, slash);
        // Recursive mkdir -p
        for (size_t i = 1; i < dir.size(); i++) {
            if (dir[i] == '/') {
                dir[i] = '\0';
                mkdir(dir.c_str(), 0755);
                dir[i] = '/';
            }
        }
        mkdir(dir.c_str(), 0755);
    }
}

// ─── Get the unique sender name from D-Bus, sanitized for portal paths ─────
static std::string getSenderId(DBusConnection* conn) {
    const char* name = dbus_bus_get_unique_name(conn);
    if (!name) return "";
    std::string s(name);
    // Strip leading ':'
    if (!s.empty() && s[0] == ':') s = s.substr(1);
    // Replace '.' with '_'
    for (auto& c : s) {
        if (c == '.') c = '_';
    }
    return s;
}

// ─── Wait for a D-Bus Response signal on a request handle ──────────────────
// Returns: response_code (0 = success), and populates result iterator.
// The caller must dbus_message_unref the returned message.
static int waitForResponse(DBusConnection* conn, const std::string& requestHandle,
                           DBusMessage** outMsg, int timeoutMs = 30000) {
    // Subscribe to the Response signal on this specific handle
    std::string matchRule = "type='signal',interface='" + std::string(REQUEST_IF) +
                            "',member='Response',path='" + requestHandle + "'";
    DBusError err;
    dbus_error_init(&err);
    dbus_bus_add_match(conn, matchRule.c_str(), &err);
    if (dbus_error_is_set(&err)) {
        std::cerr << "ERROR: dbus_bus_add_match failed: " << err.message << std::endl;
        dbus_error_free(&err);
        return -1;
    }
    dbus_connection_flush(conn);

    // Poll for the signal
    int elapsed = 0;
    const int step = 50; // ms
    while (elapsed < timeoutMs && !g_stopRequested) {
        dbus_connection_read_write(conn, step);
        DBusMessage* msg = dbus_connection_pop_message(conn);
        if (msg) {
            if (dbus_message_is_signal(msg, REQUEST_IF, "Response")) {
                const char* msgPath = dbus_message_get_path(msg);
                if (msgPath && requestHandle == msgPath) {
                    // Parse response_code (first arg, uint32)
                    DBusMessageIter iter;
                    dbus_message_iter_init(msg, &iter);
                    if (dbus_message_iter_get_arg_type(&iter) == DBUS_TYPE_UINT32) {
                        dbus_uint32_t code;
                        dbus_message_iter_get_basic(&iter, &code);
                        dbus_bus_remove_match(conn, matchRule.c_str(), nullptr);
                        *outMsg = msg;
                        return (int)code;
                    }
                }
            }
            dbus_message_unref(msg);
        }
        elapsed += step;
    }

    dbus_bus_remove_match(conn, matchRule.c_str(), nullptr);
    return -1; // timeout
}

// ─── D-Bus dict builder helpers ────────────────────────────────────────────
static void dictOpenEntry(DBusMessageIter* dict, DBusMessageIter* entry,
                          const char* key) {
    dbus_message_iter_open_container(dict, DBUS_TYPE_DICT_ENTRY, nullptr, entry);
    dbus_message_iter_append_basic(entry, DBUS_TYPE_STRING, &key);
}

static void dictAppendString(DBusMessageIter* dict, const char* key, const char* val) {
    DBusMessageIter entry, variant;
    dictOpenEntry(dict, &entry, key);
    dbus_message_iter_open_container(&entry, DBUS_TYPE_VARIANT, "s", &variant);
    dbus_message_iter_append_basic(&variant, DBUS_TYPE_STRING, &val);
    dbus_message_iter_close_container(&entry, &variant);
    dbus_message_iter_close_container(dict, &entry);
}

static void dictAppendUint32(DBusMessageIter* dict, const char* key, dbus_uint32_t val) {
    DBusMessageIter entry, variant;
    dictOpenEntry(dict, &entry, key);
    dbus_message_iter_open_container(&entry, DBUS_TYPE_VARIANT, "u", &variant);
    dbus_message_iter_append_basic(&variant, DBUS_TYPE_UINT32, &val);
    dbus_message_iter_close_container(&entry, &variant);
    dbus_message_iter_close_container(dict, &entry);
}

static void dictAppendBool(DBusMessageIter* dict, const char* key, dbus_bool_t val) {
    DBusMessageIter entry, variant;
    dictOpenEntry(dict, &entry, key);
    dbus_message_iter_open_container(&entry, DBUS_TYPE_VARIANT, "b", &variant);
    dbus_message_iter_append_basic(&variant, DBUS_TYPE_BOOLEAN, &val);
    dbus_message_iter_close_container(&entry, &variant);
    dbus_message_iter_close_container(dict, &entry);
}

// ─── Portal: CreateSession ─────────────────────────────────────────────────
static std::string portalCreateSession(DBusConnection* conn) {
    std::string sessToken = randomToken("session_");
    std::string reqToken  = randomToken("req_");
    std::string senderId  = getSenderId(conn);
    std::string expectedHandle = "/org/freedesktop/portal/desktop/request/" + senderId + "/" + reqToken;

    DBusMessage* call = dbus_message_new_method_call(
        PORTAL_BUS, PORTAL_PATH, SCREENCAST_IF, "CreateSession");
    if (!call) return "";

    // Build options dict: { session_handle_token: s, handle_token: s }
    DBusMessageIter args, dict;
    dbus_message_iter_init_append(call, &args);
    dbus_message_iter_open_container(&args, DBUS_TYPE_ARRAY, "{sv}", &dict);
    dictAppendString(&dict, "session_handle_token", sessToken.c_str());
    dictAppendString(&dict, "handle_token", reqToken.c_str());
    dbus_message_iter_close_container(&args, &dict);

    DBusError err;
    dbus_error_init(&err);
    DBusMessage* reply = dbus_connection_send_with_reply_and_block(conn, call, 5000, &err);
    dbus_message_unref(call);
    if (dbus_error_is_set(&err)) {
        std::cerr << "ERROR: CreateSession call failed: " << err.message << std::endl;
        dbus_error_free(&err);
        return "";
    }
    if (reply) {
        DBusMessageIter rIter;
        if (dbus_message_iter_init(reply, &rIter) &&
            dbus_message_iter_get_arg_type(&rIter) == DBUS_TYPE_OBJECT_PATH) {
            const char* op = nullptr;
            dbus_message_iter_get_basic(&rIter, &op);
            if (op && op[0]) expectedHandle = op;
        }
        dbus_message_unref(reply);
    }

    // Wait for Response signal
    DBusMessage* respMsg = nullptr;
    int code = waitForResponse(conn, expectedHandle, &respMsg);
    if (code != 0 || !respMsg) {
        std::cerr << "ERROR: CreateSession response code=" << code << std::endl;
        if (respMsg) dbus_message_unref(respMsg);
        return "";
    }

    // Extract session_handle from Response dict (2nd arg = a{sv})
    DBusMessageIter respIter;
    dbus_message_iter_init(respMsg, &respIter);
    // Skip uint32 response_code
    dbus_message_iter_next(&respIter);

    std::string sessionHandle;
    if (dbus_message_iter_get_arg_type(&respIter) == DBUS_TYPE_ARRAY) {
        DBusMessageIter dictIter;
        dbus_message_iter_recurse(&respIter, &dictIter);
        while (dbus_message_iter_get_arg_type(&dictIter) == DBUS_TYPE_DICT_ENTRY) {
            DBusMessageIter entryIter;
            dbus_message_iter_recurse(&dictIter, &entryIter);
            const char* key = nullptr;
            dbus_message_iter_get_basic(&entryIter, &key);
            dbus_message_iter_next(&entryIter);
            if (key && std::string(key) == "session_handle") {
                DBusMessageIter variantIter;
                dbus_message_iter_recurse(&entryIter, &variantIter);
                if (dbus_message_iter_get_arg_type(&variantIter) == DBUS_TYPE_STRING) {
                    const char* val = nullptr;
                    dbus_message_iter_get_basic(&variantIter, &val);
                    if (val) sessionHandle = val;
                }
            }
            dbus_message_iter_next(&dictIter);
        }
    }
    dbus_message_unref(respMsg);

    if (sessionHandle.empty()) {
        std::cerr << "ERROR: No session_handle in CreateSession response" << std::endl;
    }
    return sessionHandle;
}

// ─── Portal: SelectSources ─────────────────────────────────────────────────
static bool portalSelectSources(DBusConnection* conn, const std::string& sessionHandle,
                                int cursorMode) {
    std::string reqToken = randomToken("req_");
    std::string senderId = getSenderId(conn);
    std::string expectedHandle = "/org/freedesktop/portal/desktop/request/" + senderId + "/" + reqToken;

    DBusMessage* call = dbus_message_new_method_call(
        PORTAL_BUS, PORTAL_PATH, SCREENCAST_IF, "SelectSources");
    if (!call) return false;

    // Args: (o session_handle, a{sv} options)
    const char* sh = sessionHandle.c_str();
    DBusMessageIter args, dict;
    dbus_message_iter_init_append(call, &args);
    dbus_message_iter_append_basic(&args, DBUS_TYPE_OBJECT_PATH, &sh);
    dbus_message_iter_open_container(&args, DBUS_TYPE_ARRAY, "{sv}", &dict);
    dictAppendUint32(&dict, "types", 1);       // 1 = Monitor
    dictAppendBool(&dict, "multiple", FALSE);
    dictAppendUint32(&dict, "cursor_mode", (dbus_uint32_t)cursorMode);
    dictAppendString(&dict, "handle_token", reqToken.c_str());
    dbus_message_iter_close_container(&args, &dict);

    DBusError err;
    dbus_error_init(&err);
    DBusMessage* reply = dbus_connection_send_with_reply_and_block(conn, call, 5000, &err);
    dbus_message_unref(call);
    if (dbus_error_is_set(&err)) {
        std::cerr << "ERROR: SelectSources call failed: " << err.message << std::endl;
        dbus_error_free(&err);
        return false;
    }
    if (reply) {
        DBusMessageIter rIter;
        if (dbus_message_iter_init(reply, &rIter) &&
            dbus_message_iter_get_arg_type(&rIter) == DBUS_TYPE_OBJECT_PATH) {
            const char* op = nullptr;
            dbus_message_iter_get_basic(&rIter, &op);
            if (op && op[0]) expectedHandle = op;
        }
        dbus_message_unref(reply);
    }

    // Wait for Response — this is when KDE shows the screen picker dialog
    DBusMessage* respMsg = nullptr;
    int code = waitForResponse(conn, expectedHandle, &respMsg, 60000); // 60s for user to pick
    if (respMsg) dbus_message_unref(respMsg);
    if (code != 0) {
        std::cerr << "ERROR: SelectSources response code=" << code << std::endl;
        return false;
    }
    return true;
}

// ─── Portal: Start ─────────────────────────────────────────────────────────
// Returns node_id via outNodeId. Returns true on success.
static bool portalStart(DBusConnection* conn, const std::string& sessionHandle,
                        uint32_t& outNodeId) {
    std::string reqToken = randomToken("req_");
    std::string senderId = getSenderId(conn);
    std::string expectedHandle = "/org/freedesktop/portal/desktop/request/" + senderId + "/" + reqToken;

    DBusMessage* call = dbus_message_new_method_call(
        PORTAL_BUS, PORTAL_PATH, SCREENCAST_IF, "Start");
    if (!call) return false;

    // Args: (o session_handle, s parent_window, a{sv} options)
    const char* sh = sessionHandle.c_str();
    const char* parentWin = "";
    DBusMessageIter args, dict;
    dbus_message_iter_init_append(call, &args);
    dbus_message_iter_append_basic(&args, DBUS_TYPE_OBJECT_PATH, &sh);
    dbus_message_iter_append_basic(&args, DBUS_TYPE_STRING, &parentWin);
    dbus_message_iter_open_container(&args, DBUS_TYPE_ARRAY, "{sv}", &dict);
    dictAppendString(&dict, "handle_token", reqToken.c_str());
    dbus_message_iter_close_container(&args, &dict);

    DBusError err;
    dbus_error_init(&err);
    DBusMessage* reply = dbus_connection_send_with_reply_and_block(conn, call, 5000, &err);
    dbus_message_unref(call);
    if (dbus_error_is_set(&err)) {
        std::cerr << "ERROR: Start call failed: " << err.message << std::endl;
        dbus_error_free(&err);
        return false;
    }
    if (reply) {
        DBusMessageIter rIter;
        if (dbus_message_iter_init(reply, &rIter) &&
            dbus_message_iter_get_arg_type(&rIter) == DBUS_TYPE_OBJECT_PATH) {
            const char* op = nullptr;
            dbus_message_iter_get_basic(&rIter, &op);
            if (op && op[0]) expectedHandle = op;
        }
        dbus_message_unref(reply);
    }

    // Wait for Response — user confirms share dialog
    DBusMessage* respMsg = nullptr;
    int code = waitForResponse(conn, expectedHandle, &respMsg, 60000);
    if (code != 0 || !respMsg) {
        std::cerr << "ERROR: Start response code=" << code << std::endl;
        if (respMsg) dbus_message_unref(respMsg);
        return false;
    }

    // Extract streams array from response dict
    // Response dict has key "streams" => a(ua{sv})
    // We need the first element's uint32 (the PipeWire node_id)
    DBusMessageIter respIter;
    dbus_message_iter_init(respMsg, &respIter);
    dbus_message_iter_next(&respIter); // skip response_code

    bool found = false;
    if (dbus_message_iter_get_arg_type(&respIter) == DBUS_TYPE_ARRAY) {
        DBusMessageIter dictIter;
        dbus_message_iter_recurse(&respIter, &dictIter);
        while (dbus_message_iter_get_arg_type(&dictIter) == DBUS_TYPE_DICT_ENTRY) {
            DBusMessageIter entryIter;
            dbus_message_iter_recurse(&dictIter, &entryIter);
            const char* key = nullptr;
            dbus_message_iter_get_basic(&entryIter, &key);
            dbus_message_iter_next(&entryIter);

            if (key && std::string(key) == "streams") {
                // variant -> a(ua{sv})
                DBusMessageIter varIter, arrIter, structIter;
                dbus_message_iter_recurse(&entryIter, &varIter);
                if (dbus_message_iter_get_arg_type(&varIter) == DBUS_TYPE_ARRAY) {
                    dbus_message_iter_recurse(&varIter, &arrIter);
                    if (dbus_message_iter_get_arg_type(&arrIter) == DBUS_TYPE_STRUCT) {
                        dbus_message_iter_recurse(&arrIter, &structIter);
                        if (dbus_message_iter_get_arg_type(&structIter) == DBUS_TYPE_UINT32) {
                            dbus_uint32_t nodeId;
                            dbus_message_iter_get_basic(&structIter, &nodeId);
                            outNodeId = nodeId;
                            found = true;
                        }
                    }
                }
            }
            dbus_message_iter_next(&dictIter);
        }
    }
    dbus_message_unref(respMsg);
    if (!found) {
        std::cerr << "ERROR: No streams in Start response" << std::endl;
    }
    return found;
}

// ─── Portal: OpenPipeWireRemote ────────────────────────────────────────────
// Returns the PipeWire fd, or -1 on failure.
static int portalOpenPipeWireRemote(DBusConnection* conn, const std::string& sessionHandle) {
    DBusMessage* call = dbus_message_new_method_call(
        PORTAL_BUS, PORTAL_PATH, SCREENCAST_IF, "OpenPipeWireRemote");
    if (!call) return -1;

    const char* sh = sessionHandle.c_str();
    DBusMessageIter args, dict;
    dbus_message_iter_init_append(call, &args);
    dbus_message_iter_append_basic(&args, DBUS_TYPE_OBJECT_PATH, &sh);
    dbus_message_iter_open_container(&args, DBUS_TYPE_ARRAY, "{sv}", &dict);
    dbus_message_iter_close_container(&args, &dict);

    DBusError err;
    dbus_error_init(&err);
    DBusMessage* reply = dbus_connection_send_with_reply_and_block(conn, call, 5000, &err);
    dbus_message_unref(call);
    if (dbus_error_is_set(&err)) {
        std::cerr << "ERROR: OpenPipeWireRemote call failed: " << err.message << std::endl;
        dbus_error_free(&err);
        return -1;
    }
    if (!reply) return -1;

    // The reply contains a unix fd (type 'h' = fd index)
    // But dbus_connection_send_with_reply_and_block does fd passing natively
    DBusMessageIter iter;
    if (!dbus_message_iter_init(reply, &iter)) {
        dbus_message_unref(reply);
        return -1;
    }

    int fd = -1;
    if (dbus_message_iter_get_arg_type(&iter) == DBUS_TYPE_UNIX_FD) {
        dbus_message_iter_get_basic(&iter, &fd);
    }
    dbus_message_unref(reply);
    return fd;
}

// ─── Portal: Close Session ─────────────────────────────────────────────────
static void portalCloseSession(DBusConnection* conn, const std::string& sessionHandle) {
    if (sessionHandle.empty()) return;
    DBusMessage* call = dbus_message_new_method_call(
        PORTAL_BUS, sessionHandle.c_str(), SESSION_IF, "Close");
    if (call) {
        DBusError err;
        dbus_error_init(&err);
        DBusMessage* reply = dbus_connection_send_with_reply_and_block(conn, call, 1000, &err);
        if (reply) dbus_message_unref(reply);
        dbus_message_unref(call);
        if (dbus_error_is_set(&err)) dbus_error_free(&err);
    }
}

// ─── Detect best GStreamer encoder ─────────────────────────────────────────
static std::string buildEncoderPipeline(const std::string& outputPath, bool forceSoftware = false) {
    bool isWebm = outputPath.size() >= 5 &&
                  outputPath.substr(outputPath.size() - 5) == ".webm";

    bool hasNvh264    = !forceSoftware && (gst_element_factory_find("nvh264enc") != nullptr);
    bool hasVaapiH264 = !forceSoftware && (gst_element_factory_find("vaapih264enc") != nullptr);
    bool hasVaH264    = !forceSoftware && (gst_element_factory_find("vah264enc") != nullptr);
    bool hasVaapiVP9  = !forceSoftware && (gst_element_factory_find("vaapivp9enc") != nullptr);
    bool hasX264      = gst_element_factory_find("x264enc") != nullptr;

    if (isWebm) {
        if (hasVaapiVP9) {
            return "vaapipostproc ! vaapivp9enc rate-control=cbr bitrate=32000 keyframe-period=60 ! webmmux";
        }
        return "videoconvert ! vp8enc bitrate=30000000 threads=8 cpu-used=4 deadline=1 ! webmmux";
    }

    // MP4 path: prioritize GPU hardware encoders for buttery-smooth 60fps with zero CPU frame-drops
    if (hasVaapiH264) {
        return "vaapih264enc rate-control=cbr bitrate=32000 keyframe-period=60 ! h264parse ! mp4mux faststart=true";
    }
    if (hasNvh264) {
        return "nvh264enc bitrate=32000 preset=low-latency-hq rc-mode=cbr gop-size=60 ! h264parse ! mp4mux faststart=true";
    }
    if (hasVaH264) {
        return "vah264enc bitrate=32000 ! h264parse ! mp4mux faststart=true";
    }
    if (hasX264) {
        return "x264enc tune=zerolatency speed-preset=ultrafast bitrate=28000 key-int-max=60 ! h264parse ! mp4mux faststart=true";
    }
    // Fallback to VP8/WebM
    return "vp8enc bitrate=28000000 threads=8 cpu-used=4 deadline=1 ! webmmux";
}

// ─── Build GStreamer capture pipeline ──────────────────────────────────────
static GstElement* createCapturePipeline(int pwFd, uint32_t nodeId, const CaptureConfig& config, bool forceSoftware) {
    std::string encoderPipeline = buildEncoderPipeline(config.outputPath, forceSoftware);

    std::ostringstream pipelineStr;
    pipelineStr << "pipewiresrc fd=" << pwFd << " path=" << nodeId
                << " always-copy=true do-timestamp=true keepalive-time=1000 min-buffers=8"
                << " ! videoconvert"
                << " ! video/x-raw,format=NV12"
                << " ! videorate"
                << " ! video/x-raw,framerate=" << config.fps << "/1"
                << " ! queue max-size-buffers=120 max-size-time=2000000000 max-size-bytes=0"
                << " ! " << encoderPipeline
                << " ! filesink location=\"" << config.outputPath << "\" sync=false";

    GError* gstErr = nullptr;
    GstElement* pipeline = gst_parse_launch(pipelineStr.str().c_str(), &gstErr);
    if (!pipeline || gstErr) {
        std::cerr << "WARN: GStreamer parse_launch failed for: " << pipelineStr.str()
                  << "\nError: " << (gstErr ? gstErr->message : "unknown") << std::endl;
        if (gstErr) g_error_free(gstErr);
        return nullptr;
    }

    std::cerr << "Pipeline configured: " << pipelineStr.str() << std::endl;
    return pipeline;
}

// ─── stdin listener thread ─────────────────────────────────────────────────
static void stdinListenerThread(GstElement* pipeline) {
    std::string line;
    while (std::getline(std::cin, line)) {
        // Trim
        while (!line.empty() && (line.back() == '\r' || line.back() == '\n' || line.back() == ' '))
            line.pop_back();

        if (line == "pause") {
            g_pauseRequested = true;
            if (pipeline) gst_element_set_state(pipeline, GST_STATE_PAUSED);
            continue;
        }
        if (line == "resume") {
            g_pauseRequested = false;
            if (pipeline) gst_element_set_state(pipeline, GST_STATE_PLAYING);
            continue;
        }
        if (line == "stop") {
            g_stopRequested = true;
            if (pipeline) gst_element_send_event(pipeline, gst_event_new_eos());
            g_stopCv.notify_all();
            return;
        }
    }
    // stdin closed (parent process died) — stop gracefully
    g_stopRequested = true;
    if (pipeline) gst_element_send_event(pipeline, gst_event_new_eos());
    g_stopCv.notify_all();
}

// ─── main ──────────────────────────────────────────────────────────────────
int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "ERROR: Missing JSON config argument" << std::endl;
        std::cerr << "Usage: linux-capture '{\"outputPath\":\"...\",\"fps\":60}'" << std::endl;
        return 1;
    }

    // Parse config
    CaptureConfig config;
    if (!parseConfig(argv[1], config)) {
        std::cerr << "ERROR: Failed to parse config JSON" << std::endl;
        return 1;
    }

    // Init GStreamer (no args needed)
    gst_init(nullptr, nullptr);

    // Connect to session D-Bus
    DBusError err;
    dbus_error_init(&err);
    DBusConnection* conn = dbus_bus_get(DBUS_BUS_SESSION, &err);
    if (dbus_error_is_set(&err) || !conn) {
        std::cerr << "ERROR: Cannot connect to session D-Bus: "
                  << (err.message ? err.message : "unknown") << std::endl;
        dbus_error_free(&err);
        return 1;
    }

    // Step 1: CreateSession
    std::string sessionHandle = portalCreateSession(conn);
    if (sessionHandle.empty()) {
        std::cerr << "ERROR: Failed to create ScreenCast session" << std::endl;
        return 1;
    }

    // Step 2: SelectSources with cursor_mode = 1 (Hidden)
    if (!portalSelectSources(conn, sessionHandle, config.cursorMode)) {
        std::cerr << "ERROR: Failed to select sources (cursor_mode=" << config.cursorMode << ")" << std::endl;
        portalCloseSession(conn, sessionHandle);
        return 1;
    }

    // Step 3: Start — user confirms share dialog, returns PipeWire stream info
    uint32_t nodeId = 0;
    if (!portalStart(conn, sessionHandle, nodeId)) {
        std::cerr << "ERROR: Failed to start ScreenCast session" << std::endl;
        portalCloseSession(conn, sessionHandle);
        return 1;
    }

    // Step 4: OpenPipeWireRemote — get the PipeWire file descriptor
    int pwFd = portalOpenPipeWireRemote(conn, sessionHandle);
    if (pwFd < 0) {
        std::cerr << "ERROR: Failed to get PipeWire remote FD" << std::endl;
        portalCloseSession(conn, sessionHandle);
        return 1;
    }

    // Step 5: Build and start GStreamer pipeline
    ensureParentDirExists(config.outputPath);

    GstElement* pipeline = createCapturePipeline(pwFd, nodeId, config, false);
    if (!pipeline) {
        pipeline = createCapturePipeline(pwFd, nodeId, config, true);
    }
    if (!pipeline) {
        std::cerr << "ERROR: Failed to create GStreamer pipeline" << std::endl;
        close(pwFd);
        portalCloseSession(conn, sessionHandle);
        return 1;
    }

    // Start the pipeline
    GstStateChangeReturn ret = gst_element_set_state(pipeline, GST_STATE_PLAYING);
    if (ret == GST_STATE_CHANGE_FAILURE) {
        std::cerr << "WARN: Failed to set hardware pipeline to PLAYING, retrying with software encoder fallback..." << std::endl;
        GstBus* bus = gst_element_get_bus(pipeline);
        if (bus) {
            GstMessage* msg = gst_bus_timed_pop_filtered(
                bus, 1000 * GST_MSECOND,
                (GstMessageType)(GST_MESSAGE_ERROR | GST_MESSAGE_WARNING));
            if (msg) {
                GError* err = nullptr;
                gchar* debug = nullptr;
                gst_message_parse_error(msg, &err, &debug);
                if (err) {
                    std::cerr << "Hardware GStreamer error: " << err->message << std::endl;
                    g_error_free(err);
                }
                if (debug) {
                    std::cerr << "Hardware GStreamer debug: " << debug << std::endl;
                    g_free(debug);
                }
                gst_message_unref(msg);
            }
            gst_object_unref(bus);
        }
        gst_element_set_state(pipeline, GST_STATE_NULL);
        gst_object_unref(pipeline);

        pipeline = createCapturePipeline(pwFd, nodeId, config, true);
        if (!pipeline) {
            std::cerr << "ERROR: Failed to create software fallback pipeline" << std::endl;
            close(pwFd);
            portalCloseSession(conn, sessionHandle);
            return 1;
        }

        ret = gst_element_set_state(pipeline, GST_STATE_PLAYING);
        if (ret == GST_STATE_CHANGE_FAILURE) {
            std::cerr << "ERROR: Failed to set software fallback pipeline to PLAYING" << std::endl;
            gst_element_set_state(pipeline, GST_STATE_NULL);
            gst_object_unref(pipeline);
            close(pwFd);
            portalCloseSession(conn, sessionHandle);
            return 1;
        }
    }

    // Start stdin listener
    std::thread stdinThread(stdinListenerThread, pipeline);
    stdinThread.detach();

    // Notify Electron that recording has started
    std::cout << "Recording started" << std::endl;
    std::cout.flush();

    // Monitor GStreamer bus for EOS or ERROR
    GstBus* bus = gst_element_get_bus(pipeline);
    bool running = true;
    while (running && !g_stopRequested) {
        GstMessage* msg = gst_bus_timed_pop(bus, 100 * GST_MSECOND); // 100ms poll
        if (!msg) continue;

        switch (GST_MESSAGE_TYPE(msg)) {
            case GST_MESSAGE_EOS:
                running = false;
                break;
            case GST_MESSAGE_ERROR: {
                GError* gerr = nullptr;
                gchar* debug = nullptr;
                gst_message_parse_error(msg, &gerr, &debug);
                std::cerr << "ERROR: GStreamer pipeline error: "
                          << (gerr ? gerr->message : "unknown")
                          << " (" << (debug ? debug : "") << ")" << std::endl;
                if (gerr) g_error_free(gerr);
                if (debug) g_free(debug);
                running = false;
                break;
            }
            default:
                break;
        }
        gst_message_unref(msg);
    }

    // If stop was requested but EOS wasn't received yet, send it and wait briefly
    if (g_stopRequested && running) {
        gst_element_send_event(pipeline, gst_event_new_eos());
        // Wait up to 3s for EOS
        GstMessage* eosMsg = gst_bus_timed_pop_filtered(bus, 3 * GST_SECOND,
            (GstMessageType)(GST_MESSAGE_EOS | GST_MESSAGE_ERROR));
        if (eosMsg) gst_message_unref(eosMsg);
    }

    gst_object_unref(bus);

    // Cleanup
    gst_element_set_state(pipeline, GST_STATE_NULL);
    gst_object_unref(pipeline);
    close(pwFd);
    portalCloseSession(conn, sessionHandle);

    std::cout << "Recording stopped. Output path: " << config.outputPath << std::endl;
    std::cout.flush();

    // Allow pipe buffers to drain
    usleep(100000); // 100ms

    return 0;
}
