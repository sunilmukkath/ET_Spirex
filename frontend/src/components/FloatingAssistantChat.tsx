import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, MessageCircle, Send, Sparkles, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'

type ChatRole = 'user' | 'assistant'

interface ChatMessage {
  id: string
  role: ChatRole
  content: string
}

const WELCOME =
  'Hi — I\'m ET Scout Copilot. Ask how to navigate the app, run analysis, fieldwork, qual, or operations workflows.'

function pageHint(pathname: string): string {
  if (pathname === '/dashboard') return 'Projects dashboard (LimeSurvey studies)'
  if (pathname === '/home') return 'Home — PM projects or Lime fallback'
  if (pathname === '/my-work') return 'My work — assigned tasks'
  if (pathname === '/operations') return 'Operations hub — PM projects'
  if (pathname === '/fieldwork') return 'Fieldwork overview'
  if (pathname === '/settings') return 'Settings — account, LimeSurvey, Gmail, team roles'
  if (pathname.startsWith('/projects/')) return 'Survey workspace (tabs: Home, Workflow, Analyze, etc.)'
  return 'ET Scout'
}

function surveyIdFromPath(pathname: string): number | undefined {
  const match = pathname.match(/^\/projects\/(\d+)/)
  if (!match) return undefined
  const id = Number(match[1])
  return Number.isFinite(id) ? id : undefined
}

function nextId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function FloatingAssistantChat() {
  const { user } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const context = useMemo(
    () => ({
      pathname: location.pathname,
      search: location.search || undefined,
      survey_id: surveyIdFromPath(location.pathname),
      page_hint: pageHint(location.pathname),
    }),
    [location.pathname, location.search],
  )

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ id: nextId(), role: 'assistant', content: WELCOME }])
    }
  }, [open, messages.length])

  useEffect(() => {
    if (open) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, open, sending])

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 120)
      return () => window.clearTimeout(t)
    }
    return undefined
  }, [open])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    const userMsg: ChatMessage = { id: nextId(), role: 'user', content: text }
    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }))

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setSending(true)
    setError(null)

    try {
      const res = await api.assistantChat({
        message: text,
        history,
        context,
      })
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'assistant', content: res.reply },
      ])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed'
      setError(msg)
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          content: 'Sorry — I could not reach the server. Please try again.',
        },
      ])
    } finally {
      setSending(false)
    }
  }, [context, input, messages, sending])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  if (!user) return null

  return (
    <>
      {open && (
        <div
          className="fixed bottom-24 right-4 z-[80] flex w-[min(100vw-2rem,24rem)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
          style={{ height: 'min(32rem, calc(100vh - 7rem))' }}
          role="dialog"
          aria-label="ET Scout Copilot"
        >
          <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--canvas)] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--et-teal)]/15 text-[var(--et-teal)]">
                <Sparkles size={16} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--ink)]">ET Scout Copilot</p>
                <p className="truncate text-xs text-[var(--muted)]">{pageHint(location.pathname)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]"
              aria-label="Close assistant"
            >
              <X size={18} />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === 'user'
                    ? 'ml-8 rounded-2xl rounded-br-md bg-[var(--et-teal)] px-3 py-2 text-sm text-white'
                    : 'mr-4 rounded-2xl rounded-bl-md bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)]'
                }
              >
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
              </div>
            ))}
            {sending && (
              <div className="mr-4 flex items-center gap-2 rounded-2xl rounded-bl-md bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--muted)]">
                <Loader2 size={14} className="animate-spin" />
                Thinking…
              </div>
            )}
          </div>

          {error && (
            <p className="px-4 pb-1 text-xs text-red-600" role="alert">
              {error}
            </p>
          )}

          <footer className="border-t border-[var(--border)] p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={2}
                placeholder="Ask about ET Scout…"
                disabled={sending}
                className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] focus:border-[var(--et-teal)] focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || !input.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--et-teal)] text-white hover:opacity-90 disabled:opacity-40"
                aria-label="Send message"
              >
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
          </footer>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-[80] flex h-14 w-14 items-center justify-center rounded-full bg-[var(--et-teal)] text-white shadow-lg transition hover:scale-105 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--et-teal)] focus-visible:ring-offset-2"
        aria-label={open ? 'Close ET Scout Copilot' : 'Open ET Scout Copilot'}
        aria-expanded={open}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
    </>
  )
}
