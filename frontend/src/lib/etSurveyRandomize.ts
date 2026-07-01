/** Shuffle items that share the same randomize_code (LimeSurvey-style randomization groups). */

export type Randomizable = {
  sort_order: number
  randomize_code?: string | null
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * Items with the same non-empty randomize_code are shuffled among their original
 * positions; items without a code stay fixed.
 */
export function applyRandomizeOrder<T extends Randomizable>(items: T[]): T[] {
  if (!items.length) return []
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order)
  const byCode = new Map<string, number[]>()
  sorted.forEach((item, idx) => {
    const code = (item.randomize_code ?? '').trim()
    if (!code) return
    const bucket = byCode.get(code) ?? []
    bucket.push(idx)
    byCode.set(code, bucket)
  })

  const result = [...sorted]
  for (const indices of byCode.values()) {
    if (indices.length < 2) continue
    const group = indices.map((i) => sorted[i])
    const shuffled = shuffle(group)
    indices.forEach((idx, i) => {
      result[idx] = shuffled[i]
    })
  }
  return result
}
