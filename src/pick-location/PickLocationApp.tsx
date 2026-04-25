import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { LatLngLiteral } from 'leaflet'
import { getSDKTelegram, getTelegram } from './lib/telegram'

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

export function PickLocationApp() {
  const t = useMemo(() => {
    // Uzbek (Cyrillic) UI copy
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
    }
  }, [])

  const tgPresent = useMemo(() => !!getTelegram(), [])

  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const pickupLat = parseNumber(params.get('pickup_lat'))
  const pickupLng = parseNumber(params.get('pickup_lng'))

  const initialCenter = useMemo<LatLngLiteral | null>(() => {
    return pickupLat != null && pickupLng != null ? { lat: pickupLat, lng: pickupLng } : null
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
    // iOS Telegram WebView can report inconsistent CSS vh; prefer Telegram viewport height.
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
    // Reverse geocode when map center changes (debounced while panning).
    if (reverseDebounceRef.current) window.clearTimeout(reverseDebounceRef.current)
    reverseAbortRef.current?.abort()
    setReverseLoading(true)
    setBanner('')

    const tid = window.setTimeout(() => {
      const ac = new AbortController()
      reverseAbortRef.current = ac
      void (async () => {
        try {
          const data = await nominatimReverse(center.lat, center.lng, ac.signal)
          const s = shortLabelFromReverse(data)
          const full = (data.display_name ?? '').trim()
          setShortLabel(s)
          setFullAddress(full)
        } catch {
          if (ac.signal.aborted) return
          setShortLabel('')
          setFullAddress('')
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

  function onConfirm() {
    if (isSubmitting) return
    setIsSubmitting(true)

    const payload: PickedLocationPayload = {
      lat: clampDecimals(center.lat),
      lng: clampDecimals(center.lng),
      name: shortLabel?.trim() || undefined,
    }

    const json = JSON.stringify(payload)
    const wa = getTelegram()
    if (!wa || typeof wa.sendData !== 'function') {
      // Outside Telegram (or Telegram object not injected) → required browser/testing fallback.
      window.alert(json)
      setBanner(t.openInTelegram)
      setIsSubmitting(false)
      return
    }
    try {
      wa.sendData(json)
      // Some Telegram WebViews may drop the payload if we close immediately.
      window.setTimeout(() => {
        try {
          wa.close()
        } catch {
          // ignore
        }
      }, 200)
    } catch {
      // If Telegram send fails, fall back to an alert so we can still verify payload in-app.
      try {
        window.alert(json)
      } catch {
        // ignore
      }
      setBanner(t.sendFailed)
      setIsSubmitting(false)
    }
  }

  const hint = useMemo(() => {
    if (reverseLoading) return t.searching
    if (shortLabel || fullAddress) return t.hintAdjust
    return t.hintPick
  }, [fullAddress, reverseLoading, shortLabel, t.hintAdjust, t.hintPick, t.searching])

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
              onClick={onConfirm}
              disabled={blockingLoading || isSubmitting}
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

