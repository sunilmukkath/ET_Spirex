import type { BannerRequest, BannerResult } from '../api/client'

/** Max side-row tables per API request (backend builds tables in parallel per chunk). */
export const BANNER_TABLE_CHUNK_SIZE = 8

export function chunkBannerRowIds(rowIds: string[]): string[][] {
  if (rowIds.length <= BANNER_TABLE_CHUNK_SIZE) return [rowIds]
  const chunks: string[][] = []
  for (let i = 0; i < rowIds.length; i += BANNER_TABLE_CHUNK_SIZE) {
    chunks.push(rowIds.slice(i, i + BANNER_TABLE_CHUNK_SIZE))
  }
  return chunks
}

export function bannerTablesFromResult(result: BannerResult): BannerResult[] {
  if (result.table_type === 'multi' && result.tables?.length) return result.tables
  return [result]
}

export function mergeBannerChunkResults(
  tables: BannerResult[],
  request: BannerRequest,
): BannerResult {
  if (tables.length === 1 && !tables[0].error) {
    const only = tables[0]
    if (only.table_type !== 'multi') return only
  }
  return {
    table_type: 'multi',
    tables,
    confidence_level: request.confidence_level,
    show_counts: request.show_counts,
    show_col_pct: request.show_col_pct,
    show_row_pct: request.show_row_pct,
    show_significance: request.show_significance,
  }
}

export function bannerChunkRequest(request: BannerRequest, chunkIds: string[]): BannerRequest {
  const row_filters: NonNullable<BannerRequest['row_filters']> = {}
  for (const id of chunkIds) {
    row_filters[id] = request.row_filters?.[id] ?? request.filters ?? []
  }
  return {
    ...request,
    row_variable_id: chunkIds[0],
    row_variable_ids: chunkIds,
    row_filters,
  }
}
