let Pool;
try {
  ({ Pool } = require('pg'));
} catch {
  Pool = null;
}
const { isStandaloneGpuProduct } = require('./utils');

const DATABASE_URL = process.env.DATABASE_URL || '';
const COMPACT_INTERVAL_MS = Math.max(Number(process.env.DATABASE_COMPACT_INTERVAL_MS || 3600000), 300000);
let pool = null;
let ready = false;
let lastError = null;

function dbEnabled() {
  return Boolean(Pool && DATABASE_URL);
}

async function query(sql, params = []) {
  if (!pool) throw new Error('database_not_initialized');
  return pool.query(sql, params);
}

async function initDatabase() {
  if (!dbEnabled()) {
    lastError = Pool ? null : 'pg_module_missing';
    return { enabled: false, ready: false, error: lastError };
  }

  pool = new Pool({ connectionString: DATABASE_URL, max: 4, idleTimeoutMillis: 30000 });
  await query(`
    create table if not exists observations (
      observed_at timestamptz not null,
      store text not null,
      product_id text not null,
      model text,
      title text not null,
      price numeric,
      url text,
      in_stock boolean not null default false,
      msrp_hit boolean not null default false,
      within_target boolean not null default true,
      source text,
      raw_availability text,
      data jsonb not null default '{}'::jsonb,
      primary key (observed_at, store, product_id)
    );
    create table if not exists store_checks (
      checked_at timestamptz not null,
      store text not null,
      ok boolean not null default false,
      source text,
      diagnosis text,
      listing_count integer not null default 0,
      qualifying integer not null default 0,
      in_stock integer not null default 0,
      data jsonb not null default '{}'::jsonb,
      primary key (checked_at, store)
    );
    create table if not exists drops (
      drop_at timestamptz not null,
      store text not null,
      product_id text not null,
      model text,
      title text not null,
      price numeric,
      url text,
      in_stock boolean not null default false,
      msrp_hit boolean not null default false,
      data jsonb not null default '{}'::jsonb,
      primary key (drop_at, store, product_id)
    );
    create table if not exists hourly_rollups (
      bucket timestamptz not null,
      store text not null,
      model text not null,
      observations integer not null default 0,
      in_stock_observations integer not null default 0,
      msrp_observations integer not null default 0,
      min_price numeric,
      max_price numeric,
      latest_at timestamptz,
      primary key (bucket, store, model)
    );
    create table if not exists app_snapshots (
      id bigserial primary key,
      created_at timestamptz not null default now(),
      kind text not null,
      data jsonb not null
    );
    create index if not exists observations_store_model_idx on observations (store, model, observed_at desc);
    create index if not exists observations_price_idx on observations (model, price);
    create index if not exists drops_store_model_idx on drops (store, model, drop_at desc);
  `);
  ready = true;
  lastError = null;
  setInterval(() => compactDatabase().catch(error => { lastError = String(error.message || error); }), COMPACT_INTERVAL_MS).unref();
  await compactDatabase();
  return { enabled: true, ready: true };
}

function rowId(item = {}) {
  return String(item.productId || item.url || item.title || 'unknown').slice(0, 300);
}

function rowTitle(item = {}) {
  return String(item.displayTitle || item.title || 'GPU listing').slice(0, 500);
}

function isDatabaseListing(item = {}) {
  return Number.isFinite(Number(item.price)) && isStandaloneGpuProduct(rowTitle(item));
}

