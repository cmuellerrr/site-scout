import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { SitemapNode } from '../types';
import { getAllDescendantPaths, areAllDescendantsSelected, countRealDescendants, flattenTree } from '../utils/treeUtils';

interface Props {
  nodes: SitemapNode[];
  selectedPaths: Set<string>;
  previewPath: string | null;
  onToggleNode: (node: SitemapNode) => void;
  onToggleChildren: (node: SitemapNode, select: boolean) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onPreviewUrl: (url: string) => void;
  totalCount: number;
  selectedCount: number;
}

function getPathLabel(path: string): string {
  if (path === '/') return '/';
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] || path;
}

export default function TreeView({
  nodes, selectedPaths, previewPath, onToggleNode, onToggleChildren,
  onSelectAll, onClearAll, onPreviewUrl, totalCount, selectedCount,
}: Props) {
  // Initialize with only root-level nodes expanded
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    nodes.forEach(n => { if (n.children.length > 0) s.add(n.path); });
    return s;
  });
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; url: string } | null>(null);

  const toggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // Expand all on load
  const expandAll = useCallback(() => {
    const paths = new Set<string>();
    function walk(n: SitemapNode) {
      if (n.children.length > 0) paths.add(n.path);
      n.children.forEach(walk);
    }
    nodes.forEach(walk);
    setExpanded(paths);
  }, [nodes]);

  const collapseAll = useCallback(() => {
    setExpanded(new Set(['/']));
  }, []);

  const flatRows = useMemo(() => flattenTree(nodes, expanded), [nodes, expanded]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px',
        height: 30, backgroundColor: '#252526', borderBottom: '1px solid #3c3c3c',
        flexShrink: 0,
      }}>
        <span style={{ color: '#9e9e9e', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1 }}>
          Site Map
        </span>
        <span style={{ color: '#6b6b6b', fontSize: 11 }}>
          {selectedCount}/{totalCount}
        </span>
        <div style={{ width: 1, height: 14, backgroundColor: '#3c3c3c' }} />
        <HeaderButton onClick={onSelectAll} title="Select all">All</HeaderButton>
        <HeaderButton onClick={onClearAll} title="Clear selection">None</HeaderButton>
        <div style={{ width: 1, height: 14, backgroundColor: '#3c3c3c' }} />
        <HeaderButton onClick={expandAll} title="Expand all">+</HeaderButton>
        <HeaderButton onClick={collapseAll} title="Collapse all">−</HeaderButton>
      </div>

      {/* Tree rows */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {flatRows.length === 0 ? (
          <div style={{ padding: '16px 12px', color: '#6b6b6b', fontSize: 12 }}>No URLs found.</div>
        ) : (
          flatRows.map(({ node, depth }) => (
            <TreeRow
              key={node.path}
              node={node}
              depth={depth}
              isSelected={node.url !== null && selectedPaths.has(node.path)}
              isPreviewing={previewPath === node.path}
              isExpanded={expanded.has(node.path)}
              isHovered={hoveredPath === node.path}
              allChildrenSelected={areAllDescendantsSelected(node, selectedPaths)}
              onToggleExpand={() => toggleExpand(node.path)}
              onToggleCheck={() => onToggleNode(node)}
              onSelectChildren={() => {
                const allSelected = areAllDescendantsSelected(node, selectedPaths);
                onToggleChildren(node, !allSelected);
              }}
              onPreview={() => node.url && onPreviewUrl(node.url)}
              onContextMenu={(e) => {
                if (!node.url) return;
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, url: node.url });
              }}
              onMouseEnter={() => setHoveredPath(node.path)}
              onMouseLeave={() => setHoveredPath(null)}
              realChildCount={countRealDescendants(node) - (node.url !== null ? 1 : 0)}
            />
          ))
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          url={contextMenu.url}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

interface RowProps {
  node: SitemapNode;
  depth: number;
  isSelected: boolean;
  isPreviewing: boolean;
  isExpanded: boolean;
  isHovered: boolean;
  allChildrenSelected: boolean;
  onToggleExpand: () => void;
  onToggleCheck: () => void;
  onSelectChildren: () => void;
  onPreview: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  realChildCount: number;
}

function TreeRow({
  node, depth, isSelected, isPreviewing, isExpanded, isHovered,
  allChildrenSelected, onToggleExpand, onToggleCheck, onSelectChildren,
  onPreview, onContextMenu, onMouseEnter, onMouseLeave, realChildCount,
}: RowProps) {
  const hasChildren = node.children.length > 0;
  const isSynthetic = node.url === null;
  const label = getPathLabel(node.path);

  const indentPx = 8 + depth * 16;

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={!isSynthetic ? onPreview : undefined}
      onContextMenu={!isSynthetic ? onContextMenu : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        paddingLeft: indentPx, paddingRight: 8,
        height: 24, cursor: isSynthetic ? 'default' : 'pointer',
        backgroundColor: isPreviewing ? '#094771' : isHovered ? '#2a2d2e' : 'transparent',
        borderLeft: isPreviewing ? '2px solid #569cd6' : '2px solid transparent',
        userSelect: 'none',
        transition: 'background 0.05s',
      }}
    >
      {/* Expand chevron */}
      <span
        onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggleExpand(); }}
        style={{ flexShrink: 0, width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9e9e9e' }}
      >
        {hasChildren
          ? isExpanded
            ? <ChevronDown size={12} />
            : <ChevronRight size={12} />
          : <span style={{ width: 12 }} />
        }
      </span>

      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isSelected}
        disabled={isSynthetic}
        onChange={(e) => { e.stopPropagation(); onToggleCheck(); }}
        onClick={(e) => e.stopPropagation()}
        style={{ flexShrink: 0 }}
      />

      {/* Label */}
      <span
        style={{
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize: 12,
          color: isSynthetic ? '#6b6b6b' : isPreviewing ? '#9cdcfe' : '#cccccc',
          fontStyle: isSynthetic ? 'italic' : 'normal',
        }}
        title={node.url || node.path}
      >
        {label}
      </span>

      {/* Child count badge */}
      {realChildCount > 0 && !isHovered && (
        <span style={{
          flexShrink: 0, fontSize: 10, color: '#6b6b6b',
          backgroundColor: '#2d2d2d', border: '1px solid #3c3c3c',
          borderRadius: 2, padding: '0 4px', lineHeight: '14px',
        }}>
          {realChildCount}
        </span>
      )}

      {/* Hover actions */}
      {isHovered && hasChildren && (
        <button
          onClick={(e) => { e.stopPropagation(); onSelectChildren(); }}
          title={allChildrenSelected ? 'Deselect children' : 'Select children'}
          style={{
            flexShrink: 0, fontSize: 10, color: '#9e9e9e',
            backgroundColor: '#2d2d2d', border: '1px solid #3c3c3c',
            borderRadius: 2, padding: '0 5px', lineHeight: '16px',
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          {allChildrenSelected ? '−children' : '+children'}
        </button>
      )}
    </div>
  );
}

function ContextMenu({ x, y, url, onClose }: { x: number; y: number; url: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [onClose]);

  const menuItems: { label: string; action: () => void }[] = [
    { label: 'Open in browser', action: () => { window.open(url, '_blank'); onClose(); } },
    { label: 'Copy URL', action: () => { navigator.clipboard.writeText(url); onClose(); } },
  ];

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed', zIndex: 1000, left: x, top: y,
        backgroundColor: '#252526', border: '1px solid #3c3c3c',
        borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        minWidth: 160, padding: '3px 0', fontSize: 12,
      }}
    >
      {menuItems.map((item) => (
        <div
          key={item.label}
          onClick={item.action}
          style={{ padding: '5px 14px', color: '#cccccc', cursor: 'pointer' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#094771')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}

function HeaderButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        fontSize: 11, fontFamily: 'inherit', padding: '1px 6px',
        border: '1px solid #3c3c3c', borderRadius: 2,
        backgroundColor: 'transparent', color: '#9e9e9e',
        cursor: 'pointer',
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
      {children}
    </button>
  );
}
