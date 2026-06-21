# Daily Outfit Planner

A minimal MVP full-stack app for adding clothes and getting simple rule-based outfit suggestions.

## Stack

- React + Vite
- Node.js + Express
- SQLite
- TailwindCSS

## Run locally

```bash
npm install
npm run dev
```

The React app runs at `http://localhost:5173` and proxies API calls to the Express server at `http://localhost:4000`.

## iyzico sandbox setup

Premium payments are handled by the backend only. Do not put iyzico keys in the frontend.

1. Copy `server/.env.example` to `server/.env`.
2. Set `IYZIPAY_API_KEY` and `IYZIPAY_SECRET_KEY` from iyzico sandbox.
3. Set `IYZICO_CALLBACK_URL` to a public HTTPS backend URL, for example an ngrok URL ending with `/payment/callback`.
4. Start the app with `npm run dev`.

The flow is intentionally simple for now: successful iyzico checkout marks the local user as premium in SQLite.

## Apple In-App Purchase setup

iOS subscriptions are started inside the Capacitor app with Apple In-App Purchase. The backend must verify real App Store transactions before granting production premium access.

1. In App Store Connect, keep these product IDs active:
   - `com.vedat.outfitmirrorai.premium.monthly`
   - `com.vedat.outfitmirrorai.premium.yearly`
2. For local simulator testing, use the Xcode StoreKit configuration in `client/ios/App/Outfit Mirror AI.storekit`.
3. For production backend verification, set these backend-only env vars:
   - `APPLE_BUNDLE_ID`
   - `APPLE_APP_APPLE_ID`
   - `APPLE_ISSUER_ID`
   - `APPLE_KEY_ID`
   - `APPLE_PRIVATE_KEY`
   - Optional: `APPLE_IAP_ENVIRONMENT`, `APPLE_ROOT_CA_PATHS`
4. Never rely on frontend localStorage as the source of truth for production premium access.

## Project structure

```text
client/   React, Vite, Tailwind UI
server/   Express API, SQLite persistence, outfit matching logic
```

## API

- `GET /api/clothes`
- `POST /api/clothes`
- `GET /api/outfits/suggestion?season=summer`
- `POST /payment/initiate`
- `POST /payment/callback`
- `GET /payment/status`
- `POST /payment/apple/verify`
- `POST /payment/reset` local test only; requires `ALLOW_PAYMENT_RESET=true` and non-production environment.

AI image analysis is also handled by the backend only. Add `OPENAI_API_KEY` to `server/.env` before testing real photo analysis. The optional `OPENAI_VISION_MODEL` value defaults to `gpt-4o-mini`.

AI endpoints:

- `POST /ai/analyze-image`
- `POST /api/ai/analyze-image`
