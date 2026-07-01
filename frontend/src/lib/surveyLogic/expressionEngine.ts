/**
 * ExpressionScript evaluator — tokenizer/parser for survey logic and micro-tailoring.
 * Supports: == != && || and or not > < >= <= + - * /
 * Functions: if(), sum(), count(), rand(), array_filter()
 */

import type { EvaluationContext } from './types'

export class ExpressionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExpressionError'
  }
}

type TokenType =
  | 'number'
  | 'string'
  | 'identifier'
  | 'operator'
  | 'paren'
  | 'comma'
  | 'eof'

interface Token {
  type: TokenType
  value: string
  pos: number
}

const RESERVED_WORDS = new Set([
  'if',
  'sum',
  'count',
  'rand',
  'array_filter',
  'and',
  'or',
  'not',
  'true',
  'false',
])

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const s = input.trim()
  while (i < s.length) {
    const ch = s[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (ch === '"' || ch === "'") {
      const quote = ch
      let j = i + 1
      let value = ''
      while (j < s.length && s[j] !== quote) {
        if (s[j] === '\\' && j + 1 < s.length) {
          value += s[j + 1]
          j += 2
        } else {
          value += s[j]
          j++
        }
      }
      if (j >= s.length) throw new ExpressionError(`Unterminated string at ${i}`)
      tokens.push({ type: 'string', value, pos: i })
      i = j + 1
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < s.length && /[0-9.]/.test(s[j])) j++
      tokens.push({ type: 'number', value: s.slice(i, j), pos: i })
      i = j
      continue
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i
      while (j < s.length && /[a-zA-Z0-9_]/.test(s[j])) j++
      tokens.push({ type: 'identifier', value: s.slice(i, j), pos: i })
      i = j
      continue
    }
    const two = s.slice(i, i + 2)
    const three = s.slice(i, i + 3)
    if (['==', '!=', '>=', '<=', '&&', '||'].includes(two)) {
      tokens.push({ type: 'operator', value: two, pos: i })
      i += 2
      continue
    }
    if (['and', 'or', 'not'].includes(three)) {
      tokens.push({ type: 'identifier', value: three, pos: i })
      i += 3
      continue
    }
    if ('+-*/<>=!'.includes(ch)) {
      tokens.push({ type: 'operator', value: ch, pos: i })
      i++
      continue
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch, pos: i })
      i++
      continue
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ch, pos: i })
      i++
      continue
    }
    throw new ExpressionError(`Unexpected character '${ch}' at position ${i}`)
  }
  tokens.push({ type: 'eof', value: '', pos: s.length })
  return tokens
}

type AstNode =
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'identifier'; name: string }
  | { kind: 'unary'; op: string; arg: AstNode }
  | { kind: 'binary'; op: string; left: AstNode; right: AstNode }
  | { kind: 'call'; name: string; args: AstNode[] }

class Parser {
  private tokens: Token[]
  private pos = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  private peek(): Token {
    return this.tokens[this.pos] ?? { type: 'eof', value: '', pos: 0 }
  }

  private consume(): Token {
    return this.tokens[this.pos++] ?? { type: 'eof', value: '', pos: 0 }
  }

  parse(): AstNode {
    const node = this.parseOr()
    if (this.peek().type !== 'eof') {
      throw new ExpressionError(`Unexpected token '${this.peek().value}'`)
    }
    return node
  }

  private parseOr(): AstNode {
    let left = this.parseAnd()
    while (
      (this.peek().type === 'identifier' && this.peek().value === 'or') ||
      (this.peek().type === 'operator' && this.peek().value === '||')
    ) {
      this.consume()
      left = { kind: 'binary', op: '||', left, right: this.parseAnd() }
    }
    return left
  }

  private parseAnd(): AstNode {
    let left = this.parseNot()
    while (
      (this.peek().type === 'identifier' && this.peek().value === 'and') ||
      (this.peek().type === 'operator' && this.peek().value === '&&')
    ) {
      this.consume()
      left = { kind: 'binary', op: '&&', left, right: this.parseNot() }
    }
    return left
  }

  private parseNot(): AstNode {
    if (this.peek().type === 'identifier' && this.peek().value === 'not') {
      this.consume()
      return { kind: 'unary', op: 'not', arg: this.parseNot() }
    }
    if (this.peek().type === 'operator' && this.peek().value === '!') {
      this.consume()
      return { kind: 'unary', op: 'not', arg: this.parseNot() }
    }
    return this.parseComparison()
  }

  private parseComparison(): AstNode {
    let left = this.parseAdd()
    const ops = ['==', '!=', '>=', '<=', '>', '<']
    while (this.peek().type === 'operator' && ops.includes(this.peek().value)) {
      const op = this.consume().value
      left = { kind: 'binary', op, left, right: this.parseAdd() }
    }
    return left
  }

  private parseAdd(): AstNode {
    let left = this.parseMul()
    while (this.peek().type === 'operator' && '+-'.includes(this.peek().value)) {
      const op = this.consume().value
      left = { kind: 'binary', op, left, right: this.parseMul() }
    }
    return left
  }

  private parseMul(): AstNode {
    let left = this.parseUnary()
    while (this.peek().type === 'operator' && '*/'.includes(this.peek().value)) {
      const op = this.consume().value
      left = { kind: 'binary', op, left, right: this.parseUnary() }
    }
    return left
  }

