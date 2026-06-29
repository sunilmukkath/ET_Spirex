import type { FilterSpec } from '../api/client'

export type FilterOperator = 'eq' | 'ne' | 'in' | 'not_in'

export interface FilterCondition {
  type: 'condition'
  variable_id: string
  operator: FilterOperator
  values: string[]
  negate?: boolean
}

export interface FilterGroup {
  type: 'group'
  logic: 'and' | 'or'
  negate?: boolean
  children: FilterNode[]
}

export type FilterNode = FilterCondition | FilterGroup

export const FILTER_OPERATORS: {
  value: FilterOperator
  label: string
  hint: string
}[] = [
  { value: 'eq', label: 'equals', hint: 'Exact match — one answer' },
  { value: 'ne', label: 'does not equal', hint: 'Exclude one answer' },
  { value: 'in', label: 'is any of', hint: 'Match if answer is one of several' },
  { value: 'not_in', label: 'is none of', hint: 'Exclude all listed answers' },
]

export function operatorLabel(op: FilterOperator): string {
  return FILTER_OPERATORS.find((o) => o.value === op)?.label ?? op
}

export function emptyGroup(logic: 'and' | 'or' = 'and'): FilterGroup {
  return { type: 'group', logic, negate: false, children: [] }
}

export function emptyCondition(): FilterCondition {
  return { type: 'condition', variable_id: '', operator: 'eq', values: [''], negate: false }
}

export function isFilterGroup(node: FilterNode): node is FilterGroup {
  return node.type === 'group'
}

export function cloneFilterTree(tree: FilterGroup | null): FilterGroup {
  if (!tree) return emptyGroup()
  return JSON.parse(JSON.stringify(tree)) as FilterGroup
}

export function filtersToTree(filters: FilterSpec[]): FilterGroup {
  const children: FilterCondition[] = filters.map((f) => ({
    type: 'condition',
    variable_id: f.variable_id,
    operator: f.values.length > 1 ? 'in' : 'eq',
    values: [...f.values],
    negate: false,
  }))
  return { type: 'group', logic: 'and', negate: false, children }
}

export function buildDraftTree(
  filterTree: FilterGroup | null,
  filters: FilterSpec[],
): FilterGroup {
  if (filterTree?.children?.length) return cloneFilterTree(filterTree)
  if (filters.length) return filtersToTree(filters)
  return emptyGroup()
}

/** Flatten a filter tree to legacy FilterSpec[] (AND rules at top level). */
export function treeToFlatFilters(tree: FilterGroup | null): FilterSpec[] {
  if (!tree?.children?.length) return []

  const specs: FilterSpec[] = []

  function addCondition(cond: FilterCondition) {
    if (!cond.variable_id) return
    const values = cond.values.map((v) => v.trim()).filter(Boolean)
    if (!values.length) return
    if (cond.operator === 'eq' || cond.operator === 'ne') {
      specs.push({ variable_id: cond.variable_id, values: [values[0]] })
      return
    }
    specs.push({ variable_id: cond.variable_id, values })
  }

  function walk(node: FilterNode) {
    if (isFilterGroup(node)) {
      for (const child of node.children) walk(child)
      return
    }
    addCondition(node)
  }

  for (const child of tree.children) walk(child)
  return specs
}

export function countConditions(tree: FilterGroup | null): number {
  if (!tree) return 0
  let n = 0
  for (const child of tree.children) {
    if (isFilterGroup(child)) n += countConditions(child)
    else if (child.variable_id && child.values.some((v) => v.trim())) n += 1
  }
  return n
}

export function sanitizeFilterTree(tree: FilterGroup): FilterGroup | null {
  const children: FilterNode[] = []
  for (const child of tree.children) {
    if (isFilterGroup(child)) {
      const nested = sanitizeFilterTree(child)
      if (nested && nested.children.length > 0) children.push(nested)
    } else if (child.variable_id && child.values.some((v) => v.trim())) {
      children.push({
        ...child,
        values: child.values.filter((v) => v.trim()),
      })
    }
  }
  if (children.length === 0) return null
  return { ...tree, children }
}

export function filterPayload(
  filters: { variable_id: string; values: string[] }[],
  filterTree: FilterGroup | null,
): { filters: { variable_id: string; values: string[] }[]; filter_tree: FilterGroup | null } {
  const clean = filterTree ? sanitizeFilterTree(filterTree) : null
  if (clean?.children.length) {
    return { filters: [], filter_tree: clean }
  }
  return { filters, filter_tree: null }
}

export interface FilterChip {
  id: string
  text: string
  tone: 'simple' | 'advanced'
}

export function collectFilterChips(
  filters: FilterSpec[],
  filterTree: FilterGroup | null,
  varLabel: (id: string) => string,
  valueLabel: (varId: string, code: string) => string,
): FilterChip[] {
  if (filterTree?.children?.length) {
    const summary = summarizeFilterTree(filterTree, varLabel, valueLabel)
    if (summary) {
      return [{ id: 'active-rules', text: summary, tone: 'advanced' }]
    }
  }

  return filters.map((f) => {
    const q = varLabel(f.variable_id)
    const vals = f.values.map((v) => valueLabel(f.variable_id, v)).join(', ')
    return {
      id: f.variable_id,
      text: vals ? `${q} is any of ${vals}` : q,
      tone: 'simple' as const,
    }
  })
}

export function formatConditionText(
  cond: FilterCondition,
  varLabel: (id: string) => string,
  valueLabel: (varId: string, code: string) => string,
): string {
  if (!cond.variable_id) return ''
  const vals = cond.values.filter(Boolean).map((v) => valueLabel(cond.variable_id, v))
  if (!vals.length) return ''
  const q = varLabel(cond.variable_id)
  const valText = vals.length > 1 ? vals.join(', ') : vals[0]
  const prefix = cond.negate ? 'NOT ' : ''
  if (cond.operator === 'in') return `${prefix}${q} is any of ${valText}`
  if (cond.operator === 'not_in') return `${prefix}${q} is none of ${valText}`
  if (cond.operator === 'ne') return `${prefix}${q} does not equal ${valText}`
  return `${prefix}${q} equals ${valText}`
}

export function summarizeFilterTree(
  tree: FilterGroup,
  varLabel: (id: string) => string,
  valueLabel: (varId: string, code: string) => string,
): string {
  const parts: string[] = []
  const prefix = tree.negate ? 'NOT ' : ''
  const join = tree.logic === 'or' ? ' OR ' : ' AND '

  for (const child of tree.children) {
    if (isFilterGroup(child)) {
      const inner = summarizeFilterTree(child, varLabel, valueLabel)
      if (inner) parts.push(`(${inner})`)
    } else {
      const text = formatConditionText(child, varLabel, valueLabel)
      if (text) parts.push(text)
    }
  }
  if (!parts.length) return ''
  return prefix + parts.join(join)
}
