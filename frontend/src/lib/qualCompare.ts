import type {
  QualAsset,
  QualBannerField,
  QualRowDimension,
  QualSessionFilter,
} from '../api/client'

const STOPWORDS = new Set(
  `a an the and or but if in on at to for of is are was were be been being i you he she it we they this that these those with as from by not no yes so very just about into than then them their there when what which who would could should have has had do does did will can may might also um uh like really well yeah okay ok its it's i'm don't didn't doesn't`.split(
    ' ',
  ),
)

export function emptySessionFilter(): QualSessionFilter {
  return { tags: [], statuses: [], asset_types: [], query: '' }
}

export function applySessionFilter(assets: QualAsset[], filter: QualSessionFilter): QualAsset[] {
  return assets.filter((asset) => {
    if (filter.tags.length && !filter.tags.some((t) => asset.tags.includes(t))) return false
    if (filter.statuses.length && !filter.statuses.includes(asset.status)) return false
    if (filter.asset_types.length && !filter.asset_types.includes(asset.asset_type)) return false
    if (filter.query.trim()) {
      const q = filter.query.trim().toLowerCase()
      const hay = `${asset.title} ${asset.content} ${asset.tags.join(' ')} ${asset.respondent_id} ${asset.moderator}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export function assetFieldValues(asset: QualAsset, field: QualBannerField): string[] {
  switch (field) {
    case 'tags':
      return asset.tags.length ? asset.tags : ['(untagged)']
    case 'asset_type':
      return [asset.asset_type === 'transcript' ? 'Transcript' : 'Session note']
    case 'status':
      return [asset.status]
    case 'moderator':
      return [asset.moderator.trim() || '(no moderator)']
    case 'respondent_id':
      return [asset.respondent_id.trim() || '(no id)']
    default:
      return ['—']
  }
}

export function uniqueFieldValues(assets: QualAsset[], field: QualBannerField): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const asset of assets) {
    for (const value of assetFieldValues(asset, field)) {
      if (seen.has(value)) continue
      seen.add(value)
      out.push(value)
    }
  }
  return out.sort((a, b) => a.localeCompare(b))
}

export function topTermLabels(assets: QualAsset[], limit = 10): string[] {
  const counts = new Map<string, number>()
  for (const asset of assets) {
    for (const word of asset.content.toLowerCase().match(/[a-z']{4,}/g) ?? []) {
      if (STOPWORDS.has(word)) continue
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term]) => term)
}

export function rowLabels(assets: QualAsset[], rowDimension: QualRowDimension): string[] {
  if (rowDimension === 'top_terms') return topTermLabels(assets)
  if (rowDimension === 'tags') return uniqueFieldValues(assets, 'tags')
  return uniqueFieldValues(assets, rowDimension as QualBannerField)
}

export type QualBannerColumn = { id: string; labels: string[] }

export function buildBannerColumns(assets: QualAsset[], layers: QualBannerField[][]): QualBannerColumn[] {
  const activeLayers = layers.filter((layer) => layer.length > 0)
  if (!activeLayers.length) {
    return [{ id: 'total', labels: ['Total'] }]
  }

  let columns: QualBannerColumn[] = [{ id: 'root', labels: [] }]
  for (const layer of activeLayers) {
    const next: QualBannerColumn[] = []
    for (const col of columns) {
      for (const field of layer) {
        for (const value of uniqueFieldValues(assets, field)) {
          next.push({
            id: `${col.id}|${field}:${value}`,
            labels: [...col.labels, value],
          })
        }
      }
    }
    columns = next
  }
  return columns
}

function assetMatchesRow(asset: QualAsset, rowLabel: string, rowDimension: QualRowDimension): boolean {
  if (rowDimension === 'top_terms') {
    return asset.content.toLowerCase().includes(rowLabel.toLowerCase())
  }
  if (rowDimension === 'tags') {
    if (rowLabel === '(untagged)') return asset.tags.length === 0
    return asset.tags.includes(rowLabel)
  }
  return assetFieldValues(asset, rowDimension as QualBannerField).includes(rowLabel)
}

function assetMatchesColumn(asset: QualAsset, column: QualBannerColumn, layers: QualBannerField[][]): boolean {
  if (column.id === 'total') return true
  const activeLayers = layers.filter((layer) => layer.length > 0)
  let labelIdx = 0
  for (const layer of activeLayers) {
    for (const field of layer) {
      const value = column.labels[labelIdx]
      if (!assetFieldValues(asset, field).includes(value)) return false
      labelIdx += 1
    }
  }
  return true
}

export interface QualCompareRow {
  id: string
  label: string
  counts: number[]
  rowTotal: number
}

export function buildCompareTable(
  assets: QualAsset[],
  rowDimension: QualRowDimension,
  bannerLayers: QualBannerField[][],
  sessionFilter: QualSessionFilter,
  tableFilters: Record<string, string[]>,
): { columns: QualBannerColumn[]; rows: QualCompareRow[]; colTotals: number[] } {
  const filtered = applySessionFilter(assets, sessionFilter)
  const columns = buildBannerColumns(filtered, bannerLayers)
  const labels = rowLabels(filtered, rowDimension)

  const rows: QualCompareRow[] = labels.map((label) => {
    const extraTags = tableFilters[label] ?? []
    const rowAssets = filtered.filter((asset) => {
      if (!assetMatchesRow(asset, label, rowDimension)) return false
      if (extraTags.length && !extraTags.some((t) => asset.tags.includes(t))) return false
      return true
    })
    const counts = columns.map((column) =>
      rowAssets.filter((asset) => assetMatchesColumn(asset, column, bannerLayers)).length,
    )
    return {
      id: label,
      label,
      counts,
      rowTotal: rowAssets.length,
    }
  })

  const colTotals = columns.map((_, colIdx) => rows.reduce((sum, row) => sum + row.counts[colIdx], 0))
  return { columns, rows, colTotals }
}

export const QUAL_BANNER_FIELDS: { id: QualBannerField; label: string }[] = [
  { id: 'tags', label: 'Tags' },
  { id: 'moderator', label: 'Moderator' },
  { id: 'respondent_id', label: 'Respondent ID' },
  { id: 'asset_type', label: 'Document type' },
  { id: 'status', label: 'Status' },
]

export const QUAL_ROW_DIMENSIONS: { id: QualRowDimension; label: string }[] = [
  { id: 'tags', label: 'Tags' },
  { id: 'top_terms', label: 'Top terms' },
  { id: 'asset_type', label: 'Document type' },
  { id: 'status', label: 'Status' },
  { id: 'moderator', label: 'Moderator' },
]
