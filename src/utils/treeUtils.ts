import type { SitemapNode } from '../types';

/** Collect all nodes with real URLs (non-synthetic) */
export function collectRealNodes(nodes: SitemapNode[]): SitemapNode[] {
  const result: SitemapNode[] = [];
  function walk(node: SitemapNode) {
    if (node.url !== null) result.push(node);
    node.children.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

/** Get all descendant paths (including the node itself if real) */
export function getAllDescendantPaths(node: SitemapNode): string[] {
  const paths: string[] = [];
  function walk(n: SitemapNode) {
    if (n.url !== null) paths.push(n.path);
    n.children.forEach(walk);
  }
  walk(node);
  return paths;
}

/** Get real descendant paths for a node's children only — excludes the node itself */
export function getChildDescendantPaths(node: SitemapNode): string[] {
  const paths: string[] = [];
  function walk(n: SitemapNode) {
    if (n.url !== null) paths.push(n.path);
    n.children.forEach(walk);
  }
  node.children.forEach(walk);
  return paths;
}

/** Check if all of a node's children (not the node itself) are selected */
export function areAllChildrenSelected(node: SitemapNode, selected: Set<string>): boolean {
  const childPaths = getChildDescendantPaths(node);
  return childPaths.length > 0 && childPaths.every((p) => selected.has(p));
}

/** Count real (non-synthetic) nodes in a subtree */
export function countRealDescendants(node: SitemapNode): number {
  let count = node.url !== null ? 1 : 0;
  for (const child of node.children) {
    count += countRealDescendants(child);
  }
  return count;
}

/** Find a node by path */
export function findNodeByPath(nodes: SitemapNode[], path: string): SitemapNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    const found = findNodeByPath(node.children, path);
    if (found) return found;
  }
  return null;
}

/** Check if all real descendants are selected */
export function areAllDescendantsSelected(node: SitemapNode, selected: Set<string>): boolean {
  const realPaths = getAllDescendantPaths(node);
  return realPaths.length > 0 && realPaths.every((p) => selected.has(p));
}

/** Flatten tree to ordered list of [node, depth] pairs (for rendering) */
export function flattenTree(
  nodes: SitemapNode[],
  expanded: Set<string>,
  depth = 0
): Array<{ node: SitemapNode; depth: number }> {
  const result: Array<{ node: SitemapNode; depth: number }> = [];
  for (const node of nodes) {
    result.push({ node, depth });
    if (node.children.length > 0 && expanded.has(node.path)) {
      result.push(...flattenTree(node.children, expanded, depth + 1));
    }
  }
  return result;
}
