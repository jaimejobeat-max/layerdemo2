// Minimal Supabase REST (PostgREST) client — no SDK, Node 18+ fetch.
// Env: SUPABASE_URL, SUPABASE_SECRET_KEY (sb_secret_… — server only, bypasses RLS).
const URL_ = () => (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function configured() { return !!(URL_() && KEY()); }

/**
 * @param {string} table   e.g. 'reservation_requests'
 * @param {object} o
 * @param {string} [o.method='GET']
 * @param {object} [o.query]   URL params (PostgREST filters), e.g. { status: 'eq.pending', order: 'created_at.desc' }
 * @param {object|array} [o.body]
 * @param {string} [o.prefer]  e.g. 'return=representation'
 */
async function sb(table, { method = 'GET', query = {}, body, prefer } = {}) {
  if (!configured()) throw new Error('supabase not configured');
  const qs = new URLSearchParams(query).toString();
  const headers = { apikey: KEY(), Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${URL_()}/rest/v1/${table}${qs ? '?' + qs : ''}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) { const err = new Error((data && (data.message || data.error)) || `supabase ${res.status}`); err.status = res.status; err.data = data; throw err; }
  return data;
}

const insert = (table, row) => sb(table, { method: 'POST', body: row, prefer: 'return=representation' }).then((r) => (Array.isArray(r) ? r[0] : r));
const update = (table, query, patch) => sb(table, { method: 'PATCH', query, body: patch, prefer: 'return=representation' });
const select = (table, query) => sb(table, { query });

module.exports = { sb, insert, update, select, configured };
