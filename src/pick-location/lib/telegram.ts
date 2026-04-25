import WebApp from '@twa-dev/sdk'

export type TelegramWebApp = {
  ready: () => void
  expand: () => void
  close: () => void
  sendData: (data: string) => void
  onEvent?: (eventType: string, handler: () => void) => void
  offEvent?: (eventType: string, handler: () => void) => void
  viewportStableHeight?: number
  initDataUnsafe?: {
    user?: { id?: number }
  }
}

export function getTelegram(): TelegramWebApp | null {
  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
  return tg ?? null
}

export function getActiveTelegram(): TelegramWebApp | null {
  // Prefer injected object when available, fallback to SDK wrapper.
  return getTelegram() ?? (WebApp as unknown as TelegramWebApp)
}

