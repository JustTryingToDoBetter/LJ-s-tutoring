import { apiGet, qs, setActiveNav } from '/assets/portal-shared.js';
import { initTutors } from '/assets/admin/domains/tutors.js';
import { initStudents } from '/assets/admin/domains/students.js';
import { initAssignments } from '/assets/admin/domains/assignments.js';
import { initApprovals } from '/assets/admin/domains/approvals.js';
import { initPayroll } from '/assets/admin/domains/payroll.js';
import { initReconciliation } from '/assets/admin/domains/reconciliation.js';
import { initRetention } from '/assets/admin/domains/retention.js';
import { initAudit } from '/assets/admin/domains/audit.js';
import { initPrivacyRequests } from '/assets/admin/domains/privacy-requests.js';

async function initDashboard() {
  setActiveNav('dashboard');
  const counts = await apiGet('/admin/dashboard');
  qs('#countTutors').textContent = counts.tutors;
  qs('#countStudents').textContent = counts.students;
  qs('#countSessions').textContent = counts.sessions.reduce((acc, row) => acc + Number(row.count), 0);
}



const page = document.body.dataset.page;

if (page === 'dashboard') initDashboard();
if (page === 'tutors') initTutors();
if (page === 'students') initStudents();
if (page === 'assignments') initAssignments();
if (page === 'approvals') initApprovals();
if (page === 'payroll') initPayroll();
if (page === 'audit') initAudit();
if (page === 'reconciliation') initReconciliation();
if (page === 'retention') initRetention();
if (page === 'privacy-requests') initPrivacyRequests();
