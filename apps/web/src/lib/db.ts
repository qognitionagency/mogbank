/**
 * Neon data layer — a small chainable query builder over plain PostgreSQL.
 *
 * MogBank's database is Neon. This module gives the API routes a fluent way to
 * express ordinary reads and writes, compiling each chain into one
 * parameterised SQL statement executed over Neon's stateless HTTP driver.
 *
 * Anything that moves money does NOT go through here — see `@/lib/ledger`,
 * where each operation is a single guarded statement so it cannot interleave
 * badly with a concurrent one.
 *
 * Supported surface (everything `src/app/api` actually calls):
 *   .from(t).select(cols) / .insert(row|rows) / .update(patch) / .delete()
 *   filters:    .eq .neq .gt .gte .lt .lte .like .ilike .in .is .not .or
 *   modifiers:  .order(col, { ascending }) .limit(n) .range(from, to)
 *   terminals:  .single() .maybeSingle() and plain `await` (thenable)
 *   embeds:     'alias:fk_column(cols)' and 'table!inner(*)'
 *   .rpc(name, args)
 *
 * Semantics deliberately match PostgREST where routes depend on them:
 *   - every call resolves to `{ data, error }` and never throws
 *   - `.single()` on zero rows yields `error.code === 'PGRST116'`, data null
 *   - bigint and numeric come back as JS numbers, not strings, because routes
 *     do arithmetic on balances
 *   - timestamps come back as ISO-8601 strings, as PostgREST serialises them
 *
 * Identifiers are validated against the live schema (information_schema) and
 * quoted; values are always bound as parameters. Nothing from a request body
 * reaches the SQL text.
 */

import { neon, types as pgTypes } from '@neondatabase/serverless'

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

const PG_INT8 = 20
const PG_NUMERIC = 1700
const PG_TIMESTAMP = 1114
const PG_TIMESTAMPTZ = 1184

/**
 * Normalise the types the routes are sensitive to.
 * node-postgres hands back int8/numeric as strings and timestamps as Date
 * objects; both would break route arithmetic or change response payloads.
 */
const typeParsers = {
  getTypeParser(oid: number, format?: unknown) {
    if (oid === PG_INT8 || oid === PG_NUMERIC) {
      return (value: string | null) => (value === null ? null : Number(value))
    }
    if (oid === PG_TIMESTAMPTZ || oid === PG_TIMESTAMP) {
      return (value: string | null) => {
        if (value === null) return null
        const iso = oid === PG_TIMESTAMP ? `${value}Z` : value
        const parsed = new Date(iso)
        return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (pgTypes as any).getTypeParser(oid, format)
  },
}

type SqlExecutor = (
  strings: string,
  params: unknown[]
) => Promise<Record<string, unknown>[]>

let _sql: SqlExecutor | undefined

function connectionString(): string {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.NEON_DATABASE_URL
  if (!url) {
    throw new Error(
      'Missing env.DATABASE_URL — set the Neon connection string in Vercel Environment Variables'
    )
  }
  return url
}

function getSql(): SqlExecutor {
  if (!_sql) {
    const client = neon(connectionString())
    // The driver only honours `types` when passed per call, not on neon().
    _sql = (text, params) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).query(text, params, {
        types: typeParsers,
      }) as Promise<Record<string, unknown>[]>
  }
  return _sql
}

/** Escape hatch for callers that want raw SQL (health checks, migrations). */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  return (await getSql()(text, params)) as T[]
}

// ---------------------------------------------------------------------------
// Schema introspection
// ---------------------------------------------------------------------------

interface ColumnMeta {
  /** e.g. 'int8', 'jsonb', '_text', 'uuid' */
  udtName: string
  isArray: boolean
  isJson: boolean
}

interface ForeignKey {
  /** local column holding the reference */
  column: string
  /** referenced table */
  table: string
  /** referenced column */
  references: string
}

interface ChildLink {
  /** the child table holding the reference */
  table: string
  /** the child's column pointing back at us */
  column: string
  /** our column the child points at */
  references: string
}

interface TableMeta {
  columns: Map<string, ColumnMeta>
  /** local column -> foreign key (many-to-one embeds) */
  byColumn: Map<string, ForeignKey>
  /** referenced table -> foreign key (first one wins) */
  byTable: Map<string, ForeignKey>
  /** child table -> the link back to us (one-to-many embeds) */
  children: Map<string, ChildLink>
}

let _schema: Promise<Map<string, TableMeta>> | undefined

