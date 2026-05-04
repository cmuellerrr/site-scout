import { useRef, useMemo } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { toPng } from 'html-to-image';
import { Download, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { Modal } from './UrlListModal';
import type { SitemapNode } from '../../types';

interface Props {
  nodes: SitemapNode[];
  selectedPaths: Set<string>;
  rootUrl: string;
  onClose: () => void;
}

function filterToSelected(node: SitemapNode, selected: Set<string>): SitemapNode | null {
  // Include if this node or any descendant is selected
  const filteredChildren: SitemapNode[] = [];
  for (const child of node.children) {
    const filtered = filterToSelected(child, selected);
    if (filtered) filteredChildren.push(filtered);
  }
  const selfSelected = node.url !== null && selected.has(node.path);
  if (selfSelected || filteredChildren.length > 0) {
    return { ...node, children: filteredChildren };
  }
  return null;
}

function getPathLabel(path: string): string {
  if (path === '/') return '/';
  const parts = path.split('/').filter(Boolean);
  return '/' + (parts[parts.length - 1] || '');
}

// Depth-based colors
const DEPTH_COLORS = [
  { bg: '#094771', border: '#569cd6', text: '#9cdcfe' }, // 0
  { bg: '#1e3a1e', border: '#4ec9b0', text: '#4ec9b0' }, // 1
  { bg: '#3a2e00', border: '#dcdcaa', text: '#dcdcaa' }, // 2
  { bg: '#2d1b2e', border: '#c586c0', text: '#c586c0' }, // 3
  { bg: '#2e1e00', border: '#ce9178', text: '#ce9178' }, // 4+
];

function getColor(depth: number) {
  return DEPTH_COLORS[Math.min(depth, DEPTH_COLORS.length - 1)];
}

// Inject CSS for tree connector lines once
if (typeof document !== 'undefined' && !document.getElementById('scout-diagram-css')) {
  const s = document.createElement('style');
  s.id = 'scout-diagram-css';
  s.textContent = `
    .ds-children { display: flex; align-items: flex-start; }
    .ds-child { display: flex; flex-direction: column; align-items: center; padding: 0 10px; }
    .ds-multi > .ds-child { border-top: 1px solid #3c3c3c; }
    .ds-multi > .ds-child:first-child { border-left: none; }
    .ds-multi > .ds-child:last-child { border-right: none; }
  `;
  document.head.appendChild(s);
}

const LINE = '#3c3c3c';

interface TreeNodeProps {
  node: SitemapNode;
  depth: number;
}

function DiagramNode({ node, depth }: TreeNodeProps) {
  const color = getColor(depth);
  const label = getPathLabel(node.path);
  const hasChildren = node.children.length > 0;
  const isSingle = node.children.length === 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Node box */}
      <div style={{
        padding: '4px 10px', border: `1px solid ${color.border}`, borderRadius: 2,
        backgroundColor: color.bg, color: color.text, fontSize: 11,
        fontFamily: 'inherit', whiteSpace: 'nowrap', maxWidth: 140,
        overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'default',
      }} title={node.path}>
        {label}
      </div>

      {hasChildren && (
        <>
          {/* Vertical line from parent down to connector */}
          <div style={{ width: 1, height: 14, backgroundColor: LINE }} />

          <div className={`ds-children ${isSingle ? '' : 'ds-multi'}`}>
            {node.children.map((child) => (
              <div key={child.path} className="ds-child">
                {/* Vertical stub from connector bar down to child */}
                <div style={{ width: 1, height: 14, backgroundColor: LINE }} />
                <DiagramNode node={child} depth={depth + 1} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function VisualSitemapModal({ nodes, selectedPaths, rootUrl, onClose }: Props) {
  const diagramRef = useRef<HTMLDivElement>(null);

  const filteredNodes = useMemo(() => {
    return nodes.map((n) => filterToSelected(n, selectedPaths)).filter(Boolean) as SitemapNode[];
  }, [nodes, selectedPaths]);

  function handleExport() {
    if (!diagramRef.current) return;
    toPng(diagramRef.current, { backgroundColor: '#1e1e1e', pixelRatio: 2 }).then((dataUrl) => {
      const a = document.createElement('a');
      const hostname = (() => { try { return new URL(rootUrl).hostname; } catch { return 'sitemap'; } })();
      a.href = dataUrl;
      a.download = `${hostname}-sitemap.png`;
      a.click();
    });
  }

  return (
    <Modal title="Site Diagram" onClose={onClose} width={Math.min(window.innerWidth - 32, 900)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Controls */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button onClick={handleExport} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px',
            fontSize: 11, fontFamily: 'inherit', border: '1px solid #569cd6', borderRadius: 2,
            backgroundColor: '#094771', color: '#9cdcfe', cursor: 'pointer',
          }}>
            <Download size={11} /> Export PNG
          </button>
        </div>

        {/* Diagram canvas */}
        <div style={{
          border: '1px solid #3c3c3c', borderRadius: 2, backgroundColor: '#1e1e1e',
          overflow: 'hidden', height: 480,
        }}>
          <TransformWrapper minScale={0.2} maxScale={3} initialScale={0.8} centerOnInit>
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                {/* Zoom controls */}
                <div style={{
                  position: 'absolute', zIndex: 10, top: 8, right: 8,
                  display: 'flex', gap: 4,
                }}>
                  {[
                    { icon: <ZoomIn size={12} />, fn: () => zoomIn() },
                    { icon: <ZoomOut size={12} />, fn: () => zoomOut() },
                    { icon: <Maximize size={12} />, fn: () => resetTransform() },
                  ].map((ctrl, i) => (
                    <button key={i} onClick={ctrl.fn} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 24, height: 24, border: '1px solid #3c3c3c', borderRadius: 2,
                      backgroundColor: '#252526', color: '#9e9e9e', cursor: 'pointer',
                    }}>
                      {ctrl.icon}
                    </button>
                  ))}
                </div>

                <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                  <div
                    ref={diagramRef}
                    style={{ padding: 32, display: 'inline-flex', alignItems: 'flex-start' }}
                  >
                    {filteredNodes.length === 0 ? (
                      <div style={{ color: '#6b6b6b', fontSize: 12 }}>No selected URLs to display.</div>
                    ) : (
                      filteredNodes.map((node) => (
                        <div key={node.path} style={{ padding: '0 16px' }}>
                          <DiagramNode node={node} depth={0} />
                        </div>
                      ))
                    )}
                  </div>
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        </div>

        <div style={{ fontSize: 11, color: '#555', textAlign: 'right' }}>
          Showing {selectedPaths.size} selected URLs · Scroll to zoom · Drag to pan
        </div>
      </div>
    </Modal>
  );
}
