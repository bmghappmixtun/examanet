// @ts-nocheck
/**
 * D1 Admin helper — full CRUD for admin/teacher/invitation operations.
 * 2026-09-03: Replaces the prisma-compat stub for admin routes.
 *
 * Philosophy: thin wrappers around D1 prepared statements, with safeQuery
 * pattern (try/catch + return empty on error). NEVER throws.
 *
 * Models covered: User, Resource, TeacherInvitation, Comment, Rating,
 * Favorite, View, Report, Notification, ErrorLog, ApiProvider,
 * ApiProviderUsage, SearchSynonym, Setting, OtpCode, Session,
 * TeacherFile, TeacherVerificationFile, CloudflareLog, Download, Share,
 * ResourceMetadata, ResourceContent, ResourceSummary, Class, Section,
 * Subject, Level, Newsletter.
 */

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  try {
    const ctx = await getCloudflareContext({ async: true });
    return (ctx as any).env?.DB || null;
  } catch (e) {
    return null;
  }
}

type WhereInput = Record<string, any>;
type SelectInput = Record<string, boolean | { select?: SelectInput }>;

const reservedWords = ['Class', 'Level', 'Order', 'Group', 'User'];

/** Quote a table/column name. D1 reserved words need backticks. */
function q(name: string): string {
  return reservedWords.includes(name) ? `"${name}"` : `"${name}"`;
}

function safeResults(res: any): any[] {
  return res?.results || res || [];
}

function safeFirst(res: any): any {
  const r = safeResults(res);
  return r[0] || null;
}

/** Convert a Date or number/string to Unix ms. Returns null if invalid. */
function toUnixMs(v: any): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return null;
}

// ============================================================
// GENERIC CRUD
// ============================================================

/** findFirst where conditions (uses AND). Returns first match or null. */
export async function findFirst(
  table: string,
  where: WhereInput = {}
): Promise<any | null> {
  const db = await getD1();
  if (!db) return null;
  try {
    const { whereSql, values } = buildWhere(where);
    const sql = `SELECT * FROM ${q(table)} ${whereSql ? 'WHERE ' + whereSql : ''} LIMIT 1`;
    const res: any = await db.prepare(sql).bind(...values).first();
    return res || null;
  } catch (e) {
    console.error(`[d1-admin] findFirst ${table} error:`, e);
    return null;
  }
}

/** findUnique — same as findFirst for D1 (no separate index enforcement). */
export async function findUnique(
  table: string,
  where: WhereInput = {}
): Promise<any | null> {
  return findFirst(table, where);
}

/** findMany with where, optional select, orderBy, take, skip. */
export async function findMany(
  table: string,
  opts: {
    where?: WhereInput;
    select?: SelectInput;
    orderBy?: Record<string, 'asc' | 'desc'>;
    take?: number;
    skip?: number;
  } = {}
): Promise<any[]> {
  const db = await getD1();
  if (!db) return [];
  try {
    const { whereSql, values } = buildWhere(opts.where || {});
    const cols = opts.select ? buildSelectCols(opts.select) : '*';
    let orderSql = '';
    if (opts.orderBy) {
      const parts = Object.entries(opts.orderBy).map(
        ([col, dir]) => `${q(col)} ${dir.toUpperCase()}`
      );
      orderSql = 'ORDER BY ' + parts.join(', ');
    }
    const limitSql = opts.take ? `LIMIT ${parseInt(String(opts.take))}` : '';
    const offsetSql = opts.skip ? `OFFSET ${parseInt(String(opts.skip))}` : '';
    const sql = `SELECT ${cols} FROM ${q(table)} ${whereSql ? 'WHERE ' + whereSql : ''} ${orderSql} ${limitSql} ${offsetSql}`.trim();
    const res: any = await db.prepare(sql).bind(...values).all();
    return safeResults(res);
  } catch (e) {
    console.error(`[d1-admin] findMany ${table} error:`, e);
    return [];
  }
}

