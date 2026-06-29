import { Navigate, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Database,
  Layers,
  PieChart,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Zap,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { BrandLogo } from '../components/BrandLogo'
import { SignInForm } from '../components/SignInForm'
import { LoadingState } from '../components/States'

const FEATURES = [
  {
    icon: Layers,
    title: 'Explore',
    desc: 'Instant distributions, summary stats, and GPS maps for every question.',
  },
  {
    icon: PieChart,
    title: 'Charts',
    desc: 'Build bar, pie, histogram, and banner charts one at a time — export PNG or CSV.',
  },
  {
    icon: Table2,
    title: 'Crosstabs',
    desc: 'Multi-banner tables with per-table filters, significance testing, and Excel export.',
  },
  {
    icon: ShieldCheck,
    title: 'Data quality',
    desc: 'Quality score, speeders, duplicates, straight-lining, and gibberish detection.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Custom variables',
    desc: 'Recode, combine categories, and net scores — ready for banners and filters.',
  },
  {
    icon: Database,
    title: 'Raw data',
    desc: 'Search, filter columns, and export the full response dataset.',
  },
  {
    icon: BarChart3,
    title: 'QC-approved analysis',
    desc: 'Analyze clean samples with flagged responses automatically excluded.',
  },
  {
    icon: Zap,
    title: 'Live LimeSurvey',
    desc: 'Connected to your Elastic Tree survey instance in real time.',
  },
]

export function LandingPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--et-navy)]">
        <LoadingState message="Loading ET Scout…" />
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

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <BrandLogo size="lg" variant="light" />
        <a
          href="#signin"
          className="rounded-full border border-white/20 bg-white/5 px-5 py-2 text-sm font-medium backdrop-blur-sm transition hover:bg-white/10"
        >
          Sign in
        </a>
      </header>

      <main className="relative z-10 mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-8 lg:grid-cols-2 lg:items-center lg:gap-16 lg:pt-16">
        <div className="animate-fade-in">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--et-teal)]/30 bg-[var(--et-teal)]/10 px-3 py-1 text-xs font-medium text-[var(--et-teal-light)]">
            <Sparkles size={14} />
            Survey intelligence platform
          </div>
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-[3.25rem]">
            Analytics that feel as sharp as your research.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-white/70 sm:text-lg">
            ET Scout turns LimeSurvey data into explore charts, custom visualisations,
            advanced crosstabs, quality scans, and export-ready tables — built for the Elastic Tree team.
          </p>

          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition hover:border-[var(--et-teal)]/30 hover:bg-white/[0.07]"
              >
                <Icon className="mb-2 text-[var(--et-teal-light)]" size={20} />
                <h3 className="text-sm font-semibold text-white">{title}</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-white/55">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div id="signin" className="animate-fade-in lg:justify-self-end">
          <SignInForm onSuccess={() => navigate('/dashboard')} />
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/10 py-6 text-center text-xs text-white/40">
        <BarChart3 className="mx-auto mb-2 opacity-40" size={18} />
        ET Scout · Elastic Tree Consumer Insights
      </footer>
    </div>
  )
}
