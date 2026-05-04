export interface SitemapNode {
  path: string;
  url: string | null;  // null = synthetic intermediate node
  children: SitemapNode[];
  count: number;       // total real (non-synthetic) descendants
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

export interface CrawlError {
  crawlError: CrawlErrorCode;
  message: string;
}

export type SSEEvent =
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string; timestamp: number }
  | { type: 'progress'; phase: 'sitemap' | 'bfs'; crawled: number; total: number; found: number }
  | { type: 'complete'; data: SitemapNode[]; logs: LogEntry[]; urlsCapped: boolean }
  | { type: 'error'; crawlError: CrawlErrorCode; message: string; logs: LogEntry[] };
