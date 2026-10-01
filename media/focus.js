/* global acquireVsCodeApi */
(() => {
  'use strict';
  const vscode = acquireVsCodeApi();
  const saved = vscode.getState() || {};
  const state = { projects: [], projectId: saved.projectId || '', range: ['today', 'week', 'all'].includes(saved.range) ? saved.range : 'today', receivedAt: Date.now() };
  const persist = () => vscode.setState({ projectId: state.projectId, range: state.range });
  const $ = id => document.getElementById(id);
  const current = () => state.projects.find(item => item.id === state.projectId);
  const duration = milliseconds => {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
  };
  function renderTime() {
    const project = current();
    const activity = project?.activity;
    const elapsed = activity?.mode && activity.focused ? Math.min(45000, Math.max(0, Date.now() - state.receivedAt)) : 0;
    const totals = activity?.[state.range];
    $('coding-time').textContent = duration((totals?.codingMs || 0) + (activity?.mode === 'coding' ? elapsed : 0));
    $('ai-time').textContent = duration((totals?.aiMs || 0) + (activity?.mode === 'ai' ? elapsed : 0));
    const active = state.projects.find(item => item.id === activity?.activeProjectId);
    $('status').textContent = activity?.mode
      ? activity.focused ? `Recording ${activity.mode === 'coding' ? 'my coding' : 'AI-assisted'}` : 'Paused while VS Code is unfocused'
      : active ? activity.focused ? `Recording in ${active.name}` : `Paused while unfocused · ${active.name}` : 'Paused';
    $('status').classList.toggle('recording', Boolean(activity?.mode && activity.focused));
    for (const [id, mode] of [['coding', 'coding'], ['ai', 'ai']]) {
      $(id).disabled = !project;
      $(id).classList.toggle('active', activity?.mode === mode);
      $(id).setAttribute('aria-pressed', String(activity?.mode === mode));
    }
    $('pause').disabled = !activity?.activeProjectId;
    $('export').disabled = !project;
    for (const button of $('ranges').querySelectorAll('button')) {
      const active = button.dataset.range === state.range;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    }
  }
  function render() {
    const select = $('project'); select.replaceChildren();
    for (const project of state.projects) {
      const option = document.createElement('option'); option.value = project.id; option.textContent = project.name; select.append(option);
    }
    select.value = state.projectId; select.hidden = state.projects.length < 2;
    const project = current();
    $('project-name').textContent = project?.name || 'Open a project folder';
    $('project-path').textContent = project?.path || '';
    $('hint').textContent = project ? 'Choose a mode to record time while VS Code is focused.' : 'Open a folder in this window to start recording.';
    const rows = $('days'); rows.replaceChildren();
    for (const day of [...(project?.activity.days || [])].reverse()) {
      const row = document.createElement('tr');
      for (const text of [new Date(`${day.date}T12:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric' }), duration(day.codingMs), duration(day.aiMs)]) {
        const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
      }
      rows.append(row);
    }
    renderTime();
  }
  $('project').addEventListener('change', event => { state.projectId = event.target.value; persist(); render(); });
  $('ranges').addEventListener('click', event => { const button = event.target.closest('button[data-range]'); if (button) { state.range = button.dataset.range; persist(); renderTime(); } });
  for (const [id, mode] of [['coding', 'coding'], ['ai', 'ai']]) {
    $(id).addEventListener('click', () => { if (current()) vscode.postMessage({ type: 'start', projectId: state.projectId, mode }); });
  }
  $('pause').addEventListener('click', () => vscode.postMessage({ type: 'pause' }));
  $('export').addEventListener('click', () => { if (current()) vscode.postMessage({ type: 'export', projectId: state.projectId }); });
  window.addEventListener('message', event => {
    if (event.data?.type !== 'data' || !Array.isArray(event.data.projects)) return;
    state.projects = event.data.projects; state.receivedAt = Date.now();
    if (!current()) state.projectId = state.projects.find(item => item.activity.activeProjectId === item.id)?.id || state.projects[0]?.id || '';
    persist(); render();
  });
  render(); setInterval(renderTime, 1000);
  vscode.postMessage({ type: 'ready' });
})();
