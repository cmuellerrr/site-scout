import { AlertTriangle, ShieldX, RefreshCw, ArrowLeft } from 'lucide-react';
import type { CrawlErrorCode } from '../../types';

interface Props {
  code: CrawlErrorCode;
  message: string;
  onBack: () => void;
  onRetry: () => void;
}

const ERROR_DEFS: Record<CrawlErrorCode, {
  icon: 'triangle' | 'shield';
  title: string;
  tips: string[];
}> = {
  unreachable_dns: {
    icon: 'triangle',
    title: 'Site unreachable',
    tips: ['Check the URL for typos', 'Try with or without www prefix', 'Verify the domain exists'],
  },
  unreachable_refused: {
    icon: 'triangle',
    title: 'Connection refused',
    tips: ['The server is not accepting connections', 'The site may be down or have firewall rules'],
  },
  unreachable_timeout: {
    icon: 'triangle',
    title: 'Request timed out',
    tips: ['The server is slow or unresponsive', 'Try again in a moment'],
  },
  unreachable_404: {
    icon: 'triangle',
    title: 'Page not found',
    tips: ['Verify the URL is correct', 'Try the site\'s root domain instead'],
  },
  blocked_http: {
    icon: 'shield',
    title: 'Access blocked',
    tips: [
      'Bot protection is active (Cloudflare, Akamai, or similar) — the server is rejecting automated requests',
      'Try scanning a specific sub-path if only part of the site is protected',
      'Some enterprise and high-traffic sites block all non-browser traffic by design',
    ],
  },
  blocked_empty: {
    icon: 'shield',
    title: 'No pages discovered',
    tips: [
      'The site likely uses a JavaScript framework (React, Next.js, etc.) that renders navigation client-side — links aren\'t in the HTML source',
      'No sitemap.xml was found; check manually at /sitemap.xml or /robots.txt',
      'Try a sub-path like /blog or /docs where static links may be more common',
    ],
  },
};

export default function ScanWarningState({ code, message, onBack, onRetry }: Props) {
  const def = ERROR_DEFS[code] || ERROR_DEFS.unreachable_timeout;
  const isBlocked = def.icon === 'shield';

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: 32, gap: 16, color: '#9e9e9e',
    }}>
      {isBlocked
        ? <ShieldX size={36} color="#cca700" strokeWidth={1.5} />
        : <AlertTriangle size={36} color="#f44747" strokeWidth={1.5} />
      }

      <div style={{ textAlign: 'center', maxWidth: 440 }}>
        <div style={{ fontSize: 15, color: '#cccccc', marginBottom: 6 }}>{def.title}</div>
        <div style={{ fontSize: 11, color: '#555', marginBottom: 16, wordBreak: 'break-all' }}>
          {message}
        </div>

        <div style={{
          borderTop: '1px solid #2d2d2d', paddingTop: 12, textAlign: 'left',
        }}>
          <div style={{ fontSize: 11, color: '#6b6b6b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Suggestions
          </div>
          {def.tips.map((tip, i) => (
            <div key={i} style={{ fontSize: 12, color: '#9e9e9e', marginBottom: 4 }}>
              <span style={{ color: '#555' }}>› </span>{tip}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px',
            fontSize: 12, fontFamily: 'inherit', border: '1px solid #3c3c3c',
            borderRadius: 2, backgroundColor: 'transparent', color: '#9e9e9e', cursor: 'pointer',
          }}
        >
          <ArrowLeft size={12} /> Back
        </button>
        <button
          onClick={onRetry}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px',
            fontSize: 12, fontFamily: 'inherit', border: '1px solid #569cd6',
            borderRadius: 2, backgroundColor: '#094771', color: '#9cdcfe', cursor: 'pointer',
          }}
        >
          <RefreshCw size={12} /> Try again
        </button>
      </div>
    </div>
  );
}
