const LEGACY_KEY = 'et_scout_favorites'
const CACHE_KEY = 'et_scout_pinned_cache'

export function loadLegacyPinnedIds(): number[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as number[]
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isFinite(n)) : []
  } catch {
    return []
  }
}

export function loadCachedPinnedIds(): number[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return loadLegacyPinnedIds()
    const parsed = JSON.parse(raw) as number[]
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isFinite(n)) : []
  } catch {
    return loadLegacyPinnedIds()
  }
}

export function cachePinnedIds(ids: number[]) {
  const next = [...new Set(ids)]
  localStorage.setItem(CACHE_KEY, JSON.stringify(next))
  localStorage.removeItem(LEGACY_KEY)
}

export function togglePinnedId(ids: number[], surveyId: number): number[] {
  return ids.includes(surveyId) ? ids.filter((id) => id !== surveyId) : [...ids, surveyId]
}
