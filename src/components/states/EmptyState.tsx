import { Globe } from 'lucide-react';

export default function EmptyState() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 14, color: '#6b6b6b', userSelect: 'none',
    }}>
      <Globe size={40} color="#3c3c3c" strokeWidth={1} />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#9e9e9e', marginBottom: 4 }}>Enter a URL to get started</div>
        <div style={{ fontSize: 12, color: '#555' }}>
          Site Scout will crawl the site and map all pages
        </div>
      </div>

      <div style={{
        marginTop: 8, padding: '8px 16px', border: '1px solid #2d2d2d',
        borderRadius: 2, fontSize: 11, color: '#555', lineHeight: 1.8,
        maxWidth: 340, textAlign: 'center',
      }}>
        Depth 1: direct links only &nbsp;·&nbsp; Depth 3: comprehensive &nbsp;·&nbsp; Depth 5: exhaustive
      </div>
    </div>
  );
}
