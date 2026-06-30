import { useMemo } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { SurveyVariable } from '../../api/client'
import {
  chartSlotDefs,
  variablesForChartSlot,
  type ChartSlotId,
} from '../../lib/chartSlots'
import type { ChartTypeId } from '../../lib/chartTypes'

interface SlotValues {
  value: string
  y: string
  z: string
  banner: string
}

interface Props {
  chartType: ChartTypeId
  variables: SurveyVariable[]
  slots: SlotValues
  onSlotChange: (slot: ChartSlotId, variableId: string) => void
  disabled?: boolean
}

function SlotSelect({
  label,
  hint,
  required,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  hint: string
  required?: boolean
  value: string
  options: SurveyVariable[]
  onChange: (id: string) => void
  disabled?: boolean
}) {
  return (
    <label className="block text-xs">
      <span className="flex items-center gap-1 font-medium text-slate-700">
        {label}
        {required ? ' *' : ''}
        {value && <CheckCircle2 size={12} className="text-emerald-500" />}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-[var(--et-teal)] focus:ring-2 disabled:opacity-50"
      >
        <option value="">{required ? `Select ${label.toLowerCase()}…` : 'None'}</option>
        {options.map((v) => (
          <option key={v.id} value={v.id}>
            [{v.code}] {v.text || v.code}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
    </label>
  )
}

export function ChartDataMapper({
  chartType,
  variables,
  slots,
  onSlotChange,
  disabled,
}: Props) {
  const slotDefs = useMemo(() => chartSlotDefs(chartType), [chartType])

  const excludeFor = (slot: ChartSlotId): string[] => {
    const ids: string[] = []
    if (slot !== 'value' && slots.value) ids.push(slots.value)
    if (slot !== 'y' && slots.y) ids.push(slots.y)
    if (slot !== 'z' && slots.z) ids.push(slots.z)
    if (slot !== 'banner' && slots.banner) ids.push(slots.banner)
    return ids
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Data mapping</p>
        <span className="text-[10px] text-slate-400">
          {slotDefs.filter((s) => s.required).length} required ·{' '}
          {slotDefs.filter((s) => s.required && slots[s.id]).length} set
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {slotDefs.map((def) => (
          <SlotSelect
            key={def.id}
            label={def.label}
            hint={def.hint}
            required={def.required}
            value={slots[def.id]}
            options={variablesForChartSlot(chartType, def.id, variables, excludeFor(def.id))}
            onChange={(id) => onSlotChange(def.id, id)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  )
}
