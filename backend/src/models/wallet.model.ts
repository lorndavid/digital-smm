import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { WALLET_TRANSACTION_TYPES } from '../types/index.js'

const transactionSchema = new Schema(
  {
    type: { type: String, enum: [...WALLET_TRANSACTION_TYPES], required: true },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, default: '' },
    refType: {
      type: String,
      enum: ['topup', 'order', 'refund', 'adjustment'],
      default: 'adjustment',
    },
    refId: { type: Schema.Types.ObjectId, default: null },
    balanceAfter: { type: Number, default: 0 },
  },
  { timestamps: true },
)

const walletSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    balance: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'USD' },
    totalTopUp: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    transactions: { type: [transactionSchema], default: [] },
  },
  { timestamps: true },
)

export type Wallet = InferSchemaType<typeof walletSchema>
export type WalletDoc = HydratedDocument<Wallet>

export const WalletModel = model('Wallet', walletSchema)
