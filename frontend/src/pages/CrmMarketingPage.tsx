import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bot, Loader2, Megaphone, RefreshCw, Users } from 'lucide-react'
import {
  api,
  type PmAgentBrief,
  type PmClient,
  type PmMarketingActivity,
  type PmPipelineOverview,
} from '../api/client'
import { AgentBriefPanel } from '../components/pm/AgentBriefPanel'
import { EmptyState, ErrorState, LoadingState } from '../components/States'
import { ModuleQuickNav } from '../components/ModuleQuickNav'

type Tab = 'clients' | 'marketing' | 'agent'

const TAB_IDS = new Set<Tab>(['clients', 'marketing', 'agent'])

function parseTab(value: string | null): Tab {
  if (value && TAB_IDS.has(value as Tab)) return value as Tab
  return 'clients'
}

const ACTIVITY_TYPES = ['outreach', 'campaign', 'event', 'nurture', 'proposal_followup'] as const
const ACTIVITY_STATUSES = ['planned', 'active', 'completed', 'cancelled'] as const

export function CrmMarketingPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => parseTab(searchParams.get('tab')))
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [clients, setClients] = useState<PmClient[]>([])
  const [pipeline, setPipeline] = useState<PmPipelineOverview | null>(null)
  const [marketing, setMarketing] = useState<PmMarketingActivity[]>([])
  const [newClientName, setNewClientName] = useState('')
  const [crmAgent, setCrmAgent] = useState<PmAgentBrief | null>(null)
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentProjectId, setAgentProjectId] = useState('')
  const [agentClientId, setAgentClientId] = useState('')
  const [marketingSaving, setMarketingSaving] = useState(false)
  const [marketingForm, setMarketingForm] = useState({
    title: '',
    activity_type: 'nurture' as (typeof ACTIVITY_TYPES)[number],
    status: 'planned' as (typeof ACTIVITY_STATUSES)[number],
    client_id: '',
    project_id: '',
    due_date: '',
    notes: '',
  })

  const projects = pipeline?.projects ?? []
  const preselectedProject = searchParams.get('project') ?? ''

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const status = await api.getPmStatus()
      setEnabled(status.enabled)
      if (!status.enabled || !status.ready) {
        setClients([])
        setPipeline(null)
        setMarketing([])
        return
      }
      const [clientRows, pipe, activities] = await Promise.allSettled([
        api.listPmClients(),
        api.getPmPipeline(),
        api.listPmMarketing(),
      ])
      setClients(clientRows.status === 'fulfilled' ? clientRows.value : [])
      setPipeline(pipe.status === 'fulfilled' ? pipe.value : null)
      setMarketing(activities.status === 'fulfilled' ? activities.value : [])
      const firstProject =
        (pipe.status === 'fulfilled' ? pipe.value.projects[0]?.project_id : '') ?? ''
      setAgentProjectId((cur) => cur || preselectedProject || firstProject)

      const failures: string[] = []
      if (clientRows.status === 'rejected') failures.push('clients')
      if (pipe.status === 'rejected') failures.push('pipeline')
      if (activities.status === 'rejected') failures.push('marketing')
      if (failures.length) {
        setError(`Some data could not be loaded (${failures.join(', ')}). Try refresh.`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load CRM & marketing')
    } finally {
      setLoading(false)
    }
  }, [preselectedProject])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setTab(parseTab(searchParams.get('tab')))
  }, [searchParams])

  useEffect(() => {
    if (preselectedProject) {
      setAgentProjectId(preselectedProject)
      setMarketingForm((f) => ({ ...f, project_id: preselectedProject }))
    }
  }, [preselectedProject])

  function selectTab(next: Tab) {
    setTab(next)
    setSearchParams(
      (prev) => {
        prev.set('tab', next)
        return prev
      },
      { replace: true },
    )
  }

  async function handleCreateClient(e: FormEvent) {
    e.preventDefault()
    if (!newClientName.trim()) return
    await api.createPmClient({ client_name: newClientName.trim() })
    setNewClientName('')
    await load()
  }

  async function runCrmAgent() {
    setAgentLoading(true)
    setError(null)
    try {
      setCrmAgent(
        await api.runCrmAgent({
          project_id: agentProjectId || undefined,
          client_id: agentClientId || undefined,
        }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CRM agent failed')
    } finally {
      setAgentLoading(false)
    }
  }

  async function handleCreateMarketing(e: FormEvent) {
    e.preventDefault()
    if (!marketingForm.title.trim()) return
    setMarketingSaving(true)
    setError(null)
    try {
      await api.createPmMarketing({
        title: marketingForm.title.trim(),
        activity_type: marketingForm.activity_type,
        status: marketingForm.status,
        client_id: marketingForm.client_id || undefined,
        project_id: marketingForm.project_id || undefined,
        due_date: marketingForm.due_date || undefined,
        notes: marketingForm.notes.trim() || undefined,
      })
      setMarketingForm({
        title: '',
        activity_type: 'nurture',
        status: 'planned',
        client_id: '',
        project_id: agentProjectId || '',
        due_date: '',
        notes: '',
      })
      const activities = await api.listPmMarketing()
      setMarketing(activities)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create activity')
    } finally {
      setMarketingSaving(false)
    }
  }

  const marketingByStatus = useMemo(() => {
    const groups: Record<string, PmMarketingActivity[]> = {}
    for (const row of marketing) {
      const key = row.status || 'planned'
      if (!groups[key]) groups[key] = []
      groups[key].push(row)
    }
    return groups
  }, [marketing])

  if (loading) return <LoadingState message="Loading CRM & marketing…" />
  if (enabled === false) {
    return (
      <div className="et-page et-page-wide py-10">
        <EmptyState
          title="Operations database not configured"
          description="Set DATABASE_URL on the server to enable client CRM and marketing follow-ups."
        />
      </div>
    )
  }
  if (error && !clients.length && !pipeline) {
    return (
      <div className="et-page py-10">
        <ErrorState message={error} />
      </div>
    )
  }

  return (
    <div className="et-page et-page-wide space-y-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">CRM &amp; marketing</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Client relationships, nurture follow-ups, campaigns, and outreach — separate from the delivery pipeline.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      <ModuleQuickNav current="crm_marketing" />

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}

      <div className="et-segment flex flex-wrap gap-1">
        {(
          [
            ['clients', 'Clients', Users],
            ['marketing', 'Marketing', Megaphone],
            ['agent', 'CRM agent', Bot],
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

      {tab === 'clients' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <form onSubmit={(e) => void handleCreateClient(e)} className="flex gap-2">
              <input
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Client organisation name"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <button type="submit" className="rounded-lg bg-[var(--et-teal)] px-4 py-2 text-sm text-white">
                Add client
              </button>
            </form>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {clients.map((c) => (
                <li key={c.client_id} className="px-4 py-3">
                  <p className="font-medium text-slate-900">{c.client_name}</p>
                  <p className="text-xs text-slate-500">
                    {c.contact_person ?? 'No contact'}
                    {c.contact_email ? ` · ${c.contact_email}` : ''}
                    {' · '}
                    {c.project_count ?? 0} projects
                    {c.repeat_client ? ' · Repeat' : ''}
                  </p>
                </li>
              ))}
              {clients.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-slate-500">No clients yet.</li>
              )}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-900">Client CRM</p>
            <p className="mt-2 text-xs text-slate-500">
              Import contacts from the master sheet via Operations, or add clients here. Use the CRM agent tab for
              follow-up suggestions tied to pipeline projects.
            </p>
            <Link to="/operations" className="mt-3 inline-block text-xs font-medium text-[var(--et-teal-dark)] hover:underline">
              Open operations pipeline →
            </Link>
          </div>
        </div>
      )}

      {tab === 'marketing' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={(e) => void handleCreateMarketing(e)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">Log marketing activity</p>
            <input
              value={marketingForm.title}
              onChange={(e) => setMarketingForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Activity title"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              required
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-slate-600">
                Type
                <select
                  value={marketingForm.activity_type}
                  onChange={(e) =>
                    setMarketingForm((f) => ({
                      ...f,
                      activity_type: e.target.value as (typeof ACTIVITY_TYPES)[number],
                    }))
                  }
                  className="et-select mt-1 w-full"
                >
                  {ACTIVITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-slate-600">
                Status
                <select
                  value={marketingForm.status}
                  onChange={(e) =>
                    setMarketingForm((f) => ({
                      ...f,
                      status: e.target.value as (typeof ACTIVITY_STATUSES)[number],
                    }))
                  }
                  className="et-select mt-1 w-full"
                >
                  {ACTIVITY_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs text-slate-600">
              Client
              <select
                value={marketingForm.client_id}
                onChange={(e) => setMarketingForm((f) => ({ ...f, client_id: e.target.value }))}
                className="et-select mt-1 w-full"
              >
                <option value="">— Optional —</option>
                {clients.map((c) => (
                  <option key={c.client_id} value={c.client_id}>
                    {c.client_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-600">
              Project
              <select
                value={marketingForm.project_id}
                onChange={(e) => setMarketingForm((f) => ({ ...f, project_id: e.target.value }))}
                className="et-select mt-1 w-full"
              >
                <option value="">— Optional —</option>
                {projects.map((p) => (
                  <option key={p.project_id} value={p.project_id}>
                    {p.project_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-600">
              Due date
              <input
                type="date"
                value={marketingForm.due_date}
                onChange={(e) => setMarketingForm((f) => ({ ...f, due_date: e.target.value }))}
                className="et-input mt-1 w-full"
              />
            </label>
            <textarea
              value={marketingForm.notes}
              onChange={(e) => setMarketingForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Notes"
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={marketingSaving || !marketingForm.title.trim()}
              className="rounded-lg bg-[var(--et-teal)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {marketingSaving ? <Loader2 size={14} className="animate-spin inline" /> : null}
              Add activity
            </button>
          </form>

          <div className="space-y-4">
            {Object.keys(marketingByStatus).length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                No marketing activities logged yet.
              </p>
            ) : (
              Object.entries(marketingByStatus).map(([status, rows]) => (
                <div key={status} className="rounded-xl border border-slate-200 bg-white">
                  <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {status}
                  </p>
                  <ul className="divide-y divide-slate-50">
                    {rows.map((row) => (
                      <li key={row.activity_id} className="px-4 py-3 text-sm">
                        <p className="font-medium text-slate-900">{row.title}</p>
                        <p className="text-xs text-slate-500">
                          {row.activity_type.replace('_', ' ')}
                          {row.due_date ? ` · due ${row.due_date}` : ''}
                          {row.owner_name ? ` · ${row.owner_name}` : ''}
                        </p>
                        {row.notes && <p className="mt-1 text-xs text-slate-600">{row.notes}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'agent' && (
        <div className="max-w-2xl space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-slate-700">
              Project (optional)
              <select
                value={agentProjectId}
                onChange={(e) => setAgentProjectId(e.target.value)}
                className="et-select mt-1 w-full"
              >
                <option value="">All / general</option>
                {projects.map((p) => (
                  <option key={p.project_id} value={p.project_id}>
                    {p.project_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-slate-700">
              Client (optional)
              <select
                value={agentClientId}
                onChange={(e) => setAgentClientId(e.target.value)}
                className="et-select mt-1 w-full"
              >
                <option value="">—</option>
                {clients.map((c) => (
                  <option key={c.client_id} value={c.client_id}>
                    {c.client_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={() => void runCrmAgent()}
            disabled={agentLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--et-teal)]/40 bg-[var(--et-teal-light)]/50 px-4 py-2 text-sm font-medium text-[var(--et-teal-dark)] disabled:opacity-50"
          >
            <Bot size={16} />
            Run CRM agent
          </button>
          <AgentBriefPanel brief={crmAgent} loading={agentLoading} />
        </div>
      )}
    </div>
  )
}
