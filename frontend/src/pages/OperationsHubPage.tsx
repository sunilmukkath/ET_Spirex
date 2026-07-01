import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Bot,
  Briefcase,
  ChevronRight,
  DollarSign,
  FileText,
  Link2,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import {
  api,
  type PmAgentBrief,
  type PmAgentDraft,
  type PmClient,
  type PmFinanceSummary,
  type PmPipelineOverview,
  type PmPipelineProject,
  type PmSurveyLinkSuggestion,
  type ProjectRequirements,
} from '../api/client'
import { SurveyHomePanel } from '../components/analysis/SurveyHomePanel'
import { ProjectRequirementsEditor, emptyProjectRequirements } from '../components/ProjectRequirementsEditor'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { buildSurveyWorkspaceHref } from '../lib/workspaceNav'
import { EmptyState, ErrorState, LoadingState } from '../components/States'

type Tab = 'pipeline' | 'clients' | 'finance'

const TAB_IDS = new Set<Tab>(['pipeline', 'clients', 'finance'])

function parseTab(value: string | null): Tab {
  if (value && TAB_IDS.has(value as Tab)) return value as Tab
  return 'pipeline'
}

function formatInr(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })
}

const STAGES = [
  'Proposal',
  'Budgeting',
  'Vendor Setup',
  'Deployment Prep',
  'Fieldwork/Data Collection',
  'QC',
  'Analysis',
  'Reporting',
  'Close-out',
  'Delivered',
]

type ProjectEditForm = {
  project_name: string
  client_id: string
  project_type: 'quant' | 'qual' | 'mixed'
  engagement_type: 'tracking' | 'ad-hoc'
  stage: string
  owner_name: string
  project_code: string
  fiscal_year: string
  billing_month: string
  project_value_inr: string
  budget_estimate: string
  start_date: string
  target_close_date: string
  status_notes: string
}

function emptyProjectEditForm(): ProjectEditForm {
  return {
    project_name: '',
    client_id: '',
    project_type: 'quant',
    engagement_type: 'ad-hoc',
    stage: 'Proposal',
    owner_name: '',
    project_code: '',
    fiscal_year: '',
    billing_month: '',
    project_value_inr: '',
    budget_estimate: '',
    start_date: '',
    target_close_date: '',
    status_notes: '',
  }
}

function projectToEditForm(p: PmPipelineProject): ProjectEditForm {
  return {
    project_name: p.project_name ?? '',
    client_id: p.client_id ?? '',
    project_type: p.project_type,
    engagement_type: p.engagement_type,
    stage: p.stage,
    owner_name: p.owner_name ?? '',
    project_code: p.project_code ?? '',
    fiscal_year: p.fiscal_year ?? '',
    billing_month: p.billing_month ?? '',
    project_value_inr: p.project_value_inr != null ? String(p.project_value_inr) : '',
    budget_estimate: p.budget_estimate != null ? String(p.budget_estimate) : '',
    start_date: p.start_date ?? '',
    target_close_date: p.target_close_date ?? '',
    status_notes: p.status_notes ?? '',
  }
}

