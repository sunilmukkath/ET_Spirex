import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import {
  cachePinnedIds,
  loadCachedPinnedIds,
  loadLegacyPinnedIds,
  togglePinnedId,
} from '../lib/pinnedSurveys'

export function usePinnedSurveys() {
  const { user } = useAuth()
  const [pinnedIds, setPinnedIds] = useState<number[]>(() => loadCachedPinnedIds())
  const [loading, setLoading] = useState(true)
  const migrated = useRef(false)

  useEffect(() => {
    if (!user) {
      setPinnedIds([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    async function load() {
      try {
        const { survey_ids } = await api.getPinnedSurveys()
        if (cancelled) return

        let next = survey_ids
        const legacy = loadLegacyPinnedIds()
        if (!migrated.current && legacy.length > 0) {
          const merged = [...survey_ids]
          for (const id of legacy) {
            if (!merged.includes(id)) merged.push(id)
          }
          if (merged.length !== survey_ids.length) {
            const saved = await api.setPinnedSurveys(merged)
            next = saved.survey_ids
          }
          migrated.current = true
        }

        setPinnedIds(next)
        cachePinnedIds(next)
      } catch {
        if (!cancelled) setPinnedIds(loadCachedPinnedIds())
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [user?.username])

  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds])

  const persist = useCallback(async (next: number[]) => {
    setPinnedIds(next)
    cachePinnedIds(next)
    if (!user) return next
    try {
      const saved = await api.setPinnedSurveys(next)
      setPinnedIds(saved.survey_ids)
      cachePinnedIds(saved.survey_ids)
      return saved.survey_ids
    } catch {
      return next
    }
  }, [user])

  const toggle = useCallback(
    async (surveyId: number) => {
      const next = togglePinnedId(pinnedIds, surveyId)
      return persist(next)
    },
    [pinnedIds, persist],
  )

  const isPinned = useCallback((surveyId: number) => pinnedSet.has(surveyId), [pinnedSet])

  return { pinnedIds, pinnedSet, toggle, isPinned, loading, persist }
}
