import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { checkPaymentHash, hashesMatch, ipnHash, purchaseHash } from './hash.js'

const API_KEY = 'aba-secret-key'
const MERCHANT = 'payment_merchant_001'

function hmac512(data: string): string {
  return createHmac('sha512', API_KEY).update(data).digest('hex')
}

describe('ABA PayWay hashing', () => {
  it('purchaseHash concatenates tran_id + amount + items + merchant_id', () => {
    expect(purchaseHash(API_KEY, 'TRAN-1', '10.00', MERCHANT, '')).toBe(
      hmac512('TRAN-110.00' + MERCHANT),
    )
  })

  it('checkPaymentHash concatenates tran_id + merchant_id', () => {
    expect(checkPaymentHash(API_KEY, 'TRAN-1', MERCHANT)).toBe(hmac512('TRAN-1' + MERCHANT))
  })

  it('ipnHash concatenates tran_id + amount + merchant_id', () => {
    expect(ipnHash(API_KEY, 'TRAN-1', '5.00', MERCHANT)).toBe(hmac512('TRAN-15.00' + MERCHANT))
  })

  it('hashesMatch is deterministic and rejects mismatches', () => {
    const digest = hmac512('data')
    expect(hashesMatch(digest, digest)).toBe(true)
    expect(hashesMatch(digest, hmac512('other'))).toBe(false)
    expect(hashesMatch('abcd', 'abc')).toBe(false)
  })
})
