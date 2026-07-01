/**
 * Smart scoped merging — deep-copy survey assets with Qcode collision resolution.
 */

import type { EtBlock, EtQuestion, EtSurveyDefinition } from '../../api/client'
import { extractExpressionsFromAsset } from './cloneHelpers'
import { qcodeIndex, type SurveyAsset, type SurveySchema } from './types'

const RESERVED = new Set(['if', 'sum', 'count', 'rand', 'and', 'or', 'not', 'true', 'false'])

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function remapExpression(expr: string, mapping: Record<string, string>): string {
  let out = expr
  const keys = Object.keys(mapping).sort((a, b) => b.length - a.length)
  for (const oldCode of keys) {
    const re = new RegExp(`\\b${oldCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
    out = out.replace(re, mapping[oldCode])
  }
  return out
}

function cloneQuestion(q: EtQuestion, codeMap: Record<string, string>): EtQuestion {
  const next: EtQuestion = {
    ...structuredClone(q),
    id: newId('q'),
    code: codeMap[q.code] ?? q.code,
  }
  if (next.relevance_equation) next.relevance_equation = remapExpression(next.relevance_equation, codeMap)
  if (next.validation_equation) next.validation_equation = remapExpression(next.validation_equation, codeMap)
  if (next.equation) next.equation = remapExpression(next.equation, codeMap)
  if (next.text) next.text = remapExpression(next.text, codeMap)
  return next
}

function buildCodeMap(
  incomingCodes: string[],
  targetSchema: SurveySchema,
  suffix = '_copied',
): { mapping: Record<string, string>; strippedRefs: string[] } {
  const existing = qcodeIndex(targetSchema)
  const mapping: Record<string, string> = {}
  const strippedRefs: string[] = []

  for (const code of incomingCodes) {
    let candidate = code
    let n = 1
    while (existing.has(candidate) || Object.values(mapping).includes(candidate)) {
      candidate = `${code}${suffix}${n > 1 ? n : ''}`
      n++
    }
    if (candidate !== code) mapping[code] = candidate
  }
  return { mapping, strippedRefs }
}

function stripExternalRefs(
  asset: EtQuestion | EtBlock,
  scopeCodes: Set<string>,
): EtQuestion | EtBlock {
  const clone = structuredClone(asset)
  const fields = ['relevance_equation', 'validation_equation', 'equation', 'text'] as const
  for (const field of fields) {
    const val = (clone as unknown as Record<string, unknown>)[field]
    if (typeof val !== 'string' || !val.trim()) continue
    const ids = val.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g) ?? []
    const external = ids.filter((id) => !scopeCodes.has(id) && !RESERVED.has(id))
    if (external.length) {
      if (field === 'relevance_equation' || field === 'validation_equation') {
        ;(clone as unknown as Record<string, unknown>)[field] = ''
      }
    }
  }
  return clone
}

/**
 * Deep-copy a question, block, or full survey into a target schema context.
 * Renames conflicting Qcodes and rewrites internal ExpressionScript references.
 */
export function cloneSurveyAsset(
  asset: SurveyAsset,
  targetSchema: SurveySchema,
): SurveyAsset {
  if (asset.kind === 'question') {
    const question = asset.payload as EtQuestion
    const scope = new Set([question.code])
    const cleaned = stripExternalRefs(question, scope) as EtQuestion
    const { mapping } = buildCodeMap([cleaned.code], targetSchema)
    const cloned = cloneQuestion(cleaned, mapping)
    return { ...asset, id: newId('asset'), payload: cloned }
  }

  if (asset.kind === 'block') {
    const block = asset.payload as EtBlock
    const codes = block.questions.map((q) => q.code)
    const scope = new Set(codes)
    const { mapping } = buildCodeMap(codes, targetSchema)
    const nextBlock: EtBlock = {
      ...structuredClone(block),
      id: newId('block'),
      title: `${block.title} (copy)`,
      questions: block.questions.map((q) => {
        const scoped = stripExternalRefs(q, scope) as EtQuestion
        return cloneQuestion(scoped, mapping)
      }),
    }
    if (nextBlock.relevance_equation) {
      nextBlock.relevance_equation = remapExpression(nextBlock.relevance_equation, mapping)
    }
    return { ...asset, id: newId('asset'), payload: nextBlock }
  }

  if (asset.kind === 'survey') {
    const survey = asset.payload as EtSurveyDefinition
    const codes = survey.blocks.flatMap((b) => b.questions.map((q) => q.code))
    const scope = new Set(codes)
    const { mapping } = buildCodeMap(codes, targetSchema)
    const next: EtSurveyDefinition = {
      ...structuredClone(survey),
      version: survey.version,
      blocks: survey.blocks.map((b) => {
        const nb: EtBlock = {
          ...b,
          id: newId('block'),
          questions: b.questions.map((q) => cloneQuestion(stripExternalRefs(q, scope) as EtQuestion, mapping)),
        }
        if (nb.relevance_equation) nb.relevance_equation = remapExpression(nb.relevance_equation, mapping)
        return nb
      }),
    }
    return { ...asset, id: newId('asset'), payload: next }
  }

  return structuredClone(asset)
}

/** Merge cloned asset into target schema (returns new schema). */
export function mergeAssetIntoSchema(
  targetSchema: SurveySchema,
  asset: SurveyAsset,
): SurveySchema {
  const cloned = cloneSurveyAsset(asset, targetSchema)
  const next = structuredClone(targetSchema)
  if (cloned.kind === 'question') {
    const q = cloned.payload as EtQuestion
    const lastBlock = next.blocks[next.blocks.length - 1]
    if (lastBlock) {
      lastBlock.questions.push({ ...q, sort_order: lastBlock.questions.length })
    } else {
      next.blocks.push({
        id: newId('block'),
        title: 'Imported',
        sort_order: 0,
        questions: [{ ...q, sort_order: 0 }],
      })
    }
    return next
  }
  if (cloned.kind === 'block') {
    const b = cloned.payload as EtBlock
    next.blocks.push({ ...b, sort_order: next.blocks.length })
    return next
  }
  if (cloned.kind === 'survey') {
    const s = cloned.payload as EtSurveyDefinition
    for (const b of s.blocks) {
      next.blocks.push({ ...b, sort_order: next.blocks.length })
    }
    return next
  }
  return next
}

export function listExternalReferences(asset: SurveyAsset): string[] {
  const exprs = extractExpressionsFromAsset(asset)
  const scope = new Set<string>()
  if (asset.kind === 'question') scope.add((asset.payload as EtQuestion).code)
  if (asset.kind === 'block') {
    for (const q of (asset.payload as EtBlock).questions) scope.add(q.code)
  }
  if (asset.kind === 'survey') {
    for (const b of (asset.payload as EtSurveyDefinition).blocks) {
      for (const q of b.questions) scope.add(q.code)
    }
  }
  const external = new Set<string>()
  for (const expr of exprs) {
    for (const id of expr.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g) ?? []) {
      if (!scope.has(id) && !['if', 'sum', 'count', 'rand', 'and', 'or', 'not', 'true', 'false'].includes(id)) {
        external.add(id)
      }
    }
  }
  return [...external]
}
