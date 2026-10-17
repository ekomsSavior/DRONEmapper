/* Copyright 2026 Church of Malware / saviorSEC. SPDX-License-Identifier: GPL-2.0-only */
#include <jni.h>
#include <pthread.h>
#include "common/uwifi.h"
static JavaVM *vm;
static jobject receiver;
static jmethodID receive_method;
static struct uwifi_dev *radio;
static pthread_mutex_t callback_lock = PTHREAD_MUTEX_INITIALIZER;
static unsigned long long frame_count;
static char last_error[256];
void kc_runtime_idle(bool idle);
static void log_error(void *ctx, int level, const char *message) {
    if (level <= 3) {
        pthread_mutex_lock(&callback_lock);
        snprintf(last_error, sizeof(last_error), "%s", message);
        for (size_t i = 0; last_error[i]; i++) if ((unsigned char)last_error[i] >= 128) last_error[i] = '?';
        pthread_mutex_unlock(&callback_lock);
    }
}
static void received(void *ctx, struct ieee80211_hw *hw,
        const struct ieee80211_rx_status *status, const u8 *data, size_t length) {
    __atomic_add_fetch(&frame_count, 1, __ATOMIC_RELAXED);
    if (length < 8 || data[0] != 0 || status->flag & (RX_FLAG_FAILED_FCS_CRC | RX_FLAG_FAILED_PLCP_CRC)) return;
    size_t header = data[2] | (data[3] << 8);
    if (header < 8 || header + 24 > length || length - header > 4096) return;
    const u8 *frame = data + header;
    if (frame[0] != 0x80 && frame[0] != 0xd0) return;
    pthread_mutex_lock(&callback_lock);
    if (!receiver) { pthread_mutex_unlock(&callback_lock); return; }
    JNIEnv *env = NULL;
    bool attached = (*vm)->GetEnv(vm, (void **)&env, JNI_VERSION_1_6) == JNI_EDETACHED;
    if (attached && (*vm)->AttachCurrentThread(vm, &env, NULL) != JNI_OK) { pthread_mutex_unlock(&callback_lock); return; }
    jbyteArray bytes = (*env)->NewByteArray(env, (jsize)(length - header));
    if (bytes) {
        (*env)->SetByteArrayRegion(env, bytes, 0, (jsize)(length - header), (const jbyte *)frame);
        (*env)->CallVoidMethod(env, receiver, receive_method, bytes,
            status->flag & RX_FLAG_NO_SIGNAL_VAL ? -999 : status->signal, (jint)status->freq);
        (*env)->DeleteLocalRef(env, bytes);
    }
    if ((*env)->ExceptionCheck(env)) (*env)->ExceptionClear(env);
    if (attached) (*vm)->DetachCurrentThread(vm);
    pthread_mutex_unlock(&callback_lock);
}
JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *v, void *reserved) { vm = v; return JNI_VERSION_1_6; }
#define API(name) Java_org_churchofmalware_dronemapper_node_NativeWifi_##name
static void stop(JNIEnv *env) {
    pthread_mutex_lock(&callback_lock);
    if (receiver) { (*env)->DeleteGlobalRef(env, receiver); receiver = NULL; }
    pthread_mutex_unlock(&callback_lock);
    if (radio) { uwifi_close(radio); radio = NULL; }
    kc_usb_exit();
    kc_runtime_idle(true);
}
JNIEXPORT jstring JNICALL API(open)(JNIEnv *env, jobject self, jint fd, jstring firmware) {
    stop(env);
    pthread_mutex_lock(&callback_lock);
    last_error[0] = 0;
    pthread_mutex_unlock(&callback_lock);
    kc_runtime_idle(false);
    __atomic_store_n(&frame_count, 0, __ATOMIC_RELAXED);
    const char *path = (*env)->GetStringUTFChars(env, firmware, NULL);
    if (!path) return NULL;
    const char *paths[] = {path};
    uwifi_set_log_cb(log_error, NULL);
    int r = uwifi_init(paths, 1, 3);
    (*env)->ReleaseStringUTFChars(env, firmware, path);
    if (r < 0) return (*env)->NewStringUTF(env, "USB runtime could not start");
    radio = uwifi_open_fd(fd, 30000);
    if (!radio) {
        pthread_mutex_lock(&callback_lock);
        jstring error = (*env)->NewStringUTF(env, last_error[0] ? last_error : "Firmware / radio initialization failed");
        pthread_mutex_unlock(&callback_lock);
        stop(env);
        return error;
    }
    jclass cls = (*env)->GetObjectClass(env, self);
    receive_method = (*env)->GetMethodID(env, cls, "receive", "([BII)V");
    (*env)->DeleteLocalRef(env, cls);
    if (!receive_method) { stop(env); return NULL; }
    pthread_mutex_lock(&callback_lock);
    receiver = (*env)->NewGlobalRef(env, self);
    pthread_mutex_unlock(&callback_lock);
    if (!receiver || uwifi_start_monitor(radio, received, NULL) < 0) {
        stop(env); return (*env)->NewStringUTF(env, "Monitor mode initialization failed");
    }
    return (*env)->NewStringUTF(env, "");
}
JNIEXPORT jintArray JNICALL API(channels)(JNIEnv *env, jobject self) {
    jint list[64]; int n = 0;
    if (radio) {
        struct uwifi_chan *channels = NULL; size_t count = 0;
        if (uwifi_hop_list(radio, (1 << NL80211_BAND_2GHZ) | (1 << NL80211_BAND_5GHZ),
            1 << NL80211_CHAN_WIDTH_20, &channels, &count) == 0) {
            for (size_t i = 0; i < count && n < 64; i++) list[n++] = channels[i].channel;
        }
        free(channels);
    }
    jintArray result = (*env)->NewIntArray(env, n);
    if (result) (*env)->SetIntArrayRegion(env, result, 0, n, list);
    return result;
}
JNIEXPORT jboolean JNICALL API(tune)(JNIEnv *env, jobject self, jint channel) {
    if (!radio || !uwifi_alive(radio)) return JNI_FALSE;
    char spec[16]; struct uwifi_chan c;
    snprintf(spec, sizeof(spec), "%d", channel);
    return uwifi_parse_chan(radio, spec, &c) == 0 && uwifi_set_chan(radio, &c) == 0;
}
JNIEXPORT jlong JNICALL API(frames)(JNIEnv *env, jobject self) { return __atomic_load_n(&frame_count, __ATOMIC_RELAXED); }
JNIEXPORT void JNICALL API(close)(JNIEnv *env, jobject self) { stop(env); }
