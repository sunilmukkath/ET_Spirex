export interface Project {
  id: number
  title: string
  language: string
  owner: string | number
  status: 'active' | 'inactive' | 'expired'
  active: boolean
  start_date: string | null
  expire_date: string | null
  created_date: string | null
  responses: {
    completed: number
    incomplete: number
    total: number
    loaded?: boolean
  }
}

export interface ProjectDetail extends Project {
  description: string
  summary: Record<string, unknown>
}

export interface AnswerOption {
  code: string
  label: string
  sort_order: number
}

export interface SubQuestion {
  code: string
  label: string
  column: string
  sort_order: number
}

export interface Question {
  id: number
  code: string
  text: string
  type: string
  group_id: number
  group_title: string
}

export interface SurveyVariable {
  id: string
  qid: number
  code: string
  text: string
  ls_type: string
  kind: string
  type_label: string
  group_id: number
  group_title: string
  columns: string[]
  answer_options: AnswerOption[]
  subquestions: SubQuestion[]
  metrics: string[]
  can_banner: boolean
  can_filter: boolean
  lat_column?: string
  lng_column?: string
  custom?: boolean
  source_variable_id?: string
}

export interface CategoryMapping {
  label: string
  source_values: string[]
}

export type CustomVariableType = 'recode' | 'combine' | 'net_score'

export interface CustomVariable {
  id: string
  survey_id: number
  name: string
  code: string
  variable_type: CustomVariableType
  source_variable_id: string
  source_variable_ids: string[]
  categories: CategoryMapping[]
  include_unmapped: boolean
  unmapped_label: string
  tracked_codes: string[]
  top_codes: string[]
  bottom_codes: string[]
  created_at: number
  updated_at: number
}

export interface CustomVariableInput {
  name: string
  code: string
  variable_type: CustomVariableType
  source_variable_id: string
  source_variable_ids: string[]
  categories: CategoryMapping[]
  include_unmapped: boolean
  unmapped_label: string
  tracked_codes: string[]
  top_codes: string[]
  bottom_codes: string[]
}

export interface CustomVariablePreview {
  error?: string
  total?: number
  preview_type?: 'combine' | 'net_score' | 'recode'
  top_count?: number
  bottom_count?: number
  neutral_count?: number
  top_pct?: number
  bottom_pct?: number
  net_pct?: number
  counts: { label: string; count: number; percentage: number }[]
}

export interface RawDataColumn {
  key: string
  label: string
  kind: 'system' | 'raw' | 'custom'
  variable_id?: string | null
}

export interface RawDataPage {
  survey_id: number
  completion_status: string
  total_rows: number
  filtered_rows?: number
  search?: string
  search_column?: string
  page: number
  page_size: number
  total_pages: number
  columns: RawDataColumn[]
  rows: Record<string, unknown>[]
  custom_variables: CustomVariable[]
}

export interface RawDataQuery {
  completionStatus?: string
  page?: number
  pageSize?: number
  search?: string
  searchColumn?: string
}

export interface SurveySchema {
  survey_id: number
  response_count: number
  question_count?: number
  enriched?: boolean
  variables: SurveyVariable[]
  groups: { id: number; title: string; order: number; variable_ids: string[] }[]
}

export interface FilterSpec {
  variable_id: string
  values: string[]
}

export interface BannerRequest {
  row_variable_id: string
  row_variable_ids?: string[]
  banner_variable_ids: string[]
  filters?: FilterSpec[]
  row_filters?: Record<string, FilterSpec[]>
  completion_status?: string
  show_counts?: boolean
  show_col_pct?: boolean
  show_row_pct?: boolean
  show_significance?: boolean
  confidence_level?: number
  metric?: string
}

export interface TableCell {
  count?: number
  base?: number
  col_pct?: number
  row_pct?: number
  value?: number | null
  sig?: string | null
}

export interface TableRow {
  code: string
  label: string
  cells: TableCell[]
  is_total?: boolean
}

export interface BannerResult {
  error?: string
  row_variable?: { id: string; code: string; text: string; kind: string; type_label: string }
  banner_variables?: { id: string; code: string; text: string }[]
  metric?: string
  base_n?: number
  filtered_n?: number
  table_type?: string
  row_header?: string
  subquestion?: string
  headers?: { key: string; label: string; banner_id: string | null }[]
  rows?: TableRow[]
  sections?: BannerResult[]
  tables?: BannerResult[]
  confidence_level?: number
  show_counts?: boolean
  show_col_pct?: boolean
  show_row_pct?: boolean
  show_significance?: boolean
}

