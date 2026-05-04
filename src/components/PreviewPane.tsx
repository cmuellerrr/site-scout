import { useState, useEffect, useRef, useCallback } from 'react';
import { ExternalLink, ShieldOff, Monitor, RefreshCw } from 'lucide-react';
import type { FrameableStatus } from '../types';

interface Props {
  url: string | null;
  frameableStatus: FrameableStatus;
  blockPopups: boolean;
  onToggleBlockPopups: (val: boolean) => void;
}

const DESKTOP_W = 1440;

export default function PreviewPane({ url, frameableStatus, blockPopups, onToggleBlockPopups }: Props) {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeStuck, setIframeStuck] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [iframeScale, setIframeScale] = useState(1);

  // Screenshot state
  const [screenshotSrc, setScreenshotSrc] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const screenshotCacheRef = useRef<Map<string, string>>(new Map());
  const screenshotAbortRef = useRef<AbortController | null>(null);

  // Reset state when URL changes — abort any in-flight screenshot request
  useEffect(() => {
    screenshotAbortRef.current?.abort();
    screenshotAbortRef.current = null;
    setIframeLoaded(false);
    setIframeStuck(false);
    setScreenshotSrc(null);
    setScreenshotError(null);
    setScreenshotLoading(false);
    if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
  }, [url]);

  // 10-second stuck detection after frameable confirmed
  useEffect(() => {
    if (frameableStatus === 'yes' && !iframeLoaded) {
      stuckTimerRef.current = setTimeout(() => setIframeStuck(true), 10000);
    }
    return () => {
      if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
    };
  }, [frameableStatus, iframeLoaded]);

  const showIframe = frameableStatus === 'yes' && !iframeStuck;

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    if (el.clientWidth > 0) setIframeScale(el.clientWidth / DESKTOP_W);
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) setIframeScale(el.clientWidth / DESKTOP_W);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [showIframe]);

  const handleIframeLoad = useCallback(() => {
    try {
      const loc = iframeRef.current?.contentWindow?.location.href;
      if (loc === 'about:blank') return;
    } catch { /* cross-origin, fine */ }
    setIframeLoaded(true);
    setIframeStuck(false);
    if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
  }, []);

  const captureScreenshot = useCallback(async (targetUrl: string) => {
    const cached = screenshotCacheRef.current.get(targetUrl);
    if (cached) {
      setScreenshotSrc(cached);
      return;
    }

    // Cancel any previous in-flight request and start a fresh one
    screenshotAbortRef.current?.abort();
    const controller = new AbortController();
    screenshotAbortRef.current = controller;

    setScreenshotLoading(true);
    setScreenshotError(null);
    setScreenshotSrc(null);

    try {
      const res = await fetch(`/api/screenshot?url=${encodeURIComponent(targetUrl)}&mobile=false`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(text || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      screenshotCacheRef.current.set(targetUrl, objectUrl);
      setScreenshotSrc(objectUrl);
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return; // user navigated away
      setScreenshotError(err instanceof Error ? err.message : String(err));
    } finally {
      setScreenshotLoading(false);
    }
  }, []);

  const showBlocked = frameableStatus === 'no' || iframeStuck;
  const showChecking = frameableStatus === 'checking';

  // Trigger screenshot capture whenever the pane is in blocked state with a URL
  useEffect(() => {
    if (showBlocked && url) {
      captureScreenshot(url);
    }
  }, [showBlocked, url, captureScreenshot]);

  if (!url) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: '#6b6b6b', backgroundColor: '#1e1e1e',
      }}>
        <Monitor size={28} color="#3c3c3c" />
        <div style={{ marginTop: 10, fontSize: 12 }}>Select a URL to preview</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#1e1e1e' }}>
      {/* Preview header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px',
        height: 30, backgroundColor: '#252526', borderBottom: '1px solid #3c3c3c',
        flexShrink: 0,
      }}>
        <span style={{ color: '#9e9e9e', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Preview
        </span>

        {showChecking && (
          <span style={{ fontSize: 11, color: '#569cd6' }}>
            <Spinner /> checking…
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Refresh screenshot button — only shown after a successful capture */}
        {showBlocked && screenshotSrc && (
          <button
            onClick={() => {
              if (url) {
                screenshotCacheRef.current.delete(url);
                captureScreenshot(url);
              }
            }}
            title="Recapture screenshot"
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: '#9e9e9e', display: 'flex', alignItems: 'center',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = '#cccccc')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = '#9e9e9e')}
          >
            <RefreshCw size={12} />
          </button>
        )}

        {/* Block popups toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, color: '#9e9e9e' }}>
          <input
            type="checkbox"
            checked={blockPopups}
            onChange={(e) => onToggleBlockPopups(e.target.checked)}
            style={{ width: 11, height: 11 }}
          />
          block popups
        </label>

        {/* Open in tab */}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in new tab"
          style={{ color: '#9e9e9e', display: 'flex', alignItems: 'center' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = '#cccccc')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = '#9e9e9e')}
        >
          <ExternalLink size={12} />
        </a>
      </div>

      {/* URL display */}
      <div style={{
        padding: '2px 10px', fontSize: 11, color: '#6b6b6b',
        backgroundColor: '#1e1e1e', borderBottom: '1px solid #2d2d2d',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        flexShrink: 0,
      }}>
        {url}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Iframe */}
        {showIframe && (
          <div style={{ position: 'absolute', inset: 0, padding: 50, backgroundColor: '#141414', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div ref={contentRef} style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
              <div style={{
                position: 'absolute', top: 0, left: 0,
                width: DESKTOP_W,
                height: iframeScale > 0 ? `${100 / iframeScale}%` : '100%',
                transform: `scale(${iframeScale})`,
                transformOrigin: 'top left',
              }}>
                <iframe
                  ref={iframeRef}
                  src={url}
                  onLoad={handleIframeLoad}
                  sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                  style={{
                    width: '100%', height: '100%', border: '1px solid #3c3c3c',
                    display: 'block',
                    opacity: iframeLoaded ? 1 : 0,
                    transition: 'opacity 0.2s',
                  }}
                />
              </div>
            </div>
            {!iframeLoaded && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#6b6b6b', fontSize: 12,
              }}>
                <Spinner /> &nbsp;Loading preview…
              </div>
            )}
          </div>
        )}

        {/* Blocked — screenshot fallback */}
        {showBlocked && (
          <div style={{ position: 'absolute', inset: 0, padding: 50, backgroundColor: '#141414', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Show loading whenever we don't yet have a result — covers the brief gap
                between URL change resetting state and captureScreenshot setting loading=true */}
            {(screenshotLoading || (!screenshotSrc && !screenshotError)) && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <Spinner />
                <div style={{ fontSize: 11, color: '#6b6b6b', textAlign: 'center' }}>
                  Live preview blocked, capturing screenshot…
                </div>
              </div>
            )}

            {screenshotError && !screenshotLoading && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 10, color: '#9e9e9e',
              }}>
                <ShieldOff size={28} color="#3c3c3c" />
                <div style={{ fontSize: 11, color: '#cc4444', textAlign: 'center', maxWidth: 240 }}>
                  {screenshotError}
                </div>
                <button
                  onClick={() => {
                    screenshotCacheRef.current.delete(url);
                    captureScreenshot(url);
                  }}
                  style={{
                    fontSize: 11, color: '#569cd6', background: 'none', border: '1px solid #3c3c3c',
                    borderRadius: 2, padding: '3px 8px', cursor: 'pointer',
                  }}
                >
                  Retry
                </button>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, fontSize: 11,
                    color: '#569cd6', textDecoration: 'none', border: '1px solid #3c3c3c',
                    borderRadius: 2, padding: '3px 8px',
                  }}
                >
                  <ExternalLink size={11} /> Open in browser
                </a>
              </div>
            )}

            {screenshotSrc && !screenshotLoading && (
              <div style={{ flex: 1, overflowY: 'auto', borderRadius: 2 }}>
                <img src={screenshotSrc} style={{ width: '100%', display: 'block' }} alt="Screenshot" />
              </div>
            )}
          </div>
        )}

        {/* Checking / unchecked */}
        {(frameableStatus === 'checking' || frameableStatus === 'unchecked') && !showIframe && !showBlocked && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#6b6b6b', fontSize: 12, gap: 6,
          }}>
            <Spinner />
            Checking preview availability…
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span style={{
      display: 'inline-block', width: 12, height: 12, verticalAlign: 'middle',
      border: '1.5px solid #3c3c3c', borderTopColor: '#569cd6',
      borderRadius: '50%', animation: 'spin 0.8s linear infinite',
    }} />
  );
}

if (typeof document !== 'undefined' && !document.getElementById('scout-spin-kf')) {
  const style = document.createElement('style');
  style.id = 'scout-spin-kf';
  style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
}
