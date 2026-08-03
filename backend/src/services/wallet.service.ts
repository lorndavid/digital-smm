import type { Types } from 'mongoose'
import { walletRepository } from '../repositories/finance.repository.js'
import { WalletTransactionType } from '../types/index.js'
import { ApiError } from '../utils/api-error.js'

export type WalletRefType = 'topup' | 'order' | 'refund' | 'adjustment'

/**
 * Wallet business logic. The service owns the invariant that a balance
 * can never go negative (enforced at the application layer; the schema
 * also guards with min: 0).
 */
export class WalletService {
  async getWallet(userId: string) {
    return walletRepository.ensureForUser(userId)
  }

  async credit(
    userId: string,
    amount: number,
    description: string,
    refType: WalletRefType = 'topup',
    refId?: Types.ObjectId,
  ) {
    if (!(amount > 0)) throw new ApiError(400, 'Amount must be greater than zero')
    const wallet = await walletRepository.ensureForUser(userId)
    wallet.balance += amount
    wallet.totalTopUp += amount
    wallet.transactions.push({
      type: 'credit' as WalletTransactionType,
      amount,
      description,
      refType,
      refId: refId ?? null,
      balanceAfter: wallet.balance,
    })
    await wallet.save()
    return wallet
  }

  async debit(
    userId: string,
    amount: number,
    description: string,
    refType: WalletRefType = 'order',
    refId?: Types.ObjectId,
  ) {
    if (!(amount > 0)) throw new ApiError(400, 'Amount must be greater than zero')
    const wallet = await walletRepository.ensureForUser(userId)
    if (wallet.balance < amount) {
      throw new ApiError(400, 'Insufficient wallet balance', {
        balance: wallet.balance,
        required: amount,
      })
    }
    wallet.balance -= amount
    wallet.totalSpent += amount
    wallet.transactions.push({
      type: 'debit' as WalletTransactionType,
      amount,
      description,
      refType,
      refId: refId ?? null,
      balanceAfter: wallet.balance,
    })
    await wallet.save()
    return wallet
  }

  async transactions(userId: string, limit = 50) {
    return walletRepository.listTransactions(userId, limit)
  }
}

export const walletService = new WalletService()
