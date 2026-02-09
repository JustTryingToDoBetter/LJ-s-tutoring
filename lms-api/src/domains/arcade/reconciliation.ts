type Queryable = {
  query: (text: string, params?: any[]) => Promise<any>;
};

export type ArcadeReconciliationReport = {
  generatedAt: string;
  impressionsPerSession: Array<{ session_id: string; impressions: number }>;
  rewardsPerValidatedSession: Array<{ session_id: string; rewards: number }>;
  clicksWithoutImpressions: Array<{ session_id: string; clicks: number }>;
  scoresWithoutValidation: Array<{ score_id: string; session_id: string | null }>;
};

export async function buildArcadeReconciliationReport(client: Queryable): Promise<ArcadeReconciliationReport> {
  const impressions = await client.query(
    `select session_id, count(*) as impressions
     from arcade_ad_events
     where event_type = 'ad_impression'
     group by session_id
     order by impressions desc`
  );

  const rewards = await client.query(
    `select s.session_id, count(*) as rewards
     from arcade_ad_events s
     join arcade_scores sc on sc.session_id = s.session_id and sc.is_validated = true
     where s.event_type = 'reward_completed'
     group by s.session_id
     order by rewards desc`
  );

  const clicksWithout = await client.query(
    `select c.session_id, count(*) as clicks
     from arcade_ad_events c
     left join arcade_ad_events i
       on i.session_id = c.session_id and i.event_type = 'ad_impression'
     where c.event_type = 'ad_click'
       and i.event_id is null
     group by c.session_id
     order by clicks desc`
  );

  const missingValidation = await client.query(
    `select id as score_id, session_id
     from arcade_scores
     where is_validated = false`
  );

  return {
    generatedAt: new Date().toISOString(),
    impressionsPerSession: impressions.rows,
    rewardsPerValidatedSession: rewards.rows,
    clicksWithoutImpressions: clicksWithout.rows,
    scoresWithoutValidation: missingValidation.rows,
  };
}

export async function persistArcadeReconciliationReport(client: Queryable, report: ArcadeReconciliationReport) {
  const res = await client.query(
    `insert into arcade_reconciliation_reports (report_json)
     values ($1::jsonb)
     returning id, created_at`,
    [JSON.stringify(report)]
  );
  return res.rows[0];
}

export async function getLatestArcadeReconciliationReport(client: Queryable) {
  const res = await client.query(
    `select id, report_json, created_at
     from arcade_reconciliation_reports
     order by created_at desc
     limit 1`
  );
  return res.rows[0] ?? null;
}
