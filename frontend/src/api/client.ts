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
}

export interface DataQualityResult {
  total_responses: number
  flagged_count: number
  speeders: {
    available?: boolean
    message?: string
    count: number
    median_seconds?: number
    threshold_seconds?: number
    flags: { response_id: string | number; seconds: number; median_seconds?: number }[]
  }
  straight_liners: {
    count: number
    flags: {
      response_id: string | number
      variable_id: string
      question: string
      value: string
      items: number
    }[]
  }
  gibberish: {
    count: number
    flags: {
      response_id: string | number
      variable_id: string
      question: string
      text: string
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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: authHeaders(init?.headers),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${res.status})`)
  }
  return res.json()
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
  getSchema: (id: number, completionStatus = 'complete', light = false) =>
    fetchJson<SurveySchema>(
      `/api/projects/${id}/schema?completion_status=${completionStatus}&light=${light}`,
    ),
  runProfile: (id: number, variableId: string, completionStatus = 'complete', filters: FilterSpec[] = []) =>
    fetchJson<ProfileResult>(`/api/projects/${id}/analysis/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variable_id: variableId,
        completion_status: completionStatus,
        filters,
      }),
    }),
  getDataQuality: (id: number, completionStatus = 'complete') =>
    fetchJson<DataQualityResult>(
      `/api/projects/${id}/analysis/quality?completion_status=${completionStatus}`,
    ),
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
