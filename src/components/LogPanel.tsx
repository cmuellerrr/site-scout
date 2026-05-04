import { useEffect, useRef } from 'react';
import { Terminal, ChevronUp, ChevronDown } from 'lucide-react';
import type { LogEntry } from '../types';

interface Props {
  logs: LogEntry[];
  open: boolean;
  onToggle: () => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8);
}

const LEVEL_COLOR: Record<LogEntry['level'], string> = {
  info: '#9e9e9e',
  warn: '#cca700',
  error: '#f44747',
};

const LEVEL_PREFIX: Record<LogEntry['level'], string> = {
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERR  ',
};

export default function LogPanel({ logs, open, onToggle }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, open]);

  return (
    <div style={{
      flexShrink: 0,
      borderTop: '1px solid #3c3c3c',
      backgroundColor: '#1e1e1e',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Panel header */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px',
          height: 26, cursor: 'pointer', backgroundColor: '#252526',
          borderBottom: open ? '1px solid #3c3c3c' : 'none',
          userSelect: 'none',
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.backgroundColor = '#2a2d2e')}
        onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.backgroundColor = '#252526')}
      >
        <Terminal size={12} color="#9e9e9e" />
        <span style={{ fontSize: 11, color: '#9e9e9e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Crawl Log
        </span>
        {logs.length > 0 && (
          <span style={{
            fontSize: 10, color: '#569cd6', backgroundColor: '#094771',
            borderRadius: 2, padding: '0 4px', lineHeight: '16px',
          }}>
            {logs.length}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {open ? <ChevronDown size={12} color="#9e9e9e" /> : <ChevronUp size={12} color="#9e9e9e" />}
      </div>

      {/* Log content */}
      {open && (
        <div style={{
          height: 180, overflowY: 'auto', padding: '4px 0',
          fontFamily: 'inherit', fontSize: 11, lineHeight: '18px',
        }}>
          {logs.length === 0 ? (
            <div style={{ padding: '4px 12px', color: '#6b6b6b' }}>No log entries yet.</div>
          ) : (
            logs.map((entry, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', gap: 8, padding: '0 12px',
                  color: LEVEL_COLOR[entry.level],
                  backgroundColor: entry.level === 'error' ? 'rgba(244,71,71,0.06)' : 'transparent',
                }}
              >
                <span style={{ flexShrink: 0, color: '#555', minWidth: 70 }}>
                  {formatTime(entry.timestamp)}
                </span>
                <span style={{ flexShrink: 0, color: LEVEL_COLOR[entry.level], minWidth: 40 }}>
                  {LEVEL_PREFIX[entry.level]}
                </span>
                <span style={{ wordBreak: 'break-all' }}>{entry.message}</span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
