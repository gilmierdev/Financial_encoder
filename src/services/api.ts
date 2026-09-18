import type {
  AppError,
  AppInfo,
  AppSettings,
  BackupExportResult,
  BackupRecord,
  CalculationFilter,
  CalculationTotals,
  CashFlowGranularity,
  CashFlowPoint,
  CategoryBreakdown,
  Category,
  CategoryType,
  DatabaseStatus,
  ExportRequest,
  ExportResult,
  IpcResult,
  ImportMapping,
  ImportPreview,
  ImportResult,
  LogLevel,
  MonthlySummary,
  ParsedDocumentLine,
  PingResult,
  ReadDocumentResult,
  ResetResult,
  RestoreFileResult,
  Transaction,
  TransactionFilters,
  TransactionInput,
  TransactionPage,
  UpdateStatus,
} from '../../electron/types/ipc'

export class ApiError extends Error {
  readonly code: string

  constructor(error: AppError) {
    super(error.message)
    this.name = 'ApiError'
    this.code = error.code
  }
}

function unwrap<T>(result: IpcResult<T>): T {
  if (result.ok) {
    return result.data
  }
  throw new ApiError(result.error)
}

export interface Api {
  app: {
    ping(): Promise<PingResult>
    getInfo(): Promise<AppInfo>
  }
  db: {
    init(): Promise<DatabaseStatus>
    getStatus(): Promise<DatabaseStatus>
    reset(): Promise<ResetResult>
  }
  settings: {
    getAll(): Promise<AppSettings>
    set(key: keyof AppSettings, value: string): Promise<AppSettings>
  }
  transactions: {
    list(filters?: TransactionFilters): Promise<TransactionPage>
    get(id: number): Promise<Transaction | null>
    create(tx: TransactionInput): Promise<Transaction>
    update(id: number, partial: Partial<TransactionInput>): Promise<Transaction | null>
    delete(id: number): Promise<boolean>
  }
  categories: {
    list(type?: CategoryType): Promise<Category[]>
    types(): Promise<string[]>
    create(input: { name: string; type: CategoryType }): Promise<Category>
  }
  calculations: {
    totals(filter?: CalculationFilter): Promise<CalculationTotals>
    monthly(filter?: CalculationFilter): Promise<MonthlySummary[]>
    cashFlow(filter?: CalculationFilter, granularity?: CashFlowGranularity): Promise<CashFlowPoint[]>
    byCategory(filter?: CalculationFilter): Promise<CategoryBreakdown[]>
  }
  imports: {
    pick(): Promise<ImportPreview>
    confirm(req: ImportMapping): Promise<ImportResult>
  }
  exports: {
    file(req: ExportRequest): Promise<ExportResult>
  }
  backups: {
    create(): Promise<BackupRecord>
    list(): Promise<BackupRecord[]>
    restore(id: number): Promise<DatabaseStatus>
    delete(id: number): Promise<boolean>
    export(): Promise<BackupExportResult>
    importFromFile(): Promise<RestoreFileResult>
  }
  ocr: {
    pick(): Promise<ReadDocumentResult>
    parse(text: string, fileName: string): Promise<ParsedDocumentLine[]>
  }
  logger: {
    log(level: LogLevel, message: string, context?: unknown): Promise<void>
  }
  updater: {
    check(): Promise<UpdateStatus>
    download(): Promise<UpdateStatus>
    install(): Promise<void>
    openReleases(): Promise<void>
    onStatus(callback: (status: UpdateStatus) => void): () => void
  }
}

