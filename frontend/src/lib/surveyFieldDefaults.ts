import type { QcConfig, QuotaConfig, SurveyVariable } from '../api/client'

/** Cross-survey defaults — matched by LimeSurvey question code when opening a new study. */
export interface SurveyFieldDefaults {
  interviewerCode?: string | null
  gpsCode?: string | null
  bannerLayerCodes?: string[][]
  sideRowCodes?: string[]
  quotaFieldCodes?: string[]
  quotaLayerCodes?: string[][]
  quotaBasis?: 'complete' | 'qc_approved'
  updatedAt: number
}

function defaultsKey(username: string) {
  return `et_scout_field_defaults:${username}`
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

export function loadUserFieldDefaults(username: string): SurveyFieldDefaults | null {
  return readJson<SurveyFieldDefaults>(defaultsKey(username))
}

export function saveUserFieldDefaults(username: string, patch: Partial<SurveyFieldDefaults>) {
  const current = loadUserFieldDefaults(username) ?? { updatedAt: Date.now() }
  localStorage.setItem(
    defaultsKey(username),
    JSON.stringify({
      ...current,
      ...patch,
      updatedAt: Date.now(),
    }),
  )
}

export function variableByCode(variables: SurveyVariable[], code: string): SurveyVariable | undefined {
  const needle = code.trim().toLowerCase()
  if (!needle) return undefined
  return variables.find((v) => v.code.toLowerCase() === needle)
}

export function resolveIdsFromCodes(variables: SurveyVariable[], codes: string[]): string[] {
  const seen = new Set<string>()
  const ids: string[] = []
  for (const code of codes) {
    const v = variableByCode(variables, code)
    if (v && !seen.has(v.id)) {
      seen.add(v.id)
      ids.push(v.id)
    }
  }
  return ids
}

export function resolveLayersFromCodes(
  variables: SurveyVariable[],
  layers: string[][],
): string[][] {
  return layers
    .map((layer) => resolveIdsFromCodes(variables, layer))
    .filter((layer) => layer.length > 0)
}

export function codesFromIds(variables: SurveyVariable[], ids: string[]): string[] {
  const map = new Map(variables.map((v) => [v.id, v.code]))
  return ids.map((id) => map.get(id)).filter((c): c is string => Boolean(c))
}

export function captureCrosstabDefaults(
  variables: SurveyVariable[],
  sideRowIds: string[],
  bannerLayers: string[][],
): Partial<SurveyFieldDefaults> {
  return {
    sideRowCodes: codesFromIds(variables, sideRowIds),
    bannerLayerCodes: bannerLayers.map((layer) => codesFromIds(variables, layer)),
  }
}

export function applyQcDefaultsIfEmpty(
  config: QcConfig,
  variables: SurveyVariable[],
  defaults: SurveyFieldDefaults | null,
): { config: QcConfig; changed: boolean } {
  if (!defaults) return { config, changed: false }
  let changed = false
  const next = { ...config }

  if (!next.interviewer_variable_id && defaults.interviewerCode) {
    const v = variableByCode(variables, defaults.interviewerCode)
    if (v) {
      next.interviewer_variable_id = v.id
      changed = true
    }
  }

  if (!next.gps_variable_id && defaults.gpsCode) {
    const v = variableByCode(variables, defaults.gpsCode)
    if (v) {
      next.gps_variable_id = v.id
      changed = true
    }
  }

  return { config: next, changed }
}

export function captureQcDefaults(
  config: QcConfig,
  variables: SurveyVariable[],
): Partial<SurveyFieldDefaults> {
  const patch: Partial<SurveyFieldDefaults> = {}
  if (config.interviewer_variable_id) {
    patch.interviewerCode =
      variables.find((v) => v.id === config.interviewer_variable_id)?.code ?? null
  }
  if (config.gps_variable_id) {
    patch.gpsCode = variables.find((v) => v.id === config.gps_variable_id)?.code ?? null
  }
  return patch
}

export function applyQuotaDefaultsIfEmpty(
  config: QuotaConfig,
  variables: SurveyVariable[],
  defaults: SurveyFieldDefaults | null,
): { config: QuotaConfig; changed: boolean } {
  if (!defaults) return { config, changed: false }

  let changed = false
  const next: QuotaConfig = {
    ...config,
    fields: [...config.fields],
    layers: [...(config.layers ?? [])],
  }

  if (!next.interviewer_variable_id && defaults.interviewerCode) {
    const v = variableByCode(variables, defaults.interviewerCode)
    if (v) {
      next.interviewer_variable_id = v.id
      changed = true
    }
  }

  if (defaults.quotaBasis && next.basis !== defaults.quotaBasis) {
    if (!config.fields.length && !(config.layers?.length ?? 0)) {
      next.basis = defaults.quotaBasis
      changed = true
    }
  }

  if (!next.fields.length && defaults.quotaFieldCodes?.length) {
    const eligible = variables.filter(
      (v) => (v.kind === 'single' || v.kind === 'rank') && (v.answer_options?.length ?? 0) > 0,
    )
    for (const code of defaults.quotaFieldCodes) {
      const v = variableByCode(eligible, code)
      if (!v || next.fields.some((f) => f.variable_id === v.id)) continue
      next.fields.push({
        variable_id: v.id,
        quota_type: 'count',
        cells: (v.answer_options ?? []).map((o) => ({
          code: o.code,
          target: 0,
          min_value: null,
          max_value: null,
        })),
      })
      changed = true
    }
  }

  if (!(next.layers?.length ?? 0) && defaults.quotaLayerCodes?.length) {
    for (const layerCodes of defaults.quotaLayerCodes) {
      const ids = resolveIdsFromCodes(variables, layerCodes)
      if (ids.length < 2) continue
      next.layers.push({
        id: `layer_${Date.now()}_${next.layers.length}`,
        name: 'Imported layer',
        variable_ids: ids,
        quota_type: 'count',
        cells: [],
      })
      changed = true
    }
  }

  return { config: next, changed }
}

export function captureQuotaDefaults(
  config: QuotaConfig,
  variables: SurveyVariable[],
): Partial<SurveyFieldDefaults> {
  const map = new Map(variables.map((v) => [v.id, v.code]))
  return {
    interviewerCode: config.interviewer_variable_id
      ? map.get(config.interviewer_variable_id) ?? null
      : undefined,
    quotaFieldCodes: config.fields
      .map((f) => map.get(f.variable_id))
      .filter((c): c is string => Boolean(c)),
    quotaLayerCodes: (config.layers ?? []).map((layer) =>
      layer.variable_ids.map((id) => map.get(id)).filter((c): c is string => Boolean(c)),
    ),
    quotaBasis: config.basis,
  }
}
