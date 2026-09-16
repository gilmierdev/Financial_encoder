/// <reference types="vite/client" />

import type { FinancialEncoderApi } from '../electron/types/ipc'

declare global {
  interface Window {
    financialEncoder: FinancialEncoderApi
  }
}

export {}