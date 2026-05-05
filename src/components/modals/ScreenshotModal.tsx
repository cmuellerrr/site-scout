import { useState, useRef, useCallback, useEffect } from 'react';
import { Download, AlertCircle, CheckCircle } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { SitemapNode, ScreenshotOptions } from '../../types';
import type { ScreenshotCache } from '../../utils/screenshotCache';
import { Modal } from './UrlListModal';

interface Props {
  nodes: SitemapNode[];
  rootUrl: string;
  options: ScreenshotOptions;
  onOptionsChange: (opts: ScreenshotOptions) => void;
  onClose: () => void;
  screenshotCache: ScreenshotCache;
}

interface ScreenshotResult {
  url: string;
  path: string;
  variant: 'desktop' | 'mobile';
  status: 'pending' | 'capturing' | 'done' | 'failed';
  blob?: Blob;
  error?: string;
}

export default function ScreenshotModal({ nodes, rootUrl, options, onOptionsChange, onClose, screenshotCache }: Props) {
  const [phase, setPhase] = useState<'confirm' | 'progress' | 'done'>('confirm');
  const [localOptions, setLocalOptions] = useState<ScreenshotOptions>(options);
  const [results, setResults] = useState<ScreenshotResult[]>([]);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const [serverBusy, setServerBusy] = useState(false);
  const abortRef = useRef(false);
  const blobsRef = useRef<Map<string, Blob>>(new Map());

  // Check server queue depth when the confirm screen is open
  useEffect(() => {
    if (phase !== 'confirm') return;
    fetch('/api/screenshot/status')
      .then((r) => r.json())
      .then((data: { active: number; queued: number }) => {
        setServerBusy(data.active + data.queued > 0);
      })
      .catch(() => {});
  }, [phase]);

  const setOpt = useCallback(<K extends keyof ScreenshotOptions>(key: K, val: ScreenshotOptions[K]) => {
    setLocalOptions((p) => ({ ...p, [key]: val }));
  }, []);

  const variants: Array<{ url: string; path: string; variant: 'desktop' | 'mobile' }> = [];
  for (const node of nodes) {
    if (!node.url) continue;
    if (localOptions.desktop) variants.push({ url: node.url, path: node.path, variant: 'desktop' });
    if (localOptions.mobile) variants.push({ url: node.url, path: node.path, variant: 'mobile' });
  }

  function sanitizeFilename(path: string, hostname: string): string {
    if (path === '/') {
      const bare = hostname.replace(/^www\./, '');
      const name = bare.includes('.') ? bare.slice(0, bare.lastIndexOf('.')) : bare;
      return `_${name}`;
    }
    return path.replace(/^\//, '').replace(/\//g, '_');
  }

  function getHostname() {
    try { return new URL(rootUrl).hostname; } catch { return 'site'; }
  }

  async function captureItems(items: ScreenshotResult[]) {
    for (const item of items) {
      if (abortRef.current) break;

      setResults((prev) => prev.map((r) =>
        r.url === item.url && r.variant === item.variant ? { ...r, status: 'capturing' } : r
      ));

      try {
        let blob: Blob;

        // Reuse preview cache for desktop captures — skips a full Puppeteer round-trip
        const cachedBlobUrl = item.variant === 'desktop'
          ? screenshotCache.peek(item.url, localOptions.blockPopups)
          : undefined;

        if (cachedBlobUrl) {
          blob = await fetch(cachedBlobUrl).then((r) => r.blob());
        } else {
          const params = new URLSearchParams({ url: item.url, mobile: String(item.variant === 'mobile'), blockPopups: String(localOptions.blockPopups) });
          const res = await fetch(`/api/screenshot?${params}`);
          const ct = res.headers.get('content-type') || '';
          if (!res.ok || ct.includes('application/json')) {
            const err = await res.json();
            throw new Error(err.error || `HTTP ${res.status}`);
          }
          blob = await res.blob();
        }

        blobsRef.current.set(`${item.variant}:${item.path}`, blob);
        setResults((prev) => prev.map((r) =>
          r.url === item.url && r.variant === item.variant ? { ...r, status: 'done', blob } : r
        ));
      } catch (e: any) {
        setResults((prev) => prev.map((r) =>
          r.url === item.url && r.variant === item.variant ? { ...r, status: 'failed', error: e.message } : r
        ));
      }
    }
  }

  async function buildZip(): Promise<Blob> {
    const hostname = getHostname();
    const zip = new JSZip();
    for (const [key, blob] of blobsRef.current) {
      const colonIdx = key.indexOf(':');
      const variant = key.slice(0, colonIdx);
      const path = key.slice(colonIdx + 1);
      zip.file(`${sanitizeFilename(path, hostname)}--${variant}.jpg`, blob);
    }
    return zip.generateAsync({ type: 'blob' });
  }

  async function startCapture() {
    onOptionsChange(localOptions);
    abortRef.current = false;
    blobsRef.current.clear();
    const initial: ScreenshotResult[] = variants.map((v) => ({ ...v, status: 'pending' }));
    setResults(initial);
    setPhase('progress');

    await captureItems(initial);

    if (!abortRef.current) {
      setZipBlob(await buildZip());
      setPhase('done');
    }
  }

  async function retryFailed() {
    const failed = results.filter((r) => r.status === 'failed');
    if (!failed.length) return;
    abortRef.current = false;
    setResults((prev) => prev.map((r) =>
      r.status === 'failed' ? { ...r, status: 'pending', error: undefined, blob: undefined } : r
    ));
    setPhase('progress');

    await captureItems(failed);

    setZipBlob(await buildZip());
    setPhase('done');
  }

  function handleAbortDownload() {
    abortRef.current = true;
    buildZip().then((blob) => saveAs(blob, 'screenshots-partial.zip'));
  }

  function handleDownloadZip() {
    if (zipBlob) saveAs(zipBlob, `${getHostname()}-screenshots.zip`);
  }

  const doneCount = results.filter((r) => r.status === 'done').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;
  const totalCount = results.length;
  const progress = totalCount > 0 ? doneCount / totalCount : 0;

  return (
    <Modal title="Get Screenshots" onClose={onClose} width={500}>
      {phase === 'confirm' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 12, color: '#9e9e9e' }}>
            Capture screenshots for <span style={{ color: '#cccccc' }}>{nodes.length} URL{nodes.length !== 1 ? 's' : ''}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ConfirmLabel>Variants</ConfirmLabel>
            <div style={{ display: 'flex', gap: 16 }}>
              <CheckOption label="Desktop (1440px)" checked={localOptions.desktop} onChange={(v) => setOpt('desktop', v)} />
              <CheckOption label="Mobile (375px)" checked={localOptions.mobile} onChange={(v) => setOpt('mobile', v)} />
            </div>
            <ConfirmLabel>Options</ConfirmLabel>
            <CheckOption label="Block cookie banners" checked={localOptions.blockPopups} onChange={(v) => setOpt('blockPopups', v)} />
          </div>

          {serverBusy && (
            <div style={{
              fontSize: 11, color: '#cca700', backgroundColor: '#2d2008',
              border: '1px solid #6b4c00', borderRadius: 2, padding: '6px 10px',
            }}>
              ⚠ Other captures are currently running on the server — yours may take a little longer to start.
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#555' }}>
              {variants.length} screenshot{variants.length !== 1 ? 's' : ''} total
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={cancelBtn}>Cancel</button>
              <button onClick={startCapture} disabled={variants.length === 0} style={primaryBtn}>
                Start capture
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'progress' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: '#9e9e9e' }}>
            Capturing… {doneCount}/{totalCount}
            {failedCount > 0 && <span style={{ color: '#f44747', marginLeft: 8 }}>{failedCount} failed</span>}
          </div>
          <div style={{ height: 4, backgroundColor: '#3c3c3c', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', backgroundColor: '#569cd6', borderRadius: 2,
              width: `${progress * 100}%`, transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #3c3c3c', borderRadius: 2 }}>
            {results.map((r, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '3px 10px',
                borderBottom: i < results.length - 1 ? '1px solid #2d2d2d' : 'none',
                fontSize: 11,
              }}>
                <StatusDot status={r.status} />
                <span style={{ flex: 1, color: '#9e9e9e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.path}
                </span>
                <span style={{ color: '#555', flexShrink: 0 }}>{r.variant}</span>
                {r.error && <span style={{ color: '#f44747', fontSize: 10 }} title={r.error}>err</span>}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {doneCount > 0 && (
              <button onClick={handleAbortDownload} style={{ ...cancelBtn, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                <Download size={11} /> Download partial
              </button>
            )}
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '12px 0' }}>
          <CheckCircle size={36} color="#6a9955" strokeWidth={1.5} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: '#cccccc', marginBottom: 4 }}>Screenshots ready</div>
            <div style={{ fontSize: 12, color: '#9e9e9e' }}>
              {doneCount} captured{failedCount > 0 && `, ${failedCount} failed`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {failedCount > 0 && (
              <button onClick={retryFailed} style={cancelBtn}>
                Retry {failedCount} failed
              </button>
            )}
            <button onClick={handleDownloadZip} style={{ ...primaryBtn, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={14} /> Download screenshots.zip
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const cancelBtn: React.CSSProperties = {
  padding: '4px 12px', fontSize: 12, fontFamily: 'inherit',
  border: '1px solid #3c3c3c', borderRadius: 2,
  backgroundColor: 'transparent', color: '#9e9e9e', cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const primaryBtn: React.CSSProperties = {
  padding: '4px 14px', fontSize: 12, fontFamily: 'inherit',
  border: '1px solid #569cd6', borderRadius: 2,
  backgroundColor: '#094771', color: '#9cdcfe', cursor: 'pointer',
  whiteSpace: 'nowrap',
};

function ConfirmLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
      {children}
    </div>
  );
}

function CheckOption({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#9e9e9e' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function StatusDot({ status }: { status: ScreenshotResult['status'] }) {
  const color = status === 'done' ? '#6a9955' : status === 'failed' ? '#f44747' : status === 'capturing' ? '#569cd6' : '#555';
  const spinning = status === 'capturing';
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      backgroundColor: spinning ? 'transparent' : color,
      border: spinning ? `2px solid ${color}` : 'none',
      borderTopColor: spinning ? 'transparent' : undefined,
      animation: spinning ? 'spin 0.8s linear infinite' : 'none',
      flexShrink: 0,
    }} />
  );
}