/** count rows. */
export async function count(
  table: string,
  where: WhereInput = {}
): Promise<number> {
  const db = await getD1();
  if (!db) return 0;
  try {
    const { whereSql, values } = buildWhere(where);
    const sql = `SELECT COUNT(*) as c FROM ${q(table)} ${whereSql ? 'WHERE ' + whereSql : ''}`;
    const res: any = await db.prepare(sql).bind(...values).first();
    return res?.c || 0;
  } catch (e) {
    console.error(`[d1-admin] count ${table} error:`, e);
    return 0;
  }
}

/** groupBy — supports a single key (one group column) for simplicity. */
export async function groupBy(
  table: string,
  by: string,
  opts: { where?: WhereInput; _count?: boolean | string; _sum?: string; _avg?: string; orderBy?: any } = {}
): Promise<any[]> {
  const db = await getD1();
  if (!db) return [];
  try {
    const { whereSql, values } = buildWhere(opts.where || {});
    const groupCol = q(by);
    const sel: string[] = [groupCol];
    if (opts._count) sel.push('COUNT(*) as _count');
    if (opts._sum) sel.push(`SUM(${q(opts._sum)}) as _sum`);
    if (opts._avg) sel.push(`AVG(${q(opts._avg)}) as _avg`);
    const sql = `SELECT ${sel.join(', ')} FROM ${q(table)} ${whereSql ? 'WHERE ' + whereSql : ''} GROUP BY ${groupCol}`;
    const res: any = await db.prepare(sql).bind(...values).all();
    return safeResults(res);
  } catch (e) {
    console.error(`[d1-admin] groupBy ${table} error:`, e);
    return [];
  }
}

/** aggregate — returns { _sum, _avg, _count, _min, _max } */
export async function aggregate(
  table: string,
  opts: { where?: WhereInput; _sum?: string; _avg?: string; _min?: string; _max?: string; _count?: boolean } = {}
): Promise<any> {
  const db = await getD1();
  if (!db) return { _sum: {}, _avg: {}, _count: 0, _min: {}, _max: {} };
  try {
    const { whereSql, values } = buildWhere(opts.where || {});
    const sel: string[] = [];
    if (opts._sum) sel.push(`SUM(${q(opts._sum)}) as _sum_${opts._sum}`);
    if (opts._avg) sel.push(`AVG(${q(opts._avg)}) as _avg_${opts._avg}`);
    if (opts._min) sel.push(`MIN(${q(opts._min)}) as _min_${opts._min}`);
    if (opts._max) sel.push(`MAX(${q(opts._max)}) as _max_${opts._max}`);
    if (opts._count) sel.push(`COUNT(*) as _count`);
    const sql = `SELECT ${sel.join(', ')} FROM ${q(table)} ${whereSql ? 'WHERE ' + whereSql : ''}`;
    const res: any = await db.prepare(sql).bind(...values).first();
    const r = res || {};
    const out: any = { _sum: {}, _avg: {}, _min: {}, _max: {}, _count: r._count || 0 };
    if (opts._sum) out._sum[opts._sum] = r[`_sum_${opts._sum}`] || 0;
    if (opts._avg) out._avg[opts._avg] = r[`_avg_${opts._avg}`] || 0;
    if (opts._min) out._min[opts._min] = r[`_min_${opts._min}`];
    if (opts._max) out._max[opts._max] = r[`_max_${opts._max}`];
    return out;
  } catch (e) {
    console.error(`[d1-admin] aggregate ${table} error:`, e);
    return { _sum: {}, _avg: {}, _count: 0, _min: {}, _max: {} };
  }
}

/** create a row. */
export async function create(
  table: string,
  data: Record<string, any>
): Promise<any | null> {
  const db = await getD1();
  if (!db) return null;
  try {
    const cols = Object.keys(data);
    const placeholders = cols.map(() => '?').join(', ');
    const values = cols.map(c => toDbValue(data[c]));
    const sql = `INSERT INTO ${q(table)} (${cols.map(c => q(c)).join(', ')}) VALUES (${placeholders})`;
    await db.prepare(sql).bind(...values).run();
    // Always return the inserted record. If we have an id, fetch the canonical
    // row from the DB (with any defaults applied by SQLite). Otherwise spread
    // the input data so callers always get a usable object (no last_row_id
    // for tables with TEXT primary keys — it's the SQLite rowid, not the id).
    if (data.id) {
      const fetched = await findFirst(table, { id: data.id });
      if (fetched) return fetched;
    }
    return { ...data };
  } catch (e) {
    console.error(`[d1-admin] create ${table} error:`, e);
    return null;
  }
}

