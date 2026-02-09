type Queryable = {
  query: (text: string, params?: any[]) => Promise<any>;
};

export async function refreshArcadeAnalyticsReadModel(client: Queryable) {
  await client.query('refresh materialized view concurrently arcade_ad_analytics_daily');
  await client.query('refresh materialized view concurrently arcade_gameplay_analytics_daily');
}
