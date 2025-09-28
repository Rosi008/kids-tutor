// api/db.js — Postgres (Neon) připojení + schéma + helpery
import { neon } from "@neondatabase/serverless";

const CONN = process.env.POSTGRES_URL;
if (!CONN) {
  console.warn("POSTGRES_URL is missing – set it in Vercel → Project → Settings → Environment Variables.");
}
export const sql = CONN ? neon(CONN) : async () => { throw new Error("Missing POSTGRES_URL"); };

/** Jednorázová inicializace tabulek (idempotentní) */
export async function ensureSchema() {
  await sql/* sql */`
    create table if not exists profiles (
      user_id    text primary key,
      persona    text,
      likes      jsonb,
      goals      jsonb,
      notes      text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create table if not exists progress_summary (
      user_id    text primary key,
      totals     jsonb,     -- { seen:int, ok:int }
      per_mode   jsonb,     -- { tables:{seen,ok,streak}, vyjmenovana:{...}, en:{...} }
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create table if not exists progress_daily (
      user_id text,
      day     date,
      seen    int default 0,
      ok      int default 0,
      primary key (user_id, day)
    );

    create table if not exists progress_events (
      id      bigserial primary key,
      user_id text,
      mode    text,
      item    text,
      correct boolean,
      ts      timestamptz default now()
    );
  `;
}

/** --------- PROFIL --------- */
function defaultProfile(userId) {
  return {
    userId,
    persona: "Robot kamarád",
    likes: ["lego", "fotbal"],
    goals: { dailyQuestions: 10 },
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function getProfile(userId) {
  await ensureSchema();
  const rows = await sql/* sql */`select * from profiles where user_id = ${userId} limit 1`;
  if (!rows.length) return defaultProfile(userId);
  const r = rows[0];
  return {
    userId: r.user_id,
    persona: r.persona || "Robot kamarád",
    likes: Array.isArray(r.likes) ? r.likes : (r.likes?.array || r.likes) || [],
    goals: r.goals || { dailyQuestions: 10 },
    notes: r.notes || "",
    createdAt: r.created_at?.toISOString?.() || r.created_at,
    updatedAt: r.updated_at?.toISOString?.() || r.updated_at,
  };
}

export async function upsertProfile(userId, patch = {}) {
  await ensureSchema();
  const current = await getProfile(userId);
  const next = {
    ...current,
    ...patch,
    userId,
    updatedAt: new Date().toISOString(),
    createdAt: current.createdAt || new Date().toISOString(),
  };

  await sql/* sql */`
    insert into profiles (user_id, persona, likes, goals, notes, created_at, updated_at)
    values (${userId}, ${next.persona}, ${JSON.stringify(next.likes || [])}, ${JSON.stringify(next.goals || {})}, ${next.notes || ""}, ${next.createdAt}, ${next.updatedAt})
    on conflict (user_id) do update set
      persona = excluded.persona,
      likes = excluded.likes,
      goals = excluded.goals,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `;
  return next;
}

/** --------- POKROK --------- */
function emptyPerMode() {
  return {
    tables: { seen: 0, ok: 0, streak: 0 },
    vyjmenovana: { seen: 0, ok: 0, streak: 0 },
    en: { seen: 0, ok: 0, streak: 0 },
  };
}
function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function getProgress(userId) {
  await ensureSchema();

  const sRows = await sql/* sql */`select * from progress_summary where user_id = ${userId} limit 1`;
  const dRows = await sql/* sql */`select day, seen, ok from progress_daily where user_id = ${userId} order by day desc limit 60`;
  const eRows = await sql/* sql */`select mode, item, correct, ts from progress_events where user_id = ${userId} order by ts desc limit 20`;

  const summary = sRows[0];
  const totals = summary?.totals || { seen: 0, ok: 0 };
  const perMode = summary?.per_mode || emptyPerMode();

  const daily = {};
  for (const r of dRows) daily[r.day instanceof Date ? r.day.toISOString().slice(0, 10) : r.day] = { seen: r.seen, ok: r.ok };

  const lastItems = eRows.map(r => ({
    mode: r.mode,
    item: r.item,
    ok: !!r.correct,
    ts: r.ts?.toISOString?.() || r.ts,
  }));

  return { userId, totals, perMode, daily, lastItems, createdAt: summary?.created_at, updatedAt: summary?.updated_at };
}

export async function updateProgress({ userId, mode, correct, item = null }) {
  await ensureSchema();

  // 1) summary
  const sRows = await sql/* sql */`select * from progress_summary where user_id = ${userId} limit 1`;
  const now = new Date().toISOString();
  let totals = sRows[0]?.totals || { seen: 0, ok: 0 };
  let perMode = sRows[0]?.per_mode || emptyPerMode();

  totals = { seen: (totals.seen || 0) + 1, ok: (totals.ok || 0) + (correct ? 1 : 0) };

  const m = perMode[mode] || { seen: 0, ok: 0, streak: 0 };
  m.seen += 1;
  if (correct) { m.ok += 1; m.streak += 1; } else { m.streak = 0; }
  perMode[mode] = m;

  await sql/* sql */`
    insert into progress_summary (user_id, totals, per_mode, created_at, updated_at)
    values (${userId}, ${JSON.stringify(totals)}, ${JSON.stringify(perMode)}, ${now}, ${now})
    on conflict (user_id) do update set
      totals = ${JSON.stringify(totals)},
      per_mode = ${JSON.stringify(perMode)},
      updated_at = ${now}
  `;

  // 2) daily
  const day = todayStr();
  await sql/* sql */`
    insert into progress_daily (user_id, day, seen, ok)
    values (${userId}, ${day}, ${1}, ${correct ? 1 : 0})
    on conflict (user_id, day) do update set
      seen = progress_daily.seen + 1,
      ok = progress_daily.ok + ${correct ? 1 : 0}
  `;

  // 3) event log
  await sql/* sql */`
    insert into progress_events (user_id, mode, item, correct)
    values (${userId}, ${mode}, ${item}, ${!!correct})
  `;

  return { ok: true };
}
