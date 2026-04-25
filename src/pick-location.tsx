import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './pick-location.css'

import L from 'leaflet'
import icon2xUrl from 'leaflet/dist/images/marker-icon-2x.png'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'

import { PickLocationApp } from './pick-location/PickLocationApp'

// Fix Leaflet default marker icons in bundlers.
// Leaflet's internal icon URL resolution breaks under modern bundlers unless overridden.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: icon2xUrl,
  iconUrl,
  shadowUrl,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PickLocationApp />
  </StrictMode>,
)

