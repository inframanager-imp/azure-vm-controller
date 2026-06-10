document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '/login'; return; }

  const $ = id => document.getElementById(id);
  const userAvatar = $('userAvatar'), userName = $('userName'), userRole = $('userRole');
  const btnSignout = $('btnSignout'), headerSub = $('headerSubtitle');
  const tableBody = $('auditTableBody'), emptyState = $('emptyState');
  const toastCont = $('toastContainer');
  const searchInput = $('searchInput'), btnRefresh = $('btnRefresh');

  let allLogs = [];

  async function apiCall(url, method = 'GET') {
    const res = await fetch(url, { method, headers: { 'Authorization': `Bearer ${token}` } });
    if (res.status === 401) { localStorage.removeItem('token'); window.location.href = '/login'; return; }
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || 'Request failed'); }
    return res.json();
  }

  function toast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<div class="toast-icon ${type}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><circle cx="12" cy="12" r="10"/></svg></div><span class="toast-message">${msg}</span>`;
    toastCont.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 200); }, 4000);
  }

  async function fetchProfile() {
    try {
      const p = await apiCall('/api/auth/me');
      userName.textContent = p.username;
      userRole.textContent = p.role === 'admin' ? 'Administrator' : 'Operator';
      userAvatar.textContent = p.username.charAt(0).toUpperCase();
    } catch { localStorage.removeItem('token'); window.location.href = '/login'; }
  }

  btnSignout.addEventListener('click', async () => {
    try { await apiCall('/api/auth/logout', 'POST'); } catch {}
    localStorage.removeItem('token'); window.location.href = '/login';
  });

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatTs(isoStr) {
    try {
      // DB stores UTC but without timezone marker — tell JS it's UTC
      let s = String(isoStr).trim();
      if (!s.endsWith('Z') && !s.includes('+') && !/\d{2}:\d{2}$/.test(s.slice(-6))) {
        s += 'Z';
      }
      const d = new Date(s);
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true
      }) + ' IST';
    } catch { return isoStr; }
  }

  function isSuccess(result) {
    return result && result.toLowerCase() === 'success';
  }

  function renderTable(logs) {
    tableBody.innerHTML = '';
    if (logs.length === 0) { emptyState.classList.add('show'); return; }
    emptyState.classList.remove('show');
    logs.forEach(log => {
      const row = document.createElement('tr');
      row.style.cursor = 'default';
      const ok = isSuccess(log.result);
      const resultBadge = ok
        ? `<span class="result-badge success">✓ Success</span>`
        : `<span class="result-badge failed">✕ ${esc(log.result)}</span>`;
      row.innerHTML = `
        <td><span class="ts-mono">${formatTs(log.timestamp)}</span></td>
        <td style="font-weight:500;color:var(--text-2);">${esc(log.username)}</td>
        <td style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--text-2);">${esc(log.vm_name)}</td>
        <td style="color:var(--text-2);">${esc(log.action)}</td>
        <td>${resultBadge}</td>`;
      tableBody.appendChild(row);
    });
  }

  function applyFilter() {
    const q = (searchInput.value || '').toLowerCase();
    const filtered = q
      ? allLogs.filter(l =>
          (l.vm_name || '').toLowerCase().includes(q) ||
          (l.username || '').toLowerCase().includes(q) ||
          (l.action || '').toLowerCase().includes(q)
        )
      : allLogs;
    headerSub.textContent = `${filtered.length} of ${allLogs.length} log entries`;
    renderTable(filtered);
  }

  searchInput.addEventListener('input', applyFilter);

  async function fetchLogs() {
    btnRefresh.disabled = true;
    try {
      allLogs = await apiCall('/api/audit');
      applyFilter();
    } catch (e) {
      toast(e.message || 'Failed to load audit logs', 'error');
      tableBody.innerHTML = '';
    } finally {
      btnRefresh.disabled = false;
    }
  }

  btnRefresh.addEventListener('click', fetchLogs);

  fetchProfile();
  fetchLogs();
});