/** createMany — multiple rows. */
export async function createMany(
  table: string,
  data: any[]
): Promise<{ count: number }> {
  const db = await getD1();
  if (!db) return { count: 0 };
  let count = 0;
  for (const row of data) {
    const r = await create(table, row);
    if (r) count++;
  }
  return { count };
}

/** update a row matching where. */
export async function update(
  table: string,
  args: { where: WhereInput; data: Record<string, any> }
): Promise<any | null> {
  const db = await getD1();
  if (!db) return null;
  try {
    const { whereSql, values: wValues } = buildWhere(args.where);
    const data = { ...args.data, updatedAt: args.data.updatedAt ?? Date.now() };
    const cols = Object.keys(data);
    const setSql = cols.map(c => `${q(c)} = ?`).join(', ');
    const setValues = cols.map(c => toDbValue(data[c]));
    const sql = `UPDATE ${q(table)} SET ${setSql} ${whereSql ? 'WHERE ' + whereSql : ''}`;
    await db.prepare(sql).bind(...setValues, ...wValues).run();
    return await findFirst(table, args.where);
  } catch (e) {
    console.error(`[d1-admin] update ${table} error:`, e);
    return null;
  }
}

/** updateMany. */
export async function updateMany(
  table: string,
  args: { where: WhereInput; data: Record<string, any> }
): Promise<{ count: number }> {
  const db = await getD1();
  if (!db) return { count: 0 };
  try {
    const { whereSql, values: wValues } = buildWhere(args.where);
    const data = { ...args.data, updatedAt: args.data.updatedAt ?? Date.now() };
    const cols = Object.keys(data);
    const setSql = cols.map(c => `${q(c)} = ?`).join(', ');
    const setValues = cols.map(c => toDbValue(data[c]));
    const sql = `UPDATE ${q(table)} SET ${setSql} ${whereSql ? 'WHERE ' + whereSql : ''}`;
    const res: any = await db.prepare(sql).bind(...setValues, ...wValues).run();
    return { count: res?.meta?.changes || 0 };
  } catch (e) {
    console.error(`[d1-admin] updateMany ${table} error:`, e);
    return { count: 0 };
  }
}

/** delete a row. */
export async function deleteRow(
  table: string,
  where: WhereInput
): Promise<any | null> {
  const db = await getD1();
  if (!db) return null;
  try {
    const row = await findFirst(table, where);
    if (!row) return null;
    const { whereSql, values } = buildWhere(where);
    const sql = `DELETE FROM ${q(table)} ${whereSql ? 'WHERE ' + whereSql : ''}`;
    await db.prepare(sql).bind(...values).run();
    return row;
  } catch (e) {
    console.error(`[d1-admin] delete ${table} error:`, e);
    return null;
  }
}

/** deleteMany. */
export async function deleteMany(
  table: string,
  where: WhereInput = {}
): Promise<{ count: number }> {
  const db = await getD1();
  if (!db) return { count: 0 };
  try {
    const { whereSql, values } = buildWhere(where);
    const sql = `DELETE FROM ${q(table)} ${whereSql ? 'WHERE ' + whereSql : ''}`;
    const res: any = await db.prepare(sql).bind(...values).run();
    return { count: res?.meta?.changes || 0 };
  } catch (e) {
    console.error(`[d1-admin] deleteMany ${table} error:`, e);
    return { count: 0 };
  }
}

// ============================================================
// SPECIAL: includes / relations (limited support)
// ============================================================

