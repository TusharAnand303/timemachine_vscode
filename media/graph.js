/* global acquireVsCodeApi */
(() => {
  'use strict';
  const vscode = acquireVsCodeApi();
  const saved = vscode.getState() || {};
  const state = { projects: [], projectId: saved.projectId || '', folder: saved.folder || '', filter: saved.filter || 'all', range: saved.range || 'all', search: saved.search || '', commandSearch: saved.commandSearch || '', section: saved.section || 'graph', selectedId: saved.selectedId || '', receivedAt: Date.now() };
  const $ = id => document.getElementById(id);
  const create = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = String(content);
    return node;
  };
  const persist = () => vscode.setState({ projectId: state.projectId, folder: state.folder, filter: state.filter, range: state.range, search: state.search, commandSearch: state.commandSearch, section: state.section, selectedId: state.selectedId });
  const dateTime = at => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const time = at => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const day = at => new Date(at).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const project = () => state.projects.find(item => item.id === state.projectId) || state.projects[0];
  const label = event => event.kind === 'save' ? `${event.name} saved` : event.kind === 'command' ? event.command : event.kind === 'file' ? `${event.name} ${event.change}` : event.kind === 'branch' ? `Branch ${event.from} → ${event.to}` : event.kind === 'checkpoint' ? `Checkpoint: ${event.name}` : event.kind === 'ready' ? 'Server ready' : `Session started · ${project()?.name || event.directory}`;
  const kindLabel = event => event.kind === 'save' ? 'FILE SAVED' : event.kind === 'command' ? event.check ? event.check.toUpperCase() : event.dependencyInstall ? 'DEPENDENCY INSTALL' : 'COMMAND' : event.kind === 'file' ? 'FILE CHANGE' : event.kind === 'branch' ? 'BRANCH' : event.kind === 'checkpoint' ? 'CHECKPOINT' : event.kind === 'ready' ? 'SERVER READY' : 'SESSION';
  const symbol = event => event.kind === 'save' ? '📝' : event.kind === 'command' ? event.check ? event.status === 'passed' ? '✅' : event.status === 'failed' ? '❌' : '›_' : event.dependencyInstall ? '📦' : '›_' : event.kind === 'file' ? '◇' : event.kind === 'branch' ? '⑂' : event.kind === 'checkpoint' ? '◆' : event.kind === 'ready' ? '◉' : '⌁';
  const duration = event => event.finishedAt && event.finishedAt >= event.at ? `${Math.max(0.1, (event.finishedAt - event.at) / 1000).toFixed(1)}s` : '';
  const status = event => event.kind === 'command' ? event.status : event.kind;
  const openingSource = event => event.reason === 'startup' ? 'Extension started' : event.reason === 'folder-added' ? 'Folder added' : 'Opening recorded';
  const openingReason = event => event.reason === 'startup' ? 'TimeMachine started with this project folder open.' : event.reason === 'folder-added' ? 'This project folder was added to the VS Code workspace.' : 'Folder was open when TimeMachine started, or was added to the workspace.';
  const eventInfo = event => {
    if (event.kind === 'save') return event.added === undefined ? 'Snapshot unavailable' : `+${event.added}  −${event.removed}`;
    if (event.kind === 'command') return `${event.status[0].toUpperCase() + event.status.slice(1)}${event.lastKnownGood ? ' · LAST KNOWN GOOD' : ''}${duration(event) ? ` · ${duration(event)}` : ''}`;
    if (event.kind === 'file') return event.oldName ? `From ${event.oldName}` : event.change;
    if (event.kind === 'branch') return event.commit || '';
    if (event.kind === 'checkpoint') return `${event.files?.length || 0} files`;
    if (event.kind === 'ready') return event.terminal;
    return openingReason(event);
  };
  const formatDuration = milliseconds => {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours) return `${hours}h ${minutes}m`;
    if (minutes) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };
  const visibleEvents = () => {
    const current = project();
    if (!current) return [];
    const now = Date.now();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const query = state.search.trim().toLocaleLowerCase();
    return current.events.filter(event => {
      if (state.filter === 'commands' && event.kind !== 'command') return false;
      if (state.filter === 'openings' && event.kind !== 'opened') return false;
      if (state.filter === 'saves' && event.kind !== 'save') return false;
      if (state.filter === 'failures' && !(event.kind === 'command' && event.status === 'failed')) return false;
      if (state.folder && event.directory !== state.folder && !event.directory.startsWith(`${state.folder}/`)) return false;
      if (state.range === 'today' && event.at < today.getTime()) return false;
      if (state.range === 'week' && event.at < now - 7 * 24 * 60 * 60 * 1000) return false;
      return !query || [label(event), current.path, event.directory, event.kind, event.terminal || '', event.status || ''].some(value => String(value).toLocaleLowerCase().includes(query));
    }).sort((a, b) => b.at - a.at);
  };
  function renderStats(current) {
    const stats = $('stats'); stats.replaceChildren();
    const events = current ? current.events : [];
    const commands = events.filter(event => event.kind === 'command');
    const failed = commands.filter(event => event.status === 'failed');
    const saves = events.filter(event => event.kind === 'save');
    const running = commands.filter(event => event.status === 'running');
    for (const [name, value, caption, accent] of [
      ['EVENTS', events.length, 'in this project', 'violet'],
      ['COMMANDS', commands.length, `${running.length} running now`, 'blue'],
      ['FILES SAVED', saves.length, `${new Set(saves.map(event => event.name)).size} unique files`, 'mint'],
      ['FAILURES', failed.length, 'inspect what changed', 'coral'],
    ]) {
      const card = create('div', `stat ${accent}`);
      card.append(create('div', 'stat-name', name), create('div', 'stat-value', value), create('div', 'stat-caption', caption));
      stats.append(card);
    }
  }
  function renderFocus(current) {
    const activity = current?.activity || { today: { codingMs: 0, aiMs: 0 }, all: { codingMs: 0, aiMs: 0 }, mode: null, focused: false, activeProjectId: null };
    const elapsed = activity.mode && activity.focused ? Math.max(0, Date.now() - state.receivedAt) : 0;
    $('coding-time').textContent = formatDuration(activity.today.codingMs + (activity.mode === 'coding' ? elapsed : 0));
    $('ai-time').textContent = formatDuration(activity.today.aiMs + (activity.mode === 'ai' ? elapsed : 0));
    $('coding-all').textContent = `All time ${formatDuration(activity.all.codingMs + (activity.mode === 'coding' ? elapsed : 0))}`;
    $('ai-all').textContent = `All time ${formatDuration(activity.all.aiMs + (activity.mode === 'ai' ? elapsed : 0))}`;
    const otherProject = state.projects.find(item => item.id === activity.activeProjectId);
    $('focus-status').textContent = activity.mode ? activity.focused ? activity.mode === 'coding' ? 'Tracking coding' : 'Tracking AI-assisted' : 'Paused while unfocused' : otherProject ? activity.focused ? `Tracking ${otherProject.name}` : 'Paused while unfocused' : 'Paused';
    $('focus-status').classList.toggle('running', Boolean(activity.activeProjectId && activity.focused));
    $('start-coding').classList.toggle('active', activity.mode === 'coding');
    $('start-ai').classList.toggle('active', activity.mode === 'ai');
    $('pause-timer').disabled = !activity.activeProjectId;
  }
  function renderProjects() {
    const select = $('project'); select.replaceChildren();
    const current = project();
    $('reveal-project').disabled = !current;
    $('copy-project-path').disabled = !current;
    $('export-report').disabled = !current;
    if (!state.projects.length) {
      const option = create('option', '', 'No project open'); option.value = ''; select.append(option);
      $('project-path').textContent = 'Open a folder in VS Code to begin recording activity.';
      $('project-summary').textContent = '';
      return;
    }
    for (const item of state.projects) {
      const option = create('option', '', item.name); option.value = item.id; select.append(option);
    }
    select.value = state.projectId;
    $('project-path').textContent = current.path;
    const openings = current.events.filter(event => event.kind === 'opened').length;
    $('project-summary').textContent = `${current.events.length} recorded events · ${openings} project ${openings === 1 ? 'opening' : 'openings'}`;
  }
  function renderFolders(current) {
    const select = $('folder'); select.replaceChildren();
    const all = create('option', '', 'All folders'); all.value = ''; select.append(all);
    if (current) {
      const folders = new Set(current.events.map(event => event.directory));
      folders.add(current.name);
      for (const name of [...folders].sort((a, b) => a.localeCompare(b))) {
        const option = create('option', '', name); option.value = name; select.append(option);
      }
      if (!folders.has(state.folder)) state.folder = '';
    }
    select.value = state.folder;
  }
  function renderNodes(events) {
    const container = $('nodes'); container.replaceChildren();
    const empty = $('empty');
    empty.hidden = events.length > 0;
    if (!events.length) {
      const current = project();
      empty.replaceChildren(create('div', 'empty-symbol', '⌁'), create('h3', '', current && current.events.length ? 'No matching activity' : 'Your graph starts here'), create('p', '', current && current.events.length ? 'Try another filter, time range, or search.' : 'Open a project, save a file, or run a command in a new integrated terminal.'));
    }
    $('result-count').textContent = `${events.length} ${events.length === 1 ? 'event' : 'events'}`;
    let previousDay = '';
    for (const [index, event] of events.entries()) {
      const eventDay = new Date(event.at).toDateString();
      if (eventDay !== previousDay) {
        const divider = create('div', 'date-divider', day(event.at)); container.append(divider);
        previousDay = eventDay;
      }
      const row = create('div', 'event-row'); row.dataset.id = event.id;
      const card = create('button', `node kind-${event.kind} status-${status(event)}${state.selectedId === event.id ? ' selected' : ''}`);
      card.type = 'button'; card.dataset.id = event.id;
      card.setAttribute('aria-pressed', String(state.selectedId === event.id));
      card.setAttribute('aria-label', `${kindLabel(event)}: ${label(event)}, ${dateTime(event.at)}. ${eventInfo(event)}`);
      const dot = create('span', 'node-dot', symbol(event)); dot.setAttribute('aria-hidden', 'true');
      const top = create('span', 'node-top'); top.append(create('span', 'node-kind', kindLabel(event)), create('span', 'node-time', time(event.at)));
      const title = create('span', 'node-title', label(event));
      const meta = create('span', 'node-meta');
      if (event.kind === 'opened') {
        const source = create('span', 'node-source', openingSource(event));
        meta.append(source, create('span', 'node-info', eventInfo(event)), create('span', 'node-path', `Folder: ${project().path}`));
      } else {
        meta.append(create('span', 'node-folder', event.directory), create('span', 'node-info', eventInfo(event)));
      }
      card.append(dot, top, title, meta); row.append(card); container.append(row);
      if (event.kind === 'opened' && event.reason === 'startup' && index < events.length - 1 && new Date(events[index + 1].at).toDateString() === eventDay) {
        container.append(create('div', 'session-divider', 'Earlier session'));
      }
    }
    requestAnimationFrame(drawEdges);
  }
  function drawEdges() {
    const graph = $('graph'); const svg = $('edges'); svg.replaceChildren();
    const bounds = graph.getBoundingClientRect();
    const dots = new Map();
    for (const row of $('nodes').querySelectorAll('.event-row')) {
      const dot = row.querySelector('.node-dot').getBoundingClientRect();
      dots.set(row.dataset.id, { x: dot.left + dot.width / 2 - bounds.left, y: dot.top + dot.height / 2 - bounds.top });
    }
    const height = $('nodes').offsetHeight + 20;
    svg.setAttribute('width', String(graph.clientWidth)); svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${graph.clientWidth} ${height}`);
    const svgNode = (name, attributes) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', name);
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
      svg.append(node);
    };
    const ids = Array.from(dots.keys());
    for (let i = 0; i < ids.length - 1; i++) {
      const a = dots.get(ids[i]); const b = dots.get(ids[i + 1]);
      const mid = (a.y + b.y) / 2;
      svgNode('path', { class: 'edge-time', d: `M ${a.x} ${a.y} C ${a.x} ${mid}, ${b.x} ${mid}, ${b.x} ${b.y}` });
    }
    const current = project();
    if (!current) return;
    for (const event of current.events) {
      const from = dots.get(event.id);
      if (!from) continue;
      const targets = event.kind === 'command' ? event.relatedIds || [] : event.kind === 'ready' && event.linkToId ? [event.linkToId] : [];
      for (const targetId of targets) {
        const to = dots.get(targetId);
        if (!to) continue;
        const mid = (from.y + to.y) / 2;
        svgNode('path', { class: event.kind === 'ready' ? 'edge-ready' : 'edge-related', d: `M ${from.x} ${from.y} C ${from.x} ${mid}, ${to.x} ${mid}, ${to.x} ${to.y}` });
      }
    }
  }
  function detailRow(title, value) {
    const row = create('div', `detail-row${title === 'Project path' ? ' path' : ''}`);
    row.append(create('span', 'detail-label', title), create('span', 'detail-value', value)); return row;
  }
  function action(labelText, type, id, primary = false) {
    const button = create('button', `action${primary ? ' primary' : ''}`, labelText);
    button.type = 'button'; button.addEventListener('click', () => vscode.postMessage({ type, id })); return button;
  }
  function renderHistory(current) {
    const list = $('history-list'); list.replaceChildren();
    const commands = current ? current.events.filter(event => event.kind === 'command') : [];
    const query = state.commandSearch.trim().toLocaleLowerCase();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const shown = commands.filter(event => {
      if (state.folder && event.directory !== state.folder && !event.directory.startsWith(`${state.folder}/`)) return false;
      if (state.range === 'today' && event.at < today.getTime()) return false;
      if (state.range === 'week' && event.at < Date.now() - 7 * 24 * 60 * 60 * 1000) return false;
      return !query || [event.command, event.terminal, event.directory, event.status].some(value => String(value).toLocaleLowerCase().includes(query));
    }).sort((a, b) => b.at - a.at);
    $('history-count').textContent = `${shown.length} shown · ${commands.length} recorded · ${new Set(commands.map(event => event.command)).size} unique commands`;
    if (state.section === 'history') $('result-count').textContent = `${shown.length} ${shown.length === 1 ? 'command' : 'commands'}`;
    $('clear-commands').disabled = !commands.length;
    if (!shown.length) {
      const empty = create('div', 'history-empty', commands.length ? 'No commands match this search or filter.' : 'No commands recorded yet. Run one in a new integrated terminal.');
      list.append(empty); return;
    }
    for (const event of shown) {
      const row = create('div', 'history-row');
      const body = create('div', 'history-body');
      const top = create('div', 'history-top'); top.append(create('span', `history-status status-${event.status}`, event.status), create('span', 'history-date', dateTime(event.at)));
      body.append(top, create('code', 'history-command', event.command), create('div', 'history-meta', `${event.directory} · ${event.terminal}${event.exitCode !== undefined ? ` · exit ${event.exitCode}` : ''}${duration(event) ? ` · ${duration(event)}` : ''}`));
      const buttons = create('div', 'history-actions');
      const inspect = create('button', '', 'View in graph'); inspect.type = 'button'; inspect.addEventListener('click', () => { state.section = 'graph'; state.filter = 'all'; state.range = 'all'; state.folder = ''; state.search = ''; state.selectedId = event.id; render(); document.querySelector(`.node[data-id="${CSS.escape(event.id)}"]`)?.scrollIntoView({ block: 'center' }); });
      const remove = create('button', 'danger', 'Delete'); remove.type = 'button'; remove.addEventListener('click', () => vscode.postMessage({ type: 'deleteEvent', id: event.id }));
      const copy = action('Copy command', 'copyCommand', event.id);
      buttons.append(copy, inspect, remove); row.append(body, buttons); list.append(row);
    }
  }
  function renderDetail() {
    const detail = $('detail'); detail.replaceChildren();
    const current = project(); const event = current && current.events.find(item => item.id === state.selectedId);
    if (!event) {
      const intro = create('div', 'detail-placeholder');
      intro.append(create('div', 'detail-placeholder-icon', '◎'), create('h2', '', 'Explore an event'), create('p', '', 'Select a node to see its project, folder, command result, and related file changes.'));
      detail.append(intro); return;
    }
    const header = create('div', 'detail-header');
    header.append(create('div', 'field-label', 'EVENT DETAILS'), create('div', `detail-icon kind-${event.kind} status-${status(event)}`, symbol(event)), create('div', 'detail-type', kindLabel(event)), create('h2', 'detail-title', label(event)), create('div', 'detail-date', dateTime(event.at)));
    detail.append(header);
    const section = create('section', 'detail-section'); section.append(create('h3', '', 'Context'));
    section.append(detailRow('Project', current.name), detailRow('Project path', current.path), detailRow('Folder', event.directory));
    if (event.kind === 'opened') {
      const openings = current.events.filter(item => item.kind === 'opened').sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
      const index = openings.findIndex(item => item.id === event.id);
      section.append(detailRow('Recorded at', new Date(event.at).toLocaleString()), detailRow('Opening record', `${index + 1} of ${openings.length}`));
      if (index > 0) section.append(detailRow('Previous opening', new Date(openings[index - 1].at).toLocaleString()));
      section.append(create('p', 'detail-note', openingReason(event)), create('p', 'detail-note', 'Reloading VS Code or restarting the extension can record another opening. These entries are activity records; they do not measure session duration.'));
      const actions = create('div', 'detail-actions');
      for (const [title, type] of [['Show folder in Explorer', 'revealProject'], ['Copy project path', 'copyProjectPath']]) {
        const button = create('button', 'action', title); button.type = 'button';
        button.addEventListener('click', () => vscode.postMessage({ type, projectId: current.id })); actions.append(button);
      }
      if (index > 0) {
        const previous = create('button', 'action', 'View previous opening'); previous.type = 'button';
        previous.addEventListener('click', () => {
          select(openings[index - 1].id);
          const card = document.querySelector(`.node[data-id="${CSS.escape(openings[index - 1].id)}"]`);
          card?.scrollIntoView({ block: 'center' }); card?.focus();
        });
        actions.append(previous);
      }
      section.append(actions);
    }
    if (event.kind === 'command') {
      section.append(detailRow('Result', event.status), detailRow('Terminal', event.terminal));
      if (event.lastKnownGood) section.append(detailRow('Milestone', 'LAST KNOWN GOOD'));
      if (event.exitCode !== undefined) section.append(detailRow('Exit code', event.exitCode));
      if (duration(event)) section.append(detailRow('Duration', duration(event)));
      if (event.cwdInferred) section.append(create('p', 'detail-note', 'Folder was inferred because the shell did not report its working directory.'));
    }
    if (event.kind === 'save') {
      section.append(detailRow('Lines added', event.added === undefined ? 'Unavailable' : `+${event.added}`), detailRow('Lines removed', event.removed === undefined ? 'Unavailable' : `−${event.removed}`));
    }
    if (event.kind === 'ready') section.append(detailRow('Terminal', event.terminal));
    detail.append(section);
    if (event.kind === 'command' && event.status === 'failed') {
      const related = (event.relatedIds || []).map(id => current.events.find(item => item.id === id)).filter(Boolean);
      const relatedSection = create('section', 'detail-section related-section');
      relatedSection.append(create('h3', '', 'Changes before failure'));
      relatedSection.append(create('p', 'detail-note', related.length ? event.hasPreviousPass ? 'These files were saved since the last passing run of this command. Timing is a clue, not proof of cause.' : 'This is the most recent saved file before the failure. There is no earlier passing run to compare against.' : 'No related saved file was found in the recorded history.'));
      for (const save of related) {
        const link = create('button', 'related-item', save.name); link.type = 'button';
        link.addEventListener('click', () => select(save.id)); relatedSection.append(link);
      }
      detail.append(relatedSection);
    }
    if (event.kind === 'save') {
      const actions = create('div', 'detail-actions');
      actions.append(action('Open current file', 'openFile', event.id, true));
      if (event.before && event.after) actions.append(action('Compare saved change', 'compare', event.id), action('Restore before save', 'restore', event.id));
      detail.append(actions);
    }
    if (event.kind === 'command') {
      const actions = create('div', 'detail-actions');
      if (event.canInvestigate) actions.append(action('What Changed?', 'whatChanged', event.id, true));
      actions.append(action('Copy command', 'copyCommand', event.id, !event.canInvestigate)); detail.append(actions);
    }
    if (event.kind === 'checkpoint') {
      const actions = create('div', 'detail-actions'); actions.append(action('Compare with current files', 'compareCheckpoint', event.id, true)); detail.append(actions);
    }
    const deleteActions = create('div', 'detail-actions'); deleteActions.append(action('Delete this event', 'deleteEvent', event.id)); detail.append(deleteActions);
  }
  function select(id) {
    state.selectedId = id; persist(); renderDetail();
    for (const card of document.querySelectorAll('.node')) {
      const selected = card.dataset.id === id;
      card.classList.toggle('selected', selected);
      card.setAttribute('aria-pressed', String(selected));
    }
  }
  function render() {
    const current = project();
    renderProjects(); renderFolders(current); renderStats(current); renderFocus(current);
    const history = state.section === 'history';
    document.querySelector('.toolbar-heading h2').textContent = history ? 'Command history' : 'Activity graph';
    for (const button of $('sections').querySelectorAll('button')) {
      const active = button.dataset.section === state.section;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    }
    $('filters').hidden = history;
    $('lane-headings').hidden = history;
    $('graph-scroll').hidden = history;
    $('graph-footer').hidden = history;
    $('history').hidden = !history;
    $('search').hidden = history;
    for (const button of $('filters').querySelectorAll('button')) {
      const active = button.dataset.filter === state.filter;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    }
    $('range').value = state.range;
    if ($('search').value !== state.search) $('search').value = state.search;
    if ($('command-search').value !== state.commandSearch) $('command-search').value = state.commandSearch;
    renderNodes(visibleEvents()); renderHistory(current); renderDetail(); persist();
  }
  $('project').addEventListener('change', event => { state.projectId = event.target.value; state.folder = ''; state.selectedId = ''; render(); });
  $('reveal-project').addEventListener('click', () => { const current = project(); if (current) vscode.postMessage({ type: 'revealProject', projectId: current.id }); });
  $('copy-project-path').addEventListener('click', () => { const current = project(); if (current) vscode.postMessage({ type: 'copyProjectPath', projectId: current.id }); });
  $('export-report').addEventListener('click', () => { const current = project(); if (current) vscode.postMessage({ type: 'exportReport', projectId: current.id }); });
  $('folder').addEventListener('change', event => { state.folder = event.target.value; render(); });
  $('range').addEventListener('change', event => { state.range = event.target.value; render(); });
  $('search').addEventListener('input', event => { state.search = event.target.value; render(); });
  $('filters').addEventListener('click', event => {
    const button = event.target.closest('button[data-filter]');
    if (button) { state.filter = button.dataset.filter; render(); }
  });
  $('sections').addEventListener('click', event => {
    const button = event.target.closest('button[data-section]');
    if (button) { state.section = button.dataset.section; render(); if (state.section === 'history') $('command-search').focus(); }
  });
  $('command-search').addEventListener('input', event => { state.commandSearch = event.target.value; renderHistory(project()); persist(); });
  $('start-coding').addEventListener('click', () => { const current = project(); if (current) vscode.postMessage({ type: 'startTimer', projectId: current.id, mode: 'coding' }); });
  $('start-ai').addEventListener('click', () => { const current = project(); if (current) vscode.postMessage({ type: 'startTimer', projectId: current.id, mode: 'ai' }); });
  $('pause-timer').addEventListener('click', () => vscode.postMessage({ type: 'pauseTimer' }));
  $('clear-commands').addEventListener('click', () => { const current = project(); if (current) vscode.postMessage({ type: 'clearCommands', projectId: current.id }); });
  $('clear-project').addEventListener('click', () => { const current = project(); if (current) vscode.postMessage({ type: 'clearProject', projectId: current.id }); });
  $('nodes').addEventListener('click', event => {
    const card = event.target.closest('.node'); if (card) select(card.dataset.id);
  });
  $('nodes').addEventListener('keydown', event => {
    const card = event.target.closest('.node');
    if (!card || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const cards = [...$('nodes').querySelectorAll('.node')];
    const index = cards.indexOf(card);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : Math.max(0, Math.min(cards.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    event.preventDefault();
    cards[next].focus(); select(cards[next].dataset.id);
  });
  $('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
  $('latest').addEventListener('click', () => $('graph-scroll').scrollTo({ top: 0, behavior: 'smooth' }));
  window.addEventListener('resize', () => requestAnimationFrame(drawEdges));
  new ResizeObserver(() => requestAnimationFrame(drawEdges)).observe($('graph'));
  setInterval(() => renderFocus(project()), 1000);
  window.addEventListener('message', event => {
    if (event.data?.type === 'projectPathCopied') {
      $('project-feedback').textContent = 'Path copied';
      clearTimeout(state.feedbackTimer);
      state.feedbackTimer = setTimeout(() => { $('project-feedback').textContent = ''; }, 2500);
      return;
    }
    if (event.data?.type !== 'data' || !Array.isArray(event.data.projects)) return;
    state.projects = event.data.projects;
    state.receivedAt = Date.now();
    if (!state.projects.some(item => item.id === state.projectId)) state.projectId = state.projects[0]?.id || '';
    if (event.data.section === 'history' || event.data.section === 'graph') state.section = event.data.section;
    if (event.data.revealId) {
      const owner = state.projects.find(item => item.events.some(entry => entry.id === event.data.revealId));
      if (owner) { state.projectId = owner.id; state.selectedId = event.data.revealId; state.folder = ''; state.filter = 'all'; state.range = 'all'; state.search = ''; }
    }
    const scroll = $('graph-scroll').scrollTop;
    if (state.selectedId && !state.projects.some(item => item.events.some(entry => entry.id === state.selectedId))) state.selectedId = '';
    render(); $('graph-scroll').scrollTop = scroll;
    if (event.data.revealId) document.querySelector(`.node[data-id="${CSS.escape(event.data.revealId)}"]`)?.scrollIntoView({ block: 'center' });
    if (event.data.section === 'history') $('command-search').focus();
  });
  vscode.postMessage({ type: 'ready' });
})();
