export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type JobRecord = {
  id: string;
  job_type: string;
  status: JobStatus;
  payload_json: any;
  result_json: any | null;
  error_text: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
};

type Queryable = {
  query: (text: string, params?: any[]) => Promise<any>;
};

export async function enqueueJob(client: Queryable, jobType: string, payload: any) {
  const res = await client.query(
    `insert into job_queue (job_type, payload_json)
     values ($1, $2::jsonb)
     returning id, job_type, status, payload_json, result_json, error_text, created_at, started_at, finished_at`,
    [jobType, JSON.stringify(payload)]
  );
  return res.rows[0] as JobRecord;
}

export async function getJob(client: Queryable, jobId: string) {
  const res = await client.query(
    `select id, job_type, status, payload_json, result_json, error_text, created_at, started_at, finished_at
     from job_queue
     where id = $1`,
    [jobId]
  );
  return res.rows[0] as JobRecord | undefined;
}

export async function claimNextJob(client: Queryable) {
  const res = await client.query(
    `with next as (
       select id
       from job_queue
       where status = 'PENDING'
       order by created_at asc
       limit 1
       for update skip locked
     )
     update job_queue
     set status = 'RUNNING', started_at = now()
     where id in (select id from next)
     returning id, job_type, status, payload_json, result_json, error_text, created_at, started_at, finished_at`
  );
  return res.rows[0] as JobRecord | undefined;
}

export async function completeJob(client: Queryable, jobId: string, result: any) {
  const res = await client.query(
    `update job_queue
     set status = 'COMPLETED', result_json = $2::jsonb, finished_at = now()
     where id = $1
     returning id, job_type, status, payload_json, result_json, error_text, created_at, started_at, finished_at`,
    [jobId, JSON.stringify(result)]
  );
  return res.rows[0] as JobRecord;
}

export async function failJob(client: Queryable, jobId: string, errorText: string) {
  const res = await client.query(
    `update job_queue
     set status = 'FAILED', error_text = $2, finished_at = now()
     where id = $1
     returning id, job_type, status, payload_json, result_json, error_text, created_at, started_at, finished_at`,
    [jobId, errorText]
  );
  return res.rows[0] as JobRecord;
}
