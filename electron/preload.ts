import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { AppSettings, CalculationFilter, CategoryType, ExportRequest, FinancialEncoderApi, ImportMapping, TransactionFilters, TransactionInput, LogLevel, UpdateStatus } from './types/ipc'

const api: FinancialEncoderApi = {
  app: {
    ping: () => ipcRenderer.invoke('app:ping'),
    getInfo: () => ipcRenderer.invoke('app:get-info'),
  },
  db: {
    init: () => ipcRenderer.invoke('db:init'),
    getStatus: () => ipcRenderer.invoke('db:status'),
    reset: () => ipcRenderer.invoke('db:reset'),
  },
  settings: {
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    set: (key: keyof AppSettings, value: string) => ipcRenderer.invoke('settings:set', key, value),
  },
  transactions: {
    list: (filters?: TransactionFilters) => ipcRenderer.invoke('transactions:list', filters),
    get: (id: number) => ipcRenderer.invoke('transactions:get', id),
    create: (tx: TransactionInput) => ipcRenderer.invoke('transactions:create', tx),
    update: (id: number, partial: Partial<TransactionInput>) => ipcRenderer.invoke('transactions:update', id, partial),
    delete: (id: number) => ipcRenderer.invoke('transactions:delete', id),
  },
  categories: {
    list: (type?: CategoryType) => ipcRenderer.invoke('categories:list', type),
    types: () => ipcRenderer.invoke('categories:types'),
    create: (input: { name: string; type: CategoryType }) => ipcRenderer.invoke('categories:create', input),
  },
  calculations: {
    totals: (filter?: CalculationFilter) => ipcRenderer.invoke('calculations:totals', filter),
    monthly: (filter?: CalculationFilter) => ipcRenderer.invoke('calculations:monthly', filter),
    byCategory: (filter?: CalculationFilter) => ipcRenderer.invoke('calculations:by-category', filter),
  },
  imports: {
    pick: () => ipcRenderer.invoke('import:pick'),
    confirm: (req: ImportMapping) => ipcRenderer.invoke('import:confirm', req),
  },
  exports: {
    file: (req: ExportRequest) => ipcRenderer.invoke('export:file', req),
  },
  backups: {
    create: () => ipcRenderer.invoke('backup:create'),
    list: () => ipcRenderer.invoke('backup:list'),
    restore: (id: number) => ipcRenderer.invoke('backup:restore', id),
    delete: (id: number) => ipcRenderer.invoke('backup:delete', id),
    export: () => ipcRenderer.invoke('backup:export'),
    importFromFile: () => ipcRenderer.invoke('backup:import'),
  },
  ocr: {
    pick: () => ipcRenderer.invoke('ocr:pick'),
    parse: (text: string, fileName: string) => ipcRenderer.invoke('ocr:parse', { text, fileName }),
  },
  logger: {
    log: (level: LogLevel, message: string, context?: unknown) =>
      ipcRenderer.invoke('logger:log', level, message, context),
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    downloadSetup: () => ipcRenderer.invoke('updater:download-setup'),
    revealSetup: (filePath: string) => ipcRenderer.invoke('updater:reveal-setup', filePath),
    openReleases: () => ipcRenderer.invoke('updater:open-releases'),
    onStatus: (callback: (status: UpdateStatus) => void) => {
      const listener = (_event: IpcRendererEvent, status: UpdateStatus) => callback(status)
      ipcRenderer.on('updater:status', listener)
      return () => {
        ipcRenderer.removeListener('updater:status', listener)
      }
    },
  },
}

contextBridge.exposeInMainWorld('financialEncoder', api)