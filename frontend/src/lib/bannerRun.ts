import type { BannerRequest, BannerResult } from '../api/client'

/** Max side-row tables per API request (backend builds tables in parallel per chunk). */
export const BANNER_TABLE_CHUNK_SIZE = 12

/** Concurrent chunk requests — balances speed vs server load. */
export const BANNER_CHUNK_CONCURRENCY = 2

/** Update crosstab UI every N chunks to cut React re-renders during large builds. */
export const BANNER_UI_UPDATE_EVERY = 2

const WARMUP_RECENT_MS = 120_000

let lastWarmupAt = 0
let lastWarmupKey = ''

export function markSurveyWarmed(surveyId: number, completionStatus: string) {
  lastWarmupAt = Date.now()
  lastWarmupKey = `${surveyId}:${completionStatus}`
}

export function shouldWarmupSurvey(surveyId: number, completionStatus: string): boolean {
  if (lastWarmupKey !== `${surveyId}:${completionStatus}`) return true
  return Date.now() - lastWarmupAt > WARMUP_RECENT_MS
}

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
    show_base_row: request.show_base_row,
    summary_stats: request.summary_stats,
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

export async function runBannerChunksParallel<T>({
  chunks,
  concurrency,
  runChunk,
  onChunkComplete,
  signal,
}: {
  chunks: string[][]
  concurrency: number
  runChunk: (chunkIds: string[], chunkIndex: number) => Promise<T>
  onChunkComplete?: (chunkIndex: number, result: T, completedRows: number, totalRows: number) => void
  signal?: AbortSignal
}): Promise<T[]> {
  const totalRows = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const results: T[] = new Array(chunks.length)
  let nextIndex = 0
  let completedRows = 0

  async function worker() {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= chunks.length) return
      if (signal?.aborted) return

      const chunkIds = chunks[index]
      const result = await runChunk(chunkIds, index)
      if (signal?.aborted) return

      results[index] = result
      completedRows += chunkIds.length
      onChunkComplete?.(index, result, completedRows, totalRows)
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), chunks.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}
