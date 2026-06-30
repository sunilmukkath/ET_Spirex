export interface UserChartPalette {
  id: string
  label: string
  colors: string[]
  createdAt: number
}

function storageKey(username: string) {
  return `et_scout_chart_palettes:${username}`
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

export function loadUserChartPalettes(username: string): UserChartPalette[] {
  return readJson<UserChartPalette[]>(storageKey(username)) ?? []
}

export function saveUserChartPalettes(username: string, palettes: UserChartPalette[]) {
  localStorage.setItem(storageKey(username), JSON.stringify(palettes))
}

export function addUserChartPalette(
  username: string,
  input: { label: string; colors: string[] },
): UserChartPalette {
  const palettes = loadUserChartPalettes(username)
  const palette: UserChartPalette = {
    id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    label: input.label.trim() || 'Custom palette',
    colors: input.colors.slice(0, 12),
    createdAt: Date.now(),
  }
  saveUserChartPalettes(username, [...palettes, palette])
  return palette
}

export function deleteUserChartPalette(username: string, id: string) {
  const palettes = loadUserChartPalettes(username).filter((p) => p.id !== id)
  saveUserChartPalettes(username, palettes)
}

export function updateUserChartPalette(
  username: string,
  id: string,
  patch: Partial<Pick<UserChartPalette, 'label' | 'colors'>>,
) {
  const palettes = loadUserChartPalettes(username).map((p) =>
    p.id === id ? { ...p, ...patch, colors: patch.colors?.slice(0, 12) ?? p.colors } : p,
  )
  saveUserChartPalettes(username, palettes)
}
