document.addEventListener('DOMContentLoaded', () => {
  // --- AUTH GUARD ---
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '/login'; return; }

  // --- STATE ---
  let schedules = [];
  let allVms    = [];   // full VM list fetched once
  let editingId = null;
  let deletingId = null;

  // --- DOM REFS ---
  const userAvatar   = document.getElementById('userAvatar');
  const userName     = document.getElementById('userName');
  const userRole     = document.getElementById('userRole');
  const btnSignout   = document.getElementById('btnSignout');
  const headerSub    = document.getElementById('headerSubtitle');
  const tableBody    = document.getElementById('schedulesTableBody');
  const emptyState   = document.getElementById('emptyState');
  const toastCont    = document.getElementById('toastContainer');
  const btnNew       = document.getElementById('btnNewSchedule');

  // Modal refs
  const scheduleModal   = document.getElementById('scheduleModalOverlay');
  const modalTitle      = document.getElementById('scheduleModalTitle');
  const btnModalCancel  = document.getElementById('btnModalCancel');
  const btnModalSave    = document.getElementById('btnModalSave');
  const fieldName       = document.getElementById('fieldName');
  const fieldTargetType = document.getElementById('fieldTargetType');
  const fieldRg         = document.getElementById('fieldRg');       // now a <select>
  const fieldVmName     = document.getElementById('fieldVmName');   // now a <select>
  const vmNameGroup     = document.getElementById('vmNameGroup');
  const fieldAction     = document.getElementById('fieldAction');
  const fieldCron       = document.getElementById('fieldCron');
  const fieldTimezone   = document.getElementById('fieldTimezone');
  const fieldEnabled    = document.getElementById('fieldEnabled');
  const enabledText     = document.getElementById('enabledText');
  const formError       = document.getElementById('formError');

  const deleteModal     = document.getElementById('deleteModalOverlay');
  const deleteModalDesc = document.getElementById('deleteModalDesc');
  const btnDeleteCancel = document.getElementById('btnDeleteCancel');
  const btnDeleteConfirm= document.getElementById('btnDeleteConfirm');

  // --- API WRAPPER ---
  async function apiCall(endpoint, method = 'GET', body = null) {
    const opts = { method, headers: { 'Authorization': `Bearer ${token}` } };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch(endpoint, opts);
    if (res.status === 401) { localStorage.removeItem('token'); window.location.href = '/login'; return; }
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || 'Request failed'); }
    return res.json();
  }

  // --- TOAST ---
  function showToast(msg, type = 'info') {
    const icons = {
      success: '<polyline points="20 6 9 17 4 12"/>',
      error:   '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
      warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>',
      info:    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'
    };
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<div class="toast-icon ${type}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">${icons[type]||icons.info}</svg></div><span class="toast-message">${msg}</span>`;
    toastCont.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 200); }, 4000);
  }

  // --- USER PROFILE ---
  async function fetchProfile() {
    try {
      const p = await apiCall('/api/auth/me');
      userName.textContent   = p.username;
      userRole.textContent   = p.role === 'admin' ? 'Administrator' : 'Operator';
      userAvatar.textContent = p.username.charAt(0).toUpperCase();
    } catch { localStorage.removeItem('token'); window.location.href = '/login'; }
  }

  btnSignout.addEventListener('click', async () => {
    try { await apiCall('/api/auth/logout', 'POST'); } catch {}
    localStorage.removeItem('token'); window.location.href = '/login';
  });

  // --- LOAD VM LIST (for dropdowns) ---
  let vmsLoaded = false;
  async function loadVms() {
    fieldRg.innerHTML = '<option value="">Loading resource groups...</option>';
    try {
      const data = await apiCall('/api/vms');
      allVms = Array.isArray(data) ? data : [];
      vmsLoaded = true;
    } catch (e) {
      allVms = [];
      vmsLoaded = true;
      showToast('Could not load VM list: ' + (e.message || 'API error'), 'warning');
    }
    populateRgDropdown();
  }

  function populateRgDropdown(selectedRg = '') {
    // Unique RGs sorted
    const rgs = [...new Set(allVms.map(v => v.resource_group))].filter(Boolean).sort();
    fieldRg.innerHTML = '<option value="">— select resource group —</option>';
    if (rgs.length === 0) {
      const opt = document.createElement('option');
      opt.value = ''; opt.disabled = true;
      opt.textContent = '(no resource groups found)';
      fieldRg.appendChild(opt);
    } else {
      rgs.forEach(rg => {
        const opt = document.createElement('option');
        opt.value = rg; opt.textContent = rg;
        if (rg === selectedRg) opt.selected = true;
        fieldRg.appendChild(opt);
      });
    }
    // Auto-select if only one RG
    if (rgs.length === 1 && !selectedRg) fieldRg.value = rgs[0];
    // Refresh VM dropdown
    populateVmDropdown(fieldRg.value);
  }

  function populateVmDropdown(rg, selectedVm = '') {
    // If no RG selected, show ALL VMs so user can pick
    const vmsInRg = rg
      ? allVms.filter(v => v.resource_group === rg).sort((a, b) => a.name.localeCompare(b.name))
      : allVms.slice().sort((a, b) => a.name.localeCompare(b.name));

    fieldVmName.innerHTML = '<option value="">— select VM —</option>';
    if (vmsInRg.length === 0) {
      const opt = document.createElement('option');
      opt.disabled = true; opt.value = '';
      opt.textContent = rg ? `(no VMs in ${rg})` : '(no VMs found)';
      fieldVmName.appendChild(opt);
    } else {
      vmsInRg.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        // Show RG in label if all VMs are shown (no RG filter)
        opt.textContent = rg
          ? `${v.name}  ·  ${v.power_state}`
          : `${v.name}  ·  ${v.resource_group}  ·  ${v.power_state}`;
        if (v.name === selectedVm) opt.selected = true;
        fieldVmName.appendChild(opt);
      });
    }
    // Auto-set RG when user picks a VM (if RG not already set)
    fieldVmName.addEventListener('change', () => {
      const picked = allVms.find(v => v.name === fieldVmName.value);
      if (picked && !fieldRg.value) {
        fieldRg.value = picked.resource_group;
      }
    }, { once: true });
  }

  // When RG changes → refresh VM dropdown
  fieldRg.addEventListener('change', () => {
    populateVmDropdown(fieldRg.value);
  });

  // When target type changes → show/hide VM selector
  fieldTargetType.addEventListener('change', () => {
    const isVm = fieldTargetType.value === 'vm';
    vmNameGroup.style.display = isVm ? '' : 'none';
    if (isVm) {
      // Show all VMs if no RG selected yet, else filter by RG
      populateVmDropdown(fieldRg.value);
    }
  });

  // Toggle enabled label
  fieldEnabled.addEventListener('change', () => {
    enabledText.textContent = fieldEnabled.checked ? 'Active' : 'Paused';
  });

  // --- FETCH SCHEDULES ---
  async function fetchSchedules() {
    try {
      schedules = await apiCall('/api/schedules');
      renderTable();
    } catch (e) {
      showToast(e.message || 'Failed to load schedules', 'error');
      tableBody.innerHTML = '';
    }
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function formatNextRun(isoStr) {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return isoStr; }
  }

  // --- RENDER TABLE ---
  function renderTable() {
    tableBody.innerHTML = '';
    if (schedules.length === 0) {
      emptyState.classList.add('show');
      headerSub.textContent = 'No schedules configured';
      return;
    }
    emptyState.classList.remove('show');
    headerSub.textContent = `${schedules.length} schedule${schedules.length === 1 ? '' : 's'} · IST timezone`;

    schedules.forEach(s => {
      const row = document.createElement('tr');
      row.style.cursor = 'default';

      const actionBadge = s.action === 'start'
        ? `<span class="action-badge start">▶ Start</span>`
        : `<span class="action-badge stop">■ Stop</span>`;

      const enabledBadge = s.is_enabled
        ? `<span class="enabled-badge on"><span class="dot"></span>Active</span>`
        : `<span class="enabled-badge"><span class="dot"></span>Paused</span>`;

      const targetLabel = s.target_type === 'vm' ? 'VM' : 'Resource Group';
      const targetVm = s.target_type === 'vm' && s.vm_name
        ? `<div class="target-vm">${esc(s.vm_name)}</div>` : '';

      let nextRunHtml = '<span style="color:var(--text-4);font-size:11px;">—</span>';
      if (s.next_run_times && s.next_run_times.length > 0) {
        nextRunHtml = `<div class="next-run-list">` +
          s.next_run_times.slice(0, 2).map(t =>
            `<div class="next-run-entry">${formatNextRun(t)}</div>`
          ).join('') + `</div>`;
      }

      row.innerHTML = `
        <td style="font-weight:600;color:var(--text);">${esc(s.name)}</td>
        <td>
          <div class="target-cell">
            <span class="target-type-label">${targetLabel}</span>
            <span class="target-name font-mono">${esc(s.resource_group)}</span>
            ${targetVm}
          </div>
        </td>
        <td>${actionBadge}</td>
        <td>
          <span class="cron-value">${esc(s.cron_expression)}</span>
          <div style="font-size:10px;color:var(--text-4);margin-top:2px;">${esc(s.timezone)}</div>
        </td>
        <td>${nextRunHtml}</td>
        <td>${enabledBadge}</td>
        <td>
          <div class="row-actions">
            <button class="action-icon-btn btn-edit" data-id="${s.id}" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              <span>Edit</span>
            </button>
            <button class="action-icon-btn btn-del" data-id="${s.id}" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </button>
          </div>
        </td>`;

      row.querySelector('.btn-edit').addEventListener('click', () => openEditModal(s));
      row.querySelector('.btn-del').addEventListener('click', () => openDeleteModal(s));
      tableBody.appendChild(row);
    });
  }

  // --- MODAL HELPERS ---
  function resetForm() {
    fieldName.value        = '';
    fieldTargetType.value  = 'rg';
    fieldAction.value      = 'stop';
    fieldCron.value        = '';
    fieldTimezone.value    = 'Asia/Kolkata';  // default IST
    fieldEnabled.checked   = true;
    enabledText.textContent = 'Active';
    vmNameGroup.style.display = 'none';
    formError.textContent  = '';
    // Reload RG dropdown fresh from cached allVms
    populateRgDropdown();
  }

  function openCreateModal() {
    editingId = null;
    resetForm();
    modalTitle.textContent   = 'New schedule';
    btnModalSave.textContent = 'Create schedule';
    scheduleModal.classList.add('open');
    fieldName.focus();
    // If VMs not yet loaded, reload now (handles race condition)
    if (!vmsLoaded) loadVms();
  }

  function openEditModal(s) {
    editingId = s.id;
    resetForm();
    fieldName.value        = s.name;
    fieldTargetType.value  = s.target_type;
    fieldAction.value      = s.action;
    fieldCron.value        = s.cron_expression;
    fieldTimezone.value    = s.timezone || 'Asia/Kolkata';
    fieldEnabled.checked   = s.is_enabled;
    enabledText.textContent = s.is_enabled ? 'Active' : 'Paused';
    formError.textContent   = '';
    modalTitle.textContent   = 'Edit schedule';
    btnModalSave.textContent = 'Save changes';

    // Populate RG dropdown then select the right one
    populateRgDropdown(s.resource_group);

    // Show/populate VM dropdown if target_type = vm
    if (s.target_type === 'vm') {
      vmNameGroup.style.display = '';
      populateVmDropdown(s.resource_group, s.vm_name);
    } else {
      vmNameGroup.style.display = 'none';
    }

    scheduleModal.classList.add('open');
    fieldName.focus();
  }

  function closeScheduleModal() { scheduleModal.classList.remove('open'); }

  btnNew.addEventListener('click', openCreateModal);
  btnModalCancel.addEventListener('click', closeScheduleModal);
  scheduleModal.addEventListener('click', e => { if (e.target === scheduleModal) closeScheduleModal(); });

  // --- SAVE ---
  btnModalSave.addEventListener('click', async () => {
    formError.textContent = '';

    const rg = fieldRg.value;
    const vmName = fieldTargetType.value === 'vm' ? fieldVmName.value : null;

    if (!fieldName.value.trim()) { formError.textContent = 'Schedule name is required.'; return; }
    if (!rg) { formError.textContent = 'Please select a resource group.'; return; }
    if (fieldTargetType.value === 'vm' && !vmName) { formError.textContent = 'Please select a VM.'; return; }
    if (!fieldCron.value.trim()) { formError.textContent = 'Cron expression is required.'; return; }

    const payload = {
      name:            fieldName.value.trim(),
      target_type:     fieldTargetType.value,
      resource_group:  rg,
      vm_name:         vmName || null,
      action:          fieldAction.value,
      cron_expression: fieldCron.value.trim(),
      timezone:        fieldTimezone.value,
      is_enabled:      fieldEnabled.checked
    };

    btnModalSave.disabled = true;
    btnModalSave.textContent = 'Saving…';
    try {
      if (editingId === null) {
        await apiCall('/api/schedules', 'POST', payload);
        showToast(`Schedule "${payload.name}" created.`, 'success');
      } else {
        await apiCall(`/api/schedules/${editingId}`, 'PUT', payload);
        showToast(`Schedule "${payload.name}" updated.`, 'success');
      }
      closeScheduleModal();
      await fetchSchedules();
    } catch (e) {
      formError.textContent = e.message || 'Failed to save schedule.';
    } finally {
      btnModalSave.disabled = false;
      btnModalSave.textContent = editingId === null ? 'Create schedule' : 'Save changes';
    }
  });

  // --- DELETE ---
  function openDeleteModal(s) {
    deletingId = s.id;
    deleteModalDesc.textContent = `Delete schedule "${s.name}"? This cannot be undone.`;
    deleteModal.classList.add('open');
    btnDeleteConfirm.focus();
  }
  function closeDeleteModal() { deleteModal.classList.remove('open'); deletingId = null; }

  btnDeleteCancel.addEventListener('click', closeDeleteModal);
  deleteModal.addEventListener('click', e => { if (e.target === deleteModal) closeDeleteModal(); });

  btnDeleteConfirm.addEventListener('click', async () => {
    if (!deletingId) return;
    btnDeleteConfirm.disabled = true;
    btnDeleteConfirm.textContent = 'Deleting…';
    try {
      await apiCall(`/api/schedules/${deletingId}`, 'DELETE');
      showToast('Schedule deleted.', 'success');
      closeDeleteModal();
      await fetchSchedules();
    } catch (e) {
      showToast(e.message || 'Failed to delete.', 'error');
    } finally {
      btnDeleteConfirm.disabled = false;
      btnDeleteConfirm.textContent = 'Delete';
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (scheduleModal.classList.contains('open')) closeScheduleModal();
      if (deleteModal.classList.contains('open')) closeDeleteModal();
    }
  });

  // --- INIT ---
  fetchProfile();
  Promise.all([loadVms(), fetchSchedules()]);
});
