import type { WbsNode } from '@pm/types/wbs'

export interface WbsHierarchyNode {
  id: string
  parent_id: string | null
  sort_order: number
  wbs_code: string
}

export type WbsTreeNode<T extends WbsHierarchyNode = WbsNode> = T & {
  children: WbsTreeNode<T>[]
  level: number
}

export function buildWbsTree<T extends WbsHierarchyNode>(nodes: T[]): WbsTreeNode<T>[] {
  const byId = new Map<string, WbsTreeNode<T>>()
  nodes.forEach((node) => byId.set(node.id, { ...node, children: [], level: 0 }))
  const roots: WbsTreeNode<T>[] = []
  byId.forEach((node) => {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  })
  const assign = (items: WbsTreeNode<T>[], level: number) => {
    items.sort((a, b) => a.sort_order - b.sort_order || a.wbs_code.localeCompare(b.wbs_code))
    items.forEach((item) => {
      item.level = level
      assign(item.children, level + 1)
    })
  }
  assign(roots, 0)
  return roots
}

export function flattenWbsTree<T extends WbsHierarchyNode>(
  tree: WbsTreeNode<T>[]
): WbsTreeNode<T>[] {
  return tree.flatMap((node) => [node, ...flattenWbsTree(node.children)])
}

export function collectWbsSubtreeIds(nodes: WbsHierarchyNode[], nodeId: string): Set<string> {
  const ids = new Set<string>([nodeId])
  let changed = true
  while (changed) {
    changed = false
    for (const node of nodes) {
      if (node.parent_id && ids.has(node.parent_id) && !ids.has(node.id)) {
        ids.add(node.id)
        changed = true
      }
    }
  }
  return ids
}

export function hasWbsCycle(
  nodes: WbsHierarchyNode[],
  nodeId: string,
  parentId: string | null
): boolean {
  const parentMap = new Map(nodes.map((node) => [node.id, node.parent_id]))
  let cursor = parentId
  while (cursor) {
    if (cursor === nodeId) return true
    cursor = parentMap.get(cursor) ?? null
  }
  return false
}

export function nextWbsCode(nodes: WbsHierarchyNode[], parentId: string | null): string {
  const siblings = nodes.filter((node) => node.parent_id === parentId)
  const prefix = parentId ? nodes.find((node) => node.id === parentId)?.wbs_code : ''
  return `${prefix ? `${prefix}.` : ''}${siblings.length + 1}`
}
