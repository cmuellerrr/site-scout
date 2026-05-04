import { X } from 'lucide-react';
import type { LogEntry } from '../../types';
import { useEffect, useRef } from 'react';

interface Props {
  url: string;
  progress: { phase: string; crawled: number; total: number; found: number };
  logs: LogEntry[];
  onCancel: () => void;
}

const LEVEL_COLOR: Record<LogEntry['level'], string> = {
  info: '#9e9e9e',
  warn: '#cca700',
  error: '#f44747',
};

function formatTime(ts: number): string {
  return new Date(ts).toTimeString().slice(0, 8);
}

export default function ScanningState({ url, progress, logs, onCancel }: Props) {
  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  let hostname = url;
  try { hostname = new URL(url).hostname; } catch { /* ignore */ }

  const phaseLabel = progress.phase === 'sitemap' ? 'Parsing sitemaps'
    : progress.phase === 'bfs' ? 'Crawling pages'
    : 'Initializing';

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      backgroundColor: '#1e1e1e',
    }}>
      {/* Status header */}
      <div style={{
        padding: '20px 24px 16px', borderBottom: '1px solid #3c3c3c',
        backgroundColor: '#252526', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: '#cccccc', marginBottom: 4 }}>
              <SpinnerInline /> &nbsp;Scanning <span style={{ color: '#9cdcfe' }}>{hostname}</span>
            </div>
            <div style={{ fontSize: 11, color: '#6b6b6b' }}>
              {phaseLabel}
              {progress.found > 0 && <span> — {progress.found} URLs found</span>}
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
              fontSize: 11, fontFamily: 'inherit', border: '1px solid #3c3c3c',
              borderRadius: 2, backgroundColor: 'transparent', color: '#9e9e9e',
              cursor: 'pointer',
            }}
          >
            <X size={11} /> Cancel
          </button>
        </div>

        {/* Progress bar */}
        {progress.total > 0 && (
          <div style={{ height: 2, backgroundColor: '#3c3c3c', borderRadius: 1, overflow: 'hidden' }}>
            <div style={{
              height: '100%', backgroundColor: '#569cd6', borderRadius: 1,
              width: `${Math.min(100, (progress.crawled / Math.max(progress.total, 1)) * 100)}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>
        )}
        {progress.total === 0 && (
          <div style={{ height: 2, backgroundColor: '#3c3c3c', borderRadius: 1, overflow: 'hidden' }}>
            <div style={{
              height: '100%', backgroundColor: '#569cd6', borderRadius: 1,
              width: '30%',
              animation: 'scan-pulse 1.5s ease-in-out infinite',
            }} />
          </div>
        )}
      </div>

      {/* Live log stream */}
      <div
        ref={logsRef}
        style={{
          flex: 1, overflowY: 'auto', padding: '8px 0',
          fontFamily: 'inherit', fontSize: 11, lineHeight: '18px',
        }}
      >
        {logs.map((entry, i) => (
          <div
            key={i}
            style={{
              display: 'flex', gap: 8, padding: '0 24px',
              color: LEVEL_COLOR[entry.level],
            }}
          >
            <span style={{ flexShrink: 0, color: '#555', minWidth: 70 }}>
              {formatTime(entry.timestamp)}
            </span>
            <span style={{ wordBreak: 'break-all' }}>{entry.message}</span>
          </div>
        ))}
        {logs.length === 0 && (
          <div style={{ padding: '8px 24px', color: '#555' }}>Connecting to crawl server…</div>
        )}
      </div>

      <style>{`
        @keyframes scan-pulse {
          0%, 100% { transform: translateX(-100%); }
          50% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}

function SpinnerInline() {
  return (
    <span style={{
      display: 'inline-block', width: 11, height: 11, verticalAlign: 'middle',
      border: '1.5px solid #3c3c3c', borderTopColor: '#569cd6',
      borderRadius: '50%', animation: 'spin 0.8s linear infinite',
    }} />
  );
}
