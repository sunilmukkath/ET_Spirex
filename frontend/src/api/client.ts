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
  default_kind?: string
  kind_override?: string | null
  value_weights?: Record<string, number>
}

export interface VariableSetupEntry {
  kind_override?: string | null
  value_weights?: Record<string, number>
}

export interface VariableSetupConfig {
  variables: Record<string, VariableSetupEntry>
}

export interface VariableSetupUpdate {
  kind_override?: string | null
  value_weights?: Record<string, number>
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

export interface FilterPreset {
  id: string
  name: string
  filter_tree: FilterGroup | null
  filters: FilterSpec[]
  created_at: number
  updated_at: number
}

export interface AnalysisBookmark {
  id: string
  name: string
  kind: 'crosstab' | 'chart' | 'filter'
  config: Record<string, unknown>
  created_at: number
  updated_at: number
}

export interface WeightConfig {
  enabled: boolean
  variable_id: string | null
}

export interface QuotaCellTarget {
  code: string
  target: number
  min_value?: number | null
  max_value?: number | null
}

export interface QuotaFieldConfig {
  variable_id: string
  quota_type: 'count' | 'percent'
  cells: QuotaCellTarget[]
}

export interface QuotaLayerCellTarget {
  codes: Record<string, string>
  target: number
  min_value?: number | null
  max_value?: number | null
}

export interface QuotaLayerConfig {
  id: string
  name: string
  variable_ids: string[]
  quota_type: 'count' | 'percent'
  cells: QuotaLayerCellTarget[]
}

export interface QuotaConfig {
  basis: 'complete' | 'qc_approved'
  tolerance_count: number
  tolerance_pct: number
  interviewer_variable_id?: string | null
  fields: QuotaFieldConfig[]
  layers: QuotaLayerConfig[]
}

export interface QuotaCheckCell {
  code?: string
  codes?: Record<string, string>
  label: string
  target: number
  min_value: number | null
  max_value: number | null
  actual: number
  actual_pct: number
  gap: number
  status: 'met' | 'under' | 'over' | 'empty'
}

export interface QuotaCheckField {
  variable_id: string
  code: string
  label: string
  quota_type: 'count' | 'percent'
  cells: QuotaCheckCell[]
  status: string
  error?: string
}

export interface QuotaCheckLayer {
  id: string
  name: string
  variable_ids: string[]
  labels: Record<string, string>
  quota_type: 'count' | 'percent'
  cells: QuotaCheckCell[]
  status: string
  error?: string
}

export interface QuotaCheckResult {
  basis: string
  checked_at: string
  total_completes: number
  tolerance_count: number
  tolerance_pct: number
  fields: QuotaCheckField[]
  layers: QuotaCheckLayer[]
  summary: {
    fields_ok: number
    fields_under: number
    fields_over: number
    fields_mixed: number
    fields_empty: number
    layers_ok: number
    layers_under: number
    layers_over: number
    layers_mixed: number
    layers_empty: number
  }
}

export interface SurveyOverview {
  survey_id: number
  generated_at: string
  response_count: number
  total_responses: number
  incomplete_count: number
  qc_approved_count: number
  qc_excluded_count: number
  question_count: number
  banner_ready_count: number
  custom_rule_count: number
  quota_field_count: number
  quota_layer_count: number
  has_interviewer_variable: boolean
  quota_summary?: {
    fields_ok: number
    fields_under: number
    fields_over: number
    layers_ok: number
    layers_under: number
    layers_over: number
    total_completes: number
    checked_at?: string
  } | null
}

export interface FieldingStats {
  survey_id: number
  completion_status: string
  generated_at: string
  total_responses: number
  daily: { date: string; count: number; cumulative?: number }[]
  hourly: { hour: string; count: number }[]
  interviewer_variable_id?: string | null
  by_interviewer: { interviewer: string; count: number }[]
  average_completion_seconds?: number | null
  has_submit_dates: boolean
}

export interface FilterSpec {
  variable_id: string
  values: string[]
}

export interface FilterCondition {
  type: 'condition'
  variable_id: string
  operator: 'eq' | 'ne' | 'in' | 'not_in'
  values: string[]
  negate?: boolean
}

export interface FilterGroup {
  type: 'group'
  logic: 'and' | 'or'
  negate?: boolean
  children: (FilterCondition | FilterGroup)[]
}

export interface BannerRequest {
  row_variable_id: string
  row_variable_ids?: string[]
  banner_variable_ids: string[]
  banner_layers?: string[][]
  filters?: FilterSpec[]
  filter_tree?: FilterGroup | null
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
  header_rows?: { label: string; colspan: number; banner_id?: string | null; layer?: number }[][]
  banner_layer_count?: number
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
  scale_metrics?: {
    top2box_pct?: number
    bottom2box_pct?: number
    net_pct?: number
    nps?: number
    mean?: number
    base?: number
  }
}

export interface QcThresholds {
  speeder_time_basis?: 'average' | 'median'
  speeder_custom_reference_seconds?: number | null
  speeder_min_seconds: number
  speeder_median_fraction: number
  min_array_items_straight_line: number
  min_text_length_gibberish: number
  interviewer_duplicate_similarity_pct?: number
  interviewer_gps_proximity_meters?: number
  interviewer_gps_proximity_min_cluster?: number
  interviewer_gps_proximity_flag_all_in_cluster?: boolean
  interviewer_min_gap_seconds?: number
}

export interface QcCustomRule {
  variable_id: string
  operator: 'in' | 'not_in' | 'is_empty' | 'not_empty'
  values: string[]
  name: string
}

export interface QcConfig {
  disabled_checks: string[]
  kept_response_ids: string[]
  excluded_response_ids: string[]
  thresholds: QcThresholds
  custom_rules: QcCustomRule[]
  interviewer_variable_id?: string | null
  gps_variable_id?: string | null
  straight_line_variable_ids?: string[] | null
}

export type GlobalRole = 'admin' | 'manager' | 'member'
export type ProjectModule =
  | 'programming'
  | 'field'
  | 'research'
  | 'finance'
  | 'client'
  | 'analysis'
  | 'qc'
  | 'export'
export type TaskCategory =
  | 'programming'
  | 'field'
  | 'research'
  | 'finance'
  | 'client_request'
  | 'general'
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'

export interface TeamUser {
  username: string
  role: GlobalRole
}

export interface TeamRegistry {
  users: TeamUser[]
}

export interface ProjectMember {
  username: string
  project_role: 'lead' | 'contributor'
  is_project_manager: boolean
  modules: ProjectModule[]
}

export interface ProjectTask {
  id: string
  title: string
  description?: string
  category: TaskCategory
  assignee?: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date?: string | null
  created_by?: string | null
  created_at?: number | null
  updated_at?: number | null
}

export interface ProjectWorkflow {
  members: ProjectMember[]
  tasks: ProjectTask[]
  notes?: string
}

export interface WorkflowAccess {
  username: string | null
  global_role: GlobalRole
  is_project_manager: boolean
  can_manage_team: boolean
  project_role: 'lead' | 'contributor' | null
  modules: ProjectModule[]
  assigned_tasks: number
  open_tasks: number
}

export interface ProjectWorkflowResponse {
  workflow: ProjectWorkflow
  access: WorkflowAccess
  modules: ProjectModule[]
}

export interface InterviewerQcRow {
  interviewer: string
  completed: number
  approved: number
  rejected: number
  rejection_pct: number
  checks: Record<string, number>
}

export interface InterviewerQcResult {
  interviewer_variable_id?: string | null
  interviewer_question?: string
  interviewer_code?: string
  total_completed?: number
  total_rejected?: number
  total_approved?: number
  check_columns?: string[]
  rows: InterviewerQcRow[]
  error?: string
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
    average_seconds?: number
    reference_seconds?: number
    reference_basis?: 'average' | 'median' | 'custom'
    threshold_seconds?: number
    flags: {
      response_id: string | number
      seconds: number
      average_seconds?: number
      median_seconds?: number
      reference_seconds?: number
      reference_basis?: 'average' | 'median' | 'custom'
      reason?: string
    }[]
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
    checked_variables?: {
      variable_id: string
      question: string
      item_count: number
    }[]
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
  interviewer_duplicates?: {
    available?: boolean
    message?: string
    count: number
    threshold_pct?: number
    comparable_fields?: number
    by_interviewer?: {
      interviewer: string
      flagged_count: number
      max_similarity_pct: number
      completed: number
    }[]
    flags: {
      response_id: string | number
      interviewer: string
      match_response_id: string | number
      similarity_pct: number
      matched_fields: number
      comparable_fields: number
      reason?: string
    }[]
  }
  interviewer_gps_proximity?: {
    available?: boolean
    message?: string
    count: number
    proximity_meters?: number
    min_cluster?: number
    flag_all_in_cluster?: boolean
    gps_variable_id?: string | null
    sessions_total?: number
    sessions_with_gps?: number
    by_interviewer?: {
      interviewer: string
      flagged_count: number
      completed: number
    }[]
    flags: {
      response_id: string | number
      interviewer: string
      match_response_id: string | number
      distance_meters?: number
      cluster_size?: number
      reason?: string
    }[]
  }
  interviewer_short_gap?: {
    available?: boolean
    message?: string
    count: number
    min_gap_seconds?: number
    by_interviewer?: {
      interviewer: string
      flagged_count: number
      completed: number
    }[]
    flags: {
      response_id: string | number
      interviewer: string
      match_response_id: string | number
      gap_seconds?: number
      reason?: string
    }[]
  }
  custom_rules?: {
    available?: boolean
    count: number
    rules?: string[]
    flags: {
      response_id: string | number
      rule_name?: string
      variable_id?: string
      reason?: string
    }[]
  }
  thresholds?: QcThresholds
}

export interface AdvancedAnalysisResult {
  error?: string
  analysis_type?: string
  base_n?: number
  method?: string
  pairwise_n?: number
  variables?: { id: string; label: string }[]
  matrix?: { variable_id: string; label: string; values: Record<string, number | null> }[]
  p_values?: Record<string, Record<string, number | null>>
  n?: number
  dependent?: { id: string; label: string }
  independents?: { id: string; label: string }[]
  r_squared?: number
  adj_r_squared?: number
  rmse?: number
  coefficients?: { name: string; variable_id?: string | null; estimate: number }[]
  variable_a?: { id: string; label: string }
  variable_b?: { id: string; label: string }
  chi2?: number
  df?: number
  p_value?: number
  cramers_v?: number
  interpretation?: string
  table?: { row_labels: string[]; col_labels: string[]; counts: number[][] }
  numeric_variable?: { id: string; label: string }
  group_variable?: { id: string; label: string }
  group_a?: { label: string; n: number; mean: number }
  group_b?: { label: string; n: number; mean: number }
  t_statistic?: number
  significant_95?: boolean
  f_statistic?: number
  groups?: { label: string; n: number; mean: number; std: number }[]
  rows?: {
    variable_id: string
    label: string
    n: number
    mean: number
    std: number
    min: number
    max: number
    median: number
  }[]
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
/** Schema, QC summary, and warmup on large surveys. */
const SURVEY_LOAD_TIMEOUT_MS = 120_000
/** Per-request ceiling for analysis calls (crosstabs run in chunks for large builds). */
const ANALYSIS_TIMEOUT_MS = 600_000

function timeoutErrorMessage(timeoutMs: number): string {
  if (timeoutMs >= ANALYSIS_TIMEOUT_MS) {
    return 'Request timed out. Large crosstab builds run in batches — try fewer tables per build or wait for data to finish loading.'
  }
  if (timeoutMs >= SURVEY_LOAD_TIMEOUT_MS) {
    return 'Request timed out while loading survey data. Large surveys can take a minute — wait and try again, or refresh the page.'
  }
  return 'Request timed out. Check your connection or try again in a moment.'
}

function formatApiError(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const record = body as { detail?: unknown; error?: unknown }
    const detail = record.detail ?? record.error
    if (typeof detail === 'string' && detail.trim()) return detail
    if (Array.isArray(detail)) {
      const parts = detail
        .map((item) => {
          if (item && typeof item === 'object' && 'msg' in item) {
            return String((item as { msg: string }).msg)
          }
          return String(item)
        })
        .filter(Boolean)
      if (parts.length) return parts.join('; ')
    }
  }
  return `Request failed (${status})`
}

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs: number = API_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

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
      throw new Error(formatApiError(body, res.status))
    }
    return res.json()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (init?.signal?.aborted && !timedOut) {
        throw new Error('Request cancelled')
      }
      if (timedOut) {
        throw new Error(timeoutErrorMessage(timeoutMs))
      }
      throw new Error('Request was cancelled.')
    }
    if (err instanceof TypeError) {
      throw new Error(
        'Network error — check your connection or try again in a moment.',
      )
    }
    throw err
  } finally {
    window.clearTimeout(timeoutId)
  }
}

