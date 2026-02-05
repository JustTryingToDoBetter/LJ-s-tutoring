import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import crypto from 'node:crypto';

type ErrorContext = {
  correlationId?: string;
  userId?: string;
  role?: string;
  path?: string;
  method?: string;
};

type ErrorMonitor = {
  captureException: (err: unknown, context?: ErrorContext) => void;
};

let monitor: ErrorMonitor = {
  captureException: () => {}
};

export async function initErrorMonitor() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return monitor;

  const parsed = parseDsn(dsn);
  if (!parsed) return monitor;

  monitor = {
    captureException: (err, context) => {
      const payload = buildEvent(err, context);
      void sendEnvelope(parsed, payload);
    }
  };

  return monitor;
}

export function getErrorMonitor() {
  return monitor;
}

type DsnParts = {
  host: string;
  projectId: string;
  publicKey: string;
  protocol: 'https' | 'http';
  path: string;
};

function parseDsn(dsn: string): DsnParts | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace('/', '');
    if (!publicKey || !projectId) return null;
    return {
      host: url.host,
      projectId,
      publicKey,
      protocol: url.protocol === 'http:' ? 'http' : 'https',
      path: url.pathname.replace(`/${projectId}`, '')
    };
  } catch {
    return null;
  }
}

function buildEvent(err: unknown, context?: ErrorContext) {
  const error = err instanceof Error ? err : new Error(String(err));
  const event: any = {
    event_id: cryptoRandomId(),
    timestamp: new Date().toISOString(),
    platform: 'node',
    level: 'error',
    logger: 'api',
    exception: {
      values: [
        {
          type: error.name,
          value: error.message
        }
      ]
    },
    tags: {
      correlation_id: context?.correlationId,
      path: context?.path,
      method: context?.method
    },
    user: context?.userId ? { id: context.userId, role: context.role } : undefined,
    extra: error.stack ? { stack: error.stack } : undefined
  };

  return event;
}

function sendEnvelope(dsn: DsnParts, event: any) {
  return new Promise<void>((resolve) => {
    const envelope = `${JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}\n`;
    const options = {
      hostname: dsn.host,
      path: `${dsn.path}/api/${dsn.projectId}/envelope/`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=custom-monitor/1.0`,
        'Content-Length': Buffer.byteLength(envelope)
      }
    };

    const transport = dsn.protocol === 'http' ? httpRequest : httpsRequest;
    const req = transport(options, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve());
    });
    req.on('error', () => resolve());
    req.write(envelope);
    req.end();
  });
}

function cryptoRandomId() {
  return crypto.randomBytes(16).toString('hex');
}
