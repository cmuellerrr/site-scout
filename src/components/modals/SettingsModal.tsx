import { useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from './UrlListModal';
import type { AppSettings } from '../../types';

interface Props {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onClose: () => void;
}

const PRESET_PATHS = ['/blog', '/news', '/support', '/forum', '/careers', '/tag', '/author', '/category', '/page'];

export default function SettingsModal({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [customInput, setCustomInput] = useState('');

  const customPaths = draft.excludePaths.filter((p) => !PRESET_PATHS.includes(p));

  function togglePreset(path: string) {
    setDraft((prev) => ({
      ...prev,
      excludePaths: prev.excludePaths.includes(path)
        ? prev.excludePaths.filter((p) => p !== path)
        : [...prev.excludePaths, path],
    }));
  }

  function addCustomPath() {
    let path = customInput.trim();
    if (!path) return;
    if (!path.startsWith('/')) path = `/${path}`;
    if (!draft.excludePaths.includes(path)) {
      setDraft((prev) => ({ ...prev, excludePaths: [...prev.excludePaths, path] }));
    }
    setCustomInput('');
  }

  function removeCustomPath(path: string) {
    setDraft((prev) => ({ ...prev, excludePaths: prev.excludePaths.filter((p) => p !== path) }));
  }

  return (
    <Modal title="Settings" onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Crawl */}
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
        </Section>

        {/* Filters */}
        <Section title="Filters">
          <FieldRow label="Locale variants" hint="e.g. /fr/, /en-gb/">
            <CheckOption
              label="Skip locale pages during crawl"
              checked={draft.filterLocales}
              onChange={(v) => setDraft((p) => ({ ...p, filterLocales: v }))}
            />
          </FieldRow>

          <FieldRow label="Exclude paths" hint="Skipped during crawl">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* Preset toggles */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {PRESET_PATHS.map((path) => {
                  const active = draft.excludePaths.includes(path);
                  return (
                    <button
                      key={path}
                      onClick={() => togglePreset(path)}
                      style={{
                        fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
                        padding: '2px 7px', borderRadius: 2,
                        border: `1px solid ${active ? '#569cd6' : '#3c3c3c'}`,
                        backgroundColor: active ? '#094771' : 'transparent',
                        color: active ? '#9cdcfe' : '#6b6b6b',
                        transition: 'all 0.1s',
                      }}
                    >
                      {path}
                    </button>
                  );
                })}
              </div>

              {/* Custom chips */}
              {customPaths.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {customPaths.map((path) => (
                    <span
                      key={path}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontSize: 11, padding: '2px 4px 2px 7px',
                        border: '1px solid #569cd6', borderRadius: 2,
                        backgroundColor: '#094771', color: '#9cdcfe',
                      }}
                    >
                      {path}
                      <button
                        onClick={() => removeCustomPath(path)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#9cdcfe', padding: '0 1px', lineHeight: 1,
                        }}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Custom path input */}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addCustomPath(); }}
                  placeholder="Custom path, e.g. /docs"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button onClick={addCustomPath} style={cancelBtn}>Add</button>
              </div>

            </div>
          </FieldRow>
        </Section>

        {/* Save */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={cancelBtn}>Cancel</button>
          <button onClick={() => onSave(draft)} style={saveBtn}>Save settings</button>
        </div>
      </div>
    </Modal>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '4px 8px', backgroundColor: '#3c3c3c',
  border: '1px solid #555', borderRadius: 2, color: '#cccccc',
  fontFamily: 'inherit', fontSize: 12, outline: 'none',
};

const cancelBtn: React.CSSProperties = {
  padding: '4px 12px', fontSize: 12, fontFamily: 'inherit',
  border: '1px solid #3c3c3c', borderRadius: 2,
  backgroundColor: 'transparent', color: '#9e9e9e', cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const saveBtn: React.CSSProperties = {
  padding: '4px 14px', fontSize: 12, fontFamily: 'inherit',
  border: '1px solid #569cd6', borderRadius: 2,
  backgroundColor: '#094771', color: '#9cdcfe', cursor: 'pointer',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 10, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.1em',
        marginBottom: 10, paddingBottom: 4, borderBottom: '1px solid #2d2d2d',
      }}>
        {title}
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
