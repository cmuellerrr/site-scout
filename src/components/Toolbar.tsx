import { Settings, Globe } from 'lucide-react';
import { useState } from 'react';

interface Props {
  urlInput: string;
  onUrlChange: (val: string) => void;
  onScan: () => void;
  scanning: boolean;
  onOpenSettings: () => void;
}

function isValidUrl(val: string): boolean {
  const v = val.trim();
  if (!v) return false;
  if (v.includes(' ')) return false;
  return v.includes('.');
}

export default function Toolbar({ urlInput, onUrlChange, onScan, scanning, onOpenSettings }: Props) {
  const [focused, setFocused] = useState(false);
  const invalid = urlInput.length > 0 && !isValidUrl(urlInput);
  const canScan = isValidUrl(urlInput) && !scanning;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && canScan) onScan();
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
      height: 44, backgroundColor: '#2d2d2d', borderBottom: '1px solid #3c3c3c',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
        <Globe size={16} color="#569cd6" />
        <span style={{ color: '#9cdcfe', fontWeight: 600, fontSize: 13, letterSpacing: '0.05em' }}>
          SITE SCOUT
        </span>
      </div>

      <div style={{ width: 1, height: 20, backgroundColor: '#3c3c3c' }} />

      {/* URL input */}
      <div style={{ flex: 1, position: 'relative' }}>
        <input
          type="text"
          value={urlInput}
          onChange={(e) => onUrlChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="https://example.com"
          spellCheck={false}
          style={{
            width: '100%',
            padding: '4px 8px',
            backgroundColor: '#3c3c3c',
            border: `1px solid ${invalid ? '#f44747' : focused ? '#569cd6' : '#555'}`,
            borderRadius: 2,
            color: '#cccccc',
            fontFamily: 'inherit',
            fontSize: 13,
            outline: 'none',
            transition: 'border-color 0.1s',
          }}
        />
        {invalid && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 2,
            fontSize: 11, color: '#f44747', pointerEvents: 'none',
          }}>
            Invalid URL
          </div>
        )}
      </div>

      {/* Scan button */}
      <button
        onClick={onScan}
        disabled={!canScan}
        style={{
          padding: '4px 14px',
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 500,
          border: '1px solid',
          borderColor: canScan ? '#569cd6' : '#3c3c3c',
          borderRadius: 2,
          backgroundColor: canScan ? '#094771' : '#2d2d2d',
          color: canScan ? '#9cdcfe' : '#555',
          cursor: canScan ? 'pointer' : 'not-allowed',
          whiteSpace: 'nowrap',
          transition: 'all 0.1s',
        }}
      >
        {scanning ? 'Scanning…' : 'Scan'}
      </button>

      <div style={{ width: 1, height: 20, backgroundColor: '#3c3c3c' }} />

      {/* Settings */}
      <button
        onClick={onOpenSettings}
        title="Settings"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, border: '1px solid #3c3c3c', borderRadius: 2,
          backgroundColor: 'transparent', color: '#9e9e9e', cursor: 'pointer',
          transition: 'all 0.1s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = '#cccccc';
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#555';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = '#9e9e9e';
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#3c3c3c';
        }}
      >
        <Settings size={14} />
      </button>
    </div>
  );
}
