
import { apiFetch, loadJson, renderList, setActiveNav } from '/assets/common.js';
setActiveNav('career');

(async () => {
  const [goals, current] = await Promise.all([
    loadJson('/career/goals').catch(() => ({ items: [] })),
    loadJson('/career/me').catch(() => ({ selections: [], snapshots: [] })),
  ]);

  renderList(document.getElementById('careerGoalLibrary'), goals.items || goals.goals || [], (goal) => `
    <label><input type="checkbox" value="${goal.id || goal.goalId}"> ${goal.title || goal.name || goal.id}</label>
  `);

  const selected = new Set((current.selections || current.goalIds || []).map((item) => item.goalId || item));
  document.querySelectorAll('#careerGoalLibrary input[type="checkbox"]').forEach((input) => {
    input.checked = selected.has(input.value);
  });

  renderList(document.getElementById('careerRoadmapList'), current.snapshots || current.items || [], (item) => `
    <strong>${item.goalId || item.goal_id}</strong>
    <div>Alignment: ${item.alignmentScore ?? item.alignment_score ?? 0}%</div>
  `);

  const tags = document.getElementById('careerVaultTags');
  tags.innerHTML = '';
  ((current.snapshots || []).flatMap((item) => item.recommendedTags || [])).slice(0, 8).forEach((tag) => {
    const span = document.createElement('span');
    span.className = 'badge';
    span.textContent = tag;
    tags.appendChild(span);
  });
})();

document.getElementById('saveCareerGoalsBtn')?.addEventListener('click', async () => {
  const goalIds = Array.from(document.querySelectorAll('#careerGoalLibrary input[type="checkbox"]:checked')).map((input) => input.value);
  await apiFetch('/career/me/goals', { method: 'POST', body: { goalIds } }).catch(() => null);
  window.location.reload();
});
