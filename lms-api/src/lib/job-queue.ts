export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'DEAD';

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
  attempts: number;
  max_attempts: number;
  dead_lettered_at: Date | null;
};

type Queryable = {
  query: (text: string, params?: any[]) => Promise<any>;
};

export async function enqueueJob(client: Queryable, jobType: string, payload: any) {
  const res = await client.query(
    `insert into job_queue (job_type, payload_json)
     values ($1, $2::jsonb)
     returning id, job_type, status, payload_json, result_json, error_text, created_at, started_at, finished_at,
       attempts, max_attempts, dead_lettered_at`,
    [jobType, JSON.stringify(payload)]
  );
  return res.rows[0] as JobRecord;
}

export async function getJob(client: Queryable, jobId: string) {
  const res = await client.query(
    `select id, job_type, status, payload_json, result_json, error_text, created_at, started_at, finished_at,
       attempts, max_attempts, dead_lettered_at
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
         and (dead_lettered_at is null)
         and attempts < max_attempts
       order by created_at asc
       limit 1
       for update skip locked
     )
     update job_queue
     set status = 'RUNNING', started_at = now()
     where id in (select id from next)
     returning id, job_type, status, payload_json, result_json, error_text, created_at, started_at, finished_at,
       attempts, max_attempts, dead_lettered_at`,
  );
  return res.rows[0] as JobRecord | undefined;
}

export async function completeJob(client: Queryable, jobId: string, result: any) {
  const res = await client.query(
    `update job_queue
     set status = 'COMPLETED', result_json = $2::jsonb, finished_at = now()
     where id = $1
     returning id, job_type, status, payload_json, result_json, error_text, created_at, started_at, finished_at,
       attempts, max_attempts, dead_lettered_at`,
    [jobId, JSON.stringify(result)]
  );
  return res.rows[0] as JobRecord;
}

export async function failJob(client: Queryable, jobId: string, errorText: string) {
  const res = await client.query(
    `update job_queue
     set attempts = attempts + 1,
         error_text = $2,
         finished_at = now(),
         status = case
           when attempts + 1 >= max_attempts then 'DEAD'
           else 'PENDING'
         end,
         dead_lettered_at = case
           when attempts + 1 >= max_attempts then now()
           else dead_lettered_at
         end
     where id = $1
     returning id, job_type, status, payload_json, result_json, error_text, created_at, started_at, finished_at,
       attempts, max_attempts, dead_lettered_at`,
    [jobId, errorText]
  );
  return res.rows[0] as JobRecord;
}