export const api: Api = {
  app: {
    async ping() {
      return unwrap(await window.financialEncoder.app.ping())
    },
    async getInfo() {
      return unwrap(await window.financialEncoder.app.getInfo())
    },
  },
  db: {
    async init() {
      return unwrap(await window.financialEncoder.db.init())
    },
    async getStatus() {
      return unwrap(await window.financialEncoder.db.getStatus())
    },
    async reset() {
      return unwrap(await window.financialEncoder.db.reset())
    },
  },
  settings: {
    async getAll() {
      return unwrap(await window.financialEncoder.settings.getAll())
    },
    async set(key, value) {
      return unwrap(await window.financialEncoder.settings.set(key, value))
    },
  },
  logger: {
    async log(level: LogLevel, message: string, context?: unknown) {
      await unwrap(await window.financialEncoder.logger.log(level, message, context))
    },
  },
  transactions: {
    async list(filters?: TransactionFilters) {
      return unwrap(await window.financialEncoder.transactions.list(filters))
    },
    async get(id: number) {
      return unwrap(await window.financialEncoder.transactions.get(id))
    },
    async create(tx) {
      return unwrap(await window.financialEncoder.transactions.create(tx))
    },
    async update(id, partial) {
      return unwrap(await window.financialEncoder.transactions.update(id, partial))
    },
    async delete(id: number) {
      return unwrap(await window.financialEncoder.transactions.delete(id))
    },
  },
  categories: {
    async list(type?: CategoryType) {
      return unwrap(await window.financialEncoder.categories.list(type))
    },
    async types() {
      return unwrap(await window.financialEncoder.categories.types())
    },
    async create(input) {
      return unwrap(await window.financialEncoder.categories.create(input))
    },
  },
  calculations: {
    async totals(filter?: CalculationFilter) {
      return unwrap(await window.financialEncoder.calculations.totals(filter))
    },
    async monthly(filter?: CalculationFilter) {
      return unwrap(await window.financialEncoder.calculations.monthly(filter))
    },
    async cashFlow(filter?: CalculationFilter, granularity?: CashFlowGranularity) {
      return unwrap(await window.financialEncoder.calculations.cashFlow(filter, granularity))
    },
    async byCategory(filter?: CalculationFilter) {
      return unwrap(await window.financialEncoder.calculations.byCategory(filter))
    },
  },
  imports: {
    async pick() {
      return unwrap(await window.financialEncoder.imports.pick())
    },
    async confirm(req) {
      return unwrap(await window.financialEncoder.imports.confirm(req))
    },
  },
  exports: {
    async file(req) {
      return unwrap(await window.financialEncoder.exports.file(req))
    },
  },
  backups: {
    async create() {
      return unwrap(await window.financialEncoder.backups.create())
    },
    async list() {
      return unwrap(await window.financialEncoder.backups.list())
    },
    async restore(id: number) {
      return unwrap(await window.financialEncoder.backups.restore(id))
    },
    async delete(id: number) {
      return unwrap(await window.financialEncoder.backups.delete(id))
    },
    async export() {
      return unwrap(await window.financialEncoder.backups.export())
    },
    async importFromFile() {
      return unwrap(await window.financialEncoder.backups.importFromFile())
    },
  },
  ocr: {
    async pick() {
      return unwrap(await window.financialEncoder.ocr.pick())
    },
    async parse(text: string, fileName: string) {
      return unwrap(await window.financialEncoder.ocr.parse(text, fileName))
    },
  },
  updater: {
    async check() {
      const bridge = window.financialEncoder?.updater
      if (!bridge?.check) {
        return { state: 'unsupported' } as UpdateStatus
      }
      return unwrap(await bridge.check())
    },
    async download() {
      const bridge = window.financialEncoder?.updater
      if (!bridge?.download) {
        return { state: 'unsupported' } as UpdateStatus
      }
      return unwrap(await bridge.download())
    },
    async install() {
      const bridge = window.financialEncoder?.updater
      if (!bridge?.install) return
      await bridge.install()
    },
    async openReleases() {
      const bridge = window.financialEncoder?.updater
      if (!bridge?.openReleases) return
      await bridge.openReleases()
    },
    onStatus(callback) {
      const bridge = window.financialEncoder?.updater
      if (typeof bridge?.onStatus === 'function') {
        return bridge.onStatus(callback)
      }
      return () => {}
    },
  },
}