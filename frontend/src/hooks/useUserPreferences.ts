import { useCallback, useEffect, useState } from 'react'
import { api, type UserPreferences } from '../api/client'
import { saveUserAppSession } from '../lib/workspaceSession'

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  dashboard_view_mode: 'strips',
  dashboard_sort_key: 'newest',
  default_completion_status: 'complete',
  default_report_format: 'pptx',
  ai_narrative_default: false,
  crosstab_heatmap_default: true,
  operations_default_tab: 'pipeline',
  home_refresh_on_login: true,
  pinned_only_default: false,
}

export function useUserPreferences(username: string | undefined) {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_USER_PREFERENCES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!username) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    api
      .getUserPreferences()
      .then((server) => {
        if (!cancelled) setPrefs(server)
      })
      .catch(() => {
        if (!cancelled) setPrefs(DEFAULT_USER_PREFERENCES)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [username])

  const savePrefs = useCallback(
    async (patch: Partial<UserPreferences>) => {
      if (!username) return prefs
      setSaving(true)
      try {
        const saved = await api.updateUserPreferences(patch)
        setPrefs(saved)
        saveUserAppSession(username, {
          dashboardViewMode: saved.dashboard_view_mode,
          dashboardSortKey: saved.dashboard_sort_key,
        })
        return saved
      } finally {
        setSaving(false)
      }
    },
    [username, prefs],
  )

  return { prefs, loading, saving, savePrefs, setPrefs }
}
