import { useState, useCallback, useEffect, useRef } from 'react';
import type { ScanState, SitemapNode, LogEntry, CrawlErrorCode, FrameableStatus, AppSettings, ScreenshotOptions } from '../types';
import { collectRealNodes, getAllDescendantPaths } from '../utils/treeUtils';
import Toolbar from './Toolbar';
import TreeView from './TreeView';
import PreviewPane from './PreviewPane';
import LogPanel from './LogPanel';
import EmptyState from './states/EmptyState';
import ScanningState from './states/ScanningState';
import ScanWarningState from './states/ScanWarningState';
import SettingsModal from './modals/SettingsModal';
import UrlListModal from './modals/UrlListModal';
import ScreenshotModal from './modals/ScreenshotModal';
import VisualSitemapModal from './modals/VisualSitemapModal';

const DEFAULT_SETTINGS: AppSettings = { depth: 3, filterLocales: true };

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem('scout_settings');
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

function saveSettings(s: AppSettings) {
  localStorage.setItem('scout_settings', JSON.stringify(s));
}

export default function ScraperTool() {
  // ── State ─────────────────────────────────────────────────────────────────
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [urlInput, setUrlInput] = useState('');
  const [rootUrl, setRootUrl] = useState('');
  const [sitemapData, setSitemapData] = useState<SitemapNode[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [crawlError, setCrawlError] = useState<{ code: CrawlErrorCode; message: string } | null>(null);
  const [urlsCapped, setUrlsCapped] = useState(false);

  // Preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [frameableStatus, setFrameableStatus] = useState<FrameableStatus>('unchecked');
  const frameableCacheRef = useRef<Map<string, FrameableStatus>>(new Map());

  // Logs
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logOpen, setLogOpen] = useState(false);

  // Scan progress display
  const [scanProgress, setScanProgress] = useState({ phase: '', crawled: 0, total: 0, found: 0 });

  // Modals
  const [showSettings, setShowSettings] = useState(false);
  const [showUrlList, setShowUrlList] = useState(false);
  const [showScreenshot, setShowScreenshot] = useState(false);
  const [showDiagram, setShowDiagram] = useState(false);

  // Screenshot options
  const [screenshotOptions, setScreenshotOptions] = useState<ScreenshotOptions>({
    desktop: true, mobile: false, blockPopups: true,
  });

  // Active SSE connection ref for cancellation
  const eventSourceRef = useRef<EventSource | null>(null);

  // ── Settings persistence ──────────────────────────────────────────────────
  useEffect(() => { saveSettings(settings); }, [settings]);

  // ── Start scan ────────────────────────────────────────────────────────────
  const handleStartScan = useCallback((inputUrl: string) => {
    if (!inputUrl.trim()) return;

    let url = inputUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    // Cancel any in-flight scan
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setRootUrl(url);
    setScanState('scanning');
    setSitemapData([]);
    setSelectedPaths(new Set());
    setPreviewUrl(null);
    setFrameableStatus('unchecked');
    setLogs([]);
    setScanProgress({ phase: '', crawled: 0, total: 0, found: 0 });
    setCrawlError(null);
    setUrlsCapped(false);

    // Clear frameable cache for this hostname
    try {
      const hostname = new URL(url).hostname;
      for (const [key] of frameableCacheRef.current) {
        if (key === hostname) frameableCacheRef.current.delete(key);
      }
    } catch { /* ignore */ }

    const params = new URLSearchParams({ url, depth: String(settings.depth) });
    const es = new EventSource(`/api/crawl?${params}`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        switch (event.type) {
          case 'log':
            setLogs((prev) => [...prev, { level: event.level, message: event.message, timestamp: event.timestamp }]);
            break;
          case 'progress':
            setScanProgress({ phase: event.phase, crawled: event.crawled, total: event.total, found: event.found });
            break;
          case 'complete': {
            const tree: SitemapNode[] = event.data;
            setUrlsCapped(event.urlsCapped ?? false);
            setSitemapData(tree);
            // Select all real URLs by default
            const allPaths = new Set(collectRealNodes(tree).map((n) => n.path));
            setSelectedPaths(allPaths);
            setScanState('done');
            es.close();
            eventSourceRef.current = null;
            // Auto-preview the root node URL
            const rootNode = tree[0];
            if (rootNode?.url) {
              setTimeout(() => handlePreviewUrl(rootNode.url!), 0);
            }
            break;
          }
          case 'error':
            setCrawlError({ code: event.crawlError, message: event.message });
            setScanState('warning');
            if (event.logs) setLogs(event.logs);
            es.close();
            eventSourceRef.current = null;
            break;
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      if (scanState === 'scanning') {
        setCrawlError({ code: 'unreachable_timeout', message: 'Connection to crawl server lost.' });
        setScanState('warning');
      }
      es.close();
      eventSourceRef.current = null;
    };
  }, [settings.depth, scanState]);

  const handleRetry = useCallback(() => handleStartScan(urlInput), [handleStartScan, urlInput]);
  const handleBack = useCallback(() => setScanState('idle'), []);

  // ── Preview ───────────────────────────────────────────────────────────────
  const handlePreviewUrl = useCallback(async (url: string) => {
    setPreviewUrl(url);
    const hostname = new URL(url).hostname;

    const cached = frameableCacheRef.current.get(hostname);
    if (cached) { setFrameableStatus(cached); return; }

    setFrameableStatus('checking');
    try {
      const res = await fetch(`/api/check-frameable?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      const status: FrameableStatus = data.frameable ? 'yes' : 'no';
      frameableCacheRef.current.set(hostname, status);
      setFrameableStatus(status);
    } catch {
      setFrameableStatus('no');
    }
  }, []);

  // ── Selection ─────────────────────────────────────────────────────────────
  const toggleNode = useCallback((node: SitemapNode) => {
    if (node.url === null) return;
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(node.path)) next.delete(node.path);
      else next.add(node.path);
      return next;
    });
  }, []);

  const toggleChildren = useCallback((node: SitemapNode, select: boolean) => {
    const paths = getAllDescendantPaths(node);
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (select) paths.forEach((p) => next.add(p));
      else paths.forEach((p) => next.delete(p));
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedPaths(new Set(collectRealNodes(sitemapData).map((n) => n.path)));
  }, [sitemapData]);

  const clearAll = useCallback(() => setSelectedPaths(new Set()), []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const LOCALE_RE = /^\/([a-z]{2}|[a-z]{2}-[a-z]{2,4})(\/|$)/i;

  function filterLocaleNodes(nodes: SitemapNode[]): SitemapNode[] {
    return nodes
      .filter((n) => !LOCALE_RE.test(n.path))
      .map((n) => ({ ...n, children: filterLocaleNodes(n.children) }));
  }

  const visibleSitemapData = settings.filterLocales ? filterLocaleNodes(sitemapData) : sitemapData;
  const realNodes = collectRealNodes(visibleSitemapData);
  const selectedNodes = realNodes.filter((n) => selectedPaths.has(n.path));
  const selectedCount = selectedNodes.length;
  const canScreenshot = selectedCount > 0 && selectedCount <= 50;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', backgroundColor: '#1e1e1e' }}>
      {/* Toolbar */}
      <Toolbar
        urlInput={urlInput}
        onUrlChange={setUrlInput}
        onScan={() => handleStartScan(urlInput)}
        scanning={scanState === 'scanning'}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {scanState === 'idle' && <EmptyState />}

        {scanState === 'scanning' && (
          <ScanningState
            url={rootUrl}
            progress={scanProgress}
            logs={logs}
            onCancel={() => {
              eventSourceRef.current?.close();
              eventSourceRef.current = null;
              setScanState('idle');
            }}
          />
        )}

        {scanState === 'warning' && crawlError && (
          <ScanWarningState
            code={crawlError.code}
            message={crawlError.message}
            onBack={handleBack}
            onRetry={handleRetry}
          />
        )}

        {scanState === 'done' && (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {urlsCapped && (
              <div style={{
                padding: '4px 12px', fontSize: 11, backgroundColor: '#2d2008',
                borderBottom: '1px solid #6b4c00', color: '#cca700',
                display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
              }}>
                ⚠ Result capped at 15,000 URLs — some sections may be truncated
              </div>
            )}
            {/* Split pane */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', borderBottom: '1px solid #3c3c3c' }}>
              {/* Left: tree */}
              <div style={{ width: frameableStatus === 'yes' ? '60%' : '100%', minWidth: 260, borderRight: frameableStatus === 'yes' ? '1px solid #3c3c3c' : 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'width 0.2s ease' }}>
                <TreeView
                  nodes={visibleSitemapData}
                  selectedPaths={selectedPaths}
                  previewPath={previewUrl ? new URL(previewUrl).pathname : null}
                  onToggleNode={toggleNode}
                  onToggleChildren={toggleChildren}
                  onSelectAll={selectAll}
                  onClearAll={clearAll}
                  onPreviewUrl={handlePreviewUrl}
                  totalCount={realNodes.length}
                  selectedCount={selectedCount}
                />
              </div>

              {/* Right: preview — only shown when site allows framing */}
              {frameableStatus === 'yes' && (
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <PreviewPane
                    url={previewUrl}
                    frameableStatus={frameableStatus}
                    blockPopups={screenshotOptions.blockPopups}
                    onToggleBlockPopups={(val) => setScreenshotOptions((p) => ({ ...p, blockPopups: val }))}
                  />
                </div>
              )}
            </div>

            {/* Task bar */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px',
              height: 36, backgroundColor: '#252526', borderBottom: '1px solid #3c3c3c',
              flexShrink: 0,
            }}>
              <div style={{ flex: 1 }} />

              {/* Selected count */}
              <span style={{
                fontSize: 12,
                color: selectedCount > 50 ? '#f44747' : '#9e9e9e',
              }}>
                {selectedCount} selected
                {selectedCount > 50 && <span style={{ color: '#f44747' }}> (max 50)</span>}
              </span>

              <div style={{ width: 1, height: 18, backgroundColor: '#3c3c3c' }} />

              {/* Actions */}
              <TaskButton onClick={() => setShowUrlList(true)} disabled={selectedCount === 0}>
                List
              </TaskButton>
              <TaskButton onClick={() => setShowDiagram(true)} disabled={selectedCount === 0}>
                Diagram
              </TaskButton>
              <TaskButton
                onClick={() => setShowScreenshot(true)}
                disabled={!canScreenshot}
                primary
                title={
                  selectedCount === 0 ? 'Select URLs first'
                  : selectedCount > 50 ? 'Max 50 URLs'
                  : ''
                }
              >
                Screenshots
              </TaskButton>
            </div>

            {/* Log panel */}
            <LogPanel logs={logs} open={logOpen} onToggle={() => setLogOpen((p) => !p)} />
          </div>
        )}
      </div>

      {/* Modals */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={(s) => { setSettings(s); setShowSettings(false); }}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showUrlList && (
        <UrlListModal
          nodes={selectedNodes}
          rootUrl={rootUrl}
          onClose={() => setShowUrlList(false)}
        />
      )}
      {showDiagram && (
        <VisualSitemapModal
          nodes={visibleSitemapData}
          selectedPaths={selectedPaths}
          rootUrl={rootUrl}
          onClose={() => setShowDiagram(false)}
        />
      )}
      {showScreenshot && (
        <ScreenshotModal
          nodes={selectedNodes}
          rootUrl={rootUrl}
          options={screenshotOptions}
          onOptionsChange={setScreenshotOptions}
          onClose={() => setShowScreenshot(false)}
        />
      )}
    </div>
  );
}

function TaskButton({
  children, onClick, disabled, primary, title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: '2px 10px',
        fontSize: 12,
        fontFamily: 'inherit',
        border: '1px solid',
        borderColor: primary ? '#569cd6' : '#3c3c3c',
        borderRadius: 2,
        backgroundColor: primary ? (disabled ? '#2d3748' : '#094771') : 'transparent',
        color: disabled ? '#555' : primary ? '#9cdcfe' : '#cccccc',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.1s',
      }}
    >
      {children}
    </button>
  );
}