async function loadSchema(): Promise<Map<string, TableMeta>> {
  const sql = getSql()

  const columns = (await sql(
    `SELECT table_name, column_name, udt_name
       FROM information_schema.columns
      WHERE table_schema = 'public'`,
    []
  )) as { table_name: string; column_name: string; udt_name: string }[]

  const fks = (await sql(
    `SELECT tc.table_name        AS table_name,
            kcu.column_name      AS column_name,
            ccu.table_name       AS foreign_table,
            ccu.column_name      AS foreign_column
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
        AND kcu.table_schema    = tc.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema    = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema    = 'public'`,
    []
  )) as {
    table_name: string
    column_name: string
    foreign_table: string
    foreign_column: string
  }[]

  const schema = new Map<string, TableMeta>()
  const tableFor = (name: string): TableMeta => {
    let meta = schema.get(name)
    if (!meta) {
      meta = {
        columns: new Map(),
        byColumn: new Map(),
        byTable: new Map(),
        children: new Map(),
      }
      schema.set(name, meta)
    }
    return meta
  }

  for (const col of columns) {
    tableFor(col.table_name).columns.set(col.column_name, {
      udtName: col.udt_name,
      isArray: col.udt_name.startsWith('_'),
      isJson: col.udt_name === 'json' || col.udt_name === 'jsonb',
    })
  }

  for (const fk of fks) {
    const meta = tableFor(fk.table_name)
    const entry: ForeignKey = {
      column: fk.column_name,
      table: fk.foreign_table,
      references: fk.foreign_column,
    }
    meta.byColumn.set(fk.column_name, entry)
    if (!meta.byTable.has(fk.foreign_table)) {
      meta.byTable.set(fk.foreign_table, entry)
    }

    // Record the reverse direction so the parent can embed its children.
    const parent = tableFor(fk.foreign_table)
    if (!parent.children.has(fk.table_name)) {
      parent.children.set(fk.table_name, {
        table: fk.table_name,
        column: fk.column_name,
        references: fk.foreign_column,
      })
    }
  }

  return schema
}

function getSchema(): Promise<Map<string, TableMeta>> {
  if (!_schema) {
    _schema = loadSchema().catch((err) => {
      // Do not cache a failed load — the next request should retry.
      _schema = undefined
      throw err
    })
  }
  return _schema
}

// ---------------------------------------------------------------------------
// SQL fragment helpers
// ---------------------------------------------------------------------------

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

function quoteIdent(name: string): string {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`)
  }
  return `"${name}"`
}

/** Render a JS array as a PostgreSQL array literal (for text[] columns). */
function arrayLiteral(values: unknown[]): string {
  const parts = values.map((v) => {
    if (v === null || v === undefined) return 'NULL'
    return `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  })
  return `{${parts.join(',')}}`
}

/** Collects bind parameters and renders `$n` placeholders with the right cast. */
class Params {
  readonly values: unknown[] = []

  bind(value: unknown, column?: ColumnMeta): string {
    if (column?.isArray) {
      const arr = Array.isArray(value) ? value : value == null ? [] : [value]
      this.values.push(arrayLiteral(arr))
      return `$${this.values.length}::${column.udtName.slice(1)}[]`
    }
    if (column?.isJson) {
      this.values.push(value === undefined ? null : JSON.stringify(value))
      return `$${this.values.length}::${column.udtName}`
    }
    this.values.push(value === undefined ? null : value)
    return `$${this.values.length}`
  }
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

type FilterOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'ilike'
  | 'in'
  | 'is'

interface Filter {
  kind: 'cmp' | 'or'
  column?: string
  op?: FilterOp
  value?: unknown
  negate?: boolean
  /** for kind === 'or': the alternatives, all comparisons */
  alternatives?: Filter[]
}

const SQL_OPERATOR: Record<FilterOp, string> = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'LIKE',
  ilike: 'ILIKE',
  in: 'IN',
  is: 'IS',
}

