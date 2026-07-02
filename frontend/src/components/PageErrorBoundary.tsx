import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, RefreshCw } from 'lucide-react'

type Props = { children: ReactNode; label?: string }
type State = { error: string | null }

export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error: error.message || 'Unexpected error' }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Page error (${this.props.label ?? 'app'}):`, error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="et-page et-page-wide py-16">
        <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
            <AlertCircle size={22} />
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-slate-900">
            {this.props.label ? `${this.props.label} failed to load` : 'This page failed to load'}
          </h2>
          <p className="mt-2 text-sm text-rose-800">{this.state.error}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className="et-btn-primary"
              onClick={() => this.setState({ error: null })}
            >
              <RefreshCw size={14} />
              Try again
            </button>
            <Link to="/home" className="et-btn-secondary">
              Go to Home
            </Link>
          </div>
        </div>
      </div>
    )
  }
}
