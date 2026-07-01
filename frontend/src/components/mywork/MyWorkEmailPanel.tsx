import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Clock,
  ExternalLink,
  Inbox,
  Link2,
  Loader2,
  Mail,
  PenLine,
  RefreshCw,
  Reply,
  Send,
  Sparkles,
} from 'lucide-react'
import {
  api,
  type GmailConnectionStatus,
  type GmailMessageDetail,
  type GmailMessageSummary,
  type GmailScheduledSend,
} from '../../api/client'
import { EmptyState } from '../States'

type ComposeMode = 'new' | 'reply'

type SchedulePreset = 'now' | '1h' | 'tomorrow9' | 'monday9' | 'custom'

function formatEmailDate(ms: number | null | undefined) {
  if (!ms) return '—'
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function gmailUrl(messageId: string) {
  return `https://mail.google.com/mail/u/0/#inbox/${messageId}`
}

function scheduleTimestamp(preset: SchedulePreset, customIso: string): number | null {
  const now = new Date()
  if (preset === 'now') return null
  if (preset === '1h') return Math.floor(now.getTime() / 1000) + 3600
  if (preset === 'tomorrow9') {
    const d = new Date(now)
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    return Math.floor(d.getTime() / 1000)
  }
  if (preset === 'monday9') {
    const d = new Date(now)
    const day = d.getDay()
    const daysUntilMonday = (8 - day) % 7 || 7
    d.setDate(d.getDate() + daysUntilMonday)
    d.setHours(9, 0, 0, 0)
    return Math.floor(d.getTime() / 1000)
  }
  if (preset === 'custom' && customIso) {
    return Math.floor(new Date(customIso).getTime() / 1000)
  }
  return null
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

  const selectedSummary = useMemo(
    () => inbox.find((m) => m.id === selectedId) ?? null,
    [inbox, selectedId],
  )

  useEffect(() => {
    if (!gmailConnected) return
    api.getGmailScheduled().then(setScheduled).catch(() => setScheduled([]))
  }, [gmailConnected, inbox])

  async function openMessage(msg: GmailMessageSummary) {
    setSelectedId(msg.id)
    setDetail(null)
    setDetailLoading(true)
    setComposeOpen(false)
    try {
      const full = await api.getGmailMessage(msg.id, true)
      setDetail(full)
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
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
      setComposeOpen(false)
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

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Inbox size={18} className="text-[var(--et-navy)]" />
          <h2 className="text-sm font-semibold text-slate-800">Email</h2>
          {gmailConnected && (
            <span className="text-xs text-slate-500">{gmailStatus?.email}</span>
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
              className="et-btn-primary py-1.5 text-xs"
              disabled={connecting || gmailStatus?.configured === false}
            >
              {connecting ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              Connect Gmail
            </button>
          )}
        </div>
      </div>

      {sendBanner && (
        <p className="border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-xs text-emerald-800">
          {sendBanner}
          <button type="button" className="ml-2 underline" onClick={() => setSendBanner(null)}>
            Dismiss
          </button>
        </p>
      )}

      {gmailStatus?.configured === false && (
        <p className="px-4 py-3 text-sm text-amber-700">Gmail OAuth is not configured on the server.</p>
      )}

      {gmailConnected && pendingScheduled.length > 0 && (
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">
          <Clock size={12} className="mr-1 inline" />
          {pendingScheduled.length} scheduled send{pendingScheduled.length === 1 ? '' : 's'} — next:{' '}
          {formatEmailDate(pendingScheduled[0].scheduled_at * 1000)}
        </div>
      )}

      {!gmailConnected ? (
        <div className="p-6">
          <EmptyState
            title="Connect Gmail"
            description={gmailStatus?.message || 'Read, reply, schedule sends, and turn emails into tasks.'}
          />
        </div>
      ) : (
        <div className="grid min-h-[28rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="border-b border-slate-100 lg:border-b-0 lg:border-r">
            {inbox.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No messages — click Sync.</p>
            ) : (
              <ul className="max-h-[32rem] overflow-y-auto et-scroll">
                {inbox.map((msg) => (
                  <li key={msg.id}>
                    <button
                      type="button"
                      onClick={() => void openMessage(msg)}
                      className={`w-full border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50 ${
                        selectedId === msg.id ? 'bg-[var(--et-teal-light)]/25' : ''
                      } ${msg.is_unread ? 'font-medium' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm text-slate-900">
                          {msg.is_unread && <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--et-teal)]" />}
                          {msg.from_name || msg.from_email}
                        </span>
                        <span className="shrink-0 text-[10px] text-slate-400">
                          {formatEmailDate(msg.internal_date)}
                        </span>
                      </div>
                      <p className="truncate text-xs text-slate-700">{msg.subject}</p>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{msg.snippet}</p>
                      {msg.has_task && (
                        <span className="mt-1 inline-flex items-center gap-0.5 text-[10px] text-[var(--et-teal-dark)]">
                          <Link2 size={10} />
                          {msg.task_count} task{msg.task_count === 1 ? '' : 's'}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex min-h-[20rem] flex-col">
            {composeOpen ? (
              <form onSubmit={handleSend} className="flex flex-1 flex-col p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {composeMode === 'reply' ? 'Reply' : 'New message'}
                </p>
                <label className="mb-2 block text-xs">
                  <span className="text-slate-500">To</span>
                  <input
                    className="et-input mt-1 w-full text-sm"
                    value={composeTo}
                    onChange={(e) => setComposeTo(e.target.value)}
                    required
                  />
                </label>
                <label className="mb-2 block text-xs">
                  <span className="text-slate-500">Subject</span>
                  <input
                    className="et-input mt-1 w-full text-sm"
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    required
                  />
                </label>
                <label className="mb-2 block flex-1 text-xs">
                  <span className="text-slate-500">Message</span>
                  <textarea
                    className="et-input mt-1 min-h-[8rem] w-full flex-1 text-sm"
                    value={composeBody}
                    onChange={(e) => setComposeBody(e.target.value)}
                    required
                  />
                </label>
                <div className="mb-3 flex flex-wrap items-end gap-2">
                  <label className="text-xs text-slate-500">
                    Send
                    <select
                      className="et-select mt-1 block text-sm"
                      value={schedulePreset}
                      onChange={(e) => setSchedulePreset(e.target.value as SchedulePreset)}
                    >
                      <option value="now">Now</option>
                      <option value="1h">In 1 hour</option>
                      <option value="tomorrow9">Tomorrow 9:00 AM</option>
                      <option value="monday9">Monday 9:00 AM</option>
                      <option value="custom">Pick date & time…</option>
                    </select>
                  </label>
                  {schedulePreset === 'custom' && (
                    <input
                      type="datetime-local"
                      className="et-input text-sm"
                      value={customSchedule}
                      onChange={(e) => setCustomSchedule(e.target.value)}
                      required
                    />
                  )}
                </div>
                {sendError && <p className="mb-2 text-xs text-rose-600">{sendError}</p>}
                <div className="flex gap-2">
                  <button type="submit" className="et-btn-primary text-xs" disabled={sending}>
                    {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {schedulePreset === 'now' ? 'Send' : 'Schedule'}
                  </button>
                  <button type="button" className="et-btn-secondary text-xs" onClick={() => setComposeOpen(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : !selectedSummary ? (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
                Select an email to read, reply, or break into tasks.
              </div>
            ) : detailLoading ? (
              <div className="flex flex-1 items-center justify-center gap-2 p-8 text-sm text-slate-600">
                <Loader2 size={18} className="animate-spin text-[var(--et-teal)]" />
                Loading…
              </div>
            ) : detail ? (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h3 className="text-base font-semibold text-slate-900">{detail.subject}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    From {detail.from_name} &lt;{detail.from_email}&gt;
                    {' · '}
                    {formatEmailDate(detail.internal_date)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => startCompose('reply')} className="et-btn-secondary py-1 text-xs">
                      <Reply size={14} />
                      Reply
                    </button>
                    <button
                      type="button"
                      onClick={() => onBreakDown(selectedSummary)}
                      className="et-btn-secondary py-1 text-xs"
                    >
                      <Sparkles size={14} />
                      Break into tasks
                    </button>
                    <a
                      href={detail.email_url || gmailUrl(detail.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      <ExternalLink size={12} />
                      Open in Gmail
                    </a>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto whitespace-pre-wrap px-4 py-4 text-sm leading-relaxed text-slate-800 et-scroll">
                  {detail.body_text || detail.snippet}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}
