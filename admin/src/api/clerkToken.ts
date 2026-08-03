type TokenGetter = () => Promise<string | null>

let getter: TokenGetter | null = null

export function registerTokenGetter(fn: TokenGetter): void {
  getter = fn
}

export function getAuthToken(): Promise<string | null> {
  return getter ? getter() : Promise.resolve(null)
}
