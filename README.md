# Telegram Mini App — Pick Destination

This is a Telegram Mini App page that lets a rider pick a custom destination on a map, then returns the payload back to the bot via `Telegram.WebApp.sendData(...)`.

## Page

- **Picker page**: `/pick-location.html`
- **Query params**:
  - `mode=drop` (reserved; currently only drop mode is implemented)
  - `pickup_lat` / `pickup_lng` (optional): map default center

## Output (to bot)

On confirm, the page sends a JSON string via Telegram WebApp:

```json
{"lat": 41.311081, "lng": 69.240562, "name": "Optional label"}
```

Exact format:

```json
{"lat": <number>, "lng": <number>, "name": "<optional label>"}
```

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:5173/pick-location.html?mode=drop`.

## Deploy (HTTPS)

Deploy to any static host that supports HTTPS (Vercel/Netlify/Cloudflare Pages/etc). Build output is in `dist/`.

```bash
npm run build
```

### Vercel

- **Build command**: `npm run build`
- **Output directory**: `dist`
- After deploy, your picker URL will be:
  - `https://<your-vercel-domain>/pick-location.html`

### Netlify

- **Build command**: `npm run build`
- **Publish directory**: `dist`

## Telegram bot setup

- **Set WebApp URL** in BotFather (or your bot admin UI) to your deployed HTTPS origin, for example:
  - `https://your-miniapp.example.com/pick-location.html`
- Alternatively, if you configure WebApp URL as the site origin, your backend can open:
  - `WEBAPP_URL + "/pick-location.html?..."`

## Backend integration (taxi-mvp)

When rider chooses **Custom location**, open the mini app using:

```text
WEBAPP_URL + "/pick-location.html?mode=drop&pickup_lat=<lat>&pickup_lng=<lng>"
```

When the user confirms, Telegram will deliver the data back to the bot as a `web_app_data` message. Your backend must:

- **Handle `web_app_data` updates**
- **Parse the JSON payload exactly** and expect `{lat,lng,name}`

