/**
 * Safe Web Haptics API wrapper for tactile button feedback on supported mobile devices
 */
export function triggerHapticFeedback(pattern: number | number[] = 10): void {
  if (typeof window !== "undefined" && "navigator" in window && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore errors on non-supported platforms
    }
  }
}
