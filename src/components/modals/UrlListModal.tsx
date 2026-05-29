import { useState } from 'react';
import { X, Copy, Download, Check } from 'lucide-react';
import type { SitemapNode } from '../../types';

interface Props {
  nodes: SitemapNode[];
  rootUrl: string;
  onClose: () => void;
}

export default function UrlListModal({ nodes, rootUrl, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  const urls = nodes.map((n) => n.url).filter(Boolean) as string[];
  const text = urls.join('\n');

  function handleCopy() {
    const confirm = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(confirm).catch(fallback);
    } else {
      fallback();
    }
    function fallback() {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(el);
      el.select();
      try { document.execCommand('copy'); confirm(); } catch { /* ignore */ }
      document.body.removeChild(el);
    }
  }

  function handleDownload() {
    const hostname = (() => { try { return new URL(rootUrl).hostname; } catch { return 'urls'; } })();
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${hostname}-urls.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Modal title="Selected URLs" onClose={onClose} width={Math.min(window.innerWidth - 32, 900)}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button onClick={handleDownload} style={btnStyle(true)}>
          <Download size={12} /> Download .txt
        </button>
        <button
          onClick={handleCopy}
          style={btnStyle(false)}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied!' : 'Copy to clipboard'}
        </button>
      </div>

      <div style={{
        border: '1px solid #3c3c3c', borderRadius: 2,
        backgroundColor: '#1e1e1e', maxHeight: 520, overflowY: 'auto',
        padding: '8px 0',
      }}>
        {urls.map((url, i) => (
          <div key={i} style={{
            padding: '1px 12px', fontSize: 12, color: '#9e9e9e',
            fontFamily: 'inherit', wordBreak: 'break-all',
          }}>
            {url}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: '#6b6b6b', textAlign: 'right' }}>
        {urls.length} URLs
      </div>
    </Modal>
  );
}

function btnStyle(primary: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
    fontSize: 12, fontFamily: 'inherit', border: '1px solid',
    borderColor: primary ? '#569cd6' : '#3c3c3c', borderRadius: 2,
    backgroundColor: primary ? '#094771' : 'transparent',
    color: primary ? '#9cdcfe' : '#cccccc', cursor: 'pointer',
  };
}

export function Modal({
  title, children, onClose, width = 480,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  width?: number;
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 64px)',
        backgroundColor: '#252526', border: '1px solid #3c3c3c', borderRadius: 2,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 12px', height: 36, borderBottom: '1px solid #3c3c3c', flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, color: '#cccccc', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {title}
          </span>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'none', cursor: 'pointer',
              color: '#9e9e9e', display: 'flex', alignItems: 'center', padding: 2,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 14, overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
