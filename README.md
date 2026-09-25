# Sol App Prototype

Sol is a mobile-first chat interface prototype built as a self-contained front-end React experience. It has no backend, database, or server actions.

## Run locally

Install dependencies and start the Vite development server:

```bash
npm install
npm run dev
```

Create a production build with `npm run build`, then preview it with `npm run preview`.

## Prototype features

- Responsive chat UI with light and dark themes
- Markdown-formatted messages, link previews, voice-message waveforms, attachments, reactions, and message actions
- Demo commands beginning with `#` for previewing thinking, typing, streaming, image generation, prompts, voice, errors, long messages, and other chat states
- Simulated ComfyUI image-generation setup and flow

## Backend configuration

`src/config/backend.js` is the single scaffold for the future real backend. All values intentionally ship empty, so the app reads the module and remains in demo mode without making network calls.

- `apiBaseUrl` — HTTPS base URL for the future Sol application API.
- `apiKey` — API key issued by that backend.
- `comfyUiHost` — ComfyUI hostname or IP address, without the port.
- `comfyUiPort` — ComfyUI port (commonly `8188`).
- `authToken` — bearer or session token for authenticated backend requests.

Do not commit real secrets. A production implementation should inject them through a secure runtime/configuration flow rather than hard-coding them in the client bundle.

## Persistence

This static build does not use durable storage. Changes made in the interface exist only for the current browser session and reset when the page reloads.

## Source layout

- `src/App.jsx` — application state, message flows, composer behavior, and orchestration
- `src/components/` — message, overlay, screen, icon, and utility-button components
- `src/data/prototypeData.js` — in-memory starter conversations, commands, and helpers
- `src/config/backend.js` — empty future-backend connection fields and demo-mode detection
- `src/hooks/useViewportHeight.js` — mobile visual-viewport and keyboard handling
- `src/styles/app.css` — the complete responsive light/dark design system
- `public/icon.jpg` — app icon

## Contribution notes

The project intentionally keeps all state in memory: there is no backend, persistence layer, or live ComfyUI connection. Keep new behavior accessible, mobile-first, and compatible with reduced-motion preferences. Generated previews and uploads remain local to the current browser session.

## Android APK releases

The web prototype is wrapped with [Capacitor](https://capacitorjs.com/) (`net.dsect.sol`) so it installs as a native Android app. Because the prototype is fully static, the APK runs offline with no server.

The `Android APK` GitHub Actions workflow (`.github/workflows/android-apk.yml`) builds APKs two ways:

- **Manual:** Actions tab → "Android APK" → Run workflow → choose `experimental` (debug-signed, installs fine for testing) or `release`.
- **Scheduled:** an `experimental` build runs automatically every Monday at 09:00 UTC.

Manual `release` builds also publish a GitHub Release with the APK attached.

### Signing a release build

Release builds need an upload keystore stored as repository secrets:

1. Generate one (keep it safe — losing it means a new app identity):
   ```bash
   keytool -genkeypair -v -keystore sol-release.keystore -alias sol \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Add these repository secrets (Settings → Secrets and variables → Actions):
   - `ANDROID_KEYSTORE_BASE64` — `base64 -w0 sol-release.keystore`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`

Without these secrets, `release` builds fail with a clear error; `experimental` builds always work.
