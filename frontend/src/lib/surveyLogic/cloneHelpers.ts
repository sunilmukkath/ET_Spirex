import type { EtBlock, EtQuestion, EtSurveyDefinition } from '../../api/client'
import type { SurveyAsset } from './types'

export function extractExpressionsFromAsset(asset: SurveyAsset): string[] {
  const exprs: string[] = []
  const push = (s: string | null | undefined) => {
    if (s?.trim()) exprs.push(s.trim())
  }

  if (asset.kind === 'question') {
    const q = asset.payload as EtQuestion
    push(q.relevance_equation)
    push(q.validation_equation)
    push(q.equation)
    for (const m of q.text.matchAll(/\{([^{}]+)\}/g)) push(m[1])
    return exprs
  }

  if (asset.kind === 'block') {
    const b = asset.payload as EtBlock
    push(b.relevance_equation)
    for (const q of b.questions) {
      exprs.push(...extractExpressionsFromAsset({ kind: 'question', id: q.id, name: q.code, payload: q }))
    }
    return exprs
  }

  if (asset.kind === 'survey') {
    const s = asset.payload as EtSurveyDefinition
    for (const b of s.blocks) {
      exprs.push(...extractExpressionsFromAsset({ kind: 'block', id: b.id, name: b.title, payload: b }))
    }
    for (const q of s.quotas ?? []) push(q.expression)
    return exprs
  }

  return exprs
}
