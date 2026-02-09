type Queryable = {
  query: (text: string, params?: any[]) => Promise<any>;
};

type DateRange = {
  from?: string | null;
  to?: string | null;
};

export async function getArcadeExperimentMetrics(client: Queryable, range: DateRange) {
  const from = range.from ?? null;
  const to = range.to ?? null;
  const res = await client.query(
    `select
       coalesce(variant_id, 'control') as variant_id,
       coalesce(placement, 'unknown') as placement,
       coalesce(provider, 'unknown') as provider,
       count(*) filter (where event_type = 'ad_impression') as impressions,
       count(*) filter (where event_type = 'ad_click') as clicks,
       count(*) filter (where event_type = 'reward_completed') as rewards
     from arcade_ad_events
     where ($1::timestamptz is null or occurred_at >= $1::timestamptz)
       and ($2::timestamptz is null or occurred_at <= $2::timestamptz)
     group by 1, 2, 3
     order by impressions desc`,
    [from, to]
  );
  return res.rows;
}

export async function getArcadeFunnelMetrics(client: Queryable, range: DateRange) {
  const from = range.from ?? null;
  const to = range.to ?? null;
  const res = await client.query(
    `select
       count(*) filter (where event_type = 'game_session_start') as sessions_started,
       count(*) filter (where event_type = 'game_session_end') as sessions_ended,
       count(*) filter (where event_type = 'score_submitted') as scores_submitted,
       count(*) filter (where event_type = 'score_validated') as scores_validated
     from arcade_gameplay_events
     where ($1::timestamptz is null or occurred_at >= $1::timestamptz)
       and ($2::timestamptz is null or occurred_at <= $2::timestamptz)`,
    [from, to]
  );
  return res.rows[0] ?? null;
}
