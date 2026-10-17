#if defined(DM_ANDROID_HOST_HEADERS)
#include_next <linux/thermal.h>
#else
/* Emulated kernel header; see kcompat/kcompat.h */
#include <kcompat/kcompat.h>

#endif