function renderComparison(
  filter: Filter,
  meta: TableMeta,
  params: Params,
  alias: string
): string {
  const column = filter.column as string
  if (!meta.columns.has(column)) {
    throw new Error(`Unknown column ${column}`)
  }
  const columnMeta = meta.columns.get(column)
  const lhs = `${alias}.${quoteIdent(column)}`
  const op = filter.op as FilterOp

  if (op === 'is') {
    const literal =
      filter.value === null || filter.value === undefined
        ? 'NULL'
        : filter.value === true
          ? 'TRUE'
          : filter.value === false
            ? 'FALSE'
            : null
    if (literal === null) {
      throw new Error(`.is() accepts only null/true/false, got ${filter.value}`)
    }
    return `${lhs} IS ${filter.negate ? 'NOT ' : ''}${literal}`
  }

  if (op === 'in') {
    const list = (filter.value as unknown[]) ?? []
    if (list.length === 0) return filter.negate ? 'TRUE' : 'FALSE'
    const placeholders = list.map((v) => params.bind(v)).join(', ')
    return `${lhs} ${filter.negate ? 'NOT IN' : 'IN'} (${placeholders})`
  }

  // Arrays and JSON are compared as whole values; scalars bind plainly.
  const rhs = params.bind(
    filter.value,
    columnMeta?.isArray || columnMeta?.isJson ? columnMeta : undefined
  )
  const expr = `${lhs} ${SQL_OPERATOR[op]} ${rhs}`
  return filter.negate ? `NOT (${expr})` : expr
}

function renderFilters(
  filters: Filter[],
  meta: TableMeta,
  params: Params,
  alias: string
): string {
  if (filters.length === 0) return ''
  const clauses = filters.map((filter) => {
    if (filter.kind === 'or') {
      const alts = (filter.alternatives ?? []).map((alt) =>
        renderComparison(alt, meta, params, alias)
      )
      return alts.length ? `(${alts.join(' OR ')})` : 'TRUE'
    }
    return renderComparison(filter, meta, params, alias)
  })
  return ` WHERE ${clauses.join(' AND ')}`
}

/**
 * Parse the `.or()` string form: `col.op.value,col2.op.value`.
 * Only the comparison operators the routes use are accepted.
 */
function parseOr(expression: string): Filter[] {
  return expression.split(',').map((term) => {
    const first = term.indexOf('.')
    const second = term.indexOf('.', first + 1)
    if (first < 0 || second < 0) {
      throw new Error(`Malformed .or() term: ${term}`)
    }
    const column = term.slice(0, first).trim()
    const op = term.slice(first + 1, second).trim() as FilterOp
    const raw = term.slice(second + 1).trim()
    if (!(op in SQL_OPERATOR)) {
      throw new Error(`Unsupported operator in .or(): ${op}`)
    }
    const value =
      raw === 'null' ? null : raw === 'true' ? true : raw === 'false' ? false : raw
    return { kind: 'cmp' as const, column, op, value }
  })
}

// ---------------------------------------------------------------------------
// Select list parsing (including related-resource embedding)
// ---------------------------------------------------------------------------

interface Embed {
  /** key the embedded resource appears under in the result row */
  alias: string
  /** columns to pull from the embedded table, or ['*'] */
  columns: string[]
  /** whether a missing match should exclude the parent row */
  inner: boolean
  /**
   * 'one'  — this table holds the FK, so the embed is a single object or null
   * 'many' — the other table holds the FK, so the embed is an array
   * following the direction of the foreign key.
   */
  cardinality: 'one' | 'many'
  /** table being embedded */
  table: string
  /** join predicate: parent.parentColumn = child.childColumn */
  parentColumn: string
  childColumn: string
}

interface SelectList {
  columns: string[]
  embeds: Embed[]
}

/** Split on commas that are not inside parentheses. */
function splitTopLevel(input: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of input) {
    if (char === '(') depth++
    else if (char === ')') depth--
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) parts.push(current)
  return parts.map((p) => p.trim()).filter(Boolean)
}

function parseSelect(spec: string, meta: TableMeta, table: string): SelectList {
  const result: SelectList = { columns: [], embeds: [] }

  for (const part of splitTopLevel(spec)) {
    const paren = part.indexOf('(')
    if (paren < 0) {
      if (part !== '*' && !meta.columns.has(part)) {
        throw new Error(`Unknown column ${part} on ${table}`)
      }
      result.columns.push(part)
      continue
    }

    const head = part.slice(0, paren).trim()
    const body = part.slice(paren + 1, part.lastIndexOf(')'))
    const inner = head.endsWith('!inner')
    const target = inner ? head.slice(0, -'!inner'.length).trim() : head

    // `alias:fk_column(...)` names the local column explicitly; `table(...)`
    // names the other table and the relationship is resolved from the keys.
    const colon = target.indexOf(':')
    const alias = colon >= 0 ? target.slice(0, colon).trim() : target
    const relation = colon >= 0 ? target.slice(colon + 1).trim() : target

    const parentFk = meta.byColumn.get(relation) ?? meta.byTable.get(relation)
    const childLink = meta.children.get(relation)

    if (parentFk) {
      result.embeds.push({
        alias,
        columns: splitTopLevel(body),
        inner,
        cardinality: 'one',
        table: parentFk.table,
        parentColumn: parentFk.column,
        childColumn: parentFk.references,
      })
    } else if (childLink) {
      result.embeds.push({
        alias,
        columns: splitTopLevel(body),
        inner,
        cardinality: 'many',
        table: childLink.table,
        parentColumn: childLink.references,
        childColumn: childLink.column,
      })
    } else {
      throw new Error(`Cannot resolve embedded resource "${target}" on ${table}`)
    }
  }

  if (result.columns.length === 0 && result.embeds.length === 0) {
    result.columns.push('*')
  }
  return result
}

