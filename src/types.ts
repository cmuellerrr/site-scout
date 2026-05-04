export interface SitemapNode {
  path: string;
  url: string | null;  // null = synthetic intermediate node
  children: SitemapNode[];
  count: number;
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

export type CrawlErrorCode =
  | 'unreachable_dns'
  | 'unreachable_refused'
  | 'unreachable_timeout'
  | 'unreachable_404'
  | 'blocked_http'
  | 'blocked_empty';

export type ScanState = 'idle' | 'scanning' | 'done' | 'warning';

export type FrameableStatus = 'unchecked' | 'checking' | 'yes' | 'no';

export interface ScreenshotOptions {
  desktop: boolean;
  mobile: boolean;
  blockPopups: boolean;
}

export interface AppSettings {
  depth: number;
  filterLocales: boolean;
}
