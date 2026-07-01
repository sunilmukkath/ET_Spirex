import { Navigate, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  Briefcase,
  ChevronRight,
  ClipboardList,
  Database,
  MessageSquare,
  PieChart,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Users,
  Zap,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { BrandLockup } from '../components/BrandLockup'
import { SignInForm } from '../components/SignInForm'
import { LoadingState } from '../components/States'
import {
  ET_LANDING_BADGE,
  ET_LANDING_SUBTITLE,
  ET_LANDING_TITLE,
  ET_ORG_NAME,
  ET_PRODUCT_NAME,
} from '../lib/etCopy'

const JOURNEY_STEPS = [
  { icon: Briefcase, label: 'Proposal & ops', hint: 'CRM, finance, pipeline' },
  { icon: Zap, label: 'Fieldwork', hint: 'LimeSurvey + quotas' },
  { icon: BarChart3, label: 'Analysis', hint: 'Quant, qual, stats' },
  { icon: Database, label: 'Delivery', hint: 'Reports & exports' },
] as const

const HIGHLIGHTS = [
  'Quant + qual in one workspace',
  'Live LimeSurvey fieldwork',
  'AI-assisted client reports',
] as const

const CAPABILITY_GROUPS = [
  {
    title: 'Research & insight',
    description: 'From transcripts to crosstabs — one analysis layer.',
    features: [
      {
        icon: MessageSquare,
        title: 'Qual library',
        desc: 'Upload FG/IDI transcripts, search sessions, and run AI thematic summaries.',
      },
      {
        icon: Table2,
        title: 'Quant analysis',
        desc: 'Question profiles, multi-banner crosstabs, filters, and heatmaps.',
      },
      {
        icon: PieChart,
        title: 'Charts & statistics',
        desc: '30+ chart types plus correlation, regression, t-tests, and ANOVA.',
      },
    ],
  },
  {
    title: 'Field operations',
    description: 'Monitor fieldwork quality and pace in real time.',
    features: [
      {
        icon: ClipboardList,
        title: 'Fielding & quotas',
        desc: 'Daily completes, interviewer throughput, and layered quota targets.',
      },
      {
        icon: ShieldCheck,
        title: 'QC review',
        desc: 'Speeders, duplicates, straight-lining, and interviewer pattern checks.',
      },
      {
        icon: Zap,
        title: 'Live LimeSurvey',
        desc: 'Quant fieldwork connected to your Elastic Tree survey instance.',
      },
    ],
  },
  {
    title: 'Programming & delivery',
    description: 'Ship client-ready outputs without leaving the project.',
    features: [
      {
        icon: SlidersHorizontal,
        title: 'Programming & weighting',
        desc: 'Custom variables, recodes, net scores, and survey weighting.',
      },
      {
        icon: Database,
        title: 'Exports & reports',
        desc: 'Raw data, codebooks, and branded PDF/PPT decks with AI narrative.',
      },
      {
        icon: Users,
        title: 'Team workflow',
        desc: 'Tasks, roles, proposals, and requirements on every study.',
      },
    ],
  },
] as const

function scrollToSignIn() {
  document.getElementById('signin')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function scrollToCapabilities() {
  document.getElementById('capabilities')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function LandingPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--et-navy)]">
        <LoadingState message={`Loading ${ET_PRODUCT_NAME}…`} />
      </div>
    )
  }

  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[var(--et-navy)] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="landing-glow absolute -left-24 top-8 h-[28rem] w-[28rem] rounded-full bg-[var(--et-yellow)]/20 blur-3xl" />
        <div
          className="landing-glow absolute bottom-0 right-0 h-[32rem] w-[32rem] rounded-full bg-[var(--et-info-blue)]/10 blur-3xl"
          style={{ animationDelay: '2s' }}
        />
        <div className="et-grid absolute inset-0 opacity-[0.06]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </div>

      <header className="sticky top-0 z-20 border-b border-white/5 bg-[var(--et-navy)]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="sm:hidden">
              <BrandLockup size="sm" variant="light" />
            </div>
            <div className="hidden sm:block">
              <BrandLockup size="lg" variant="light" />
            </div>
          </div>
          <button
            type="button"
            onClick={scrollToSignIn}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium transition hover:border-[var(--et-yellow)]/50 hover:bg-white/10 sm:px-5"
          >
            Sign in
            <ChevronRight size={14} className="text-[var(--et-yellow-bright)]" />
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6 sm:pt-14 lg:pb-28">
        <div className="grid gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-16">
          <div>
            <div className="animate-fade-in">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--et-yellow)]/40 bg-[var(--et-yellow)]/15 px-3.5 py-1.5 text-xs font-semibold text-[var(--et-yellow-bright)]">
                <Sparkles size={14} />
                {ET_LANDING_BADGE}
              </div>

              <h1 className="font-display max-w-2xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.35rem]">
                {ET_LANDING_TITLE}
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-white/72 sm:text-lg">
                {ET_LANDING_SUBTITLE}
              </p>

              <ul className="mt-6 flex flex-wrap gap-2">
                {HIGHLIGHTS.map((item) => (
                  <li
                    key={item}
                    className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-white/80"
                  >
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={scrollToSignIn}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--et-yellow)] px-5 py-3 text-sm font-semibold text-[var(--et-navy)] shadow-lg shadow-[var(--et-yellow)]/30 transition hover:brightness-105"
                >
                  Sign in to workspace
                  <ArrowRight size={16} />
                </button>
                <button
                  type="button"
                  onClick={scrollToCapabilities}
                  className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-white/90 transition hover:bg-white/10"
                >
                  Explore capabilities
                </button>
              </div>
            </div>

            <section className="animate-fade-in-delay-1 mt-12">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
                Proposal to closure
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                {JOURNEY_STEPS.map(({ icon: Icon, label, hint }, index) => (
                  <div
                    key={label}
                    className="relative rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm"
                  >
                    {index < JOURNEY_STEPS.length - 1 && (
                      <span
                        className="absolute -right-1 top-1/2 hidden h-px w-2 -translate-y-1/2 bg-white/15 sm:block"
                        aria-hidden
                      />
                    )}
                    <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--et-yellow)]/20 text-[var(--et-yellow-bright)]">
                      <Icon size={18} />
                    </div>
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-white/50">{hint}</p>
                  </div>
                ))}
              </div>
            </section>

            <section id="capabilities" className="animate-fade-in-delay-2 mt-14 scroll-mt-24">
              <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-semibold text-white sm:text-2xl">
                    Built for Elastic Tree delivery
                  </h2>
                  <p className="mt-1 text-sm text-white/55">
                    Everything your team needs on one study — no tool switching.
                  </p>
                </div>
              </div>

              <div className="space-y-8">
                {CAPABILITY_GROUPS.map((group) => (
                  <div key={group.title}>
                    <div className="mb-3">
                      <h3 className="text-sm font-semibold text-[var(--et-yellow-bright)]">{group.title}</h3>
                      <p className="text-xs text-white/45">{group.description}</p>
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-3">
                      {group.features.map(({ icon: Icon, title, desc }) => (
                        <div
                          key={title}
                          className="group rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:border-[var(--et-yellow)]/35 hover:bg-white/[0.07] hover:shadow-lg hover:shadow-black/10"
                        >
                          <div className="mb-2.5 flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--et-yellow)]/20 text-[var(--et-yellow-bright)] ring-1 ring-white/10 transition group-hover:bg-[var(--et-yellow)]/30">
                              <Icon size={16} />
                            </span>
                            <h4 className="text-sm font-semibold text-white">{title}</h4>
                          </div>
                          <p className="text-[11px] leading-relaxed text-white/55">{desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="animate-fade-in-delay-3 lg:sticky lg:top-24">
            <div
              id="signin"
              className="scroll-mt-28 overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-white/[0.1] to-white/[0.04] p-1 shadow-2xl shadow-black/20 ring-1 ring-white/10"
            >
              <div className="rounded-[0.9rem] bg-[var(--et-navy)]/40 px-5 py-4 sm:px-6">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--et-teal-light)]">
                  Team access
                </p>
                <p className="mt-1 text-sm text-white/70">
                  Elastic Tree researchers and project managers — sign in to open your home hub.
                </p>
                <ul className="mt-4 space-y-2 border-t border-white/10 pt-4 text-xs text-white/60">
                  <li className="flex items-start gap-2">
                    <ChevronRight size={14} className="mt-0.5 shrink-0 text-[var(--et-teal-light)]" />
                    Tasks, projects, proposals, and finance in one place
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight size={14} className="mt-0.5 shrink-0 text-[var(--et-teal-light)]" />
                    Pick up LimeSurvey studies where you left off
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight size={14} className="mt-0.5 shrink-0 text-[var(--et-teal-light)]" />
                    QC, quotas, and client-ready exports per study
                  </li>
                </ul>
              </div>
              <div className="p-4 sm:p-5">
                <SignInForm onSuccess={() => navigate('/dashboard')} />
              </div>
            </div>
          </aside>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/10 bg-[var(--et-navy)]/60 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-center sm:flex-row sm:px-6 sm:text-left">
          <p className="text-xs text-white/40">
            {ET_PRODUCT_NAME} · {ET_ORG_NAME}
          </p>
          <button
            type="button"
            onClick={scrollToSignIn}
            className="text-xs font-medium text-[var(--et-teal-light)] hover:underline"
          >
            Sign in to workspace
          </button>
        </div>
      </footer>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[var(--et-navy)]/95 p-3 backdrop-blur-md sm:hidden">
        <button
          type="button"
          onClick={scrollToSignIn}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--et-teal)] py-3 text-sm font-semibold text-white"
        >
          Sign in to {ET_PRODUCT_NAME}
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}
