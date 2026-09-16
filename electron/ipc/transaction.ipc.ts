import { AppError, registerIpcHandler } from '../services/ipc-handler'
import { isSafePositiveInt } from '../services/validation'
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
} from '../transactions/transaction.service'
import type {
  TransactionFilters,
  TransactionInput,
} from '../transactions/transaction.service'

function toPositiveId(value: unknown): number {
  if (!isSafePositiveInt(value)) {
    throw new AppError('VALIDATION_ERROR', 'A valid positive transaction id is required.')
  }
  return value
}

export function registerTransactionIpcHandlers(): void {
  registerIpcHandler('transactions:list', (_event, ...args: unknown[]) =>
    listTransactions((args[0] as TransactionFilters | undefined) ?? {}),
  )

  registerIpcHandler('transactions:get', (_event, ...args: unknown[]) =>
    getTransaction(toPositiveId(args[0])),
  )

  registerIpcHandler('transactions:create', (_event, ...args: unknown[]) =>
    createTransaction(args[0] as TransactionInput),
  )

  registerIpcHandler('transactions:update', (_event, ...args: unknown[]) =>
    updateTransaction(toPositiveId(args[0]), args[1] as Partial<TransactionInput>),
  )

  registerIpcHandler('transactions:delete', (_event, ...args: unknown[]) =>
    deleteTransaction(toPositiveId(args[0])),
  )
}