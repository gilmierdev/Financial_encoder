// Minimal ambient types for the PDF.js legacy ESM build, which does not ship
// a .d.ts alongside the .mjs files. Only the API surface used for text
// extraction is declared.
declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export interface TextItem {
    str: string
    transform?: number[]
  }

  export interface TextContent {
    items: TextItem[]
  }

  export interface PDFPageProxy {
    getTextContent(): Promise<TextContent>
  }

  export interface PDFDocumentProxy {
    numPages: number
    getPage(pageNumber: number): Promise<PDFPageProxy>
    destroy(): Promise<void>
  }

  export interface PDFDocumentLoadingTask {
    promise: Promise<PDFDocumentProxy>
    destroy(): Promise<void>
  }

  export const GlobalWorkerOptions: {
    workerSrc: string | null
  }

  export function getDocument(src: unknown): PDFDocumentLoadingTask
}