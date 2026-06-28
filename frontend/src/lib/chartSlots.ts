import type { SurveyVariable } from '../api/client'
import {
  CHART_TYPES,
  chartTypesForVariable,
  getChartType,
  type ChartTypeId,
} from './chartTypes'
import { scatterAxisVariables } from './chartDataHelpers'

export type ChartSlotId = 'value' | 'y' | 'z' | 'banner'

export interface ChartSlotDef {
  id: ChartSlotId
  label: string
  hint: string
  required: boolean
}

export function chartSlotDefs(chartType: ChartTypeId): ChartSlotDef[] {
  const meta = getChartType(chartType)
  const slots: ChartSlotDef[] = [
    {
      id: 'value',
      label: slotValueLabel(chartType),
      hint: 'Main question mapped to this chart',
      required: true,
    },
  ]

  if (meta?.needsYVariable || chartType === 'combo') {
    slots.push({
      id: 'y',
      label: chartType === 'combo' ? 'Line series' : 'Y axis',
      hint:
        chartType === 'combo'
          ? 'Second question shown as the trend line'
          : 'Second question — one point per respondent',
      required: chartType !== 'bubble',
    })
  }

  if (meta?.needsZVariable) {
    slots.push({
      id: 'z',
      label: 'Bubble size',
      hint: 'Optional third question controls bubble size',
      required: false,
    })
  }

  if (meta?.needsBanner) {
    slots.push({
      id: 'banner',
      label: 'Segment by (banner)',
      hint: 'Break down results by this variable',
      required: true,
    })
  }

  return slots
}

function slotValueLabel(chartType: ChartTypeId): string {
  if (chartType === 'scatter_xy' || chartType === 'bubble') return 'X axis'
  if (chartType === 'combo') return 'Bars (primary)'
  return 'Question'
}

export function variableSupportsChart(variable: SurveyVariable, chartType: ChartTypeId): boolean {
  return chartTypesForVariable(variable, 'all').some((t) => t.id === chartType)
}

export function variablesForChartSlot(
  chartType: ChartTypeId,
  slot: ChartSlotId,
  variables: SurveyVariable[],
  excludeIds: string[] = [],
): SurveyVariable[] {
  const excluded = new Set(excludeIds.filter(Boolean))

  if (slot === 'banner') {
    return variables.filter(
      (v) =>
        !excluded.has(v.id) &&
        v.can_banner &&
        ['single', 'multi'].includes(v.kind),
    )
  }

  if (slot === 'y' || slot === 'z') {
    if (chartType === 'combo') {
      return variables.filter(
        (v) => !excluded.has(v.id) && variableSupportsChart(v, chartType),
      )
    }
    return scatterAxisVariables(variables, [...excludeIds])
  }

  return variables.filter(
    (v) => !excluded.has(v.id) && variableSupportsChart(v, chartType),
  )
}

export function allChartTypesForPicker() {
  return CHART_TYPES
}
