import { useState, useEffect, useRef, useCallback } from 'react';
import { ExternalLink, ShieldOff, Monitor } from 'lucide-react';
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

  // Reset state when URL changes
  useEffect(() => {
    setIframeLoaded(false);
    setIframeStuck(false);
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

  // Re-run when showIframe changes so the ref is populated when the div mounts
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
    // Check if iframe navigated to about:blank (frame-busting)
    try {
      const loc = iframeRef.current?.contentWindow?.location.href;
      if (loc === 'about:blank') return; // busted
    } catch { /* cross-origin, that's fine */ }
    setIframeLoaded(true);
    setIframeStuck(false);
    if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
  }, []);

  const showBlocked = frameableStatus === 'no' || iframeStuck;
  const showChecking = frameableStatus === 'checking';

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

        {showBlocked && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#cca700' }}>
            <ShieldOff size={11} /> blocked
          </span>
        )}

        <div style={{ flex: 1 }} />

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
              {/* Wrapper div scaled to fit — applying transform to the iframe itself doesn't clip correctly */}
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

        {/* Blocked */}
        {showBlocked && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 10,
            color: '#9e9e9e',
          }}>
            <ShieldOff size={28} color="#3c3c3c" />
            <div style={{ fontSize: 12, textAlign: 'center' }}>
              <div style={{ marginBottom: 4 }}>
                {iframeStuck ? 'Preview unavailable' : 'Preview blocked by site'}
              </div>
              <div style={{ fontSize: 11, color: '#6b6b6b' }}>Screenshots will still work</div>
            </div>
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

// Inject the spin keyframe once
if (typeof document !== 'undefined' && !document.getElementById('scout-spin-kf')) {
  const style = document.createElement('style');
  style.id = 'scout-spin-kf';
  style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
}
