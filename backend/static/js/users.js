document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '/login'; return; }

  let users = [], editingId = null, deletingId = null;

  const $ = id => document.getElementById(id);
  const userAvatar = $('userAvatar'), userName = $('userName'), userRole = $('userRole');
  const btnSignout = $('btnSignout'), headerSub = $('headerSubtitle');
  const tableBody = $('usersTableBody'), emptyState = $('emptyState');
  const toastCont = $('toastContainer');
  const btnNew = $('btnNewUser');
  const userModal = $('userModal'), modalTitle = $('userModalTitle');
  const btnUserCancel = $('btnUserCancel'), btnUserSave = $('btnUserSave');
  const fUsername = $('fUsername'), fEmail = $('fEmail'), fRole = $('fRole');
  const fPassword = $('fPassword'), fActive = $('fActive'), activeText = $('activeText');
  const pwNote = $('pwNote'), userFormError = $('userFormError');
  const deleteModal = $('deleteModal'), deleteModalDesc = $('deleteModalDesc');
  const btnDelCancel = $('btnDelCancel'), btnDelConfirm = $('btnDelConfirm');

  async function apiCall(url, method = 'GET', body = null) {
    const opts = { method, headers: { 'Authorization': `Bearer ${token}` } };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch(url, opts);
    if (res.status === 401) { localStorage.removeItem('token'); window.location.href = '/login'; return; }
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || 'Request failed'); }
    return res.status === 204 ? null : res.json();
  }

  function toast(msg, type = 'info') {
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<div class="toast-icon ${type}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">${type==='success'?'<polyline points="20 6 9 17 4 12"/>':type==='error'?'<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>':'<circle cx="12" cy="12" r="10"/>'}</svg></div><span class="toast-message">${msg}</span>`;
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

  async function fetchUsers() {
    try {
      users = await apiCall('/api/users');
      renderTable();
    } catch (e) { toast(e.message || 'Failed to load users', 'error'); tableBody.innerHTML = ''; }
  }

  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function renderTable() {
    tableBody.innerHTML = '';
    headerSub.textContent = `${users.length} user${users.length===1?'':'s'} registered`;
    if (users.length === 0) { emptyState.classList.add('show'); return; }
    emptyState.classList.remove('show');
    users.forEach(u => {
      const row = document.createElement('tr');
      row.style.cursor = 'default';
      const roleBadge = u.role === 'admin'
        ? `<span class="role-badge admin">Admin</span>`
        : `<span class="role-badge user">Operator</span>`;
      const statusBadge = u.is_active
        ? `<span class="status-badge active"><span class="dot green"></span>Active</span>`
        : `<span class="status-badge inactive"><span class="dot grey"></span>Inactive</span>`;
      row.innerHTML = `
        <td style="font-weight:600;color:var(--text);">${esc(u.username)}</td>
        <td style="color:var(--text-2);">${esc(u.email)}</td>
        <td>${roleBadge}</td>
        <td>${statusBadge}</td>
        <td>
          <div class="actions-cell">
            <button class="action-icon-btn btn-edit" data-id="${u.id}" title="Edit user">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              <span>Edit</span>
            </button>
            <button class="action-icon-btn btn-del" data-id="${u.id}" title="Delete user">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </button>
          </div>
        </td>`;
      row.querySelector('.btn-edit').addEventListener('click', () => openEditModal(u));
      row.querySelector('.btn-del').addEventListener('click', () => openDeleteModal(u));
      tableBody.appendChild(row);
    });
  }

  fActive.addEventListener('change', () => { activeText.textContent = fActive.checked ? 'Active' : 'Inactive'; });

  function resetForm() {
    fUsername.value = ''; fEmail.value = ''; fRole.value = 'user';
    fPassword.value = ''; fActive.checked = true; activeText.textContent = 'Active';
    userFormError.textContent = '';
  }

  function openCreateModal() {
    editingId = null; resetForm();
    fUsername.disabled = false;
    modalTitle.textContent = 'New user';
    btnUserSave.textContent = 'Create user';
    pwNote.textContent = '(required)';
    userModal.classList.add('open'); fUsername.focus();
  }

  function openEditModal(u) {
    editingId = u.id; resetForm();
    fUsername.value = u.username; fUsername.disabled = true;
    fEmail.value = u.email; fRole.value = u.role;
    fActive.checked = u.is_active; activeText.textContent = u.is_active ? 'Active' : 'Inactive';
    modalTitle.textContent = 'Edit user';
    btnUserSave.textContent = 'Save changes';
    pwNote.textContent = '(leave blank to keep existing)';
    userModal.classList.add('open'); fEmail.focus();
  }

  function openDeleteModal(u) {
    deletingId = u.id;
    deleteModalDesc.textContent = `Delete user "${u.username}"? This cannot be undone.`;
    deleteModal.classList.add('open'); btnDelConfirm.focus();
  }

  function closeUserModal() { userModal.classList.remove('open'); fUsername.disabled = false; }
  function closeDeleteModal() { deleteModal.classList.remove('open'); deletingId = null; }

  btnNew.addEventListener('click', openCreateModal);
  btnUserCancel.addEventListener('click', closeUserModal);
  userModal.addEventListener('click', e => { if (e.target === userModal) closeUserModal(); });
  btnDelCancel.addEventListener('click', closeDeleteModal);
  deleteModal.addEventListener('click', e => { if (e.target === deleteModal) closeDeleteModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeUserModal(); closeDeleteModal(); }
  });

  btnUserSave.addEventListener('click', async () => {
    userFormError.textContent = '';
    const email = fEmail.value.trim(), role = fRole.value, isActive = fActive.checked, pw = fPassword.value;
    if (!email) { userFormError.textContent = 'Email is required.'; return; }
    if (editingId === null && !pw) { userFormError.textContent = 'Password is required.'; return; }
    if (editingId === null && !fUsername.value.trim()) { userFormError.textContent = 'Username is required.'; return; }
    btnUserSave.disabled = true; btnUserSave.textContent = 'Saving…';
    try {
      if (editingId === null) {
        await apiCall('/api/users', 'POST', { username: fUsername.value.trim(), email, role, is_active: isActive, password: pw });
        toast(`User "${fUsername.value.trim()}" created.`, 'success');
      } else {
        const payload = { email, role, is_active: isActive };
        if (pw) payload.password = pw;
        await apiCall(`/api/users/${editingId}`, 'PUT', payload);
        toast('User updated.', 'success');
      }
      closeUserModal(); await fetchUsers();
    } catch (e) { userFormError.textContent = e.message || 'Failed to save user.'; }
    finally { btnUserSave.disabled = false; btnUserSave.textContent = editingId === null ? 'Create user' : 'Save changes'; }
  });

  btnDelConfirm.addEventListener('click', async () => {
    if (!deletingId) return;
    btnDelConfirm.disabled = true; btnDelConfirm.textContent = 'Deleting…';
    try {
      await apiCall(`/api/users/${deletingId}`, 'DELETE');
      toast('User deleted.', 'success'); closeDeleteModal(); await fetchUsers();
    } catch (e) { toast(e.message || 'Failed to delete.', 'error'); }
    finally { btnDelConfirm.disabled = false; btnDelConfirm.textContent = 'Delete'; }
  });

  fetchProfile(); fetchUsers();
});
