import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { LatLngLiteral } from 'leaflet'
import { getSDKTelegram, getTelegram } from './lib/telegram'

type PickedDestinationPayload = {
  lat: number
  lng: number
  name: string
  request_id: string
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

function isValidLatLng(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

function clampDecimals(n: number, decimals = 6): number {
  const p = 10 ** decimals
  return Math.round(n * p) / p
}

function shortLabelFromReverse(r: NominatimReverse): string {
  const name = (r.name ?? '').trim()
  if (name) return name
  const dn = (r.display_name ?? '').trim()
  if (!dn) return ''
  return dn.split(',')[0]?.trim() ?? dn
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
  const lastEmitRef = useRef<number>(0)
  useMapEvents({
    move(e) {
      const now = Date.now()
      if (now - lastEmitRef.current < 120) return
      lastEmitRef.current = now
      const map = e.target
      const c = map.getCenter()
      onCenterChange({ lat: c.lat, lng: c.lng })
    },
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

function MapSizeFixer({ mapReady }: { mapReady: boolean }) {
  const map = useMap()
  const lastRef = useRef<number>(0)

  useEffect(() => {
    const bump = () => {
      const now = Date.now()
      if (now - lastRef.current < 120) return
      lastRef.current = now
      try {
        map.invalidateSize({ animate: false })
      } catch {
        // ignore
      }
    }

    const raf = window.requestAnimationFrame(bump)
    const t1 = window.setTimeout(bump, 60)
    const t2 = window.setTimeout(bump, 250)

    window.addEventListener('resize', bump)
    const sdk = getSDKTelegram()
    sdk?.onEvent?.('viewportChanged', bump)

    return () => {
      window.cancelAnimationFrame(raf)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.removeEventListener('resize', bump)
      sdk?.offEvent?.('viewportChanged', bump)
    }
  }, [map])

  useEffect(() => {
    if (!mapReady) return
    const t = window.setTimeout(() => {
      try {
        map.invalidateSize({ animate: false })
      } catch {
        // ignore
      }
    }, 0)
    return () => window.clearTimeout(t)
  }, [map, mapReady])

  return null
}

async function postDestination(body: {
  request_id: string
  lat: number
  lng: number
  name: string
  init_data: string
}): Promise<{ ok?: boolean; estimated_price?: number }> {
  const res = await fetch('/rider/request/destination', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const msg =
      (typeof data.error === 'string' && data.error) ||
      (typeof data.message === 'string' && data.message) ||
      'Request failed'
    throw new Error(msg)
  }
  return data as { ok?: boolean; estimated_price?: number }
}

export function PickDestinationApp() {
  const t = useMemo(() => {
    return {
      title: 'Манзилни танланг',
      mapReady: 'Харита тайёр',
      loading: 'Юкланмоқда…',
      selectedPlace: 'Танланган жой',
      confirm: '✅ Манзилни тасдиқлаш',
      searching: 'Манзил қидирилмоқда…',
      hintAdjust: 'Созлаш учун маркерни суринг ёки харитани босинг',
      hintPick: 'Танлаш учун харитани босинг ёки маркерни суринг',
      geoUnavailable: 'Геолокация мавжуд эмас. Тошкент маркази танланди.',
      geoDenied: 'Жойлашув рухсати берилмади. Тошкент маркази танланди.',
      reverseFailed: 'Манзил топилмади.',
      openInTelegram: 'Иловани Telegram ичида очинг.',
      sendFailed: 'Манзилни юбориб бўлмади. Илтимос қайта уриниб кўринг.',
      saving: 'Сақланмоқда…',
      saved: 'Сақланди ✅',
    }
  }, [])

  const tgPresent = useMemo(() => !!getTelegram(), [])
  const params = useMemo(() => new URLSearchParams(window.location.search), [])

  const mode = (params.get('mode') ?? '').toLowerCase()
  const requestId = (params.get('request_id') ?? '').trim()

  const pickupLat = parseNumber(params.get('pickup_lat'))
  const pickupLng = parseNumber(params.get('pickup_lng'))

  const initialCenter = useMemo<LatLngLiteral | null>(() => {
    if (pickupLat == null || pickupLng == null) return null
    if (!isValidLatLng(pickupLat, pickupLng)) return null
    return { lat: pickupLat, lng: pickupLng }
  }, [pickupLat, pickupLng])

  const [center, setCenter] = useState<LatLngLiteral>(initialCenter ?? TASHKENT_CENTER)
  const [mapReady, setMapReady] = useState(false)

  const [shortLabel, setShortLabel] = useState<string>('')
  const [fullAddress, setFullAddress] = useState<string>('')
  const [reverseLoading, setReverseLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [banner, setBanner] = useState<string>('')
  const [blockingLoading, setBlockingLoading] = useState<boolean>(false)

  const reverseAbortRef = useRef<AbortController | null>(null)
  const reverseDebounceRef = useRef<number | null>(null)

  const initData = useMemo(() => {
    const fromQuery = (params.get('initData') ?? params.get('init_data') ?? '').trim()
    if (fromQuery) return fromQuery
    const injected = getTelegram()
    const sdk = getSDKTelegram()
    return (injected?.initData ?? sdk?.initData ?? '').trim()
  }, [params])

  useEffect(() => {
    const wa = getSDKTelegram()
    if (!wa) return
    try {
      wa.ready()
      wa.expand()
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    const setAppHeight = () => {
      let h = window.innerHeight
      const stable = getTelegram()?.viewportStableHeight ?? getSDKTelegram()?.viewportStableHeight
      if (typeof stable === 'number' && stable > 0) h = stable
      document.documentElement.style.setProperty('--app-height', `${h}px`)
    }

    setAppHeight()
    window.addEventListener('resize', setAppHeight)
    getSDKTelegram()?.onEvent?.('viewportChanged', setAppHeight)

    return () => {
      window.removeEventListener('resize', setAppHeight)
      getSDKTelegram()?.offEvent?.('viewportChanged', setAppHeight)
    }
  }, [])

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
    if (mode && mode !== 'drop') {
      setBanner('Invalid mode')
      return
    }
    if (!requestId) {
      setBanner('Missing request_id')
      return
    }
  }, [mode, requestId])

  useEffect(() => {
    if (reverseDebounceRef.current) window.clearTimeout(reverseDebounceRef.current)
    reverseAbortRef.current?.abort()
    setReverseLoading(true)

    const tid = window.setTimeout(() => {
      const ac = new AbortController()
      reverseAbortRef.current = ac
      void (async () => {
        try {
          const data = await nominatimReverse(center.lat, center.lng, ac.signal)
          const s = shortLabelFromReverse(data)
          const full = (data.display_name ?? '').trim()
          if (s) setShortLabel(s)
          if (full) setFullAddress(full)
        } catch {
          if (ac.signal.aborted) return
          setBanner(t.reverseFailed)
        } finally {
          if (!ac.signal.aborted) setReverseLoading(false)
        }
      })()
    }, 600)

    reverseDebounceRef.current = tid
    return () => {
      window.clearTimeout(tid)
      reverseAbortRef.current?.abort()
    }
  }, [center.lat, center.lng, t.reverseFailed])

  async function onConfirm() {
    if (isSubmitting) return
    if (mode !== 'drop') return
    if (!requestId) return

    setIsSubmitting(true)
    setBanner(t.saving)

    const lat = clampDecimals(center.lat)
    const lng = clampDecimals(center.lng)
    const label = shortLabel?.trim() || shortLabelFromReverse({ display_name: fullAddress }) || ''
    const fallbackName = `${clampDecimals(lat, 5)}, ${clampDecimals(lng, 5)}`

    const payload: PickedDestinationPayload = {
      lat,
      lng,
      name: (label || fallbackName).toString(),
      request_id: requestId,
    }

    const json = JSON.stringify(payload)

    const injected = getTelegram()
    const sdk = getSDKTelegram()
    const canSendInjected = !!injected && typeof injected.sendData === 'function'
    const canSendSDK = !!sdk && typeof sdk.sendData === 'function'

    // Best-effort: do not block on sendData, always call backend.
    try {
      if (canSendInjected) injected!.sendData(json)
      if (!canSendInjected && canSendSDK) sdk.sendData(json)
    } catch {
      // ignore send errors (HTTP fallback still runs)
    }

    try {
      const res = await postDestination({
        request_id: payload.request_id,
        lat: payload.lat,
        lng: payload.lng,
        name: payload.name,
        init_data: initData,
      })

      const price = typeof res.estimated_price === 'number' ? res.estimated_price : null
      setBanner(price != null ? `${t.saved} (${price})` : t.saved)

      window.setTimeout(() => {
        try {
          ;(injected ?? sdk).close()
        } catch {
          // ignore
        }
      }, 800)
    } catch (e) {
      setBanner(e instanceof Error ? e.message : t.sendFailed)
      setIsSubmitting(false)
    }
  }

  const hint = useMemo(() => {
    if (reverseLoading) return t.searching
    if (shortLabel || fullAddress) return t.hintAdjust
    return t.hintPick
  }, [fullAddress, reverseLoading, shortLabel, t.hintAdjust, t.hintPick, t.searching])

  const confirmDisabled = blockingLoading || isSubmitting || mode !== 'drop' || !requestId

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
          <MapSizeFixer mapReady={mapReady} />
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickAndDrag onCenterChange={(pos) => setCenter(pos)} />
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
          {!tgPresent && <div className="pl-banner pl-banner-info">{t.openInTelegram}</div>}
          {!!banner && <div className="pl-banner">{banner}</div>}
        </div>
      </div>

      <div className="pl-bottom">
        <div className="pl-sheet">
          <div className="pl-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="pl-label">{t.selectedPlace}</div>
              <div className="pl-value" style={{ wordBreak: 'break-word' }}>
                {shortLabel || hint}
              </div>
              {!!fullAddress && (
                <div className="pl-address" style={{ wordBreak: 'break-word' }}>
                  {fullAddress}
                </div>
              )}
            </div>
          </div>

          <div className="pl-actions">
            <button
              type="button"
              className="pl-btn pl-btn-primary"
              onClick={() => void onConfirm()}
              disabled={confirmDisabled}
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