function renderSelectList(
  select: SelectList,
  meta: TableMeta,
  alias: string
): { list: string; joinConditions: string[] } {
  const pieces = select.columns.map((col) =>
    col === '*' ? `${alias}.*` : `${alias}.${quoteIdent(col)}`
  )
  const joinConditions: string[] = []

  for (const embed of select.embeds) {
    const targetTable = quoteIdent(embed.table)
    const joinOn =
      `e.${quoteIdent(embed.childColumn)} = ` +
      `${alias}.${quoteIdent(embed.parentColumn)}`
    const projection =
      embed.columns.length === 1 && embed.columns[0] === '*'
        ? 'e.*'
        : embed.columns.map((c) => `e.${quoteIdent(c)}`).join(', ')
    const rows = `SELECT ${projection} FROM ${targetTable} e WHERE ${joinOn}`

    // A many-to-one embed yields a single object (or null); a one-to-many
    // embed yields an array, empty rather than null.
    pieces.push(
      embed.cardinality === 'one'
        ? `(SELECT to_jsonb(sub) FROM (${rows}) sub) AS ${quoteIdent(embed.alias)}`
        : `COALESCE((SELECT jsonb_agg(to_jsonb(sub)) FROM (${rows}) sub),` +
          ` '[]'::jsonb) AS ${quoteIdent(embed.alias)}`
    )

    if (embed.inner) {
      joinConditions.push(
        `EXISTS (SELECT 1 FROM ${targetTable} e WHERE ${joinOn})`
      )
    }
  }

  void meta
  return { list: pieces.join(', '), joinConditions }
}

// ---------------------------------------------------------------------------
// Query builder
// ---------------------------------------------------------------------------

export interface PostgrestError {
  message: string
  code: string
  details: string | null
  hint: string | null
}

export interface Result<T> {
  data: T
  error: PostgrestError | null
  count?: number | null
  status: number
}

