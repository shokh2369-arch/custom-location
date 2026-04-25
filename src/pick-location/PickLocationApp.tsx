import WebApp from '@twa-dev/sdk'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { LatLngLiteral } from 'leaflet'

type TelegramWebApp = {
	ready: () => void
	expand: () => void
	close: () => void
	sendData: (data: string) => void
	onEvent: (eventType: string, handler: () => void) => void
	offEvent: (eventType: string, handler: () => void) => void
	viewportStableHeight?: number
}

function getTelegramWebApp(): TelegramWebApp | null {
	const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
	return tg ?? null
}

function getActiveWebApp(): TelegramWebApp | null {
	// Prefer the native injected object, but fall back to SDK wrapper.
	return getTelegramWebApp() ?? ((WebApp as unknown as TelegramWebApp) || null)
}

type PickedLocationPayload = {
  lat: number
  lng: number
  name?: string
}

type NominatimReverse = {
  display_name?: string
  name?: string
}

const TASHKENT_CENTER: LatLngLiteral = { lat: 41.311081, lng: 69.240562 }

function parseNumber(v: string | null): number | null {
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function clampDecimals(n: number, decimals = 6): number {
  const p = 10 ** decimals
  return Math.round(n * p) / p
}

async function nominatimReverse(
  lat: number,
  lng: number,
  signal: AbortSignal,
): Promise<NominatimReverse> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  url.searchParams.set('zoom', '18')
  url.searchParams.set('addressdetails', '1')
  // Prefer Cyrillic where available (Telegram mini app target locale).
  url.searchParams.set('accept-language', 'uz-Cyrl,ru,en')

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'uz-Cyrl,ru;q=0.9,en;q=0.8',
    },
    signal,
  })
  if (!res.ok) throw new Error('Reverse geocoding failed')
  const data = (await res.json()) as NominatimReverse
  return data ?? {}
}

function MapClickAndDrag({
  onCenterChange,
}: {
  onCenterChange: (pos: LatLngLiteral) => void
}) {
  useMapEvents({
    moveend(e) {
      const map = e.target
      const c = map.getCenter()
      onCenterChange({ lat: c.lat, lng: c.lng })
    },
  })
  return null
}

function MapViewUpdater({ center }: { center: LatLngLiteral }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true })
  }, [center, map])
  return null
}

