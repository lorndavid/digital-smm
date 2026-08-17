/**
 * Analytics consent.
 *
 * DigitalSMM does not currently show a cookie-consent banner, so analytics
 * respects an opt-out flag stored in localStorage ('digitalsmm:analytics').
 * Users (or the site operator) can set it to 'denied' to disable tracking;
 * anything else means tracking is allowed. This gives a safe, verifiable
 * on/off switch without shipping a full consent framework.
 */

const CONSENT_KEY = 'digitalsmm:analytics'

export type AnalyticsConsent = 'granted' | 'denied'

/** Reads the stored consent preference (defaults to granted). */
export function getConsent(): AnalyticsConsent {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'denied' ? 'denied' : 'granted'
  } catch {
    return 'granted'
  }
}

/** Persists the consent preference. */
export function setConsent(consent: AnalyticsConsent): void {
  try {
    if (consent === 'denied') localStorage.setItem(CONSENT_KEY, 'denied')
    else localStorage.removeItem(CONSENT_KEY)
  } catch {
    /* storage unavailable — treat as granted (default) */
  }
}

/** Whether tracking is currently allowed. */
export function isTrackingAllowed(): boolean {
  return getConsent() === 'granted'
}