  private parseUnary(): AstNode {
    if (this.peek().type === 'operator' && this.peek().value === '-') {
      this.consume()
      return { kind: 'unary', op: '-', arg: this.parseUnary() }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): AstNode {
    const t = this.peek()
    if (t.type === 'number') {
      this.consume()
      return { kind: 'literal', value: Number(t.value) }
    }
    if (t.type === 'string') {
      this.consume()
      return { kind: 'literal', value: t.value }
    }
    if (t.type === 'identifier') {
      const name = this.consume().value
      if (name === 'true') return { kind: 'literal', value: true }
      if (name === 'false') return { kind: 'literal', value: false }
      if (RESERVED_WORDS.has(name) && this.peek().type !== 'paren') {
        throw new ExpressionError(`Unexpected keyword ${name}`)
      }
      if (this.peek().type === 'paren' && this.peek().value === '(') {
        this.consume()
        const args: AstNode[] = []
        if (!(this.peek().type === 'paren' && this.peek().value === ')')) {
          args.push(this.parseOr())
          while (this.peek().type === 'comma') {
            this.consume()
            args.push(this.parseOr())
          }
        }
        if (!(this.peek().type === 'paren' && this.peek().value === ')')) {
          throw new ExpressionError('Expected closing parenthesis')
        }
        this.consume()
        return { kind: 'call', name, args }
      }
      return { kind: 'identifier', name }
    }
    if (t.type === 'paren' && t.value === '(') {
      this.consume()
      const inner = this.parseOr()
      if (!(this.peek().type === 'paren' && this.peek().value === ')')) {
        throw new ExpressionError('Expected closing parenthesis')
      }
      this.consume()
      return inner
    }
    throw new ExpressionError(`Unexpected token '${t.value}'`)
  }
}

function resolveIdentifier(name: string, ctx: EvaluationContext): unknown {
  if (name in ctx.participant_responses) return ctx.participant_responses[name]
  if (name in ctx.panel_metadata) return ctx.panel_metadata[name]
  if (name in ctx.system_variables) return ctx.system_variables[name]
  return undefined
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  if (v === null || v === undefined || v === '') return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'number') return v !== 0
  return true
}

function evalNode(node: AstNode, ctx: EvaluationContext): unknown {
  switch (node.kind) {
    case 'literal':
      return node.value
    case 'identifier':
      return resolveIdentifier(node.name, ctx)
    case 'unary': {
      const v = evalNode(node.arg, ctx)
      if (node.op === 'not') return !toBool(v)
      if (node.op === '-') return -toNumber(v)
      throw new ExpressionError(`Unknown unary operator ${node.op}`)
    }
    case 'binary': {
      const l = evalNode(node.left, ctx)
      const r = evalNode(node.right, ctx)
      switch (node.op) {
        case '==':
          return String(l) === String(r)
        case '!=':
          return String(l) !== String(r)
        case '>':
          return toNumber(l) > toNumber(r)
        case '<':
          return toNumber(l) < toNumber(r)
        case '>=':
          return toNumber(l) >= toNumber(r)
        case '<=':
          return toNumber(l) <= toNumber(r)
        case '&&':
          return toBool(l) && toBool(r)
        case '||':
          return toBool(l) || toBool(r)
        case '+':
          return toNumber(l) + toNumber(r)
        case '-':
          return toNumber(l) - toNumber(r)
        case '*':
          return toNumber(l) * toNumber(r)
        case '/':
          return toNumber(l) / toNumber(r)
        default:
          throw new ExpressionError(`Unknown operator ${node.op}`)
      }
    }
    case 'call': {
      const args = node.args.map((a) => evalNode(a, ctx))
      switch (node.name) {
        case 'if':
          return toBool(args[0]) ? args[1] : args[2]
        case 'sum':
          return args.reduce<number>((acc, v) => acc + toNumber(v), 0)
        case 'count':
          return args.filter((v) => toBool(v)).length
        case 'rand': {
          const min = toNumber(args[0])
          const max = toNumber(args[1])
          return Math.floor(Math.random() * (max - min + 1)) + min
        }
        case 'array_filter': {
          const arr = args[0]
          if (!Array.isArray(arr)) return []
          const pred = args[1]
          return arr.filter((item) => String(item) === String(pred))
        }
        default:
          throw new ExpressionError(`Unknown function ${node.name}`)
      }
    }
    default:
      throw new ExpressionError('Invalid AST node')
  }
}

/** Evaluate a standalone ExpressionScript expression. */
export function evaluateExpression(
  expression: string,
  context: EvaluationContext | Record<string, unknown>,
): unknown {
  const trimmed = expression.trim()
  if (!trimmed) return true
  const ctx: EvaluationContext =
    'participant_responses' in context
      ? (context as EvaluationContext)
      : {
          participant_responses: context as Record<string, unknown>,
          panel_metadata: {},
          system_variables: {},
        }
  const tokens = tokenize(trimmed)
  const ast = new Parser(tokens).parse()
  return evalNode(ast, ctx)
}

/** Replace `{expression}` placeholders in survey text (micro-tailoring). */
export function interpolateText(template: string, context: EvaluationContext): string {
  return template.replace(/\{([^{}]+)\}/g, (_match, expr: string) => {
    try {
      const result = evaluateExpression(expr.trim(), context)
      if (result === null || result === undefined) return ''
      return String(result)
    } catch {
      return `{${expr}}`
    }
  })
}

/** Return true when relevance expression evaluates truthy (empty = always show). */
export function isRelevant(expression: string | null | undefined, context: EvaluationContext): boolean {
  if (!expression?.trim()) return true
  try {
    return toBool(evaluateExpression(expression, context))
  } catch {
    return false
  }
}
