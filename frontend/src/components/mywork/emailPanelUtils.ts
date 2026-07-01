export type InboxFilter = 'all' | 'unread' | 'tasks'
export type ComposeMode = 'new' | 'reply'
export type SchedulePreset = 'now' | '1h' | 'tomorrow9' | 'monday9' | 'custom'

const AVATAR_PALETTE = [
  { bg: '#e0e7ff', text: '#3730a3' },
  { bg: '#dbeafe', text: '#1d4ed8' },
  { bg: '#ccfbf1', text: '#0f766e' },
  { bg: '#dcfce7', text: '#15803d' },
  { bg: '#fef3c7', text: '#b45309' },
  { bg: '#fce7f3', text: '#be185d' },
  { bg: '#ede9fe', text: '#6d28d9' },
  { bg: '#ffedd5', text: '#c2410c' },
]

const BRIEF_HINT =
  /\b(brief|proposal|rfp|pitch|scope|new\s+project|new\s+study|request\s+for\s+proposal)\b/i

export function gmailUrl(messageId: string) {
  return `https://mail.google.com/mail/u/0/#inbox/${messageId}`
}

export function avatarInitials(name: string, email: string) {
  const source = (name || email || '?').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  if (source.includes('@')) return source[0].toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

export function avatarColors(name: string, email: string) {
  const key = (name || email || 'x').toLowerCase()
  let hash = 0
  for (let i = 0; i < key.length; i += 1) hash = (hash + key.charCodeAt(i) * (i + 1)) % 997
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

export function looksLikeBrief(subject: string, snippet: string) {
  return BRIEF_HINT.test(`${subject}\n${snippet}`)
}

export function formatInboxDate(ms: number | null | undefined) {
  if (!ms) return ''
  const date = new Date(ms)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfWeek.getDate() - 6)

  if (date >= startOfToday) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  if (date >= startOfYesterday) return 'Yesterday'
  if (date >= startOfWeek) {
    return date.toLocaleDateString(undefined, { weekday: 'short' })
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
}

export function formatMessageDate(ms: number | null | undefined) {
  if (!ms) return '—'
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function scheduleTimestamp(preset: SchedulePreset, customIso: string): number | null {
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

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)}\]"'])/g

export function splitEmailBody(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  return normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
}

export function linkifyText(text: string): Array<{ type: 'text' | 'link'; value: string }> {
  const parts: Array<{ type: 'text' | 'link'; value: string }> = []
  let lastIndex = 0
  for (const match of text.matchAll(URL_RE)) {
    const index = match.index ?? 0
    if (index > lastIndex) parts.push({ type: 'text', value: text.slice(lastIndex, index) })
    parts.push({ type: 'link', value: match[0] })
    lastIndex = index + match[0].length
  }
  if (lastIndex < text.length) parts.push({ type: 'text', value: text.slice(lastIndex) })
  if (parts.length === 0) parts.push({ type: 'text', value: text })
  return parts
}
