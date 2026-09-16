import { registerIpcHandler } from '../services/ipc-handler'
import { AppError } from '../services/ipc-handler'
import { createCategory, listCategories, listCategoryTypes } from '../categories/category.service'
import type { Category, CategoryType } from '../categories/category.service'

const VALID_TYPES = new Set<string>(['income', 'expense', 'capital', 'withdrawal', 'asset', 'liability'])

export function registerCategoryIpcHandlers(): void {
  registerIpcHandler('categories:list', (_event, ...args: unknown[]) => {
    const type = args[0]
    if (type !== undefined && (typeof type !== 'string' || !VALID_TYPES.has(type))) {
      throw new AppError('VALIDATION_ERROR', 'A valid category type is required.')
    }
    return listCategories(type as Parameters<typeof listCategories>[0])
  })

  registerIpcHandler('categories:types', (_event) => listCategoryTypes())

  registerIpcHandler<Category>('categories:create', (_event, raw) => {
    const input = (raw ?? {}) as Record<string, unknown>
    if (typeof input.name !== 'string') {
      throw new AppError('VALIDATION_ERROR', 'A category name is required.')
    }
    if (typeof input.type !== 'string' || !VALID_TYPES.has(input.type)) {
      throw new AppError('VALIDATION_ERROR', 'A valid category type is required.')
    }
    return createCategory(input.name, input.type as CategoryType)
  })
}