const schemaCache = new Map<string, { at: number; data: SurveySchema }>()
const SCHEMA_CACHE_MS = 300_000

const profileCache = new Map<string, { at: number; data: ProfileResult }>()
const PROFILE_CACHE_MS = 120_000

function profileCacheKey(
  id: number,
  variableId: string,
  completionStatus: string,
  filters: FilterSpec[],
  filterTree?: FilterGroup | null,
) {
  return `${id}:${variableId}:${completionStatus}:${JSON.stringify({ filters, filterTree: filterTree ?? null })}`
}

export function invalidateProfileCache(surveyId?: number) {
  if (surveyId == null) {
    profileCache.clear()
    return
  }
  for (const key of profileCache.keys()) {
    if (key.startsWith(`${surveyId}:`)) profileCache.delete(key)
  }
}

function schemaCacheKey(id: number, completionStatus: string, light: boolean) {
  return `${id}:${completionStatus}:${light}`
}

export function invalidateSchemaCache(surveyId?: number) {
  if (surveyId == null) {
    schemaCache.clear()
    return
  }
  for (const key of schemaCache.keys()) {
    if (key.startsWith(`${surveyId}:`)) schemaCache.delete(key)
  }
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
  getMe: () => fetchJson<{ username: string; login_at: number; role?: GlobalRole }>('/api/auth/me'),
  getActiveSessions: () =>
    fetchJson<{ sessions: { username: string; login_at: number; last_seen: number }[] }>(
      '/api/auth/sessions',
    ),
  getAuthUsers: () => fetchJson<{ users: string[] }>('/api/auth/users'),
  getTeamRegistry: () => fetchJson<TeamRegistry>('/api/team/registry'),
  setTeamRegistry: (body: TeamRegistry) =>
    fetchJson<TeamRegistry>('/api/team/registry', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  getProjectWorkflow: (id: number) => fetchJson<ProjectWorkflowResponse>(`/api/projects/${id}/workflow`),
  setProjectWorkflow: (id: number, workflow: ProjectWorkflow) =>
    fetchJson<ProjectWorkflowResponse>(`/api/projects/${id}/workflow`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workflow),
    }),
  getPinnedSurveys: () => fetchJson<{ survey_ids: number[] }>('/api/me/pinned-surveys'),
  setPinnedSurveys: (surveyIds: number[]) =>
    fetchJson<{ survey_ids: number[] }>('/api/me/pinned-surveys', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ survey_ids: surveyIds }),
    }),
  getConnection: () => fetchJson<ConnectionStatus>('/api/connection'),
  getProjects: (opts?: { limit?: number; includeStats?: boolean }) => {
    const params = new URLSearchParams()
    if (opts?.limit != null) params.set('limit', String(opts.limit))
    if (opts?.includeStats) params.set('include_stats', 'true')
    const qs = params.toString()
    return fetchJson<{ projects: Project[] }>(`/api/projects${qs ? `?${qs}` : ''}`)
  },
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
      light ? SURVEY_LOAD_TIMEOUT_MS : ANALYSIS_TIMEOUT_MS,
    )
    schemaCache.set(key, { at: Date.now(), data })
    return data
  },
  runProfile: async (
    id: number,
    variableId: string,
    completionStatus = 'complete',
    filters: FilterSpec[] = [],
    signal?: AbortSignal,
    filterTree?: FilterGroup | null,
  ) => {
    const key = profileCacheKey(id, variableId, completionStatus, filters, filterTree)
    const hit = profileCache.get(key)
    if (hit && Date.now() - hit.at < PROFILE_CACHE_MS) {
      return hit.data
    }
    const data = await fetchJson<ProfileResult>(
      `/api/projects/${id}/analysis/profile`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variable_id: variableId,
          completion_status: completionStatus,
          filters: filterTree ? [] : filters,
          filter_tree: filterTree ?? null,
        }),
        signal,
      },
      ANALYSIS_TIMEOUT_MS,
    )
    profileCache.set(key, { at: Date.now(), data })
    return data
  },
  runChart: (
    id: number,
    query: {
      variableId: string
      completionStatus?: string
      filters?: FilterSpec[]
      filterTree?: FilterGroup | null
      chartType?: string
      bins?: number
      bannerVariableId?: string
      yVariableId?: string
      zVariableId?: string
    },
    signal?: AbortSignal,
  ) =>
    fetchJson<ProfileResult & BannerResult>(
      `/api/projects/${id}/analysis/chart`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variable_id: query.variableId,
          completion_status: query.completionStatus ?? 'complete',
          filters: query.filterTree ? [] : (query.filters ?? []),
          filter_tree: query.filterTree ?? null,
          chart_type: query.chartType ?? 'auto',
          bins: query.bins ?? 10,
          banner_variable_id: query.bannerVariableId || null,
          y_variable_id: query.yVariableId || null,
          z_variable_id: query.zVariableId || null,
        }),
        signal,
      },
      ANALYSIS_TIMEOUT_MS,
    ),
  warmupSurvey: (id: number, completionStatus = 'complete') =>
    fetchJson<{ ok: boolean }>(
      `/api/projects/${id}/warmup?completion_status=${encodeURIComponent(completionStatus)}`,
      { method: 'POST' },
      SURVEY_LOAD_TIMEOUT_MS,
    ),
  getFilterOptions: (surveyId: number, variableId: string, completionStatus = 'complete') =>
    fetchJson<{ options: { code: string; label: string; count?: number }[]; error?: string }>(
      `/api/projects/${surveyId}/variables/${variableId}/filter-options?completion_status=${completionStatus}`,
    ),
  getDataQuality: (id: number, completionStatus = 'complete', refresh = false) =>
    fetchJson<DataQualityResult>(
      `/api/projects/${id}/analysis/quality?completion_status=${completionStatus}${refresh ? '&refresh=true' : ''}`,
      undefined,
      ANALYSIS_TIMEOUT_MS,
    ),
  getQcConfig: (id: number) => fetchJson<QcConfig>(`/api/projects/${id}/qc/config`),
  getQcSummary: (id: number) =>
    fetchJson<{
      total_completed: number
      auto_flagged_count: number
      excluded_count: number
      qc_approved_count: number
      kept_flagged_count: number
      manual_excluded_count: number
      has_review: boolean
    }>(`/api/projects/${id}/qc/summary`, undefined, SURVEY_LOAD_TIMEOUT_MS),
  setQcConfig: (id: number, body: QcConfig) =>
    fetchJson<QcConfig>(`/api/projects/${id}/qc/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  getInterviewerQc: (id: number, interviewerVariableId?: string) => {
    const qs = interviewerVariableId
      ? `?interviewer_variable_id=${encodeURIComponent(interviewerVariableId)}`
      : ''
    return fetchJson<InterviewerQcResult>(`/api/projects/${id}/qc/by-interviewer${qs}`)
  },
  getInterviewerLabels: (id: number, interviewerVariableId?: string) => {
    const qs = interviewerVariableId
      ? `?interviewer_variable_id=${encodeURIComponent(interviewerVariableId)}`
      : ''
    return fetchJson<{
      interviewer_variable_id?: string | null
      interviewer_question?: string
      labels: Record<string, string>
      error?: string
    }>(`/api/projects/${id}/qc/interviewer-labels${qs}`)
  },
  getSurveyOverview: (id: number) => fetchJson<SurveyOverview>(`/api/projects/${id}/overview`),
  getFieldingStats: (id: number, completionStatus?: string, interviewerVariableId?: string) => {
    const params = new URLSearchParams()
    if (completionStatus) params.set('completion_status', completionStatus)
    if (interviewerVariableId) params.set('interviewer_variable_id', interviewerVariableId)
    const qs = params.toString() ? `?${params.toString()}` : ''
    return fetchJson<FieldingStats>(`/api/projects/${id}/fielding${qs}`)
  },
  exportCodebook: async (id: number, completionStatus?: string) => {
    const qs = completionStatus ? `?completion_status=${encodeURIComponent(completionStatus)}` : ''
    const res = await fetch(`/api/projects/${id}/data/codebook/export${qs}`, { headers: authHeaders() })
    if (!res.ok) throw new Error('Codebook export failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `survey_${id}_codebook.csv`
    a.click()
    URL.revokeObjectURL(url)
  },
  getQuotaConfig: (id: number) => fetchJson<QuotaConfig>(`/api/projects/${id}/quota/config`),
  setQuotaConfig: (id: number, body: QuotaConfig) =>
    fetchJson<QuotaConfig>(`/api/projects/${id}/quota/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  checkQuotas: (id: number, completionStatus?: string) => {
    const qs = completionStatus ? `?completion_status=${encodeURIComponent(completionStatus)}` : ''
    return fetchJson<QuotaCheckResult>(`/api/projects/${id}/quota/check${qs}`, { method: 'POST' })
  },
  exportFieldReport: async (
    id: number,
    kind: 'quota' | 'qc' | 'interviewer-rejections',
    options: { completionStatus?: string; interviewerVariableId?: string; filename?: string } = {},
  ) => {
    const params = new URLSearchParams()
    if (kind === 'quota' && options.completionStatus) {
      params.set('completion_status', options.completionStatus)
    }
    if (kind === 'interviewer-rejections' && options.interviewerVariableId) {
      params.set('interviewer_variable_id', options.interviewerVariableId)
    }
    const qs = params.toString() ? `?${params.toString()}` : ''
    const path =
      kind === 'quota'
        ? `/api/projects/${id}/field-reports/quota/export${qs}`
        : kind === 'qc'
          ? `/api/projects/${id}/field-reports/qc/export`
          : `/api/projects/${id}/field-reports/interviewer-rejections/export${qs}`
    const defaultName =
      kind === 'quota'
        ? `survey_${id}_quota_completion.csv`
        : kind === 'qc'
          ? `survey_${id}_qc_checks.csv`
          : `survey_${id}_interviewer_rejections.csv`
    const res = await fetch(path, { headers: authHeaders() })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || `Export failed (${res.status})`)
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = options.filename || defaultName
    a.click()
    URL.revokeObjectURL(url)
  },
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
  getFilterPresets: (id: number) =>
    fetchJson<{ presets: FilterPreset[] }>(`/api/projects/${id}/filters/presets`),
  createFilterPreset: (
    id: number,
    body: { name: string; filter_tree?: FilterGroup | null; filters?: FilterSpec[] },
  ) =>
    fetchJson<FilterPreset>(`/api/projects/${id}/filters/presets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteFilterPreset: (id: number, presetId: string) =>
    fetchJson<{ ok: boolean }>(`/api/projects/${id}/filters/presets/${presetId}`, { method: 'DELETE' }),
  getBookmarks: (id: number) =>
    fetchJson<{ bookmarks: AnalysisBookmark[] }>(`/api/projects/${id}/bookmarks`),
  createBookmark: (id: number, body: { name: string; kind: string; config: Record<string, unknown> }) =>
    fetchJson<AnalysisBookmark>(`/api/projects/${id}/bookmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteBookmark: (id: number, bookmarkId: string) =>
    fetchJson<{ ok: boolean }>(`/api/projects/${id}/bookmarks/${bookmarkId}`, { method: 'DELETE' }),
  getWeightConfig: (id: number) =>
    fetchJson<WeightConfig>(`/api/projects/${id}/weight-config`),
  setWeightConfig: (id: number, config: WeightConfig) =>
    fetchJson<WeightConfig & { saved: boolean }>(`/api/projects/${id}/weight-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }),
  getVariableSetup: (id: number) =>
    fetchJson<VariableSetupConfig>(`/api/projects/${id}/variable-setup`),
  setVariableSetup: (id: number, variableId: string, body: VariableSetupUpdate) =>
    fetchJson<VariableSetupEntry & { saved: boolean; variable_id: string }>(
      `/api/projects/${id}/variables/${encodeURIComponent(variableId)}/setup`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),
  clearVariableSetup: (id: number, variableId: string) =>
    fetchJson<{ ok: boolean; variable_id: string }>(
      `/api/projects/${id}/variables/${encodeURIComponent(variableId)}/setup`,
      { method: 'DELETE' },
    ),
  getVariableSetupDefaults: (id: number, variableId: string) =>
    fetchJson<{ value_weights: Record<string, number> }>(
      `/api/projects/${id}/variables/${encodeURIComponent(variableId)}/setup/defaults`,
    ),
  exportReport: async (
    id: number,
    body: {
      format: 'pdf' | 'pptx'
      report_type: 'profile' | 'banner'
      variable_id?: string
      completion_status?: string
      filters?: FilterSpec[]
      filter_tree?: FilterGroup | null
      banner_request?: BannerRequest
    },
    filename = 'report.pdf',
  ) => {
    const res = await fetch(`/api/projects/${id}/analysis/report`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...body,
        filters: body.filter_tree ? [] : (body.filters ?? []),
      }),
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new Error(errBody.detail || `Export failed (${res.status})`)
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },
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
  runBanner: (id: number, request: BannerRequest, signal?: AbortSignal) =>
    fetchJson<BannerResult>(
      `/api/projects/${id}/analysis/banner`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...request,
          filters: request.filter_tree ? [] : (request.filters ?? []),
        }),
        signal,
      },
      ANALYSIS_TIMEOUT_MS,
    ),
  runAdvancedAnalysis: (
    id: number,
    body: {
      analysis_type: string
      completion_status?: string
      filters?: FilterSpec[]
      filter_tree?: FilterGroup | null
      variable_ids?: string[]
      dependent_id?: string
      independent_ids?: string[]
      group_variable_id?: string
      numeric_variable_id?: string
      method?: string
    },
  ) =>
    fetchJson<AdvancedAnalysisResult>(
      `/api/projects/${id}/analysis/advanced`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      ANALYSIS_TIMEOUT_MS,
    ),
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
