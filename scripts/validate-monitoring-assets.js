#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const alertsPath = path.join(root, 'ops', 'monitoring', 'prometheus', 'alerts.yml');
const dashboardPath = path.join(root, 'ops', 'monitoring', 'grafana', 'api-overview.dashboard.json');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function mustInclude(haystack, needle, context) {
  if (!haystack.includes(needle)) {
    fail(`Monitoring validation failed: missing ${context} (${needle})`);
  }
}

if (!fs.existsSync(alertsPath)) {
  fail('Monitoring validation failed: missing Prometheus alerts file at ops/monitoring/prometheus/alerts.yml');
}
if (!fs.existsSync(dashboardPath)) {
  fail('Monitoring validation failed: missing Grafana dashboard file at ops/monitoring/grafana/api-overview.dashboard.json');
}

const alertsRaw = fs.readFileSync(alertsPath, 'utf8');
const requiredAlerts = [
  'ProjectOdysseusHighErrorRate',
  'ProjectOdysseusSlowRequestRate',
  'ProjectOdysseusRequestVolumeDrop',
  'ProjectOdysseusReadyProbeFailing',
];

for (const alertName of requiredAlerts) {
  mustInclude(alertsRaw, `alert: ${alertName}`, 'alert rule');
}

const requiredMetricFragments = [
  'po_requests_total',
  'po_requests_error_total',
  'po_requests_slow_total',
  'probe_success{job="project-odysseus-ready"}',
];

for (const metric of requiredMetricFragments) {
  mustInclude(alertsRaw, metric, 'alert expression metric');
}

let dashboard;
try {
  dashboard = JSON.parse(fs.readFileSync(dashboardPath, 'utf8'));
} catch (error) {
  fail(`Monitoring validation failed: invalid dashboard JSON (${error.message})`);
}

if (!Array.isArray(dashboard.panels) || dashboard.panels.length < 4) {
  fail('Monitoring validation failed: dashboard must define at least 4 panels');
}

const panelTitles = dashboard.panels.map((panel) => String(panel.title || ''));
const requiredTitles = [
  'Request Rate (req/s)',
  'Error Rate (%)',
  'Slow Request Ratio (%)',
  'Total Requests (1h)',
];

for (const title of requiredTitles) {
  if (!panelTitles.includes(title)) {
    fail(`Monitoring validation failed: missing dashboard panel title (${title})`);
  }
}

const dashboardQueryBlob = dashboard.panels
  .flatMap((panel) => Array.isArray(panel.targets) ? panel.targets : [])
  .map((target) => String(target.expr || ''))
  .join('\n');

for (const metric of ['po_requests_total', 'po_requests_error_total', 'po_requests_slow_total']) {
  mustInclude(dashboardQueryBlob, metric, 'dashboard query metric');
}

console.log('monitoring_assets_validation_passed');
