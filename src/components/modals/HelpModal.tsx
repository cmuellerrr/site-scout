import { Globe, Search, Monitor, Camera } from 'lucide-react';
import { Modal } from './UrlListModal';

export default function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="About Site Scout" onClose={onClose} width={580}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* Tagline */}
        <div style={{ padding: '14px 16px 16px', borderBottom: '1px solid #2d2d2d' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Globe size={15} color="#569cd6" />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#9cdcfe', letterSpacing: '0.05em' }}>
              SITE SCOUT
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: '#9e9e9e', lineHeight: 1.6 }}>
            Crawl any website, explore its URL structure, preview pages, and capture bulk screenshots —
            all without leaving the tool.
          </p>
        </div>

        {/* Two-column layout */}
        <div style={{ display: 'flex', gap: 0 }}>

          {/* Left: feature descriptions */}
          <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

            <FeatureBlock icon={<Search size={13} color="#569cd6" />} title="Scanning">
              Enter any URL and hit <Kbd>Scan</Kbd>. Scout first checks for a sitemap, then
              supplements with a BFS crawl up to the depth you set in Settings
              to discover all child pages.
            </FeatureBlock>

            <FeatureBlock icon={<Monitor size={13} color="#569cd6" />} title="Preview">
              Click any row in the tree to open a live preview. If the site blocks embedding,
              Scout automatically falls back to a full-page screenshot so you always
              get a visual.
            </FeatureBlock>

            <FeatureBlock icon={<Camera size={13} color="#569cd6" />} title="Screenshots">
              Check the URLs you want in the tree, then hit <Kbd>Screenshots</Kbd>. Scout
              captures desktop and/or mobile renders for up to 50 pages at a time and
              packages them as a ZIP download.
            </FeatureBlock>

          </div>

          {/* Right: illustration */}
          <div style={{
            width: 200, flexShrink: 0, borderLeft: '1px solid #2d2d2d',
            padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <AppIllustration />
          </div>

        </div>

        {/* Tips footer */}
        <div style={{
          borderTop: '1px solid #2d2d2d', padding: '10px 16px',
          display: 'flex', gap: 16, flexWrap: 'wrap',
        }}>
          <Tip>Filter the tree with the <Kbd>⌕</Kbd> button to find specific paths quickly.</Tip>
          <Tip>Right-click any URL in the tree to copy it or open it in a browser tab.</Tip>
        </div>

      </div>
    </Modal>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FeatureBlock({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 600, color: '#cccccc', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {title}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: '#9e9e9e', lineHeight: 1.65 }}>
        {children}
      </p>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-block', padding: '0 4px', fontSize: 10,
      backgroundColor: '#2d2d2d', border: '1px solid #3c3c3c',
      borderRadius: 2, color: '#cccccc', lineHeight: '16px',
      verticalAlign: 'baseline', whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: '#6b6b6b', lineHeight: 1.5, flex: '1 1 200px' }}>
      <span style={{ color: '#569cd6', marginRight: 4 }}>›</span>
      {children}
    </div>
  );
}

// ── Div-based app illustration ────────────────────────────────────────────────

function AppIllustration() {
  const rows: { label: string; depth: number; checked: boolean; active?: boolean }[] = [
    { label: 'home', depth: 0, checked: true, active: true },
    { label: 'about', depth: 0, checked: true },
    { label: 'team', depth: 1, checked: true },
    { label: 'careers', depth: 0, checked: false },
    { label: 'open-roles', depth: 1, checked: false },
    { label: 'blog', depth: 0, checked: true },
    { label: 'getting-started', depth: 1, checked: true },
    { label: 'advanced', depth: 1, checked: false },
    { label: 'contact', depth: 0, checked: true },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      {/* Mini toolbar */}
      <div style={{
        height: 18, backgroundColor: '#2d2d2d', border: '1px solid #3c3c3c',
        borderRadius: 2, display: 'flex', alignItems: 'center', gap: 4, padding: '0 5px',
      }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#569cd6' }} />
        <div style={{ flex: 1, height: 5, backgroundColor: '#3c3c3c', borderRadius: 1 }} />
        <div style={{ width: 18, height: 8, backgroundColor: '#094771', border: '1px solid #569cd6', borderRadius: 1 }} />
      </div>

      {/* Mini split pane */}
      <div style={{ flex: 1, display: 'flex', gap: 5, minHeight: 0 }}>

        {/* Mini tree */}
        <div style={{
          width: 90, border: '1px solid #3c3c3c', borderRadius: 2,
          backgroundColor: '#1e1e1e', overflow: 'hidden',
        }}>
          {/* Tree header */}
          <div style={{
            height: 14, backgroundColor: '#252526', borderBottom: '1px solid #3c3c3c',
            display: 'flex', alignItems: 'center', padding: '0 4px', gap: 3,
          }}>
            <div style={{ width: 20, height: 4, backgroundColor: '#3c3c3c', borderRadius: 1 }} />
            <div style={{ flex: 1 }} />
            <div style={{ width: 10, height: 4, backgroundColor: '#3c3c3c', borderRadius: 1 }} />
          </div>
          {/* Tree rows */}
          {rows.map((r, i) => (
            <div key={i} style={{
              height: 12, display: 'flex', alignItems: 'center',
              paddingLeft: 3 + r.depth * 7,
              backgroundColor: r.active ? '#094771' : 'transparent',
              borderLeft: r.active ? '2px solid #569cd6' : '2px solid transparent',
            }}>
              <div style={{
                width: 5, height: 5, border: `1px solid ${r.checked ? '#569cd6' : '#555'}`,
                backgroundColor: r.checked ? '#094771' : 'transparent',
                borderRadius: 1, flexShrink: 0, marginRight: 3,
              }} />
              <div style={{
                height: 3, borderRadius: 1,
                width: 28 - r.depth * 5,
                backgroundColor: r.active ? '#569cd6' : r.checked ? '#4a4a4a' : '#333',
              }} />
            </div>
          ))}
        </div>

        {/* Mini preview pane */}
        <div style={{
          flex: 1, border: '1px solid #3c3c3c', borderRadius: 2,
          backgroundColor: '#141414', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Preview header */}
          <div style={{
            height: 14, backgroundColor: '#252526', borderBottom: '1px solid #3c3c3c',
            display: 'flex', alignItems: 'center', padding: '0 4px',
          }}>
            <div style={{ width: 16, height: 4, backgroundColor: '#3c3c3c', borderRadius: 1 }} />
          </div>
          {/* Image placeholder */}
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#1a1a1a',
          }}>
            {/* Mountain + sun image icon */}
            <svg width="28" height="24" viewBox="0 0 28 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="26" height="22" rx="1.5" stroke="#3c3c3c" strokeWidth="1.5" />
              <circle cx="9" cy="8" r="2.5" stroke="#4a4a4a" strokeWidth="1.5" />
              <polyline points="1,18 8,10 14,16 19,11 27,18" stroke="#4a4a4a" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

      </div>

      {/* Mini task bar */}
      <div style={{
        height: 14, backgroundColor: '#252526', border: '1px solid #3c3c3c',
        borderRadius: 2, display: 'flex', alignItems: 'center',
        justifyContent: 'flex-end', gap: 4, padding: '0 5px',
      }}>
        <div style={{ width: 20, height: 7, backgroundColor: '#2d2d2d', border: '1px solid #3c3c3c', borderRadius: 1 }} />
        <div style={{ width: 28, height: 7, backgroundColor: '#094771', border: '1px solid #569cd6', borderRadius: 1 }} />
      </div>

    </div>
  );
}