export function PickLocationApp() {
  const t = useMemo(() => {
    // Uzbek (Cyrillic) UI copy
    return {
      title: 'Манзилни танланг',
      mapReady: 'Харита тайёр',
      loading: 'Юкланмоқда…',
      selectedPlace: 'Танланган жой',
      confirm: '✅ Манзилни тасдиқлаш',
      resolving: 'Манзил аниқланмоқда…',
      hintAdjust: 'Созлаш учун маркерни суринг ёки харитани босинг',
      hintPick: 'Танлаш учун харитани босинг ёки маркерни суринг',
      geoUnavailable: 'Геолокация мавжуд эмас. Тошкент маркази танланди.',
      geoDenied: 'Жойлашув рухсати берилмади. Тошкент маркази танланди.',
      reverseFailed: 'Бу нуқта учун манзилни аниқлаб бўлмади.',
      openInTelegram: 'Иловани Telegram ичида очинг.',
      sendFailed: 'Манзилни юбориб бўлмади. Илтимос қайта уриниб кўринг.',
    }
  }, [])

  const tg = useMemo(() => getActiveWebApp(), [])

  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const pickupLat = parseNumber(params.get('pickup_lat'))
  const pickupLng = parseNumber(params.get('pickup_lng'))

  const initialCenter = useMemo<LatLngLiteral | null>(() => {
    return pickupLat != null && pickupLng != null ? { lat: pickupLat, lng: pickupLng } : null
  }, [pickupLat, pickupLng])

  const [center, setCenter] = useState<LatLngLiteral>(initialCenter ?? TASHKENT_CENTER)
  const [mapReady, setMapReady] = useState(false)

  const [label, setLabel] = useState<string>('')
  const [reverseLoading, setReverseLoading] = useState(false)

  const [banner, setBanner] = useState<string>('')
  const [blockingLoading, setBlockingLoading] = useState<boolean>(false)

  const reverseAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const wa = getActiveWebApp()
    if (!wa) return
    try {
      wa.ready()
      wa.expand()
    } catch {
      // ignore
    }
  }, [tg])

  useEffect(() => {
    // iOS Telegram WebView can report inconsistent CSS vh; prefer Telegram viewport height.
    const setAppHeight = () => {
      let h = window.innerHeight
      const stable = getActiveWebApp()?.viewportStableHeight
      if (typeof stable === 'number' && stable > 0) h = stable
      document.documentElement.style.setProperty('--app-height', `${h}px`)
    }

    setAppHeight()
    window.addEventListener('resize', setAppHeight)
    getActiveWebApp()?.onEvent?.('viewportChanged', setAppHeight)

    return () => {
      window.removeEventListener('resize', setAppHeight)
      getActiveWebApp()?.offEvent?.('viewportChanged', setAppHeight)
    }
  }, [tg])

  useEffect(() => {
    if (initialCenter) return

    if (!('geolocation' in navigator)) {
      setBanner(t.geoUnavailable)
      return
    }

    setBlockingLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setCenter(next)
        setBlockingLoading(false)
      },
      () => {
        setBanner(t.geoDenied)
        setBlockingLoading(false)
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 60_000 },
    )
  }, [initialCenter, t.geoDenied, t.geoUnavailable])

  useEffect(() => {
    // Reverse geocode when map center changes (center pin UX).
    reverseAbortRef.current?.abort()
    const ac = new AbortController()
    reverseAbortRef.current = ac

    setReverseLoading(true)
    setBanner('')
    void (async () => {
      try {
        const data = await nominatimReverse(center.lat, center.lng, ac.signal)
        const nextLabel = (data.name || data.display_name || '').trim()
        setLabel(nextLabel)
      } catch {
        if (ac.signal.aborted) return
        setLabel('')
        setBanner(t.reverseFailed)
      } finally {
        if (!ac.signal.aborted) setReverseLoading(false)
      }
    })()

    return () => ac.abort()
  }, [center.lat, center.lng, t.reverseFailed])

  function onConfirm() {
    const payload: PickedLocationPayload = {
      lat: clampDecimals(center.lat),
      lng: clampDecimals(center.lng),
      name: label?.trim() || undefined,
    }

    const json = JSON.stringify(payload)
    const wa = getActiveWebApp()
    if (!wa) {
      setBanner(t.openInTelegram)
      return
    }
    try {
      wa.sendData(json)
      wa.close()
    } catch {
      setBanner(t.sendFailed)
    }
  }

  const hint = useMemo(() => {
    if (reverseLoading) return t.resolving
    if (label) return t.hintAdjust
    return t.hintPick
  }, [label, reverseLoading, t.hintAdjust, t.hintPick, t.resolving])

  return (
    <div className="pl-root">
      <div className="pl-map">
        <MapContainer
          center={center}
          zoom={15}
          zoomControl={false}
          style={{ height: '100%', width: '100%' }}
          whenReady={() => setMapReady(true)}
        >
          <MapViewUpdater center={center} />
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickAndDrag
            onCenterChange={(pos) => setCenter(pos)}
          />
        </MapContainer>
        <div className="pl-center-pin" aria-hidden="true">
          <div className="pl-center-pin-icon" />
          <div className="pl-center-pin-shadow" />
        </div>
      </div>

      <div className="pl-top">
        <div className="pl-top-inner">
          <div className="pl-header">
            <div className="pl-title">{t.title}</div>
            <div className="pl-pill">{mapReady ? t.mapReady : t.loading}</div>
          </div>
          {!!banner && <div className="pl-banner">{banner}</div>}
        </div>
      </div>

      <div className="pl-bottom">
        <div className="pl-sheet">
          <div className="pl-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="pl-label">{t.selectedPlace}</div>
              <div className="pl-value" style={{ wordBreak: 'break-word' }}>
                {label || hint}
              </div>
            </div>
          </div>

          <div className="pl-actions">
            <button
              type="button"
              className="pl-btn pl-btn-primary"
              onClick={onConfirm}
              disabled={blockingLoading}
            >
              {t.confirm}
            </button>
          </div>
        </div>
      </div>

      {blockingLoading && (
        <div className="pl-loading" aria-label="Loading">
          <div className="pl-spinner" />
        </div>
      )}
    </div>
  )
}