async function persistScanToDatabase(payload = {}) {
  if (!ready || !pool) return { enabled: dbEnabled(), ready: false };
  const at = payload.at || new Date().toISOString();
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const status of payload.storeStatus || []) {
      await client.query(
        `insert into store_checks (checked_at, store, ok, source, diagnosis, listing_count, qualifying, in_stock, data)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (checked_at, store) do update set
           ok = excluded.ok,
           source = excluded.source,
           diagnosis = excluded.diagnosis,
           listing_count = excluded.listing_count,
           qualifying = excluded.qualifying,
           in_stock = excluded.in_stock,
           data = excluded.data`,
        [
          status.checkedAt || at,
          status.store || 'unknown',
          status.ok === true,
          status.source || null,
          status.diagnosis || null,
          Number(status.listingCount || 0),
          Number(status.qualifying || 0),
          Number(status.inStock || 0),
          status
        ]
      );
    }

    for (const item of payload.listings || []) {
      if (item.stale || !isDatabaseListing(item)) continue;
      await client.query(
        `insert into observations (observed_at, store, product_id, model, title, price, url, in_stock, msrp_hit, within_target, source, raw_availability, data)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         on conflict (observed_at, store, product_id) do nothing`,
        [
          item.checkedAt || at,
          item.store || 'unknown',
          rowId(item),
          item.model || null,
          rowTitle(item),
          Number(item.price),
          item.url || null,
          item.inStock === true,
          item.msrpHit === true,
          item.withinTarget !== false,
          item.source || null,
          item.rawAvailability || null,
          item
        ]
      );
    }

    for (const alert of payload.alerts || []) {
      if (!['new_in_stock', 'new_listing'].includes(alert.type) || !alert.listing) continue;
      const item = alert.listing;
      if (!isDatabaseListing(item)) continue;
      await client.query(
        `insert into drops (drop_at, store, product_id, model, title, price, url, in_stock, msrp_hit, data)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (drop_at, store, product_id) do nothing`,
        [
          alert.at || at,
          item.store || 'unknown',
          rowId(item),
          item.model || null,
          rowTitle(item),
          Number(item.price),
          item.url || null,
          item.inStock === true,
          item.msrpHit === true,
          alert
        ]
      );
    }

    await client.query(
      'insert into app_snapshots (kind, data) values ($1, $2)',
      ['stats', { at, stats: payload.stats || {}, summary: payload.summary || {} }]
    );
    await client.query('commit');
    await compactDatabase();
    return { enabled: true, ready: true };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    lastError = String(error.message || error);
    return { enabled: true, ready: false, error: lastError };
  } finally {
    client.release();
  }
}

async function seedHistoryToDatabase(history = {}) {
  if (!ready || !pool) return { enabled: dbEnabled(), ready: false };
  const health = await databaseHealth();
  if (Number(health.observations || 0) > 0 || Number(health.checks || 0) > 0) {
    return { enabled: true, ready: true, seeded: false, reason: 'database_already_has_history' };
  }
  const drops = (history.drops || []).map(item => ({
    type: 'new_in_stock',
    at: item.at,
    listing: item
  }));
  const result = await persistScanToDatabase({
    at: history.updatedAt || new Date().toISOString(),
    listings: history.observations || [],
    storeStatus: history.checks || [],
    alerts: drops,
    stats: history.stats || {},
    summary: {}
  });
  return { ...result, seeded: true };
}

async function compactDatabase() {
  if (!ready || !pool) return;
  await query(`
    delete from observations
    where title ~* '(backplate|water block|gpu block|thermal pad|kryosheet)';
    delete from drops
    where title ~* '(backplate|water block|gpu block|thermal pad|kryosheet)';
    delete from hourly_rollups;

    insert into hourly_rollups (bucket, store, model, observations, in_stock_observations, msrp_observations, min_price, max_price, latest_at)
    select
      date_trunc('hour', observed_at) as bucket,
      store,
      coalesce(model, 'unknown') as model,
      count(*)::integer as observations,
      count(*) filter (where in_stock)::integer as in_stock_observations,
      count(*) filter (where msrp_hit)::integer as msrp_observations,
      min(price) as min_price,
      max(price) as max_price,
      max(observed_at) as latest_at
    from observations
    group by 1, 2, 3
    on conflict (bucket, store, model) do update set
      observations = excluded.observations,
      in_stock_observations = excluded.in_stock_observations,
      msrp_observations = excluded.msrp_observations,
      min_price = excluded.min_price,
      max_price = excluded.max_price,
      latest_at = excluded.latest_at;

    delete from app_snapshots
    where id not in (select id from app_snapshots order by created_at desc limit 500);
  `);
}

async function databaseHealth() {
  if (!dbEnabled()) return { enabled: false, ready: false, error: lastError };
  if (!ready || !pool) return { enabled: true, ready: false, error: lastError };
  try {
    const result = await query(`
      select
        (select count(*)::integer from observations) as observations,
        (select count(*)::integer from hourly_rollups) as hourly_rollups,
        (select count(*)::integer from drops) as drops,
        (select count(*)::integer from store_checks) as checks
    `);
    return { enabled: true, ready: true, ...result.rows[0] };
  } catch (error) {
    lastError = String(error.message || error);
    return { enabled: true, ready: false, error: lastError };
  }
}

module.exports = {
  databaseHealth,
  initDatabase,
  persistScanToDatabase,
  seedHistoryToDatabase
};
