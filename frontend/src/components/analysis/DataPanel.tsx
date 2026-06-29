import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Loader2,
  Save,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import {
  api,
  type CustomVariable,
  type RawDataColumn,
  type RawDataPage,
} from '../../api/client'
import {
  loadCustomVariableBackup,
  saveCustomVariableBackup,
} from '../../lib/customVariableBackup'
import { ErrorState } from '../States'

type ColumnFilter = 'all' | 'raw' | 'custom' | 'system'

interface Props {
  surveyId: number
  completionStatus: string
  username: string | null
  onVariablesChanged?: () => void
  onOpenVariables?: () => void
}

function kindBadge(kind: RawDataColumn['kind']) {
  if (kind === 'custom') {
    return 'bg-indigo-100 text-indigo-800 ring-indigo-200'
  }
  if (kind === 'system') {
    return 'bg-slate-100 text-slate-600 ring-slate-200'
  }
  return 'bg-emerald-50 text-emerald-800 ring-emerald-200'
}

export function DataPanel({
  surveyId,
  completionStatus,
  username,
  onVariablesChanged,
  onOpenVariables,
}: Props) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [columnFilter, setColumnFilter] = useState<ColumnFilter>('all')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchColumn, setSearchColumn] = useState('')
  const [data, setData] = useState<RawDataPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportingCodebook, setExportingCodebook] = useState(false)
  const [savingVars, setSavingVars] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [customVariables, setCustomVariables] = useState<CustomVariable[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const loadAbort = useRef<AbortController | null>(null)
  const hasData = useRef(false)
  hasData.current = data !== null

  useEffect(() => {
    if (!username) return
    const activeUser = username
    let cancelled = false
    async function restore() {
      const backup = loadCustomVariableBackup(activeUser, surveyId)
      if (!backup?.length) return
      try {
        const { variables: serverVars } = await api.getCustomVariables(surveyId)
        if (cancelled) return
        if (backup.length > serverVars.length) {
          const synced = await api.syncCustomVariables(surveyId, backup)
          if (!cancelled) {
            setCustomVariables(synced.variables)
            saveCustomVariableBackup(activeUser, surveyId, synced.variables)
            onVariablesChanged?.()
          }
        }
      } catch {
        /* ignore restore errors */
      }
    }
    restore()
    return () => { cancelled = true }
  }, [surveyId, username, onVariablesChanged])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput.trim())
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    setPage(1)
  }, [searchQuery, searchColumn])

  const loadData = useCallback(async () => {
    loadAbort.current?.abort()
    const ctrl = new AbortController()
    loadAbort.current = ctrl
    if (!hasData.current) setLoading(true)
    else setRefreshing(true)
    setError(null)
    try {
      const result = await api.getRawData(
        surveyId,
        {
          completionStatus,
          page,
          pageSize,
          search: searchQuery,
          searchColumn,
        },
        ctrl.signal,
      )
      if (ctrl.signal.aborted) return
      setData(result)
      setCustomVariables(result.custom_variables)
      if (username) saveCustomVariableBackup(username, surveyId, result.custom_variables)
    } catch (err) {
      if (ctrl.signal.aborted) return
      setError(err instanceof Error ? err.message : 'Failed to load data')
      if (!hasData.current) setData(null)
    } finally {
      if (!ctrl.signal.aborted) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [surveyId, completionStatus, page, pageSize, searchQuery, searchColumn, username])

  useEffect(() => {
    setPage(1)
  }, [completionStatus])

  useEffect(() => {
    loadData()
    return () => loadAbort.current?.abort()
  }, [loadData])

  const visibleColumns = useMemo(() => {
    if (!data) return []
    if (columnFilter === 'all') return data.columns
    return data.columns.filter((col) => col.kind === columnFilter)
  }, [data, columnFilter])

  async function handleSaveVariables() {
    if (!username) {
      setSaveMessage('Sign in to save variables for future sessions.')
      return
    }
    setSavingVars(true)
    setSaveMessage(null)
    try {
      let variables = customVariables
      const backup = loadCustomVariableBackup(username, surveyId)
      if (backup?.length && backup.length >= variables.length) {
        variables = backup
      }
      const result = await api.syncCustomVariables(surveyId, variables)
      setCustomVariables(result.variables)
      saveCustomVariableBackup(username, surveyId, result.variables)
      onVariablesChanged?.()
      setSaveMessage(`Saved ${result.variables.length} custom variable(s) for ${username}.`)
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingVars(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      await api.exportRawData(surveyId, {
        completionStatus,
        search: searchQuery,
        searchColumn,
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const filteredRowCount = data?.filtered_rows ?? data?.total_rows ?? 0
  const hasActiveSearch = Boolean(searchQuery)
  const rowRangeStart = data ? (data.page - 1) * data.page_size + (filteredRowCount ? 1 : 0) : 0
  const rowRangeEnd = data ? Math.min(data.page * data.page_size, filteredRowCount) : 0

  if (loading && !data) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Loader2 className="animate-spin text-[var(--et-teal)]" size={32} />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="p-6">
        <ErrorState message={error} />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Database size={18} className="text-[var(--et-teal)]" />
              <h2 className="text-lg font-semibold text-slate-900">Raw data</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Survey responses with custom recoded variables appended as columns.
              {data && (
                <span className="ml-1 font-medium text-slate-700">
                  {hasActiveSearch ? (
                    <>
                      {filteredRowCount.toLocaleString()} matching
                      {filteredRowCount !== data.total_rows && (
                        <> of {data.total_rows.toLocaleString()}</>
                      )}{' '}
                      rows · {data.columns.length} columns
                    </>
                  ) : (
                    <>
                      {data.total_rows.toLocaleString()} rows · {data.columns.length} columns
                    </>
                  )}
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSaveVariables}
              disabled={savingVars}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {savingVars ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              Save variables
            </button>
            <button
              type="button"
              onClick={async () => {
                setExportingCodebook(true)
                try {
                  await api.exportCodebook(surveyId, completionStatus)
                } catch (err) {
                  alert(err instanceof Error ? err.message : 'Codebook export failed')
                } finally {
                  setExportingCodebook(false)
                }
              }}
              disabled={exportingCodebook}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {exportingCodebook ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
              Codebook CSV
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {exporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
              Export CSV
            </button>
          </div>
        </div>

        {saveMessage && (
          <p className={`mt-3 text-sm ${saveMessage.includes('failed') || saveMessage.includes('Sign in') ? 'text-amber-700' : 'text-emerald-700'}`}>
            {saveMessage}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-[var(--et-teal)] focus-within:ring-2 focus-within:ring-[var(--et-teal)]/20">
            <Search size={16} className="shrink-0 text-slate-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search responses…"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600">
            In column
            <select
              value={searchColumn}
              onChange={(e) => setSearchColumn(e.target.value)}
              className="max-w-[220px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">All columns</option>
              {(data?.columns ?? []).map((col) => (
                <option key={col.key} value={col.key}>
                  {col.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium text-slate-500">Show columns:</span>
          {(['all', 'raw', 'custom', 'system'] as ColumnFilter[]).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setColumnFilter(filter)}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
                columnFilter === filter
                  ? 'bg-[var(--et-teal-light)] text-[var(--et-teal-dark)] ring-[var(--et-teal)]/30'
                  : 'bg-white text-slate-600 ring-slate-200 hover:ring-[var(--et-teal)]/30'
              }`}
            >
              {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}

          <label className="ml-auto flex items-center gap-2 text-xs text-slate-600">
            Rows per page
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
              className="rounded-lg border border-slate-200 px-2 py-1.5"
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>

        {customVariables.length > 0 && (
          <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-900">
              <SlidersHorizontal size={16} />
              Custom variables ({customVariables.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {customVariables.map((v) => (
                <span
                  key={v.id}
                  className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-medium text-indigo-800 ring-1 ring-indigo-200"
                >
                  {v.name} <span className="ml-1 text-indigo-400">({v.code})</span>
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-indigo-700/80">
              Custom columns appear at the end of the table. Use <strong>Save variables</strong> to keep them after sign-out.
            </p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {refreshing && (
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="animate-spin" size={16} />
            Refreshing…
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  {visibleColumns.map((col) => (
                    <th
                      key={col.key}
                      className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-700"
                      title={col.key}
                    >
                      <div className="flex max-w-[220px] flex-col gap-1">
                        <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${kindBadge(col.kind)}`}>
                          {col.kind}
                        </span>
                        <span className="line-clamp-2 font-medium normal-case">{col.label}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.rows ?? []).map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-slate-50/80">
                    {visibleColumns.map((col) => (
                      <td key={col.key} className="max-w-[220px] truncate px-3 py-2 text-slate-700">
                        {row[col.key] == null || row[col.key] === '' ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          String(row[col.key])
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && (data?.rows.length ?? 0) === 0 && (
            <p className="p-8 text-center text-sm text-slate-500">
              {hasActiveSearch
                ? `No responses match "${searchQuery}".`
                : 'No rows in this dataset.'}
            </p>
          )}
        </div>
      </div>

      {data && (
        <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-6 py-3 text-sm">
          <p className="text-slate-500">
            Page {data.page} of {data.total_pages}
            <span className="ml-2 text-slate-400">
              ({rowRangeStart.toLocaleString()}–{rowRangeEnd.toLocaleString()}
              {hasActiveSearch ? ` of ${filteredRowCount.toLocaleString()} matching` : ` of ${data.total_rows.toLocaleString()}`})
            </span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={data.page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <button
              type="button"
              disabled={data.page >= data.total_pages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="shrink-0 border-t border-slate-100 bg-slate-50 px-6 py-2 text-xs text-slate-500">
        Create variables in the{' '}
        <button
          type="button"
          onClick={onOpenVariables}
          className="font-medium text-[var(--et-teal-dark)] hover:underline"
        >
          Variables
        </button>{' '}
        tab, then return here to view recoded values. Saved variables reload automatically on your next sign-in.
      </div>
    </div>
  )
}
