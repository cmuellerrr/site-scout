# Site Scout

Site Scout is a site-mapping and visual preview tool. Give it a URL and it crawls the site, builds an interactive tree of every page it finds, and lets you browse each page and generate screenshots — desktop or mobile — without leaving the app.

## Features

- **Site crawler** — BFS crawl + sitemap parsing, up to 15,000 URLs
- **Interactive tree** — collapsible, zoomable sitemap with page counts
- **Screenshot previews** — full-page desktop and mobile screenshots
- **Live previews** — live preview of frameable pages
- **Export** — download a URL list as a TXT, a diagram as a PNG, and screenshots as a ZIP
- **Path exclusions** — skip sections of a site (e.g. `/blog`, `/docs`)
- **Locale filtering** — collapse duplicate translated paths

---

## Running on Mac (no dev experience needed)

These steps get the app running from source. You only need to do the one-time setup once.

### One-time setup

**1. Install Node.js**

Download and run the macOS installer from [nodejs.org](https://nodejs.org) (choose the "LTS" version).

**2. Get the code**

If you have git installed:
```bash
git clone https://github.com/cmuellerrr/site-scout.git
cd site-scout
```

If you don't have git, install it from [git-scm.com](https://git-scm.com/download/mac), or click **Code → Download ZIP** on the GitHub page, unzip it, and open Terminal in that folder.

**3. Install dependencies**

```bash
npm install
```

This takes a minute on first run while it downloads everything.

### Launch the app

```bash
npm run electron:dev
```

This starts the app in a desktop window. Run this command every time you want to open Site Scout.

---

## Developer setup

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
| npm | 9+ |

Puppeteer downloads its own Chromium automatically on first `npm install`.

### Running locally

**Web app (browser)**
```bash
npm run dev
```
Opens the Vite dev server at `http://localhost:5173`. The Express API runs on `:3001`.

**Desktop app (Electron)**
```bash
npm run electron:dev
```
Starts the Vite + Express servers and launches the app in an Electron window.

**Production server only**
```bash
npm run build   # compile the frontend
npm start       # serve frontend + API on :3001
```

---

## Building for distribution

### Desktop installer

```bash
npm run electron:build
```

This:
1. Compiles the React frontend (`dist/`)
2. Bundles the Express server to `electron/server.cjs`
3. Bundles the Electron main process to `electron/main.cjs`
4. Packages everything into a native installer via `electron-builder`

Output lands in `dist-electron/`:

| Platform | Format |
|----------|--------|
| macOS | `.dmg` (arm64 + x64) |
| Windows | `.exe` NSIS installer |
| Linux | `.AppImage` |

### Web / Docker

```bash
docker build -t scout .
docker run -p 10000:10000 scout
```

The image installs Chromium via `apt` so there's no runtime download.

---

## Deployment

The app ships with a `render.yaml` for [Render](https://render.com). Connect the repo, choose the Docker runtime, and deploy. Screenshots work best on instances with ≥1 CPU and ≥1 GB RAM.

---

## Testing

```bash
npm test            # run once
npm run test:watch  # watch mode
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Tailwind CSS v4 |
| Backend | Express, TypeScript, tsx |
| Crawler | Cheerio, Fetch API |
| Screenshots | Puppeteer (Chromium) |
| Desktop | Electron, electron-builder |
| Bundler | Vite (frontend), esbuild (Electron) |
| Testing | Vitest |

---

## Project structure

```
scout/
├── electron/          # Electron main process
│   └── main.ts
├── server/            # Express API
│   ├── index.ts
│   ├── crawler.ts
│   ├── screenshot.ts
│   ├── sitemap.ts
│   └── types.ts
├── src/               # React frontend
│   ├── components/
│   └── ...
├── Dockerfile         # Web deployment
├── render.yaml        # Render.com config
└── package.json
```
