# Custom Location — Telegram Mini App (Frontend)

“Custom Location” is a Telegram Mini App page that lets a rider pick a destination on a map (move the map under a fixed center pin), reverse‑geocodes it to an address, and returns the selection to the bot via `Telegram.WebApp.sendData(...)`.

## What you get

- **Full‑screen map** (Leaflet + OpenStreetMap tiles)
- **Center pin UX** (pin stays in the center, user pans the map)
- **Reverse geocoding** via OpenStreetMap Nominatim (HTTPS)
- **Telegram Mini App integration**:
  - `ready()` + `expand()` on load
  - `sendData()` + `close()` on confirm
- **Uzbek (Cyrillic) UI**: “Манзилни танланг”
- **Mobile safe-areas** + iOS Telegram viewport height handling

## URL / Route

The picker is a dedicated HTML entrypoint:

- **`/pick-location.html`**

Query params:

- `mode=drop` (reserved; currently only “drop” is used)
- `pickup_lat` / `pickup_lng` (optional): initial center, typically pickup coordinates

Example:

```text
https://custom-location.vercel.app/pick-location.html?mode=drop&pickup_lat=41.311081&pickup_lng=69.240562
```

## Data sent back to the bot (IMPORTANT)

On confirm, the Mini App sends a **JSON string**:

```json
{"lat": 41.311081, "lng": 69.240562, "name": "Optional label"}
```

Exact format:

```json
{"lat": <number>, "lng": <number>, "name": "<optional label>"}
```

Notes:

- `name` comes from reverse geocoding (may be empty if address resolution fails).
- Telegram delivers this payload to the bot as a **`web_app_data`** message.

## Local development

Install and run:

```bash
npm install
npm run dev
```

API base URL (for destination confirm fallback):

- Copy `.env.example` → `.env`
- Set `VITE_API_BASE_URL` to your backend, e.g. `https://taxi-2r2j.onrender.com`

Open:

- `http://localhost:5173/pick-location.html?mode=drop`

## Build

```bash
npm run build
```

Output is in `dist/`.

## Deploy (HTTPS)

You must host on **HTTPS** (Telegram requirement). This project includes configs for Vercel and Netlify.

### Deploy to Vercel

- **Build command**: `npm run build`
- **Output directory**: `dist`
- Picker URL after deploy:
  - `https://<your-vercel-domain>/pick-location.html`

### Deploy to Netlify

- **Build command**: `npm run build`
- **Publish directory**: `dist`

## Telegram bot setup (BotFather)

Set the bot’s WebApp URL to your deployed picker page:

- `https://<your-domain>/pick-location.html`

## Backend integration (`shokh2369-arch/taxi`)

### Render env var

Set **one of** these env vars:

- `RIDER_PICKER_WEBAPP_URL=https://custom-location.vercel.app`
- (fallback) `CUSTOM_LOCATION_WEBAPP_URL=https://custom-location.vercel.app`

Tip: prefer **no trailing slash**.

### How backend should open the Mini App

Backend opens:

```text
RIDER_PICKER_WEBAPP_URL + "/pick-location.html?mode=drop&pickup_lat=<lat>&pickup_lng=<lng>"
```

### Backend must handle result

Telegram returns the result as `web_app_data`:

- **Handle `web_app_data` updates**
- **Parse JSON exactly** and expect `{lat,lng,name}`

## Troubleshooting

- **iOS shows empty/blurred space at bottom**: this project sets `--app-height` based on Telegram viewport stable height and updates on `viewportChanged`.
- **Confirm does nothing**: verify the Mini App is opened from a Telegram WebApp button (not a normal link), and confirm backend is reading `web_app_data`.


