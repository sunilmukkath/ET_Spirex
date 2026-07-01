export interface SurveyWorkspaceSession {
  mode: string
  view?: string
  responses: string
  selectedQuestionId?: string | null
  sideRowIds?: string[]
  bannerLayers?: string[][]
  metric?: string
  setupExpandedQuestionId?: string | null
  updatedAt: number
}

export interface UserAppSession {
  lastSurveyId?: number
  lastSurveyTitle?: string
  lastPath?: string
  dashboardViewMode?: 'strips' | 'table'
  dashboardSortKey?: string
  updatedAt: number
}

function surveyKey(username: string, surveyId: number) {
  return `et_scout_ws:${username}:${surveyId}`
}

function appKey(username: string) {
  return `et_scout_app:${username}`
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function loadSurveySession(username: string, surveyId: number): SurveyWorkspaceSession | null {
  return readJson<SurveyWorkspaceSession>(surveyKey(username, surveyId))
}

export function saveSurveySession(
  username: string,
  surveyId: number,
  session: Partial<Omit<SurveyWorkspaceSession, 'updatedAt'>>,
) {
  const current = loadSurveySession(username, surveyId)
  writeJson(surveyKey(username, surveyId), {
    ...current,
    ...session,
    updatedAt: Date.now(),
  })
}

export function loadUserAppSession(username: string): UserAppSession | null {
  return readJson<UserAppSession>(appKey(username))
}

export function saveUserAppSession(username: string, patch: Partial<UserAppSession>) {
  const current = loadUserAppSession(username) ?? { updatedAt: Date.now() }
  writeJson(appKey(username), {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  })
}

export function buildSurveyPath(
  surveyId: number,
  session: Pick<SurveyWorkspaceSession, 'mode' | 'view' | 'responses'>,
) {
  const params = new URLSearchParams()
  if (session.mode && session.mode !== 'home') params.set('mode', session.mode)
  else if (session.mode) params.set('mode', session.mode)
  if (session.view) params.set('view', session.view)
  if (session.responses && session.responses !== 'complete') {
    params.set('responses', session.responses)
  }
  const qs = params.toString()
  return `/projects/${surveyId}${qs ? `?${qs}` : ''}`
}

export function surveyEntryUsesDefaults(search: string): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const mode = params.get('mode')
  if (!mode || mode === 'home' || mode === 'overview') {
    return !params.get('view') && !params.get('responses') && !params.get('chart')
  }
  return false
}

export function surveyOverviewHref(surveyId: number): string {
  return `/projects/${surveyId}`
}

export function resolveSurveyHref(_username: string | undefined, surveyId: number) {
  return surveyOverviewHref(surveyId)
}

export function mergeSessionIntoSearch(
  current: URLSearchParams,
  saved: SurveyWorkspaceSession,
): URLSearchParams {
  const next = new URLSearchParams(current)
  if (saved.mode) next.set('mode', saved.mode)
  if (saved.view) next.set('view', saved.view)
  else next.delete('view')
  if (saved.responses) next.set('responses', saved.responses)
  return next
}
