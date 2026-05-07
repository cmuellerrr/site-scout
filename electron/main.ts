import { app, BrowserWindow, shell } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

// esbuild compiles this to CJS, so __dirname and require are native globals.
// Declare them to satisfy TypeScript while keeping the source ESM-compatible.
declare const __dirname: string;
declare function require(id: string): any; // eslint-disable-line no-var

// Must be set before the app menu is built (changes the macOS menu bar title
// and the "About" menu item from the package.json "name" to the display name).
app.name = 'Site Scout';

const isDev = !app.isPackaged;

// ── Port configuration ────────────────────────────────────────────────────────
const SERVER_PORT = 3001;
const VITE_PORT   = 5173;

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;

// ── Server bootstrap (production only) ───────────────────────────────────────
function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    // In production the compiled server sits next to this main file.
    const serverEntry = path.join(__dirname, 'server.cjs');
    serverProcess = spawn(process.execPath, [serverEntry], {
      env: { ...process.env, PORT: String(SERVER_PORT), NODE_ENV: 'production' },
      stdio: 'pipe',
    });

    serverProcess.stdout?.on('data', (d) => console.log('[server]', d.toString().trim()));
    serverProcess.stderr?.on('data', (d) => console.error('[server]', d.toString().trim()));
    serverProcess.on('error', reject);

    // Poll until the server is accepting connections
    const waitOn = require('wait-on');
    waitOn({ resources: [`http://localhost:${SERVER_PORT}/api/health`], timeout: 15000 })
      .then(resolve)
      .catch(reject);
  });
}

// ── Window creation ───────────────────────────────────────────────────────────
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open external links in the system browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    // In dev mode both Vite and Express are already running (started by electron:dev script)
    await mainWindow.loadURL(`http://localhost:${VITE_PORT}`);
  } else {
    // In production load the Express server that also serves the built SPA
    await mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    if (!isDev) {
      console.log('Starting bundled server...');
      await startServer();
    }
    await createWindow();
  } catch (err) {
    console.error('Failed to start:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

app.on('before-quit', () => {
  serverProcess?.kill();
});
