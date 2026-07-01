import { Navigate, useNavigate } from 'react-router-dom'
import {
  ClipboardList,
  Database,
  MessageSquare,
  PieChart,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table2,
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

const FEATURES = [
  {
    icon: MessageSquare,
    title: 'Qual library',
    desc: 'Upload FG/IDI transcripts, search across sessions, and run AI thematic summaries.',
  },
  {
    icon: Table2,
    title: 'Quant analysis',
    desc: 'Question profiles, multi-banner crosstabs with significance testing, and filters.',
  },
  {
    icon: PieChart,
    title: 'Charts & statistics',
    desc: '30+ chart types plus correlation, regression, t-tests, and ANOVA.',
  },
  {
    icon: ClipboardList,
    title: 'Fielding & quotas',
    desc: 'Daily completes, interviewer throughput, and layered quota targets.',
  },
  {
    icon: ShieldCheck,
    title: 'QC review',
    desc: 'Speeders, duplicates, straight-lining, custom rules, and interviewer QC.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Programming & weighting',
    desc: 'Custom variables, recodes, net scores, and survey weighting.',
  },
  {
    icon: Database,
    title: 'Exports & reports',
    desc: 'Raw data, codebooks, and client-ready PDF/PPT decks with optional AI narrative.',
  },
  {
    icon: Zap,
    title: 'Live LimeSurvey',
    desc: 'Quant fieldwork connected to your Elastic Tree survey instance in real time.',
  },
]

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
    <div className="relative min-h-screen overflow-hidden bg-[var(--et-navy)] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-[var(--et-teal)]/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-[var(--et-gold)]/10 blur-3xl" />
        <div className="et-grid absolute inset-0 opacity-[0.07]" />
      </div>

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:gap-4 sm:px-6 sm:py-6">
        <div className="min-w-0 flex-1">
          <div className="sm:hidden">
            <BrandLockup size="sm" variant="light" />
          </div>
          <div className="hidden sm:block">
            <BrandLockup size="lg" variant="light" />
          </div>
        </div>
        <a
          href="#signin"
          className="inline-flex shrink-0 items-center justify-center self-center rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium leading-none backdrop-blur-sm transition hover:bg-white/10 sm:px-5"
        >
          Sign in
        </a>
      </header>

      <main className="relative z-10 mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-14 lg:pt-14">
        <div className="animate-fade-in">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--et-teal)]/30 bg-[var(--et-teal)]/10 px-3.5 py-1.5 text-xs font-semibold text-[var(--et-teal-light)]">
            <Sparkles size={14} />
            {ET_LANDING_BADGE}
          </div>
          <h1 className="font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.25rem]">
            {ET_LANDING_TITLE}
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-white/75 sm:text-lg">
            {ET_LANDING_SUBTITLE}
          </p>

          <div className="mt-10 grid gap-2.5 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="group rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm transition hover:border-[var(--et-teal)]/35 hover:bg-white/[0.08]"
              >
                <div className="mb-2.5 flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--et-teal)]/20 text-[var(--et-teal-light)] ring-1 ring-white/10">
                    <Icon size={16} />
                  </span>
                  <h3 className="text-sm font-semibold text-white">{title}</h3>
                </div>
                <p className="text-[11px] leading-relaxed text-white/55">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div id="signin" className="animate-fade-in lg:sticky lg:top-8 lg:justify-self-end">
          <SignInForm onSuccess={() => navigate('/dashboard')} />
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/10 py-6 text-center text-xs text-white/40">
        {ET_PRODUCT_NAME} · {ET_ORG_NAME}
      </footer>
    </div>
  )
}
