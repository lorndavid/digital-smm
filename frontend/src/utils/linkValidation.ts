/**
 * Platform link detection & validation.
 *
 * Users paste the URL of the page/post they want to grow. This module
 * recognizes the real URL formats of every major platform, so the buy
 * flow can show the detected platform logo + a clear validation message
 * the moment a link is pasted.
 */

export type DetectedPlatform =
  | 'tiktok'
  | 'facebook'
  | 'instagram'
  | 'youtube'
  | 'telegram'
  | 'twitter'
  | 'threads'
  | 'other'

interface PlatformRule {
  platform: DetectedPlatform
  /** Host (or host suffix) that identifies the platform. */
  hosts: string[]
  label: string
}

const RULES: PlatformRule[] = [
  {
    platform: 'tiktok',
    hosts: ['tiktok.com', 'vt.tiktok.com', 'vm.tiktok.com', 'musical.ly'],
    label: 'TikTok',
  },
  {
    platform: 'facebook',
    hosts: ['facebook.com', 'fb.com', 'fb.watch', 'm.me'],
    label: 'Facebook',
  },
  {
    platform: 'instagram',
    hosts: ['instagram.com', 'instagr.am'],
    label: 'Instagram',
  },
  {
    platform: 'youtube',
    hosts: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'],
    label: 'YouTube',
  },
  {
    platform: 'telegram',
    hosts: ['t.me', 'telegram.me', 'telegram.dog'],
    label: 'Telegram',
  },
  {
    platform: 'twitter',
    hosts: ['x.com', 'twitter.com', 't.co'],
    label: 'X (Twitter)',
  },
  {
    platform: 'threads',
    hosts: ['threads.net'],
    label: 'Threads',
  },
]

export const PLATFORM_LABEL: Record<DetectedPlatform, string> = {
  tiktok: 'TikTok',
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
  telegram: 'Telegram',
  twitter: 'X (Twitter)',
  threads: 'Threads',
  other: 'Other',
}

/** Adds a protocol so `URL` can parse bare hosts like "tiktok.com/@user". */
function withProtocol(input: string): string {
  const trimmed = input.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

/** Extracts the hostname from a (possibly protocol-less) URL string. */
function hostnameOf(input: string): string | null {
  try {
    const url = new URL(withProtocol(input))
    return url.hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Detects the platform from a pasted link. `other` means the link is a
 * valid URL but no known platform matched (e.g. a web-traffic target,
 * shopee link or a custom URL) — still allowed, but flagged.
 */
export function detectPlatform(input: string): DetectedPlatform {
  if (!input.trim()) return 'other'
  const host = hostnameOf(input)
  if (!host) return 'other'
  for (const rule of RULES) {
    if (rule.hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
      return rule.platform
    }
  }
  return 'other'
}

export interface LinkValidationResult {
  /** Empty input. */
  empty: boolean
  /** The link is a well-formed http(s) URL. */
  isUrl: boolean
  /** A known platform was matched. */
  platform: DetectedPlatform
  /** True when the link is usable for ordering. */
  valid: boolean
  /** Short message for the UI (empty → no message). */
  message: string
}

/**
 * Validates a pasted link:
 *  - must resolve to a URL with a hostname
 *  - must be http(s) when a protocol is present (no javascript:, data:…)
 *  - known platforms get a positive confirmation; unknown-but-valid URLs
 *    are accepted with a gentle heads-up (web traffic, backlinks, etc.).
 */
export function validateLink(input: string): LinkValidationResult {
  const trimmed = input.trim()

  if (!trimmed) {
    return { empty: true, isUrl: false, platform: 'other', valid: false, message: '' }
  }

  const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
  if (hasProtocol && !/^https?:\/\//i.test(trimmed)) {
    return {
      empty: false,
      isUrl: false,
      platform: 'other',
      valid: false,
      message: 'Only http(s) links are allowed',
    }
  }

  const host = hostnameOf(trimmed)
  if (!host || !host.includes('.')) {
    return {
      empty: false,
      isUrl: false,
      platform: 'other',
      valid: false,
      message: 'That does not look like a valid link — paste the full URL',
    }
  }

  const platform = detectPlatform(trimmed)
  if (platform === 'other') {
    return {
      empty: false,
      isUrl: true,
      platform,
      valid: true,
      message: 'Link looks valid — we could not auto-detect the platform, but you can still order',
    }
  }

  return {
    empty: false,
    isUrl: true,
    platform,
    valid: true,
    message: `${PLATFORM_LABEL[platform]} link detected`,
  }
}
