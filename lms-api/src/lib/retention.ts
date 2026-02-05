const toInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export type RetentionConfig = {
  sessionsYears: number;
  sessionHistoryYears: number;
  invoicesYears: number;
  auditYears: number;
  magicLinkDays: number;
  privacyRequestsYears: number;
};

export function getRetentionConfig(): RetentionConfig {
  return {
    sessionsYears: toInt(process.env.RETENTION_SESSIONS_YEARS, 7),
    sessionHistoryYears: toInt(process.env.RETENTION_SESSION_HISTORY_YEARS, 7),
    invoicesYears: toInt(process.env.RETENTION_INVOICES_YEARS, 7),
    auditYears: toInt(process.env.RETENTION_AUDIT_YEARS, 5),
    magicLinkDays: toInt(process.env.RETENTION_MAGIC_LINK_DAYS, 30),
    privacyRequestsYears: toInt(process.env.RETENTION_PRIVACY_REQUESTS_YEARS, 3)
  };
}

const subtractYears = (from: Date, years: number) => {
  const date = new Date(from.getTime());
  date.setFullYear(date.getFullYear() - years);
  return date;
};

const subtractDays = (from: Date, days: number) => {
  const date = new Date(from.getTime());
  date.setDate(date.getDate() - days);
  return date;
};

export function getRetentionCutoffs(now = new Date()) {
  const config = getRetentionConfig();
  return {
    sessionsBefore: subtractYears(now, config.sessionsYears),
    sessionHistoryBefore: subtractYears(now, config.sessionHistoryYears),
    invoicesBefore: subtractYears(now, config.invoicesYears),
    auditBefore: subtractYears(now, config.auditYears),
    magicLinkBefore: subtractDays(now, config.magicLinkDays),
    privacyRequestsBefore: subtractYears(now, config.privacyRequestsYears)
  };
}
