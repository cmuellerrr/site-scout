import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, X } from 'lucide-react';
import type { SitemapNode } from '../types';
import { areAllChildrenSelected, countRealDescendants, flattenTree } from '../utils/treeUtils';

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
  const [filterText, setFilterText] = useState('');
  const filterInputRef = useRef<HTMLInputElement>(null);

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

  // When filter text changes, auto-expand all ancestors of matching nodes
  useEffect(() => {
    if (!filterText) return;
    const lower = filterText.toLowerCase();

    function hasMatch(n: SitemapNode): boolean {
      if (n.path.toLowerCase().includes(lower)) return true;
      return n.children.some(hasMatch);
    }

    const toExpand = new Set<string>();
    function walk(n: SitemapNode) {
      if (n.children.length > 0 && hasMatch(n)) toExpand.add(n.path);
      n.children.forEach(walk);
    }
    nodes.forEach(walk);
    setExpanded(prev => new Set([...prev, ...toExpand]));
  }, [filterText, nodes]);

  // Compute displayRows: when filter is active, restrict flatRows to visible paths.
  // flatRows already respects expanded state, so chevron toggling works naturally.
  const displayRows = useMemo(() => {
    if (!filterText) return flatRows;

    const lower = filterText.toLowerCase();
    const matchPaths = new Set<string>();
    const ancestorPaths = new Set<string>();

    function walk(n: SitemapNode) {
      if (n.path.toLowerCase().includes(lower)) {
        matchPaths.add(n.path);
      }
      n.children.forEach(walk);
    }
    nodes.forEach(walk);

    // Collect ancestors of all matches
    function collectAncestors(path: string) {
      const parts = path.split('/').filter(Boolean);
      for (let i = 1; i < parts.length; i++) {
        ancestorPaths.add('/' + parts.slice(0, i).join('/'));
      }
      if (parts.length > 0) ancestorPaths.add('/');
    }
    matchPaths.forEach(collectAncestors);

    const visible = new Set([...matchPaths, ...ancestorPaths]);

    // Filter flatRows (which respects expanded) so expand/collapse works in filtered view
    return flatRows.filter(({ node }) => visible.has(node.path));
  }, [nodes, filterText, flatRows]);

  const matchCount = useMemo(
    () => displayRows.filter(({ node }) => node.url !== null).length,
    [displayRows],
  );

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
        {filterText ? (
          <span style={{ color: '#569cd6', fontSize: 11 }}>
            {matchCount} match{matchCount !== 1 ? 'es' : ''}
          </span>
        ) : (
          <span style={{ color: '#6b6b6b', fontSize: 11 }}>
            {selectedCount}/{totalCount}
          </span>
        )}
        <div style={{ width: 1, height: 14, backgroundColor: '#3c3c3c' }} />
        <HeaderButton onClick={onSelectAll} title="Select all">All</HeaderButton>
        <HeaderButton onClick={onClearAll} title="Clear selection">None</HeaderButton>
        <div style={{ width: 1, height: 14, backgroundColor: '#3c3c3c' }} />
        <HeaderButton onClick={expandAll} title="Expand all">+</HeaderButton>
        <HeaderButton onClick={collapseAll} title="Collapse all">−</HeaderButton>
      </div>

      {/* Filter bar — always visible, matches PreviewPane URL label height */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '2px 10px',
        backgroundColor: '#1e1e1e', borderBottom: '1px solid #2d2d2d',
        flexShrink: 0,
      }}>
        <input
          ref={filterInputRef}
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setFilterText(''); }}
          placeholder="Filter paths…"
          style={{
            flex: 1, border: 'none', backgroundColor: 'transparent',
            fontSize: 11, color: filterText ? '#cccccc' : '#6b6b6b', outline: 'none',
          }}
        />
        {filterText && (
          <button
            onClick={() => setFilterText('')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', padding: 0,
              cursor: 'pointer', color: '#6b6b6b',
            }}
          >
            <X size={11} />
          </button>
        )}
      </div>

      {/* Tree rows */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {displayRows.length === 0 ? (
          <div style={{ padding: '16px 12px', color: '#6b6b6b', fontSize: 12 }}>
            {filterText ? 'No matches.' : 'No URLs found.'}
          </div>
        ) : (
          displayRows.map(({ node, depth }) => (
            <TreeRow
              key={node.path}
              node={node}
              depth={depth}
              filterText={filterText}
              isSelected={node.url !== null && selectedPaths.has(node.path)}
              isPreviewing={previewPath === node.path}
              isExpanded={expanded.has(node.path)}
              isHovered={hoveredPath === node.path}
              allChildrenSelected={areAllChildrenSelected(node, selectedPaths)}
              onToggleExpand={() => toggleExpand(node.path)}
              onToggleCheck={() => onToggleNode(node)}
              onSelectChildren={() => {
                const allSelected = areAllChildrenSelected(node, selectedPaths);
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
  filterText: string;
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

/** Render a label with the matching substring highlighted. */
function HighlightedLabel({ text, query, baseColor }: { text: string; query: string; baseColor: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: '#f8c555', backgroundColor: 'rgba(248,197,85,0.18)', borderRadius: 2 }}>
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}

function TreeRow({
  node, depth, filterText, isSelected, isPreviewing, isExpanded, isHovered,
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
        <HighlightedLabel
          text={label}
          query={filterText}
          baseColor={isSynthetic ? '#6b6b6b' : isPreviewing ? '#9cdcfe' : '#cccccc'}
        />
      </span>

      {/* Child count / select-children button — animates between the two */}
      {realChildCount > 0 && (
        <button
          onClick={(e) => { if (isHovered && hasChildren) { e.stopPropagation(); onSelectChildren(); } }}
          style={{
            flexShrink: 0, fontSize: 10, fontFamily: 'inherit',
            backgroundColor: '#2d2d2d', border: '1px solid #3c3c3c',
            borderRadius: 2, padding: '0 5px', lineHeight: '16px',
            overflow: 'hidden', whiteSpace: 'nowrap',
            cursor: isHovered && hasChildren ? 'pointer' : 'default',
            color: isHovered && hasChildren ? '#9e9e9e' : '#6b6b6b',
            maxWidth: isHovered && hasChildren ? '130px' : '26px',
            transition: 'max-width 0.18s ease, color 0.12s',
          }}
        >
          {isHovered && hasChildren
            ? (allChildrenSelected ? 'Deselect children' : 'Select children')
            : realChildCount}
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

function HeaderButton({ children, onClick, title, disabled }: { children: React.ReactNode; onClick: () => void; title?: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        fontSize: 11, fontFamily: 'inherit', lineHeight: 1, padding: '3px 6px',
        border: '1px solid #3c3c3c', borderRadius: 2,
        backgroundColor: 'transparent',
        color: disabled ? '#444' : '#9e9e9e',
        cursor: disabled ? 'default' : 'pointer',
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        (e.currentTarget as HTMLButtonElement).style.color = '#cccccc';
        (e.currentTarget as HTMLButtonElement).style.borderColor = '#555';
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        (e.currentTarget as HTMLButtonElement).style.color = '#9e9e9e';
        (e.currentTarget as HTMLButtonElement).style.borderColor = '#3c3c3c';
      }}
    >
      {children}
    </button>
  );
}
