/**
 * PKCE (RFC 7636) helpers for Google OAuth.
 *
 * The code_verifier is generated here, kept in sessionStorage for the
 * duration of the login flow, and supplied to the backend exchange — it never
 * travels through a URL, which is what makes the code non-interceptable.
 */

const VERIFIER_KEY = 'vidsmm_oauth_verifier'
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'

function randomVerifier(length = 64): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ''
  for (const b of bytes) out += CHARSET[b % CHARSET.length]
  return out
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Creates a fresh verifier, stores it and returns its S256 challenge. */
export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomVerifier()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = toBase64Url(new Uint8Array(digest))
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  return { verifier, challenge }
}

/** Reads (and removes) the verifier stored when the flow started. */
export function takePkceVerifier(): string | null {
  try {
    const verifier = sessionStorage.getItem(VERIFIER_KEY)
    sessionStorage.removeItem(VERIFIER_KEY)
    return verifier
  } catch {
    return null
  }
}