/** Build a where clause for prisma-like input. */
function buildWhere(where: WhereInput): { whereSql: string; values: any[] } {
  const parts: string[] = [];
  const values: any[] = [];
  for (const [key, val] of Object.entries(where)) {
    if (val === undefined) continue;
    if (key === 'NOT') continue; // skip
    if (key === 'OR' || key === 'AND') {
      // Recursive: build sub-clauses
      const subParts: string[] = [];
      const arr = Array.isArray(val) ? val : [val];
      for (const sub of arr) {
        const subWhere = buildWhere(sub);
        if (subWhere.whereSql) {
          subParts.push(`(${subWhere.whereSql})`);
          values.push(...subWhere.values);
        }
      }
      if (subParts.length > 0) {
        parts.push(`(${subParts.join(` ${key} `)})`);
      }
      continue;
    }
    // Handle special keys
    if (key === 'in' || key === 'notIn') {
      // This is a sub-condition: { status: { in: ['x', 'y'] } }
      // The 'key' here is actually the field name
      continue;
    }
    if (typeof val === 'object' && val !== null && !(val instanceof Date) && !Array.isArray(val)) {
      // Operators: { contains, startsWith, endsWith, gt, gte, lt, lte, in, notIn, equals, not, mode }
      for (const [op, opVal] of Object.entries(val)) {
        if (opVal === undefined) continue;
        const col = q(key);
        if (op === 'equals' || op === 'is') {
          parts.push(`${col} = ?`);
          values.push(toDbValue(opVal));
        } else if (op === 'not') {
          // 2026-09-07 FIX: { not: null } must use IS NOT NULL, not != NULL
          // (SQL's three-valued logic: `col != NULL` is always NULL, not TRUE)
          if (opVal === null) {
            parts.push(`${col} IS NOT NULL`);
          } else {
            parts.push(`${col} != ?`);
            values.push(toDbValue(opVal));
          }
        } else if (op === 'in') {
          const arr = Array.isArray(opVal) ? opVal : [opVal];
          if (arr.length > 0) {
            parts.push(`${col} IN (${arr.map(() => '?').join(', ')})`);
            values.push(...arr.map(toDbValue));
          } else {
            parts.push('1 = 0'); // empty IN
          }
        } else if (op === 'notIn') {
          const arr = Array.isArray(opVal) ? opVal : [opVal];
          if (arr.length > 0) {
            parts.push(`${col} NOT IN (${arr.map(() => '?').join(', ')})`);
            values.push(...arr.map(toDbValue));
          }
        } else if (op === 'contains') {
          parts.push(`${col} LIKE ?`);
          values.push(`%${opVal}%`);
        } else if (op === 'startsWith') {
          parts.push(`${col} LIKE ?`);
          values.push(`${opVal}%`);
        } else if (op === 'endsWith') {
          parts.push(`${col} LIKE ?`);
          values.push(`%${opVal}`);
        } else if (op === 'gt') {
          parts.push(`${col} > ?`);
          values.push(toDbValue(opVal));
        } else if (op === 'gte') {
          parts.push(`${col} >= ?`);
          values.push(toDbValue(opVal));
        } else if (op === 'lt') {
          parts.push(`${col} < ?`);
          values.push(toDbValue(opVal));
        } else if (op === 'lte') {
          parts.push(`${col} <= ?`);
          values.push(toDbValue(opVal));
        } else if (op === 'mode') {
          // 'insensitive' — SQLite LIKE is case-insensitive for ASCII by default
          // Just skip — already handled by contains/etc.
          continue;
        }
      }
    } else if (Array.isArray(val)) {
      // { tags: ['x', 'y'] } → IN
      if (val.length > 0) {
        parts.push(`${q(key)} IN (${val.map(() => '?').join(', ')})`);
        values.push(...val.map(toDbValue));
      } else {
        parts.push('1 = 0');
      }
    } else {
      // Equality
      if (val === null) {
        parts.push(`${q(key)} IS NULL`);
      } else {
        parts.push(`${q(key)} = ?`);
        values.push(toDbValue(val));
      }
    }
  }
  return { whereSql: parts.join(' AND '), values };
}

/** Convert a prisma select clause to a column list. */
function buildSelectCols(select: SelectInput): string {
  // For now, just use the top-level keys. Nested selects are ignored.
  // (Most queries use simple top-level select.)
  return Object.keys(select)
    .filter(k => select[k] !== false)
    .map(k => q(k))
    .join(', ') || '*';
}

/** Convert a JS value to a DB-compatible value. */
function toDbValue(v: any): any {
  if (v === undefined) return null;
  if (v === null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object' && !Array.isArray(v)) {
    // JSON columns — store as text
    return JSON.stringify(v);
  }
  return v;
}

