/**
 * Mobile banking app deep links.
 *
 * ABA Mobile (documented in the ABA PayWay QR API docs):
 *   abamobilebank://ababank.com?type=payway&qrcode={KHQR}
 *
 * The `qrcode` parameter carries the raw EMVCo KHQR string, which embeds the
 * exact payment amount (and currency), so ABA Mobile opens with the amount
 * already pre-filled — no amount/reference query params needed.
 */
export function buildAbaDeepLink(qrString: string): string {
  return `abamobilebank://ababank.com?type=payway&qrcode=${encodeURIComponent(qrString)}`
}

/** True when the device is a touch screen (phone/tablet) where a banking
 * app deep link can actually open. Falls back to the hosted checkout on
 * desktops where no app can receive the link. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches
}
