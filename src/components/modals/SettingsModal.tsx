import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Modal } from './UrlListModal';
import type { AppSettings } from '../../types';

interface Props {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onClose: () => void;
}

export default function SettingsModal({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<AppSettings>(settings);

  function handleSave() {
    onSave(draft);
  }

  return (
    <Modal title="Settings" onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Crawl settings */}
        <Section title="Crawl">
          <FieldRow label="Depth" hint="From root page">
            <div style={{ display: 'flex', gap: 6 }}>
              {[1, 2, 3, 4, 5].map((d) => (
                <button
                  key={d}
                  onClick={() => setDraft((p) => ({ ...p, depth: d }))}
                  style={{
                    width: 32, height: 26, border: '1px solid', borderRadius: 2,
                    borderColor: draft.depth === d ? '#569cd6' : '#3c3c3c',
                    backgroundColor: draft.depth === d ? '#094771' : 'transparent',
                    color: draft.depth === d ? '#9cdcfe' : '#9e9e9e',
                    fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </FieldRow>
          <FieldRow label="Localized pages" hint="e.g. /fr/, /en-gb/">
            <CheckOption
              label="Hide locale variants"
              checked={draft.filterLocales}
              onChange={(v) => setDraft((p) => ({ ...p, filterLocales: v }))}
            />
          </FieldRow>
        </Section>


        {/* Save */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={cancelBtn}>Cancel</button>
          <button onClick={handleSave} style={saveBtn}>Save settings</button>
        </div>
      </div>
    </Modal>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '4px 8px', backgroundColor: '#3c3c3c',
  border: '1px solid #555', borderRadius: 2, color: '#cccccc',
  fontFamily: 'inherit', fontSize: 12, outline: 'none',
};

const cancelBtn: React.CSSProperties = {
  padding: '4px 12px', fontSize: 12, fontFamily: 'inherit',
  border: '1px solid #3c3c3c', borderRadius: 2,
  backgroundColor: 'transparent', color: '#9e9e9e', cursor: 'pointer',
};

const saveBtn: React.CSSProperties = {
  padding: '4px 14px', fontSize: 12, fontFamily: 'inherit',
  border: '1px solid #569cd6', borderRadius: 2,
  backgroundColor: '#094771', color: '#9cdcfe', cursor: 'pointer',
};

function Section({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 10, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.1em',
        marginBottom: 10, paddingBottom: 4, borderBottom: '1px solid #2d2d2d',
      }}>
        {title}
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer"
            style={{ color: '#6b6b6b', display: 'flex', alignItems: 'center', lineHeight: 1 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#9e9e9e')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#6b6b6b')}
          >
            <ExternalLink size={10} />
          </a>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  );
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ width: 110, flexShrink: 0, paddingTop: 4 }}>
        <div style={{ fontSize: 12, color: '#9e9e9e' }}>{label}</div>
        {hint && <div style={{ fontSize: 10, color: '#555', marginTop: 1 }}>{hint}</div>}
      </div>
      <div style={{ flex: 1 }}>{children}</div>
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

function SpinnerTiny() {
  return (
    <span style={{
      display: 'inline-block', width: 10, height: 10, verticalAlign: 'middle',
      border: '1.5px solid #3c3c3c', borderTopColor: '#569cd6',
      borderRadius: '50%', animation: 'spin 0.8s linear infinite',
    }} />
  );
}
