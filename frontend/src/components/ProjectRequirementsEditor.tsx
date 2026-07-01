import { REQUIREMENT_FIELD_LABELS, type ProjectRequirements } from '../api/client'

const EMPTY: ProjectRequirements = {
  summary: '',
  objectives: '',
  methodology: '',
  sample_design: '',
  deliverables: '',
  timeline: '',
  constraints: '',
}

type RequirementField = keyof Omit<ProjectRequirements, 'updated_at' | 'updated_by'>

const REQUIREMENT_FIELDS = Object.keys(REQUIREMENT_FIELD_LABELS) as RequirementField[]

interface Props {
  value: ProjectRequirements | null | undefined
  onChange: (next: ProjectRequirements) => void
  disabled?: boolean
  compact?: boolean
}

export function ProjectRequirementsEditor({ value, onChange, disabled, compact }: Props) {
  const req = value ?? EMPTY

  function patch(field: RequirementField, text: string) {
    onChange({ ...req, [field]: text })
  }

  return (
    <div className={`grid gap-3 ${compact ? '' : 'sm:grid-cols-2'}`}>
      {REQUIREMENT_FIELDS.map((field) => (
        <label key={field} className={`block text-xs ${field === 'summary' && !compact ? 'sm:col-span-2' : ''}`}>
          <span className="mb-1 block font-medium text-slate-600">{REQUIREMENT_FIELD_LABELS[field]}</span>
          <textarea
            value={req[field] ?? ''}
            disabled={disabled}
            onChange={(e) => patch(field, e.target.value)}
            rows={compact ? 2 : field === 'summary' ? 3 : 2}
            className="et-input w-full text-sm"
            placeholder={`${REQUIREMENT_FIELD_LABELS[field]}…`}
          />
        </label>
      ))}
    </div>
  )
}

export function emptyProjectRequirements(): ProjectRequirements {
  return { ...EMPTY }
}
