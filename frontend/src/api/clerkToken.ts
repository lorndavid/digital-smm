type TokenGetter = () => Promise<string | null>

let getter: TokenGetter | null = null

/** Registered once by useClerkSession with the live Clerk token provider. */
export function registerTokenGetter(fn: TokenGetter): void {
  getter = fn
}

/** Returns the current session token (or null when signed out). */
export function getAuthToken(): Promise<string | null> {
  return getter ? getter() : Promise.resolve(null)
}
