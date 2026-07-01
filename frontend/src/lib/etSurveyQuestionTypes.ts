import type { EtQuestion, EtQuestionType } from '../api/client'

export interface QuestionTypeOption {
  value: EtQuestionType
  label: string
  hint?: string
}

export const QUESTION_TYPE_GROUPS: { title: string; types: QuestionTypeOption[] }[] = [
  {
    title: 'Choice',
    types: [
      { value: 'single', label: 'Single choice', hint: 'Radio list' },
      { value: 'multi', label: 'Multiple choice', hint: 'Checkboxes' },
      { value: 'dropdown', label: 'Dropdown', hint: 'Single select menu' },
      { value: 'yes_no', label: 'Yes / No' },
      { value: 'ranking', label: 'Ranking', hint: 'Rank options in order' },
    ],
  },
  {
    title: 'Scale & grid',
    types: [
      { value: 'scale', label: 'Rating scale', hint: 'Numeric scale buttons' },
      { value: 'matrix', label: 'Matrix grid', hint: 'All rows on one table' },
      { value: 'array_carousel', label: 'Array (carousel)', hint: 'One sub-question at a time' },
    ],
  },
  {
    title: 'Open end',
    types: [
      { value: 'text', label: 'Short text' },
      { value: 'long_text', label: 'Long text' },
      { value: 'numeric', label: 'Numeric' },
      { value: 'email', label: 'Email' },
      { value: 'date', label: 'Date' },
    ],
  },
  {
    title: 'Other',
    types: [{ value: 'display', label: 'Instruction text' }],
  },
]

export const ALL_QUESTION_TYPES = QUESTION_TYPE_GROUPS.flatMap((g) => g.types)

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

export function defaultOptions(count = 2) {
  return Array.from({ length: count }, (_, i) => ({
    code: String(i + 1),
    label: `Option ${i + 1}`,
    sort_order: i,
  }))
}

export function defaultRows(count = 2) {
  return Array.from({ length: count }, (_, i) => ({
    code: `R${i + 1}`,
    label: `Item ${i + 1}`,
    sort_order: i,
  }))
}

export function newQuestion(type: EtQuestionType, index: number): EtQuestion {
  const code = `Q${index}`
  const base: EtQuestion = {
    id: uid('q'),
    code,
    type,
    text: type === 'display' ? 'Instruction text here.' : `Question ${index}`,
    help_text: '',
    required: type !== 'display',
    sort_order: index,
    options: [],
    rows: [],
    scale_min: 1,
    scale_max: 5,
    scale_min_label: '',
    scale_max_label: '',
    allow_other: false,
    other_label: 'Other (please specify)',
    randomize_options: false,
  }

  switch (type) {
    case 'single':
    case 'multi':
    case 'dropdown':
    case 'ranking':
      base.options = defaultOptions(type === 'ranking' ? 4 : 2)
      break
    case 'yes_no':
      base.options = [
        { code: 'Y', label: 'Yes', sort_order: 0 },
        { code: 'N', label: 'No', sort_order: 1 },
      ]
      break
    case 'matrix':
    case 'array_carousel':
      base.rows = defaultRows(3)
      base.options = [
        { code: '1', label: 'Strongly disagree', sort_order: 0 },
        { code: '2', label: 'Disagree', sort_order: 1 },
        { code: '3', label: 'Neutral', sort_order: 2 },
        { code: '4', label: 'Agree', sort_order: 3 },
        { code: '5', label: 'Strongly agree', sort_order: 4 },
      ]
      break
    default:
      break
  }
  return base
}

export function patchQuestionForType(question: EtQuestion, nextType: EtQuestionType): Partial<EtQuestion> {
  const fresh = newQuestion(nextType, question.sort_order || 1)
  return {
    type: nextType,
    options: fresh.options,
    rows: fresh.rows,
    scale_min: fresh.scale_min,
    scale_max: fresh.scale_max,
    required: nextType !== 'display',
    allow_other: nextType === 'single' || nextType === 'multi' || nextType === 'dropdown',
  }
}

export function usesOptions(type: EtQuestionType) {
  return ['single', 'multi', 'dropdown', 'ranking', 'yes_no'].includes(type)
}

export function usesRows(type: EtQuestionType) {
  return type === 'matrix' || type === 'array_carousel'
}

export function usesScale(type: EtQuestionType) {
  return type === 'scale' || type === 'matrix' || type === 'array_carousel'
}

export function usesColumnOptions(type: EtQuestionType) {
  return type === 'matrix' || type === 'array_carousel'
}