export interface ProfileResult {
  error?: string
  analysis_type?: string
  variable?: { id: string; code: string; text: string; kind: string; type_label: string }
  subquestion?: string
  base_n?: number
  values?: { code: string; label: string; count: number; percentage: number }[]
  sections?: ProfileResult[]
  count?: number
  mean?: number
  median?: number
  std?: number
  min?: number
  max?: number
  response_count?: number
  samples?: string[]
  top_words?: { word: string; count: number }[]
  points?: { lat: number; lng: number }[]
  bounds?: { north: number; south: number; east: number; west: number } | null
  chart_type?: string
  scatter_points?: { x: number; y: number; z?: number }[]
  x_variable?: { id: string; code: string; text: string; kind: string; type_label: string }
  line_values?: { code: string; label: string; count: number; percentage: number }[]
  y_variable?: { id: string; code: string; text: string; kind: string; type_label: string }
  z_variable?: { id: string; code: string; text: string; kind: string; type_label: string }
}

export interface DataQualityResult {
  total_responses: number
  flagged_count: number
  clean_estimate?: number
  duplicate_exclude_count?: number
  message?: string
  checks?: { id: string; title: string; count: number; severity: string }[]
  speeders: {
    available?: boolean
    message?: string
    count: number
    median_seconds?: number
    threshold_seconds?: number
    flags: { response_id: string | number; seconds: number; median_seconds?: number; reason?: string }[]
  }
  test_responses: {
    count: number
    flags: {
      response_id: string | number
      field: string
      text: string
      reason?: string
    }[]
  }
  duplicate_phones: {
    available?: boolean
    message?: string
    count: number
    exclude_count?: number
    flags: {
      response_id: string | number
      phone: string
      normalized_phone?: string
      field: string
      keep_response_id: string | number
      reason?: string
    }[]
    groups?: {
      phone: string
      field: string
      response_ids: (string | number)[]
      keep_response_id: string | number
      duplicate_count: number
    }[]
  }
  straight_liners: {
    count: number
    flags: {
      response_id: string | number
      variable_id: string
      question: string
      value: string
      items: number
      reason?: string
    }[]
  }
  gibberish: {
    count: number
    flags: {
      response_id: string | number
      variable_id: string
      question: string
      text: string
      reason?: string
    }[]
  }
}

export interface ConnectionStatus {
  connected: boolean
  configured: boolean
  version?: string
  survey_count?: number
  url?: string
  message?: string
}

let authToken: string | null = null

export function setAuthToken(token: string | null) {
  authToken = token
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {}
  if (extra) {
    if (extra instanceof Headers) {
      extra.forEach((v, k) => { headers[k] = v })
    } else if (Array.isArray(extra)) {
      extra.forEach(([k, v]) => { headers[k] = v })
    } else {
      Object.assign(headers, extra)
    }
  }
  if (authToken) headers.Authorization = `Bearer ${authToken}`
  return headers
}

const API_TIMEOUT_MS = 12_000

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS)

  if (init?.signal) {
    init.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  try {
    const res = await fetch(url, {
      ...init,
      headers: authHeaders(init?.headers),
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || `Request failed (${res.status})`)
    }
    return res.json()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        'Cannot reach the ET Spirex server. If running locally, start the backend on port 8000.',
      )
    }
    if (err instanceof TypeError) {
      throw new Error(
        'Network error — is the backend running? Use: cd backend && uvicorn app.main:app --port 8000',
      )
    }
    throw err
  } finally {
    window.clearTimeout(timeoutId)
  }
}

const schemaCache = new Map<string, { at: number; data: SurveySchema }>()
const SCHEMA_CACHE_MS = 90_000

function schemaCacheKey(id: number, completionStatus: string, light: boolean) {
  return `${id}:${completionStatus}:${light}`
}