function AgentPanel({ brief, loading }: { brief: PmAgentBrief | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <Loader2 size={16} className="animate-spin text-[var(--et-teal)]" />
        Agent thinking…
      </div>
    )
  }
  if (!brief) return null
  return (
    <div className="rounded-xl border border-[var(--et-teal)]/25 bg-[var(--et-teal-light)]/30 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--et-teal-dark)]">
        <Bot size={14} />
        {brief.agent} agent {brief.configured ? '(AI)' : '(rules)'}
      </div>
      <p className="mt-2 text-sm text-slate-800">{brief.summary}</p>
      {brief.actions.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          {brief.actions.map((a) => (
            <li key={a}>• {a}</li>
          ))}
        </ul>
      )}
      {brief.risks.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-amber-800">
          {brief.risks.map((r) => (
            <li key={r}>⚠ {r}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DraftAgentPanel({ draft, loading }: { draft: PmAgentDraft | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <Loader2 size={16} className="animate-spin text-[var(--et-teal)]" />
        Drafting…
      </div>
    )
  }
  if (!draft) return null
  return (
    <div className="rounded-xl border border-[var(--et-teal)]/25 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--et-teal-dark)]">
          <Bot size={14} />
          {draft.agent} writing agent {draft.configured ? '(AI)' : '(template)'}
        </div>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(draft.draft_markdown)}
          className="text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
        >
          Copy markdown
        </button>
      </div>
      <h3 className="mt-3 font-display text-lg font-semibold text-slate-900">{draft.title}</h3>
      <div className="mt-4 space-y-4">
        {draft.sections.map((s) => (
          <section key={s.heading}>
            <h4 className="text-sm font-semibold text-slate-800">{s.heading}</h4>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{s.body}</p>
          </section>
        ))}
      </div>
      {draft.actions.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm text-slate-700">
          {draft.actions.map((a) => (
            <li key={a}>• {a}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function OperationsHubPage() {
  const { user } = useAuth()
  const { prefs } = useUserPreferences(user?.username)
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => parseTab(searchParams.get('tab')))
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [pipeline, setPipeline] = useState<PmPipelineOverview | null>(null)
  const [clients, setClients] = useState<PmClient[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [finance, setFinance] = useState<PmFinanceSummary | null>(null)
  const [financeAgent, setFinanceAgent] = useState<PmAgentBrief | null>(null)
  const [crmAgent, setCrmAgent] = useState<PmAgentBrief | null>(null)
  const [proposalDraft, setProposalDraft] = useState<PmAgentDraft | null>(null)
  const [proposalProjectId, setProposalProjectId] = useState('')
  const [proposalBrief, setProposalBrief] = useState('')
  const [agentLoading, setAgentLoading] = useState(false)
  const [proposalLoading, setProposalLoading] = useState(false)
  const [requirementsProjectId, setRequirementsProjectId] = useState<string | null>(null)
  const [requirementsProjectName, setRequirementsProjectName] = useState('')
  const [requirementsDraft, setRequirementsDraft] = useState<ProjectRequirements>(emptyProjectRequirements())
  const [requirementsSaving, setRequirementsSaving] = useState(false)

  const [newClientName, setNewClientName] = useState('')
  const [newProjectName, setNewProjectName] = useState('')

  const [editProjectId, setEditProjectId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<ProjectEditForm>(emptyProjectEditForm())
  const [editSaving, setEditSaving] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)

  const [linkQuery, setLinkQuery] = useState('')
  const [linkAgentLoading, setLinkAgentLoading] = useState(false)
  const [linkAgentSummary, setLinkAgentSummary] = useState<string | null>(null)
  const [linkAgentError, setLinkAgentError] = useState<string | null>(null)
  const [linkSuggestions, setLinkSuggestions] = useState<PmSurveyLinkSuggestion[]>([])
  const [linkSelected, setLinkSelected] = useState<Set<string>>(new Set())
  const [linkApplying, setLinkApplying] = useState(false)

  const [fieldworkProjectId, setFieldworkProjectId] = useState<string | null>(null)
  const [fieldworkProjectName, setFieldworkProjectName] = useState('')
  const [fieldworkCompletes, setFieldworkCompletes] = useState('0')
  const [fieldworkTarget, setFieldworkTarget] = useState('')
  const [fieldworkSaving, setFieldworkSaving] = useState(false)
  const [manualLinkProjectId, setManualLinkProjectId] = useState<string | null>(null)
  const [manualLinkProjectName, setManualLinkProjectName] = useState('')
  const [manualSurveyId, setManualSurveyId] = useState('')
  const [manualLinkSaving, setManualLinkSaving] = useState(false)

  const overviewProjectId = searchParams.get('project') ?? ''

  const selectOverviewProject = useCallback(
    (projectId: string) => {
      setSearchParams(
        (prev) => {
          prev.set('tab', 'pipeline')
          if (projectId) prev.set('project', projectId)
          else prev.delete('project')
          return prev
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const status = await api.getPmStatus()
      setEnabled(status.enabled)
      if (!status.enabled || !status.ready) {
        setPipeline(null)
        return
      }
      const [pipe, clientRows] = await Promise.all([
        api.getPmPipeline(),
        api.listPmClients(),
      ])
      setPipeline(pipe)
      setClients(clientRows)
      const first = pipe.projects[0]?.project_id ?? ''
      setSelectedProjectId((cur) => cur || first)
      setProposalProjectId((cur) => cur || first)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load operations hub')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const next = parseTab(searchParams.get('tab'))
    setTab(next)
  }, [searchParams])

  const projects = pipeline?.projects ?? []
  const overviewProject = useMemo(
    () => projects.find((p) => p.project_id === overviewProjectId) ?? null,
    [projects, overviewProjectId],
  )

  const surveyHrefBuilder = useMemo(() => {
    const surveyId = overviewProject?.limesurvey_survey_id
    if (!surveyId) return undefined
    return (mode: string, view?: string) => buildSurveyWorkspaceHref(surveyId, mode, view)
  }, [overviewProject?.limesurvey_survey_id])

  useEffect(() => {
    if (!searchParams.get('tab') && prefs.operations_default_tab) {
      setTab(parseTab(prefs.operations_default_tab))
    }
  }, [prefs.operations_default_tab, searchParams])

  useEffect(() => {
    if (!selectedProjectId || tab !== 'finance') return
    void (async () => {
      try {
        const f = await api.getPmFinance(selectedProjectId)
        setFinance(f)
      } catch {
        setFinance(null)
      }
    })()
  }, [selectedProjectId, tab])

  async function handleCreateClient(e: FormEvent) {
    e.preventDefault()
    if (!newClientName.trim()) return
    await api.createPmClient({ client_name: newClientName.trim() })
    setNewClientName('')
    await load()
  }

  async function handleCreateProject(e: FormEvent) {
    e.preventDefault()
    if (!newProjectName.trim()) return
    setCreatingProject(true)
    setError(null)
    try {
      const created = await api.createPmProject({
        project_name: newProjectName.trim(),
        project_type: 'quant',
        engagement_type: 'ad-hoc',
        stage: 'Proposal',
      })
      setNewProjectName('')
      await load()
      openEditProject({
        ...created,
        client_name: null,
        proposal_status: null,
        has_survey_link: false,
        data_collection_status: '',
        data_collection_pct: null,
        open_task_count: 0,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setCreatingProject(false)
    }
  }

  async function handleStageChange(projectId: string, stage: string) {
    await api.updatePmProject(projectId, { stage })
    await load()
  }

  function openEditProject(p: PmPipelineProject) {
    setEditProjectId(p.project_id)
    setEditForm(projectToEditForm(p))
  }

  async function saveEditProject(e: FormEvent) {
    e.preventDefault()
    if (!editProjectId || !editForm.project_name.trim()) return
    setEditSaving(true)
    setError(null)
    try {
      await api.updatePmProject(editProjectId, {
        project_name: editForm.project_name.trim(),
        client_id: editForm.client_id || null,
        project_type: editForm.project_type,
        engagement_type: editForm.engagement_type,
        stage: editForm.stage,
        owner_name: editForm.owner_name.trim() || null,
        project_code: editForm.project_code.trim() || null,
        fiscal_year: editForm.fiscal_year.trim() || null,
        billing_month: editForm.billing_month.trim() || null,
        project_value_inr:
          editForm.project_value_inr.trim() === '' ? null : Number(editForm.project_value_inr),
        budget_estimate:
          editForm.budget_estimate.trim() === '' ? null : Number(editForm.budget_estimate),
        start_date: editForm.start_date || null,
        target_close_date: editForm.target_close_date || null,
        status_notes: editForm.status_notes.trim() || null,
      })
      setEditProjectId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project')
    } finally {
      setEditSaving(false)
    }
  }

  async function runFinanceAgent() {
    if (!selectedProjectId) return
    setAgentLoading(true)
    try {
      setFinanceAgent(await api.runFinanceAgent(selectedProjectId))
    } finally {
      setAgentLoading(false)
    }
  }

  async function runCrmAgentForProject(projectId: string) {
    setAgentLoading(true)
    try {
      setCrmAgent(await api.runCrmAgent({ project_id: projectId }))
      setTab('clients')
    } finally {
      setAgentLoading(false)
    }
  }

  async function runProposalAgent() {
    if (!proposalProjectId) return
    setProposalLoading(true)
    try {
      setProposalDraft(
        await api.runProposalWritingAgent({
          project_id: proposalProjectId,
          context: proposalBrief.trim() || undefined,
        }),
      )
    } finally {
      setProposalLoading(false)
    }
  }

  async function runProposalAgentForProject(projectId: string) {
    setProposalProjectId(projectId)
    setProposalLoading(true)
    try {
      setProposalDraft(
        await api.runProposalWritingAgent({
          project_id: projectId,
          context: proposalBrief.trim() || undefined,
        }),
      )
    } finally {
      setProposalLoading(false)
    }
  }

  async function openRequirements(projectId: string, projectName: string) {
    setRequirementsProjectId(projectId)
    setRequirementsProjectName(projectName)
    try {
      const project = await api.getPmProject(projectId)
      setRequirementsDraft(project.requirements ?? emptyProjectRequirements())
    } catch {
      setRequirementsDraft(emptyProjectRequirements())
    }
  }

  async function saveRequirements() {
    if (!requirementsProjectId) return
    setRequirementsSaving(true)
    try {
      await api.updatePmProjectRequirements(requirementsProjectId, requirementsDraft)
      setRequirementsProjectId(null)
      await load()
    } finally {
      setRequirementsSaving(false)
    }
  }

  function linkConfidenceClass(conf: PmSurveyLinkSuggestion['confidence']) {
    if (conf === 'high') return 'bg-emerald-100 text-emerald-800'
    if (conf === 'medium') return 'bg-amber-100 text-amber-900'
    return 'bg-slate-100 text-slate-600'
  }

  async function runSurveyLinkAgent(applyHighOnly = false) {
    setLinkAgentLoading(true)
    setLinkAgentError(null)
    try {
      const result = await api.runSurveyLinkAgent({
        apply: applyHighOnly,
        context: linkQuery.trim() || undefined,
      })
      setLinkAgentSummary(result.summary)
      setLinkSuggestions(result.suggestions)
      setLinkSelected(
        new Set(result.suggestions.filter((s) => s.confidence === 'high').map((s) => s.project_id)),
      )
      if (applyHighOnly && result.applied_count > 0) {
        await load()
      }
    } catch (e) {
      setLinkAgentError(e instanceof Error ? e.message : 'Survey link agent failed')
    } finally {
      setLinkAgentLoading(false)
    }
  }

  async function applySelectedLinks() {
    const links = linkSuggestions
      .filter((s) => linkSelected.has(s.project_id))
      .map((s) => ({ project_id: s.project_id, limesurvey_survey_id: s.limesurvey_survey_id }))
    if (links.length === 0) return
    setLinkApplying(true)
    setLinkAgentError(null)
    try {
      const result = await api.applySurveyLinks(links)
      if (result.errors.length) setLinkAgentError(result.errors.join(' · '))
      setLinkAgentSummary(`Applied ${result.applied_count} link(s).`)
      setLinkSuggestions((prev) => prev.filter((s) => !linkSelected.has(s.project_id)))
      setLinkSelected(new Set())
      await load()
    } catch (e) {
      setLinkAgentError(e instanceof Error ? e.message : 'Apply failed')
    } finally {
      setLinkApplying(false)
    }
  }

  function openFieldworkLog(projectId: string, projectName: string) {
    setFieldworkProjectId(projectId)
    setFieldworkProjectName(projectName)
    setFieldworkCompletes('0')
    setFieldworkTarget('')
  }

  function openManualSurveyLink(projectId: string, projectName: string) {
    setManualLinkProjectId(projectId)
    setManualLinkProjectName(projectName)
    setManualSurveyId('')
  }

  async function addManualSurveyLink(e: FormEvent) {
    e.preventDefault()
    if (!manualLinkProjectId || !manualSurveyId.trim()) return
    const surveyId = Number(manualSurveyId)
    if (!Number.isFinite(surveyId) || surveyId <= 0) {
      setError('Enter a valid LimeSurvey study ID')
      return
    }
    setManualLinkSaving(true)
    setError(null)
    try {
      await api.linkPmSurvey(manualLinkProjectId, surveyId, 'add')
      setManualLinkProjectId(null)
      setManualSurveyId('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link survey')
    } finally {
      setManualLinkSaving(false)
    }
  }

  async function removeSurveyLink(projectId: string, surveyId: number) {
    setError(null)
    try {
      await api.linkPmSurvey(projectId, surveyId, 'remove')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove survey link')
    }
  }

  async function saveFieldworkLog(e: FormEvent) {
    e.preventDefault()
    if (!fieldworkProjectId) return
    setFieldworkSaving(true)
    setError(null)
    try {
      await api.createPmFieldworkEntry(fieldworkProjectId, {
        entry_date: new Date().toISOString().slice(0, 10),
        completes_today: Number(fieldworkCompletes) || 0,
        target_completes: fieldworkTarget ? Number(fieldworkTarget) : undefined,
      })
      setFieldworkProjectId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log fieldwork')
    } finally {
      setFieldworkSaving(false)
    }
  }

  function dataCollectionTone(stage: string, pct: number | null | undefined) {
    if (stage === 'Delivered') return 'text-slate-500'
    if (pct != null && pct >= 100) return 'text-emerald-700'
    if (pct != null && pct >= 70) return 'text-sky-700'
    if (stage === 'Fieldwork/Data Collection' || stage === 'QC') return 'text-amber-800'
    return 'text-slate-600'
  }

  if (loading) return <LoadingState message="Loading operations hub…" />
  if (enabled === false) {
    return (
      <div className="et-page et-page-wide py-10">
        <EmptyState
          title="Operations database not configured"
          description="Set DATABASE_URL on the server to enable proposal-to-closure tracking, finance, CRM, and survey linking."
        />
      </div>
    )
  }
  if (error) return <div className="et-page py-10"><ErrorState message={error} /></div>

  return (
    <div className="et-page et-page-wide space-y-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">Operations hub</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            End-to-end from proposal to closure — clients, finance, and marketing in one place.
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

      <div className="et-segment flex flex-wrap gap-1">
        {(
          [
            ['pipeline', 'Pipeline', Briefcase],
            ['clients', 'CRM & marketing', Users],
            ['finance', 'Finance', DollarSign],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`et-segment-btn inline-flex items-center gap-1.5 text-xs ${
              tab === id ? 'et-segment-btn-active' : 'et-segment-btn-inactive'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'pipeline' && (
        <div className="space-y-6">
          <div className="grid gap-2 sm:grid-cols-5 lg:grid-cols-10">
            {(pipeline?.stages ?? STAGES.map((s) => ({ stage: s, count: 0 }))).map((s) => (
              <div
                key={s.stage}
                className="rounded-lg border border-slate-200 bg-white px-2 py-3 text-center shadow-sm"
              >
                <p className="text-lg font-semibold text-[var(--et-teal-dark)]">{s.count}</p>
                <p className="mt-1 text-[10px] leading-tight text-slate-500">{s.stage}</p>
              </div>
            ))}
          </div>

          <form onSubmit={(e) => void handleCreateProject(e)} className="flex flex-wrap gap-2">
            <input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="New project name (proposal stage)"
              className="min-w-[200px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={creatingProject || !newProjectName.trim()}
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--et-teal)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {creatingProject ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Add &amp; edit details
            </button>
          </form>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">FY / Month</th>
                  <th className="px-4 py-3">Value INR</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Pending</th>
                  <th className="px-4 py-3">Data collection</th>
                  <th className="px-4 py-3">Survey</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const isSelected = p.project_id === overviewProjectId
                  return (
                  <tr
                    key={p.project_id}
                    className={`border-b border-slate-50 ${isSelected ? 'bg-[var(--et-teal-light)]/25' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => selectOverviewProject(isSelected ? '' : p.project_id)}
                        className="group flex w-full items-start gap-2 text-left"
                      >
                        <ChevronRight
                          size={16}
                          className={`mt-0.5 shrink-0 text-slate-400 transition ${isSelected ? 'rotate-90 text-[var(--et-teal-dark)]' : 'group-hover:text-slate-600'}`}
                        />
                        <span>
                          <p className="font-medium text-slate-900 group-hover:text-[var(--et-teal-dark)]">
                            {p.project_name}
                          </p>
                          {p.project_code && <p className="text-xs text-slate-500">{p.project_code}</p>}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.client_name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <p>{p.fiscal_year ?? '—'}</p>
                      {p.billing_month && <p>{p.billing_month}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {formatInr(p.project_value_inr ?? p.budget_estimate)}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={p.stage}
                        onChange={(e) => void handleStageChange(p.project_id, e.target.value)}
                        className="et-select text-xs"
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {p.open_task_count > 0 ? (
                        <button
                          type="button"
                          onClick={() => selectOverviewProject(p.project_id)}
                          title={`${p.open_task_count} pending task${p.open_task_count === 1 ? '' : 's'}`}
                          className="inline-flex min-w-[1.75rem] items-center justify-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 hover:bg-amber-200"
                        >
                          {p.open_task_count}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="min-w-[8rem]">
                        <p className={`text-xs font-medium ${dataCollectionTone(p.stage, p.data_collection_pct)}`}>
                          {p.data_collection_status || '—'}
                        </p>
                        {p.data_collection_pct != null && (
                          <div className="mt-1.5 h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-[var(--et-navy)]"
                              style={{ width: `${Math.min(100, p.data_collection_pct)}%` }}
                            />
                          </div>
                        )}
                        {['Deployment Prep', 'Fieldwork/Data Collection', 'QC'].includes(p.stage) && (
                          <button
                            type="button"
                            onClick={() => openFieldworkLog(p.project_id, p.project_name)}
                            className="mt-1 text-[10px] font-medium text-[var(--et-teal-dark)] hover:underline"
                          >
                            Log completes
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {p.linked_survey_ids?.length ? (
                        <div className="flex max-w-[12rem] flex-wrap gap-1.5">
                          {p.linked_survey_ids.map((sid, idx) => (
                            <span
                              key={sid}
                              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
                            >
                              <Link to={`/projects/${sid}`} className="font-medium text-[var(--et-teal-dark)] hover:underline">
                                {idx + 1}: #{sid}
                              </Link>
                              <button
                                type="button"
                                onClick={() => void removeSurveyLink(p.project_id, sid)}
                                className="text-slate-400 hover:text-red-600"
                                title="Remove survey link"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-amber-700">Unlinked</span>
                      )}
                      <button
                        type="button"
                        onClick={() => openManualSurveyLink(p.project_id, p.project_name)}
                        className="mt-1 block text-[10px] font-medium text-[var(--et-teal-dark)] hover:underline"
                      >
                        Add link
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEditProject(p)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
                        >
                          <Pencil size={12} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => selectOverviewProject(p.project_id)}
                          className="text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
                        >
                          Study overview
                        </button>
                        <button
                          type="button"
                          onClick={() => void openRequirements(p.project_id, p.project_name)}
                          className="text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
                        >
                          Requirements
                        </button>
                        <button
                          type="button"
                          onClick={() => void runProposalAgentForProject(p.project_id)}
                          className="text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
                        >
                          Proposal agent
                        </button>
                        <button
                          type="button"
                          onClick={() => void runCrmAgentForProject(p.project_id)}
                          className="text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
                        >
                          CRM agent
                        </button>
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
            {projects.length === 0 && (
              <p className="p-8 text-center text-sm text-slate-500">No PM projects yet — create one above.</p>
            )}
          </div>

          {overviewProject && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Study overview</p>
                  <p className="text-sm font-semibold text-slate-900">{overviewProject.project_name}</p>
                  <p className="text-xs text-slate-500">
                    {overviewProject.client_name ?? 'No client'}
                    {' · '}
                    {overviewProject.stage}
                    {overviewProject.linked_survey_ids?.length
                      ? ` · ${overviewProject.linked_survey_ids.length} survey link${overviewProject.linked_survey_ids.length === 1 ? '' : 's'}`
                      : ' · No survey linked'}
                  </p>
                  {overviewProject.linked_survey_ids?.length > 1 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {overviewProject.linked_survey_ids.map((sid, idx) => (
                        <Link
                          key={sid}
                          to={`/projects/${sid}`}
                          className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-[var(--et-teal-dark)] ring-1 ring-slate-200 hover:bg-slate-50"
                        >
                          Visit {idx + 1}: #{sid}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {overviewProject.limesurvey_survey_id && (
                    <Link
                      to={`/projects/${overviewProject.limesurvey_survey_id}`}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Open workspace
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => selectOverviewProject('')}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <X size={14} />
                    Close
                  </button>
                </div>
              </div>
              {overviewProject.limesurvey_survey_id ? (
                <SurveyHomePanel
                  surveyId={overviewProject.limesurvey_survey_id}
                  onNavigate={() => {}}
                  buildHref={surveyHrefBuilder}
                  projectLabel={
                    overviewProject.linked_survey_ids?.length > 1
                      ? `${overviewProject.project_name} · Visit 1`
                      : overviewProject.project_name
                  }
                />
              ) : (
                <div className="space-y-3 p-6 text-sm text-slate-600">
                  <p>Link a LimeSurvey study to see sample health, quotas, and analysis shortcuts.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setLinkQuery(overviewProject.project_name)
                      document.getElementById('survey-link-agent')?.scrollIntoView({ behavior: 'smooth' })
                    }}
                    className="font-medium text-[var(--et-teal-dark)] hover:underline"
                  >
                    Use survey link agent below
                  </button>
                </div>
              )}
            </div>
          )}

          <div id="survey-link-agent" className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Link2 size={16} className="text-[var(--et-navy)]" />
                  <h3 className="text-sm font-semibold text-slate-800">Survey link agent</h3>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Enter a project name, client, or LimeSurvey study ID — Scout recommends matching links.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void runSurveyLinkAgent(false)}
                  disabled={linkAgentLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--et-teal)]/40 bg-white px-3 py-1.5 text-xs font-medium text-[var(--et-teal-dark)] disabled:opacity-50"
                >
                  {linkAgentLoading ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
                  Recommend links
                </button>
                <button
                  type="button"
                  onClick={() => void runSurveyLinkAgent(true)}
                  disabled={linkAgentLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--et-teal)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  Apply high-confidence
                </button>
              </div>
            </div>
            <input
              value={linkQuery}
              onChange={(e) => setLinkQuery(e.target.value)}
              placeholder="e.g. Brand tracker wave 3 · Nestle · 123456"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            {linkAgentSummary && <p className="text-xs text-slate-700">{linkAgentSummary}</p>}
            {linkAgentError && <p className="text-xs text-rose-700">{linkAgentError}</p>}
            {(pipeline?.unlinked_survey_ids.length ?? 0) > 0 && (
              <p className="text-xs text-amber-800">
                {pipeline!.unlinked_survey_ids.length} unlinked LimeSurvey stud
                {pipeline!.unlinked_survey_ids.length === 1 ? 'y' : 'ies'} available to match.
              </p>
            )}
            {linkSuggestions.length > 0 && (
              <div className="space-y-2">
                <ul className="max-h-56 space-y-2 overflow-y-auto et-scroll">
                  {linkSuggestions.map((s) => (
                    <li
                      key={s.project_id}
                      className="flex flex-wrap items-start gap-3 rounded-lg border border-white bg-white px-3 py-2 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={linkSelected.has(s.project_id)}
                        onChange={() => {
                          setLinkSelected((prev) => {
                            const next = new Set(prev)
                            if (next.has(s.project_id)) next.delete(s.project_id)
                            else next.add(s.project_id)
                            return next
                          })
                        }}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900">{s.project_name}</p>
                        <p className="text-slate-600">
                          → #{s.limesurvey_survey_id} {s.survey_title}
                        </p>
                        <p className="text-slate-500">{s.reason}</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${linkConfidenceClass(s.confidence)}`}>
                        {s.confidence}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => void applySelectedLinks()}
                  disabled={linkApplying || linkSelected.size === 0}
                  className="rounded-lg bg-[var(--et-navy)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {linkApplying ? <Loader2 size={14} className="animate-spin inline" /> : null}
                  Apply {linkSelected.size} selected
                </button>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Proposal writing agent</h3>
              <p className="mt-1 text-xs text-slate-500">
                Draft a client-facing proposal from PM project details, budget, and optional brief notes.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="text-sm text-slate-700">
                Project
                <select
                  value={proposalProjectId}
                  onChange={(e) => setProposalProjectId(e.target.value)}
                  className="et-select mt-1 block min-w-[200px]"
                >
                  {projects.map((p) => (
                    <option key={p.project_id} value={p.project_id}>
                      {p.project_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <textarea
              value={proposalBrief}
              onChange={(e) => setProposalBrief(e.target.value)}
              placeholder="Optional client brief or objectives (used as additional context)"
              rows={3}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void runProposalAgent()}
              disabled={!proposalProjectId || proposalLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--et-teal)]/40 bg-[var(--et-teal-light)]/50 px-4 py-2 text-sm font-medium text-[var(--et-teal-dark)] disabled:opacity-50"
            >
              <Bot size={16} />
              Draft proposal
            </button>
            <DraftAgentPanel draft={proposalDraft} loading={proposalLoading} />
          </div>
        </div>
      )}

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
                    {c.contact_person ?? 'No contact'} · {c.project_count ?? 0} projects
                    {c.repeat_client && ' · Repeat'}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-4">
            <AgentPanel brief={crmAgent} loading={agentLoading} />
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Megaphone size={16} className="text-[var(--et-teal)]" />
                Marketing follow-ups
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Log nurture, campaign, and proposal follow-up activities from the pipeline CRM agent suggestions, or create via API.
              </p>
            </div>
          </div>
        </div>
      )}

      {tab === 'finance' && (
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Project</span>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="et-select mt-1 w-full max-w-md"
            >
              {projects.map((p) => (
                <option key={p.project_id} value={p.project_id}>
                  {p.project_name}
                </option>
              ))}
            </select>
          </label>
          {finance && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">Budget estimate</p>
                <p className="text-xl font-semibold">{formatInr(finance.budget_estimate)}</p>
                {finance.project_value_inr != null && (
                  <p className="mt-1 text-xs text-slate-500">Project value: {formatInr(finance.project_value_inr)}</p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">Actual</p>
                <p className="text-xl font-semibold">{formatInr(finance.budget_actual)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">Outstanding</p>
                <p className="text-xl font-semibold">{formatInr(finance.total_outstanding)}</p>
                {(finance.fiscal_year || finance.billing_month) && (
                  <p className="mt-1 text-xs text-slate-500">
                    {[finance.fiscal_year, finance.billing_month].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => void runFinanceAgent()}
            disabled={!selectedProjectId || agentLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--et-teal)]/40 bg-[var(--et-teal-light)]/50 px-4 py-2 text-sm font-medium text-[var(--et-teal-dark)] disabled:opacity-50"
          >
            <Bot size={16} />
            Run finance agent
          </button>
          <AgentPanel brief={financeAgent} loading={agentLoading} />
        </div>
      )}

      <p className="text-xs text-slate-400">
        LimeSurvey &amp; programming: <Link to="/quantitative" className="text-[var(--et-teal-dark)] hover:underline">Quantitative</Link>
      </p>

      {fieldworkProjectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <form
            onSubmit={(e) => void saveFieldworkLog(e)}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <h3 className="text-lg font-semibold text-slate-900">Log data collection</h3>
            <p className="mt-1 text-sm text-slate-500">{fieldworkProjectName}</p>
            <p className="mt-2 text-xs text-slate-500">
              Updates today&apos;s entry if one already exists for this date.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-slate-600">Completes today</span>
                <input
                  type="number"
                  min={0}
                  className="et-input w-full"
                  value={fieldworkCompletes}
                  onChange={(e) => setFieldworkCompletes(e.target.value)}
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-slate-600">Target completes (optional)</span>
                <input
                  type="number"
                  min={0}
                  className="et-input w-full"
                  value={fieldworkTarget}
                  onChange={(e) => setFieldworkTarget(e.target.value)}
                  placeholder="Overall quota target"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="et-btn-secondary" onClick={() => setFieldworkProjectId(null)}>
                Cancel
              </button>
              <button type="submit" className="et-btn-primary" disabled={fieldworkSaving}>
                {fieldworkSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {manualLinkProjectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <form
            onSubmit={(e) => void addManualSurveyLink(e)}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <h3 className="text-lg font-semibold text-slate-900">Add survey link</h3>
            <p className="mt-1 text-sm text-slate-500">{manualLinkProjectName}</p>
            <p className="mt-2 text-xs text-slate-500">
              Use this for multi-visit or mixed-method studies, for example Visit 1, Visit 2, Visit 3.
            </p>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-slate-600">LimeSurvey study ID</span>
              <input
                type="number"
                min={1}
                className="et-input w-full"
                value={manualSurveyId}
                onChange={(e) => setManualSurveyId(e.target.value)}
                placeholder="e.g. 997292"
                autoFocus
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="et-btn-secondary" onClick={() => setManualLinkProjectId(null)}>
                Cancel
              </button>
              <button type="submit" className="et-btn-primary" disabled={manualLinkSaving || !manualSurveyId.trim()}>
                {manualLinkSaving ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                Add link
              </button>
            </div>
          </form>
        </div>
      )}

      {editProjectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <form
            onSubmit={(e) => void saveEditProject(e)}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl et-scroll"
          >
            <div className="flex items-start gap-2">
              <Pencil size={20} className="mt-0.5 text-[var(--et-teal)]" />
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Edit project details</h3>
                <p className="text-sm text-slate-500">Update the operations record for this project.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-slate-600">Project name</span>
                <input
                  className="et-input w-full"
                  value={editForm.project_name}
                  onChange={(e) => setEditForm({ ...editForm, project_name: e.target.value })}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Client</span>
                <select
                  className="et-select w-full"
                  value={editForm.client_id}
                  onChange={(e) => setEditForm({ ...editForm, client_id: e.target.value })}
                >
                  <option value="">No client</option>
                  {clients.map((c) => (
                    <option key={c.client_id} value={c.client_id}>
                      {c.client_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Owner</span>
                <input
                  className="et-input w-full"
                  value={editForm.owner_name}
                  onChange={(e) => setEditForm({ ...editForm, owner_name: e.target.value })}
                  placeholder="Assigned lead"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Project type</span>
                <select
                  className="et-select w-full"
                  value={editForm.project_type}
                  onChange={(e) =>
                    setEditForm({ ...editForm, project_type: e.target.value as ProjectEditForm['project_type'] })
                  }
                >
                  <option value="quant">Quant</option>
                  <option value="qual">Qual</option>
                  <option value="mixed">Mixed</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Engagement</span>
                <select
                  className="et-select w-full"
                  value={editForm.engagement_type}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      engagement_type: e.target.value as ProjectEditForm['engagement_type'],
                    })
                  }
                >
                  <option value="ad-hoc">Ad-hoc</option>
                  <option value="tracking">Tracking</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Stage</span>
                <select
                  className="et-select w-full"
                  value={editForm.stage}
                  onChange={(e) => setEditForm({ ...editForm, stage: e.target.value })}
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Project code</span>
                <input
                  className="et-input w-full"
                  value={editForm.project_code}
                  onChange={(e) => setEditForm({ ...editForm, project_code: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Fiscal year</span>
                <input
                  className="et-input w-full"
                  value={editForm.fiscal_year}
                  onChange={(e) => setEditForm({ ...editForm, fiscal_year: e.target.value })}
                  placeholder="e.g. 2026-27"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Billing month</span>
                <input
                  className="et-input w-full"
                  value={editForm.billing_month}
                  onChange={(e) => setEditForm({ ...editForm, billing_month: e.target.value })}
                  placeholder="e.g. Jul 2026"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Project value (INR)</span>
                <input
                  type="number"
                  min={0}
                  className="et-input w-full"
                  value={editForm.project_value_inr}
                  onChange={(e) => setEditForm({ ...editForm, project_value_inr: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Budget estimate (INR)</span>
                <input
                  type="number"
                  min={0}
                  className="et-input w-full"
                  value={editForm.budget_estimate}
                  onChange={(e) => setEditForm({ ...editForm, budget_estimate: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Start date</span>
                <input
                  type="date"
                  className="et-input w-full"
                  value={editForm.start_date}
                  onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Target close date</span>
                <input
                  type="date"
                  className="et-input w-full"
                  value={editForm.target_close_date}
                  onChange={(e) => setEditForm({ ...editForm, target_close_date: e.target.value })}
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-slate-600">Status notes</span>
                <textarea
                  rows={3}
                  className="et-input w-full"
                  value={editForm.status_notes}
                  onChange={(e) => setEditForm({ ...editForm, status_notes: e.target.value })}
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="et-btn-secondary" onClick={() => setEditProjectId(null)}>
                Cancel
              </button>
              <button type="submit" className="et-btn-primary" disabled={editSaving || !editForm.project_name.trim()}>
                {editSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save details
              </button>
            </div>
          </form>
        </div>
      )}

      {requirementsProjectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl et-scroll">
            <div className="flex items-start gap-2">
              <FileText size={20} className="mt-0.5 text-[var(--et-teal)]" />
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Project requirements</h3>
                <p className="text-sm text-slate-500">{requirementsProjectName}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              PM-level brief — feeds proposal agent and operations. Linked LimeSurvey workflow can hold a copy under Workflow.
            </p>
            <div className="mt-4">
              <ProjectRequirementsEditor
                value={requirementsDraft}
                onChange={setRequirementsDraft}
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="et-btn-secondary"
                onClick={() => setRequirementsProjectId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="et-btn-primary"
                disabled={requirementsSaving}
                onClick={() => void saveRequirements()}
              >
                {requirementsSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save requirements
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
