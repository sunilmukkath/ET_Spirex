import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Inbox,
  Link2,
  Loader2,
  Mail,
  PenLine,
  RefreshCw,
  Reply,
  Search,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import {
  api,
  type GmailConnectionStatus,
  type GmailMessageDetail,
  type GmailMessageSummary,
  type GmailScheduledSend,
} from '../../api/client'
import {
  avatarColors,
  avatarInitials,
  formatInboxDate,
  formatMessageDate,
  gmailUrl,
  linkifyText,
  looksLikeBrief,
  scheduleTimestamp,
  splitEmailBody,
  type ComposeMode,
  type InboxFilter,
  type SchedulePreset,
} from './emailPanelUtils'

function EmailAvatar({ name, email, size = 'md' }: { name: string; email: string; size?: 'sm' | 'md' | 'lg' }) {
  const colors = avatarColors(name, email)
  const dim = size === 'sm' ? 'h-8 w-8 text-[11px]' : size === 'lg' ? 'h-11 w-11 text-sm' : 'h-9 w-9 text-xs'
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${dim}`}
      style={{ backgroundColor: colors.bg, color: colors.text }}
      aria-hidden
    >
      {avatarInitials(name, email)}
    </span>
  )
}

function EmailBody({ text }: { text: string }) {
  const paragraphs = splitEmailBody(text)
  if (paragraphs.length === 0) {
    return <p className="text-sm italic text-slate-400">No message body.</p>
  }
  return (
    <div className="et-email-body space-y-4">
      {paragraphs.map((paragraph, index) => (
        <p key={`p-${index}`} className="whitespace-pre-wrap text-[15px] leading-7 text-slate-800">
          {linkifyText(paragraph).map((part, partIndex) =>
            part.type === 'link' ? (
              <a
                key={`link-${index}-${partIndex}`}
                href={part.value}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[var(--et-info-blue)] underline decoration-[var(--et-info-blue)]/30 underline-offset-2 hover:decoration-[var(--et-info-blue)]"
              >
                {part.value}
              </a>
            ) : (
              <span key={`text-${index}-${partIndex}`}>{part.value}</span>
            ),
          )}
        </p>
      ))}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="flex gap-3">
        <div className="h-11 w-11 rounded-full bg-slate-200" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 rounded bg-slate-200" />
          <div className="h-3 w-1/2 rounded bg-slate-100" />
        </div>
      </div>
      <div className="space-y-2 pt-4">
        <div className="h-3 w-full rounded bg-slate-100" />
        <div className="h-3 w-full rounded bg-slate-100" />
        <div className="h-3 w-5/6 rounded bg-slate-100" />
      </div>
    </div>
  )
}

function FilterChip({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean
  count?: number
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'bg-[var(--et-navy)] text-white shadow-sm'
          : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
      }`}
    >
      {label}
      {count != null && count > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] ${
            active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

export function MyWorkEmailPanel({
  gmailStatus,
  inbox,
  syncing,
  connecting,
  onConnect,
  onSync,
  onBreakDown,
}: {
  gmailStatus: GmailConnectionStatus | null
  inbox: GmailMessageSummary[]
  syncing: boolean
  connecting: boolean
  onConnect: () => void
  onSync: () => void
  onBreakDown: (msg: GmailMessageSummary) => void
}) {
  const gmailConnected = gmailStatus?.connected === true
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<GmailMessageDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [scheduled, setScheduled] = useState<GmailScheduledSend[]>([])
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeMode, setComposeMode] = useState<ComposeMode>('new')
  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [schedulePreset, setSchedulePreset] = useState<SchedulePreset>('now')
  const [customSchedule, setCustomSchedule] = useState('')
  const [sending, setSending] = useState(false)
  const [sendBanner, setSendBanner] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [showScheduled, setShowScheduled] = useState(false)

  const selectedSummary = useMemo(
    () => inbox.find((m) => m.id === selectedId) ?? null,
    [inbox, selectedId],
  )

  const unreadCount = useMemo(() => inbox.filter((m) => m.is_unread).length, [inbox])
  const taskLinkedCount = useMemo(() => inbox.filter((m) => m.has_task).length, [inbox])

  const filteredInbox = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return inbox.filter((msg) => {
      if (filter === 'unread' && !msg.is_unread) return false
      if (filter === 'tasks' && !msg.has_task) return false
      if (!q) return true
      const haystack = `${msg.from_name} ${msg.from_email} ${msg.subject} ${msg.snippet}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [filter, inbox, searchQuery])

  useEffect(() => {
    if (!gmailConnected) return
    api.getGmailScheduled().then(setScheduled).catch(() => setScheduled([]))
  }, [gmailConnected, inbox])

  useEffect(() => {
    if (!composeOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setComposeOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [composeOpen])

  async function openMessage(msg: GmailMessageSummary) {
    setSelectedId(msg.id)
    setDetail(null)
    setDetailLoading(true)
    try {
      const full = await api.getGmailMessage(msg.id, true)
      setDetail(full)
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  function closeCompose() {
    setComposeOpen(false)
    setSendError(null)
  }

  function startCompose(mode: ComposeMode) {
    setComposeMode(mode)
    setComposeOpen(true)
    setSendError(null)
    if (mode === 'reply' && detail) {
      setComposeTo(detail.from_email)
      setComposeSubject(detail.subject.toLowerCase().startsWith('re:') ? detail.subject : `Re: ${detail.subject}`)
      setComposeBody('')
    } else {
      setComposeTo('')
      setComposeSubject('')
      setComposeBody('')
    }
    setSchedulePreset('now')
    setCustomSchedule('')
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    if (!composeTo.trim() || !composeSubject.trim()) return
    setSending(true)
    setSendError(null)
    try {
      const scheduledAt = scheduleTimestamp(schedulePreset, customSchedule)
      const result = await api.sendGmailMessage({
        to: composeTo.trim(),
        subject: composeSubject.trim(),
        body_text: composeBody,
        reply_to_message_id: composeMode === 'reply' && detail ? detail.id : null,
        scheduled_at: scheduledAt,
      })
      closeCompose()
      setSendBanner(result.message)
      if (result.scheduled) {
        const list = await api.getGmailScheduled()
        setScheduled(list)
      } else {
        onSync()
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  const pendingScheduled = scheduled.filter((s) => s.status === 'pending')

  let readingPane: ReactNode
  if (!selectedSummary) {
    readingPane = (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--et-yellow-light)] text-[var(--et-navy)]">
          <Mail size={28} strokeWidth={1.5} />
        </div>
        <div>
          <p className="font-display text-lg font-semibold text-slate-900">Select a conversation</p>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Read, reply, schedule sends, or let Scout break client emails into tasks and pipeline projects.
          </p>
        </div>
      </div>
    )
  } else if (detailLoading) {
    readingPane = <DetailSkeleton />
  } else if (detail) {
    const isBrief = looksLikeBrief(detail.subject, detail.snippet)
    readingPane = (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-6">
          <div className="flex items-start gap-3">
            <button
              type="button"
              className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 lg:hidden"
              onClick={() => setSelectedId(null)}
              aria-label="Back to inbox"
            >
              <ArrowLeft size={18} />
            </button>
            <EmailAvatar name={detail.from_name} email={detail.from_email} size="lg" />
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-lg font-semibold leading-snug text-slate-900">{detail.subject}</h3>
              <p className="mt-1 text-sm text-slate-600">
                <span className="font-medium text-slate-800">{detail.from_name || detail.from_email}</span>
                {detail.from_email && detail.from_name ? (
                  <span className="text-slate-500"> &lt;{detail.from_email}&gt;</span>
                ) : null}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">{formatMessageDate(detail.internal_date)}</p>
              {(detail.to_emails.length > 0 || detail.cc_emails.length > 0) && (
                <p className="mt-2 text-xs text-slate-500">
                  {detail.to_emails.length > 0 && (
                    <span>
                      To: {detail.to_emails.slice(0, 3).join(', ')}
                      {detail.to_emails.length > 3 ? ` +${detail.to_emails.length - 3}` : ''}
                    </span>
                  )}
                  {detail.cc_emails.length > 0 && (
                    <span className={detail.to_emails.length > 0 ? 'ml-3' : ''}>
                      Cc: {detail.cc_emails.slice(0, 2).join(', ')}
                      {detail.cc_emails.length > 2 ? ` +${detail.cc_emails.length - 2}` : ''}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => startCompose('reply')} className="et-btn-primary py-1.5 text-xs">
              <Reply size={14} />
              Reply
            </button>
            <button
              type="button"
              onClick={() => onBreakDown(selectedSummary)}
              className="et-btn-secondary py-1.5 text-xs"
            >
              <Sparkles size={14} />
              Scout: break into tasks
            </button>
            {isBrief && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--et-yellow-light)] px-2.5 py-1 text-[11px] font-medium text-[var(--et-navy)]">
                <Briefcase size={12} />
                Likely brief / proposal
              </span>
            )}
            {detail.has_task && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                <Link2 size={12} />
                {detail.task_count} linked task{detail.task_count === 1 ? '' : 's'}
              </span>
            )}
            <a
              href={detail.email_url || gmailUrl(detail.id)}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            >
              <ExternalLink size={13} />
              Open in Gmail
            </a>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 et-scroll">
          <EmailBody text={detail.body_text || detail.snippet} />
        </div>
      </div>
    )
  } else {
    readingPane = (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
        Could not load this message. Try syncing again.
      </div>
    )
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-soft)]">
      <div className="border-b border-slate-100 bg-gradient-to-r from-[var(--et-navy)] to-[var(--et-navy-soft)] px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white">
              <Inbox size={20} />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-white">Inbox</h2>
              {gmailConnected ? (
                <p className="text-xs text-white/70">{gmailStatus?.email}</p>
              ) : (
                <p className="text-xs text-white/70">Connect Gmail to work from Scout</p>
              )}
            </div>
            {gmailConnected && unreadCount > 0 && (
              <span className="rounded-full bg-[var(--et-yellow)] px-2.5 py-0.5 text-xs font-semibold text-[var(--et-navy)]">
                {unreadCount} unread
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {gmailConnected && (
              <>
                <button type="button" onClick={() => startCompose('new')} className="et-btn-secondary py-1.5 text-xs">
                  <PenLine size={14} />
                  Compose
                </button>
                <button type="button" onClick={onSync} className="et-btn-secondary py-1.5 text-xs" disabled={syncing}>
                  {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Sync
                </button>
              </>
            )}
            {!gmailConnected && (
              <button
                type="button"
                onClick={onConnect}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--et-yellow)] px-3 py-1.5 text-xs font-semibold text-[var(--et-navy)] hover:bg-[var(--et-yellow-bright)] disabled:opacity-60"
                disabled={connecting || gmailStatus?.configured === false}
              >
                {connecting ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                Connect Gmail
              </button>
            )}
          </div>
        </div>
      </div>

      {sendBanner && (
        <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 size={16} className="shrink-0" />
          <span className="flex-1">{sendBanner}</span>
          <button type="button" className="text-xs underline" onClick={() => setSendBanner(null)}>
            Dismiss
          </button>
        </div>
      )}

      {gmailStatus?.configured === false && (
        <p className="px-4 py-3 text-sm text-amber-700">Gmail OAuth is not configured on the server.</p>
      )}

      {!gmailConnected ? (
        <div className="grid gap-6 px-6 py-10 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="font-display text-xl font-semibold text-slate-900">Your research inbox, inside Scout</p>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-600">
              {gmailStatus?.message ||
                'Connect once to read client mail, reply with scheduled sends, and turn briefs into pipeline projects — without leaving My work.'}
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <Sparkles size={14} className="text-[var(--et-navy)]" />
                AI task breakdown for every thread
              </li>
              <li className="flex items-center gap-2">
                <Briefcase size={14} className="text-[var(--et-navy)]" />
                One-click pipeline for proposals & briefs
              </li>
              <li className="flex items-center gap-2">
                <CalendarClock size={14} className="text-[var(--et-navy)]" />
                Schedule replies for tomorrow or Monday morning
              </li>
            </ul>
          </div>
          <div className="flex h-32 w-32 items-center justify-center rounded-3xl bg-[var(--et-yellow-light)] text-[var(--et-navy)]">
            <Mail size={48} strokeWidth={1.25} />
          </div>
        </div>
      ) : (
        <>
          <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative flex-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search sender, subject, or preview…"
                  className="et-input w-full py-2.5 pl-9 text-sm"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <FilterChip active={filter === 'all'} label="All" count={inbox.length} onClick={() => setFilter('all')} />
                <FilterChip
                  active={filter === 'unread'}
                  label="Unread"
                  count={unreadCount}
                  onClick={() => setFilter('unread')}
                />
                <FilterChip
                  active={filter === 'tasks'}
                  label="With tasks"
                  count={taskLinkedCount}
                  onClick={() => setFilter('tasks')}
                />
              </div>
            </div>
          </div>

          {pendingScheduled.length > 0 && (
            <div className="border-b border-slate-100 bg-white px-4 py-2 sm:px-5">
              <button
                type="button"
                onClick={() => setShowScheduled((open) => !open)}
                className="flex w-full items-center gap-2 text-left text-xs text-slate-600"
              >
                <Clock size={14} className="text-[var(--et-navy)]" />
                <span className="flex-1">
                  {pendingScheduled.length} scheduled send{pendingScheduled.length === 1 ? '' : 's'} — next{' '}
                  {formatMessageDate(pendingScheduled[0].scheduled_at * 1000)}
                </span>
                <ChevronDown size={14} className={`transition ${showScheduled ? 'rotate-180' : ''}`} />
              </button>
              {showScheduled && (
                <ul className="mt-2 space-y-1.5 pb-1">
                  {pendingScheduled.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"
                    >
                      <span className="font-medium text-slate-800">{item.subject}</span>
                      <span className="text-slate-400"> · </span>
                      {item.to}
                      <span className="text-slate-400"> · </span>
                      {formatMessageDate(item.scheduled_at * 1000)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="grid min-h-[min(720px,calc(100vh-16rem))] lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
            <aside
              className={`flex min-h-[280px] flex-col border-b border-slate-100 lg:min-h-0 lg:border-b-0 lg:border-r ${
                selectedId ? 'hidden lg:flex' : 'flex'
              }`}
            >
              {filteredInbox.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
                  <Inbox size={24} className="text-slate-300" />
                  <p className="text-sm font-medium text-slate-700">
                    {searchQuery || filter !== 'all' ? 'No messages match' : 'Inbox is empty'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {searchQuery || filter !== 'all' ? 'Try a different search or filter.' : 'Click Sync to refresh.'}
                  </p>
                </div>
              ) : (
                <ul className="flex-1 overflow-y-auto et-scroll">
                  {filteredInbox.map((msg) => {
                    const selected = selectedId === msg.id
                    const brief = looksLikeBrief(msg.subject, msg.snippet)
                    return (
                      <li key={msg.id}>
                        <button
                          type="button"
                          onClick={() => void openMessage(msg)}
                          className={`group relative w-full border-b border-slate-100 px-4 py-3.5 text-left transition sm:px-4 ${
                            selected
                              ? 'bg-[var(--et-yellow-light)]/70 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[var(--et-yellow)]'
                              : 'hover:bg-slate-50/90'
                          }`}
                        >
                          <div className="flex gap-3">
                            <EmailAvatar name={msg.from_name} email={msg.from_email} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <span
                                  className={`truncate text-sm ${
                                    msg.is_unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'
                                  }`}
                                >
                                  {msg.from_name || msg.from_email}
                                </span>
                                <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                                  {formatInboxDate(msg.internal_date)}
                                </span>
                              </div>
                              <p
                                className={`mt-0.5 truncate text-sm ${
                                  msg.is_unread ? 'font-medium text-slate-800' : 'text-slate-600'
                                }`}
                              >
                                {msg.subject || '(no subject)'}
                              </p>
                              <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
                                {msg.snippet}
                              </p>
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {msg.is_unread && (
                                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--et-navy)]" aria-label="Unread" />
                                )}
                                {brief && (
                                  <span className="rounded-full bg-[var(--et-yellow-light)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--et-navy)]">
                                    Brief
                                  </span>
                                )}
                                {msg.has_task && (
                                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                                    <Link2 size={9} />
                                    {msg.task_count}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </aside>

            <main className={`flex min-h-[320px] flex-col bg-white ${selectedId ? 'flex' : 'hidden lg:flex'}`}>
              {readingPane}
            </main>
          </div>
        </>
      )}

      {composeOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <form
            onSubmit={handleSend}
            className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="font-display text-base font-semibold text-slate-900">
                  {composeMode === 'reply' ? 'Reply' : 'New message'}
                </p>
                <p className="text-xs text-slate-500">Send now or schedule for later</p>
              </div>
              <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600" onClick={closeCompose} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 overflow-y-auto px-5 py-4 et-scroll">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">To</span>
                <input
                  className="et-input w-full"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="client@company.com"
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Subject</span>
                <input
                  className="et-input w-full"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Re: Project update"
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Message</span>
                <textarea
                  className="et-input min-h-[10rem] w-full resize-y"
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="Write your reply…"
                  required
                />
              </label>
              <div>
                <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">When to send</span>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['now', 'Now'],
                      ['1h', 'In 1 hour'],
                      ['tomorrow9', 'Tomorrow 9 AM'],
                      ['monday9', 'Monday 9 AM'],
                      ['custom', 'Pick time'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSchedulePreset(value)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        schedulePreset === value
                          ? 'bg-[var(--et-navy)] text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {schedulePreset === 'custom' && (
                  <input
                    type="datetime-local"
                    className="et-input mt-3 w-full"
                    value={customSchedule}
                    onChange={(e) => setCustomSchedule(e.target.value)}
                    required
                  />
                )}
              </div>
              {sendError && <p className="text-sm text-rose-600">{sendError}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button type="button" className="et-btn-secondary" onClick={closeCompose}>
                Cancel
              </button>
              <button type="submit" className="et-btn-primary" disabled={sending}>
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {schedulePreset === 'now' ? 'Send' : 'Schedule send'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