export const api = {
  login: (username: string, password: string) =>
    fetchJson<{ token: string; username: string }>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
  logout: () =>
    fetchJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  getMe: () => fetchJson<{ username: string; login_at: number }>('/api/auth/me'),
  getActiveSessions: () =>
    fetchJson<{ sessions: { username: string; login_at: number; last_seen: number }[] }>(
      '/api/auth/sessions',
    ),
  getAuthUsers: () => fetchJson<{ users: string[] }>('/api/auth/users'),
  getConnection: () => fetchJson<ConnectionStatus>('/api/connection'),
  getProjects: () => fetchJson<{ projects: Project[] }>('/api/projects'),
  getProjectStats: (ids: number[]) =>
    fetchJson<{
      stats: Record<
        string,
        {
          completed: number
          incomplete: number
          total: number
          created_date: string | null
        }
      >
    }>('/api/projects/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ survey_ids: ids }),
    }),
  getProject: (id: number) => fetchJson<ProjectDetail>(`/api/projects/${id}`),
  getQuestions: (id: number) =>
    fetchJson<{ questions: Question[] }>(`/api/projects/${id}/questions`),
  getSchema: async (id: number, completionStatus = 'complete', light = false, signal?: AbortSignal) => {
    const key = schemaCacheKey(id, completionStatus, light)
    const hit = schemaCache.get(key)
    if (hit && Date.now() - hit.at < SCHEMA_CACHE_MS) {
      return hit.data
    }
    const data = await fetchJson<SurveySchema>(
      `/api/projects/${id}/schema?completion_status=${completionStatus}&light=${light}`,
      { signal },
    )
    schemaCache.set(key, { at: Date.now(), data })
    return data
  },
  runProfile: (
    id: number,
    variableId: string,
    completionStatus = 'complete',
    filters: FilterSpec[] = [],
    signal?: AbortSignal,
  ) =>
    fetchJson<ProfileResult>(`/api/projects/${id}/analysis/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variable_id: variableId,
        completion_status: completionStatus,
        filters,
      }),
      signal,
    }),
  runChart: (
    id: number,
    query: {
      variableId: string
      completionStatus?: string
      filters?: FilterSpec[]
      chartType?: string
      bins?: number
      bannerVariableId?: string
      yVariableId?: string
      zVariableId?: string
    },
    signal?: AbortSignal,
  ) =>
    fetchJson<ProfileResult & BannerResult>(`/api/projects/${id}/analysis/chart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variable_id: query.variableId,
        completion_status: query.completionStatus ?? 'complete',
        filters: query.filters ?? [],
        chart_type: query.chartType ?? 'auto',
        bins: query.bins ?? 10,
        banner_variable_id: query.bannerVariableId || null,
        y_variable_id: query.yVariableId || null,
        z_variable_id: query.zVariableId || null,
      }),
      signal,
    }),
  warmupSurvey: (id: number, completionStatus = 'complete') =>
    fetchJson<{ ok: boolean }>(
      `/api/projects/${id}/warmup?completion_status=${encodeURIComponent(completionStatus)}`,
      { method: 'POST' },
    ),
  getFilterOptions: (surveyId: number, variableId: string, completionStatus = 'complete') =>
    fetchJson<{ options: { code: string; label: string; count?: number }[]; error?: string }>(
      `/api/projects/${surveyId}/variables/${variableId}/filter-options?completion_status=${completionStatus}`,
    ),
  getDataQuality: (id: number, completionStatus = 'complete', refresh = false) =>
    fetchJson<DataQualityResult>(
      `/api/projects/${id}/analysis/quality?completion_status=${completionStatus}${refresh ? '&refresh=true' : ''}`,
    ),
  getCustomVariables: (id: number) =>
    fetchJson<{ variables: CustomVariable[] }>(`/api/projects/${id}/variables/custom`),
  createCustomVariable: (id: number, body: CustomVariableInput) =>
    fetchJson<CustomVariable>(`/api/projects/${id}/variables/custom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  updateCustomVariable: (id: number, variableId: string, body: Partial<CustomVariableInput>) =>
    fetchJson<CustomVariable>(`/api/projects/${id}/variables/custom/${variableId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteCustomVariable: (id: number, variableId: string) =>
    fetchJson<{ ok: boolean }>(`/api/projects/${id}/variables/custom/${variableId}`, {
      method: 'DELETE',
    }),
  previewCustomVariable: (id: number, body: CustomVariableInput, completionStatus = 'complete') =>
    fetchJson<CustomVariablePreview>(
      `/api/projects/${id}/variables/custom/preview?completion_status=${completionStatus}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),
  syncCustomVariables: (id: number, variables: CustomVariable[]) =>
    fetchJson<{ variables: CustomVariable[]; saved: boolean }>(
      `/api/projects/${id}/variables/custom/sync`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables }),
      },
    ),
  getRawData: (id: number, query: RawDataQuery = {}, signal?: AbortSignal) => {
    const {
      completionStatus = 'complete',
      page = 1,
      pageSize = 50,
      search = '',
      searchColumn = '',
    } = query
    const params = new URLSearchParams({
      completion_status: completionStatus,
      page: String(page),
      page_size: String(pageSize),
    })
    if (search.trim()) params.set('search', search.trim())
    if (searchColumn.trim()) params.set('search_column', searchColumn.trim())
    return fetchJson<RawDataPage>(`/api/projects/${id}/data/raw?${params.toString()}`, { signal })
  },
  exportRawData: async (id: number, query: RawDataQuery = {}, filename = 'survey_data.csv') => {
    const {
      completionStatus = 'complete',
      search = '',
      searchColumn = '',
    } = query
    const params = new URLSearchParams({ completion_status: completionStatus })
    if (search.trim()) params.set('search', search.trim())
    if (searchColumn.trim()) params.set('search_column', searchColumn.trim())
    const res = await fetch(`/api/projects/${id}/data/raw/export?${params.toString()}`, {
      headers: authHeaders(),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || `Export failed (${res.status})`)
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },
  runBanner: (id: number, request: BannerRequest) =>
    fetchJson<BannerResult>(`/api/projects/${id}/analysis/banner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    }),
  exportBanner: async (id: number, request: BannerRequest, filename = 'crosstab.xlsx') => {
    const res = await fetch(`/api/projects/${id}/analysis/banner/export`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(request),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || `Export failed (${res.status})`)
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },
}
