import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BarChart3, Link2, PenLine, Sparkles } from 'lucide-react'
import { api, type PmPipelineOverview, type Project } from '../api/client'
import { DashboardPage } from './DashboardPage'
import { SurveyStudioPage } from './SurveyStudioPage'
import { QuantitativeSurveyOps } from '../components/quantitative/QuantitativeSurveyOps'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { ET_QUANTITATIVE_SUBTITLE, ET_QUANTITATIVE_TITLE } from '../lib/etCopy'

type Tab = 'studies' | 'programming' | 'links' | 'studio'

const TAB_IDS = new Set<Tab>(['studies', 'programming', 'links', 'studio'])

function parseTab(value: string | null): Tab {
  if (value && TAB_IDS.has(value as Tab)) return value as Tab
  return 'studies'
}

export function QuantitativePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => parseTab(searchParams.get('tab')))
  const [pmEnabled, setPmEnabled] = useState<boolean | null>(null)
  const [opsLoading, setOpsLoading] = useState(false)
  const [opsError, setOpsError] = useState<string | null>(null)
  const [pipeline, setPipeline] = useState<PmPipelineOverview | null>(null)
  const [limeSurveys, setLimeSurveys] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [linkSurveyId, setLinkSurveyId] = useState('')

  useEffect(() => {
    setTab(parseTab(searchParams.get('tab')))
  }, [searchParams])

  const loadOps = useCallback(async () => {
    setOpsLoading(true)
    setOpsError(null)
    try {
      const status = await api.getPmStatus()
      setPmEnabled(status.enabled)
      if (!status.enabled || !status.ready) {
        setPipeline(null)
        return
      }
      const [pipe, surveysRaw] = await Promise.all([
        api.getPmPipeline(),
        api.getProjects().catch(() => [] as Project[]),
      ])
      const surveys = Array.isArray(surveysRaw) ? surveysRaw : surveysRaw.projects
      setPipeline(pipe)
      setLimeSurveys(surveys)
      const first = pipe.projects[0]?.project_id ?? ''
      setSelectedProjectId((cur) => cur || first)
    } catch (e) {
      setOpsError(e instanceof Error ? e.message : 'Failed to load survey operations')
    } finally {
      setOpsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'programming' || tab === 'links') {
      void loadOps()
    }
  }, [tab, loadOps])

  function selectTab(next: Tab) {
    setTab(next)
    const params = new URLSearchParams(searchParams)
    if (next === 'studies') params.delete('tab')
    else params.set('tab', next)
    setSearchParams(params, { replace: true })
  }

  async function handleLinkSurvey(projectId: string) {
    const sid = linkSurveyId ? Number(linkSurveyId) : null
    await api.linkPmSurvey(projectId, sid)
    setLinkSurveyId('')
    await loadOps()
  }

  const needsPm = tab === 'programming' || tab === 'links'

  return (
    <div className="et-page et-page-wide space-y-6 py-8">
      <header>
        <h1 className="font-display text-2xl font-semibold text-slate-900">{ET_QUANTITATIVE_TITLE}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">{ET_QUANTITATIVE_SUBTITLE}</p>
      </header>

      <div className="et-segment flex flex-wrap gap-1">
        {(
          [
            ['studies', 'LimeSurvey studies', BarChart3],
            ['programming', 'Programming', PenLine],
            ['links', 'Survey links', Link2],
            ['studio', 'Survey Studio', Sparkles],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => selectTab(id)}
            className={`et-segment-btn inline-flex items-center gap-1.5 text-xs ${
              tab === id ? 'et-segment-btn-active' : 'et-segment-btn-inactive'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'studies' && <DashboardPage embedded />}

      {tab === 'studio' && <SurveyStudioPage embedded />}

      {needsPm && opsLoading && <LoadingState message="Loading survey operations…" />}

      {needsPm && !opsLoading && pmEnabled === false && (
        <EmptyState
          title="Operations database not configured"
          description="Set DATABASE_URL on the server to link LimeSurvey studies to PM projects and manage programming shortcuts."
        />
      )}

      {needsPm && !opsLoading && opsError && (
        <ErrorState message={opsError} />
      )}

      {needsPm && !opsLoading && pmEnabled !== false && !opsError && (
        <QuantitativeSurveyOps
          tab={tab}
          pipeline={pipeline}
          limeSurveys={limeSurveys}
          selectedProjectId={selectedProjectId}
          linkSurveyId={linkSurveyId}
          onSelectProject={setSelectedProjectId}
          onLinkSurveyIdChange={setLinkSurveyId}
          onLinkSurvey={(projectId) => void handleLinkSurvey(projectId)}
          onReload={() => void loadOps()}
          onSwitchTab={(next) => selectTab(next)}
        />
      )}
    </div>
  )
}
