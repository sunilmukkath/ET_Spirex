const KEY = 'et_scout_favorites'

export function loadFavoriteSurveyIds(): number[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as number[]
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isFinite(n)) : []
  } catch {
    return []
  }
}

export function saveFavoriteSurveyIds(ids: number[]) {
  localStorage.setItem(KEY, JSON.stringify([...new Set(ids)]))
}

export function toggleFavoriteSurveyId(id: number): number[] {
  const current = loadFavoriteSurveyIds()
  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
  saveFavoriteSurveyIds(next)
  return next
}

export function isFavoriteSurvey(id: number): boolean {
  return loadFavoriteSurveyIds().includes(id)
}
