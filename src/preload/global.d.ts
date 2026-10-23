import type { DLApi } from '@shared/types'

declare global {
  interface Window {
    dl: DLApi
  }
}