/**
 * Rows are intentionally loose: the routes index freely into results and do
 * arithmetic on them. Tightening this is a worthwhile follow-up, but it
 * belongs with generated schema types rather than here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

function toError(err: unknown, code = 'DB_ERROR'): PostgrestError {
  const e = err as { message?: string; code?: string; detail?: string }
  return {
    message: e?.message ?? String(err),
    code: e?.code ?? code,
    details: e?.detail ?? null,
    hint: null,
  }
}

const NOT_FOUND: PostgrestError = {
  message: 'JSON object requested, multiple (or no) rows returned',
  code: 'PGRST116',
  details: 'The result contains 0 rows',
  hint: null,
}

type Mode = 'select' | 'insert' | 'update' | 'delete'

class QueryBuilder<T = any[]> implements PromiseLike<Result<T>> {
  private mode: Mode = 'select'
  private selectSpec: string | null = null
  private payload: Row[] = []
  private patch: Row = {}
  private filters: Filter[] = []
  private orderBy: { column: string; ascending: boolean }[] = []
  private limitTo: number | null = null
  private offsetBy = 0
  private rowMode: 'many' | 'single' | 'maybeSingle' = 'many'

  private readonly table: string

  constructor(table: string) {
    this.table = table
  }

  // -- verbs ---------------------------------------------------------------

  select(spec = '*'): this {
    this.selectSpec = spec
    return this
  }

  insert(values: Row | Row[]): this {
    this.mode = 'insert'
    this.payload = Array.isArray(values) ? values : [values]
    this.selectSpec = null
    return this
  }

  update(patch: Row): this {
    this.mode = 'update'
    this.patch = patch
    this.selectSpec = null
    return this
  }

  delete(): this {
    this.mode = 'delete'
    this.selectSpec = null
    return this
  }

  // -- filters -------------------------------------------------------------

  private cmp(column: string, op: FilterOp, value: unknown, negate = false): this {
    this.filters.push({ kind: 'cmp', column, op, value, negate })
    return this
  }

  eq(column: string, value: unknown) {
    return this.cmp(column, 'eq', value)
  }
  neq(column: string, value: unknown) {
    return this.cmp(column, 'neq', value)
  }
  gt(column: string, value: unknown) {
    return this.cmp(column, 'gt', value)
  }
  gte(column: string, value: unknown) {
    return this.cmp(column, 'gte', value)
  }
  lt(column: string, value: unknown) {
    return this.cmp(column, 'lt', value)
  }
  lte(column: string, value: unknown) {
    return this.cmp(column, 'lte', value)
  }
  like(column: string, value: string) {
    return this.cmp(column, 'like', value)
  }
  ilike(column: string, value: string) {
    return this.cmp(column, 'ilike', value)
  }
  in(column: string, values: unknown[]) {
    return this.cmp(column, 'in', values)
  }
  is(column: string, value: null | boolean) {
    return this.cmp(column, 'is', value)
  }

  not(column: string, op: FilterOp, value: unknown) {
    return this.cmp(column, op, value, true)
  }

  or(expression: string): this {
    this.filters.push({ kind: 'or', alternatives: parseOr(expression) })
    return this
  }

  filter(column: string, op: FilterOp, value: unknown) {
    return this.cmp(column, op, value)
  }

  match(criteria: Row): this {
    for (const [column, value] of Object.entries(criteria)) {
      this.cmp(column, 'eq', value)
    }
    return this
  }

  // -- modifiers -----------------------------------------------------------

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderBy.push({ column, ascending: options?.ascending !== false })
    return this
  }

  limit(count: number): this {
    this.limitTo = count
    return this
  }

  range(from: number, to: number): this {
    this.offsetBy = from
    this.limitTo = to - from + 1
    return this
  }

  // -- terminals -----------------------------------------------------------

  single(): QueryBuilder<any> {
    this.rowMode = 'single'
    return this as QueryBuilder<any>
  }

  maybeSingle(): QueryBuilder<any> {
    this.rowMode = 'maybeSingle'
    return this as QueryBuilder<any>
  }

  then<R1 = Result<T>, R2 = never>(
    onfulfilled?: ((value: Result<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected)
  }

  // -- execution -----------------------------------------------------------

  private async run(): Promise<Result<T>> {
    try {
      const schema = await getSchema()
      const meta = schema.get(this.table)
      if (!meta) throw new Error(`Unknown table ${this.table}`)

      const { text, params } = this.compile(meta)
      const rows = await getSql()(text, params.values)
      return this.shape(rows)
    } catch (err) {
      return {
        data: (this.rowMode === 'many' ? null : null) as T,
        error: toError(err),
        count: null,
        status: 500,
      }
    }
  }

  private shape(rows: Row[]): Result<T> {
    if (this.rowMode === 'many') {
      return { data: rows as T, error: null, count: rows.length, status: 200 }
    }
    if (rows.length === 1) {
      return { data: rows[0] as T, error: null, count: 1, status: 200 }
    }
    if (rows.length === 0 && this.rowMode === 'maybeSingle') {
      return { data: null as T, error: null, count: 0, status: 200 }
    }
    return {
      data: null as T,
      error:
        rows.length === 0
          ? NOT_FOUND
          : {
              ...NOT_FOUND,
              details: `The result contains ${rows.length} rows`,
            },
      count: rows.length,
      status: 406,
    }
  }

  private compile(meta: TableMeta): { text: string; params: Params } {
    const params = new Params()
    const table = quoteIdent(this.table)
    const alias = 't'

    switch (this.mode) {
      case 'select': {
        const select = parseSelect(this.selectSpec ?? '*', meta, this.table)
        const { list, joinConditions } = renderSelectList(select, meta, alias)
        let text = `SELECT ${list} FROM ${table} ${alias}`
        const where = renderFilters(this.filters, meta, params, alias)
        if (where && joinConditions.length) {
          text += `${where} AND ${joinConditions.join(' AND ')}`
        } else if (where) {
          text += where
        } else if (joinConditions.length) {
          text += ` WHERE ${joinConditions.join(' AND ')}`
        }
        text += this.renderOrderLimit(meta, alias)
        return { text, params }
      }

      case 'insert': {
        if (this.payload.length === 0) {
          throw new Error('insert() requires at least one row')
        }
        // A bulk insert needs one uniform column list, so take the union of
        // the rows' keys. A row that omits a key must fall through to the
        // column DEFAULT, not NULL — callers legitimately supply an explicit
        // `id` on one row and let the sequence fill it on the next, and NULL
        // would violate the primary key. An explicit `undefined` still means
        // NULL, matching how the value would serialise over the wire.
        const columns = [
          ...new Set(this.payload.flatMap((row) => Object.keys(row))),
        ]
        for (const column of columns) {
          if (!meta.columns.has(column)) {
            throw new Error(`Unknown column ${column} on ${this.table}`)
          }
        }
        const tuples = this.payload.map((row) => {
          const bound = columns.map((column) =>
            column in row
              ? params.bind(row[column], meta.columns.get(column))
              : 'DEFAULT'
          )
          return `(${bound.join(', ')})`
        })
        const text =
          `INSERT INTO ${table} (${columns.map(quoteIdent).join(', ')})` +
          ` VALUES ${tuples.join(', ')}` +
          this.renderReturning(meta, alias)
        return { text, params }
      }

      case 'update': {
        const entries = Object.entries(this.patch)
        if (entries.length === 0) throw new Error('update() requires a payload')
        const assignments = entries.map(([column, value]) => {
          if (!meta.columns.has(column)) {
            throw new Error(`Unknown column ${column} on ${this.table}`)
          }
          return `${quoteIdent(column)} = ${params.bind(
            value,
            meta.columns.get(column)
          )}`
        })
        const text =
          `UPDATE ${table} ${alias} SET ${assignments.join(', ')}` +
          renderFilters(this.filters, meta, params, alias) +
          this.renderReturning(meta, alias)
        return { text, params }
      }

      case 'delete': {
        const text =
          `DELETE FROM ${table} ${alias}` +
          renderFilters(this.filters, meta, params, alias) +
          this.renderReturning(meta, alias)
        return { text, params }
      }
    }
  }

  private renderOrderLimit(meta: TableMeta, alias: string): string {
    let text = ''
    if (this.orderBy.length) {
      const terms = this.orderBy.map(({ column, ascending }) => {
        if (!meta.columns.has(column)) {
          throw new Error(`Unknown column ${column} on ${this.table}`)
        }
        return `${alias}.${quoteIdent(column)} ${ascending ? 'ASC' : 'DESC'}`
      })
      text += ` ORDER BY ${terms.join(', ')}`
    }
    if (this.limitTo !== null) text += ` LIMIT ${Number(this.limitTo) | 0}`
    if (this.offsetBy) text += ` OFFSET ${Number(this.offsetBy) | 0}`
    return text
  }

  /**
   * Mutations only return rows when the caller chained `.select()`, matching
   * an explicit request to return the affected rows.
   */
  private renderReturning(meta: TableMeta, alias: string): string {
    if (this.selectSpec === null) return ''
    const select = parseSelect(this.selectSpec, meta, this.table)
    if (select.embeds.length) {
      throw new Error('Resource embedding is not supported on mutations')
    }
    const list = select.columns
      .map((col) => (col === '*' ? '*' : quoteIdent(col)))
      .join(', ')
    void alias
    return ` RETURNING ${list}`
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class NeonClient {
  from(table: string): QueryBuilder {
    return new QueryBuilder(table)
  }

  /** Call a PostgreSQL function. */
  async rpc(fn: string, args: Row = {}): Promise<Result<unknown>> {
    try {
      const params = new Params()
      const named = Object.entries(args).map(
        ([key, value]) => `${quoteIdent(key)} => ${params.bind(value)}`
      )
      const rows = await getSql()(
        `SELECT * FROM ${quoteIdent(fn)}(${named.join(', ')}) AS result`,
        params.values
      )
      const data =
        rows.length === 1 && Object.keys(rows[0]).length === 1
          ? Object.values(rows[0])[0]
          : rows
      return { data, error: null, count: rows.length, status: 200 }
    } catch (err) {
      return { data: null, error: toError(err), count: null, status: 500 }
    }
  }
}

/** The HTTP driver is stateless, so a client is just a handle — cheap to make. */
export function createClient(): NeonClient {
  return new NeonClient()
}

/**
 * Server-side client used by the API routes for every read and write.
 *
 * The database has no public surface: it is only ever reached from server-side
 * route handlers over the pooled owner connection. Row scoping is therefore
 * enforced in the handlers — see `@/lib/auth`.
 *
 * WARNING: never expose this client, or the connection string, to the browser.
 */
export function createServerClient(): NeonClient {
  return createClient()
}
