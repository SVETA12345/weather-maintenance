const STATUS = {
  new:        { label: 'Новая',      css: '#2563eb' },
  in_progress:{ label: 'В работе',  css: '#ea580c' },
  done:       { label: 'Выполнена', css: '#16a34a' },
  rejected:   { label: 'Отклонена', css: '#dc2626' },
};
const PRIORITY = {
  low: 'Низкий', medium: 'Средний', high: 'Высокий', critical: 'Критический',
};
// Названия кнопок смены статуса для каждого статуса.
const ACTIONS = {
  new: [
    { to: 'in_progress', label: 'В работу' },
    { to: 'rejected', label: 'Отклонить', danger: true },
  ],
  in_progress: [
    { to: 'done', label: 'Завершить' },
    { to: 'rejected', label: 'Отклонить', danger: true },
  ],
};

const state = { page: 1, limit: 10, equipment: new Map() };

// file:// не имеет origin — обращаемся к API по абсолютному адресу;
// при раздаче страницы самим сервером используем относительные пути.
const API_BASE = location.protocol === 'file:' ? 'http://localhost:3000' : '';

const $ = (sel) => document.querySelector(sel);

function showMessage(text, type, details) {
  const el = $('#message');
  el.className = type;
  el.innerHTML = '';
  const p = document.createElement('div');
  p.textContent = text;
  el.append(p);
  if (Array.isArray(details) && details.length) {
    const ul = document.createElement('ul');
    details.forEach((d) => {
      const li = document.createElement('li');
      li.textContent = typeof d === 'string' ? d : `${d.field || ''}: ${d.message || ''}`.trim();
      ul.append(li);
    });
    el.append(ul);
  }
}
function clearMessage() { $('#message').className = ''; $('#message').innerHTML = ''; }

async function api(path, options = {}) {
  const url = /^https?:\/\//.test(path) ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error((body && body.error && body.error.message) || `Ошибка ${res.status}`);
    err.code = body && body.error && body.error.code || '';
    err.details = body && body.error && body.error.details || [];
    throw err;
  }
  return body;
}

async function loadEquipment() {
  const all = [];
  for (let page = 1; ; page += 1) {
    const res = await api(`/api/equipment?page=${page}&limit=100&sortBy=name`);
    res.data.forEach((e) => {
      state.equipment.set(e.id, e);
      all.push(e);
    });
    if (page >= Math.ceil(res.meta.total / res.meta.limit)) break;
  }
  const fill = (sel) => {
    sel.innerHTML = '';
    all.forEach((e) => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = `${e.name} (${e.serialNumber})`;
      sel.append(opt);
    });
  };
  fill($('#f-equipment'));
  fill($('#c-equipment'));
  if (!$('#c-equipment').value && all.length) {
    $('#c-equipment').value = $('#f-equipment').value;
  }
}

function buildQuery() {
  const p = new URLSearchParams({ page: state.page, limit: state.limit });
  const status = $('#f-status').value;
  const priority = $('#f-priority').value;
  const equipmentId = $('#f-equipment').value;
  if (status) p.set('status', status);
  if (priority) p.set('priority', priority);
  if (equipmentId) p.set('equipmentId', equipmentId);
  return p.toString();
}

function equipmentName(id) {
  const e = state.equipment.get(id);
  return e ? `${e.name} (${e.serialNumber})` : id;
}

function dateLabel(value) {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d) ? value : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusBadge(status) {
  const st = STATUS[status] || { label: status, css: '#6b7280' };
  return `<span class="badge" style="background:${st.css}1a;color:${st.css}">${st.label}</span>`;
}

function actionButtons(row) {
  const acts = ACTIONS[row.status];
  if (!acts) return '<span class="muted">—</span>';
  return acts
    .map(
      (a) =>
        `<button class="ghost sm ${a.danger ? 'danger' : ''}" type="button" data-action-status="${a.to}" data-id="${row.id}">${a.label}</button>`,
    )
    .join(' ');
}

async function loadRequests() {
  clearMessage();
  const tbody = $('#rows');
  tbody.innerHTML = '<tr><td colspan="7" class="empty">Загрузка…</td></tr>';
  try {
    const res = await api(`/api/requests?${buildQuery()}`);
    const pages = Math.max(1, Math.ceil(res.meta.total / res.meta.limit));
    if (state.page > pages) {
      state.page = pages;
      return loadRequests();
    }
    tbody.innerHTML = '';
    if (!res.data.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">Заявок не найдено</td></tr>';
    }
    res.data.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(r.title)}</strong></td>
        <td>${PRIORITY[r.priority] || r.priority}</td>
        <td>${statusBadge(r.status)}</td>
        <td class="muted">${escapeHtml(equipmentName(r.equipmentId))}</td>
        <td class="muted">${dateLabel(r.plannedAt)}</td>
        <td class="muted">${dateLabel(r.createdAt)}</td>
        <td class="actions">${actionButtons(r)}</td>`;
      tbody.append(tr);
    });
    $('#info').textContent = `Стр. ${res.meta.page} из ${pages} · всего ${res.meta.total}`;
    $('#prev').disabled = res.meta.page <= 1;
    $('#next').disabled = res.meta.page >= pages;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">Не удалось загрузить заявки</td></tr>`;
    showMessage(err.message, 'error', err.details);
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

$('#create-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const payload = {
    equipmentId: $('#c-equipment').value,
    title: $('#c-title').value.trim(),
    priority: $('#c-priority').value,
  };
  const description = $('#c-description').value.trim();
  if (description) payload.description = description;
  const planned = $('#c-planned').value;
  if (planned) payload.plannedAt = new Date(planned).toISOString();

  try {
    clearMessage();
    await api('/api/requests', { method: 'POST', body: JSON.stringify(payload) });
    showMessage('Заявка создана', 'success');
    $('#create-form').reset();
    state.page = 1;
    await loadRequests();
  } catch (err) {
    showMessage(err.message, 'error', err.details);
  }
});

$('#rows').addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-action-status]');
  if (!btn) return;
  try {
    clearMessage();
    await api(`/api/requests/${btn.dataset.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: btn.dataset.actionStatus }),
    });
    await loadRequests();
  } catch (err) {
    showMessage(err.message, 'error', err.details);
    await loadRequests();
  }
});

['f-status', 'f-priority', 'f-equipment'].forEach((id) => {
  $(`#${id}`).addEventListener('change', () => { state.page = 1; loadRequests(); });
});
$('#f-reset').addEventListener('click', () => {
  ['f-status', 'f-priority', 'f-equipment'].forEach((id) => { $(`#${id}`).value = ''; });
  state.page = 1;
  loadRequests();
});
$('#prev').addEventListener('click', () => { if (state.page > 1) { state.page -= 1; loadRequests(); } });
$('#next').addEventListener('click', () => { state.page += 1; loadRequests(); });

(async () => {
  try {
    await loadEquipment();
  } catch (err) {
    showMessage(err.message, 'error', err.details);
  }
  loadRequests();
})();