// ============================================================
// PRISMA-LIKE PROXY (for drop-in replacement)
// ============================================================

/** Make a model proxy that calls our generic CRUD. */
function makeModelProxy(model: string) {
  return {
    findFirst: (args: any = {}) => findFirst(model, args.where),
    findUnique: (args: any = {}) => findFirst(model, args.where),
    findFirstOrThrow: (args: any = {}) => findFirst(model, args.where),
    findUniqueOrThrow: (args: any = {}) => findFirst(model, args.where),
    findMany: (args: any = {}) => findMany(model, args),
    count: (args: any = {}) => count(model, args?.where),
    create: (args: any) => create(model, args.data),
    createMany: (args: any) => createMany(model, args.data),
    update: (args: any) => update(model, { where: args.where, data: args.data }),
    updateMany: (args: any) => updateMany(model, { where: args.where, data: args.data }),
    upsert: async (args: any) => {
      const existing = await findFirst(model, args.where);
      if (existing) return update(model, { where: args.where, data: args.update });
      return create(model, args.create);
    },
    delete: (args: any) => deleteRow(model, args.where),
    deleteMany: (args: any = {}) => deleteMany(model, args.where),
    groupBy: (args: any) => groupBy(model, args.by, args),
    aggregate: (args: any) => aggregate(model, args),
    increment: async (args: any) => {
      // { where: { id }, data: { viewsCount: 1 } }
      const col = Object.keys(args.data)[0];
      const val = args.data[col];
      const db = await getD1();
      if (!db) return null;
      const { whereSql, values: wValues } = buildWhere(args.where);
      const sql = `UPDATE ${q(model)} SET ${q(col)} = COALESCE(${q(col)}, 0) + ? ${whereSql ? 'WHERE ' + whereSql : ''}`;
      await db.prepare(sql).bind(val, ...wValues).run();
      return findFirst(model, args.where);
    },
    decrement: async (args: any) => {
      const col = Object.keys(args.data)[0];
      const val = args.data[col];
      const db = await getD1();
      if (!db) return null;
      const { whereSql, values: wValues } = buildWhere(args.where);
      const sql = `UPDATE ${q(model)} SET ${q(col)} = COALESCE(${q(col)}, 0) - ? ${whereSql ? 'WHERE ' + whereSql : ''}`;
      await db.prepare(sql).bind(val, ...wValues).run();
      return findFirst(model, args.where);
    },
  };
}

/** Drop-in proxy that mimics the Prisma client for admin operations. */
export const db = new Proxy({}, {
  get(target, prop) {
    if (typeof prop !== 'string') return undefined;
    if (prop === '$transaction') {
      return async (arg: any) => {
        // Prisma $transaction supports BOTH a callback function and an array
        // of operations. We need to handle both. D1 doesn't have multi-statement
        // transactions easily, so we execute the operations sequentially
        // (the array case) and rely on caller to ensure atomicity isn't
        // required across rows.
        try {
          if (Array.isArray(arg)) {
            // db.$transaction([op1, op2, ...]) - sequential array execution
            // Each `op` is already a Promise (from calling db.x.update etc.)
            // because the proxy intercepted the call. Await each in order.
            const results = [];
            for (const op of arg) {
              if (op && typeof op.then === 'function') {
                results.push(await op);
              }
            }
            return results;
          }
          if (typeof arg === 'function') {
            // db.$transaction(async (tx) => {...}) - interactive transaction
            return await arg(db);
          }
          // Unknown shape - just return the arg as-is
          return arg;
        } catch (e) {
          console.error('[d1-admin] $transaction error:', e);
          return [];
        }
      };
    }
    if (prop === '$queryRaw' || prop === '$executeRaw') {
      return async (strings: TemplateStringsArray, ...values: any[]) => {
        const db = await getD1();
        if (!db) return [];
        const sql = strings.join('?');
        try {
          const res: any = await db.prepare(sql).bind(...values).all();
          return safeResults(res);
        } catch (e) {
          console.error('[d1-admin] $queryRaw error:', e);
          return [];
        }
      };
    }
    if (prop === '$connect' || prop === '$disconnect') {
      return async () => {};
    }
    return makeModelProxy(prop);
  },
});

export { getD1 };
