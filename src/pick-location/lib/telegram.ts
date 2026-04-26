import WebApp from '@twa-dev/sdk'

export type TelegramWebApp = {
  ready: () => void
  expand: () => void
  close: () => void
  sendData: (data: string) => void
  onEvent?: (eventType: string, handler: () => void) => void
  offEvent?: (eventType: string, handler: () => void) => void
  viewportStableHeight?: number
  initData?: string
  initDataUnsafe?: {
    user?: { id?: number }
  }
}

export function getTelegram(): TelegramWebApp | null {
  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
  return tg ?? null
}

export function getSDKTelegram(): TelegramWebApp {
  return WebApp as unknown as TelegramWebApp
}


