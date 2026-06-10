/**
 * schedules2.js — Auto Start/Stop Schedules
 *
 * UX: table shows (Instance, Start, Stop, Days, Status, Edit/Delete)
 * Form: VM/RG picker, start time, stop time, day checkboxes, timezone, enabled
 *
 * Backend model: each "pair" = up to 2 records (action=start + action=stop)
 * We group them by resource_group+vm_name key and display as 1 row.
 */
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '/login'; return; }

  /* ── DOM refs ── */
  const $ = id => document.getElementById(id);
  const userAvatar   = $('userAvatar'), userName = $('userName'), userRole = $('userRole');
  const btnSignout   = $('btnSignout'), headerSub = $('headerSubtitle');
  const schedulesBody = $('schedulesBody'), emptyState = $('emptyState');
  const toastCont    = $('toastContainer');
  const btnAddNew    = $('btnAddNew');

  // Form panel
  const schedFormPanel  = $('schedFormPanel');
  const schedFormTitle  = $('schedFormTitle');
  const fTargetType     = $('fTargetType');
  const fInstanceWrap   = $('fInstanceWrap'),  fInstance = $('fInstance');
  const fRgWrap         = $('fRgWrap'),         fRg       = $('fRg');
  const fStartTime      = $('fStartTime'),      fStopTime = $('fStopTime');
  const fTimezone       = $('fTimezone'),       fEnabled  = $('fEnabled');
  const schedError      = $('schedError');
  const btnSaveSched    = $('btnSaveSched'),    btnCancelSched = $('btnCancelSched');

  // Day checkboxes
  const dayCheckboxes = Array.from(document.querySelectorAll('.day-check input[type="checkbox"]'));

  // Delete modal
  const deleteModal  = $('deleteModal'), deleteDesc = $('deleteDesc');
  const btnDelCancel = $('btnDelCancel'), btnDelConfirm = $('btnDelConfirm');

  /* ── State ── */
  let allVms      = [];   // raw VM list from /api/vms
  let allSchedules = [];  // raw schedule list from /api/schedules
  let pairs       = [];   // grouped {startRec, stopRec, key, ...} for table
  let editingKey  = null; // null = create, string = editing
  let deletingIds = [];   // IDs to delete on confirm

  /* ── API helper ── */
  async function api(url, method = 'GET', body = null) {
    const opts = { method, headers: { Authorization: `Bearer ${token}` } };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch(url, opts);
    if (res.status === 401) { localStorage.removeItem('token'); window.location.href = '/login'; return; }
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || 'Request failed'); }
    return res.status === 204 ? null : res.json();
  }

  /* ── Toast ── */
  function toast(msg, type = 'info') {
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

  /* ── Profile ── */
  async function fetchProfile() {
    try {
      const p = await api('/api/auth/me');
      userName.textContent = p.username;
      userRole.textContent = p.role === 'admin' ? 'Administrator' : 'Operator';
      userAvatar.textContent = p.username.charAt(0).toUpperCase();
    } catch { localStorage.removeItem('token'); window.location.href = '/login'; }
  }
  btnSignout.addEventListener('click', async () => {
    try { await api('/api/auth/logout', 'POST'); } catch {}
    localStorage.removeItem('token'); window.location.href = '/login';
  });

  /* ──────────────────────────────────────────
     CRON HELPERS
  ────────────────────────────────────────── */
  function timeDaysToCron(timeStr, days) {
    const [hStr, mStr] = timeStr.split(':');
    const h = parseInt(hStr, 10), m = parseInt(mStr, 10) || 0;
    let dayPart;
    if (days.length === 0 || days.length === 7) {
      dayPart = '*';
    } else {
      const sorted = [...days].sort((a, b) => a - b);
      // Check if contiguous range
      const isRange = sorted.length > 2 &&
        sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
      dayPart = isRange ? `${sorted[0]}-${sorted[sorted.length - 1]}` : sorted.join(',');
    }
    return `${m} ${h} * * ${dayPart}`;
  }

  function cronToTimeDays(cron) {
    if (!cron) return { time: '00:00', days: [] };
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 5) return { time: '00:00', days: [] };
    const [min, hour, , , dayPart] = parts;
    const time = `${String(parseInt(hour)).padStart(2, '0')}:${String(parseInt(min)).padStart(2, '0')}`;
    let days = [];
    if (dayPart === '*') {
      days = []; // means every day — all unchecked = daily
    } else if (dayPart.includes('-')) {
      const [from, to] = dayPart.split('-').map(Number);
      for (let d = from; d <= to; d++) days.push(d);
    } else {
      days = dayPart.split(',').map(Number);
    }
    return { time, days };
  }

  const DAY_NAMES = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };

  function daysLabel(days) {
    if (!days || days.length === 0) return [{ label: 'Daily', daily: true }];
    return [...days].sort((a, b) => a - b).map(d => ({ label: DAY_NAMES[d] || d, daily: false }));
  }

  /* ──────────────────────────────────────────
     GROUP SCHEDULES INTO PAIRS
  ────────────────────────────────────────── */
  function groupPairs(schedules) {
    const map = {};
    schedules.forEach(s => {
      const key = s.target_type === 'vm'
        ? `vm::${s.resource_group}::${s.vm_name || ''}`
        : `rg::${s.resource_group}`;
      if (!map[key]) map[key] = { key, target_type: s.target_type, resource_group: s.resource_group, vm_name: s.vm_name || null, startRec: null, stopRec: null, timezone: s.timezone, is_enabled: s.is_enabled };
      if (s.action === 'start') map[key].startRec = s;
      else                       map[key].stopRec  = s;
      // Use the latest enabled/timezone
      map[key].is_enabled = s.is_enabled;
      map[key].timezone   = s.timezone;
    });
    return Object.values(map);
  }

  /* ──────────────────────────────────────────
     FETCH ALL DATA
  ────────────────────────────────────────── */
  async function loadAll() {
    try {
      [allVms, allSchedules] = await Promise.all([api('/api/vms'), api('/api/schedules')]);
      if (!Array.isArray(allVms)) allVms = [];
      if (!Array.isArray(allSchedules)) allSchedules = [];
    } catch (e) {
      toast('Failed to load data: ' + e.message, 'error');
      allVms = []; allSchedules = [];
    }
    pairs = groupPairs(allSchedules);
    renderTable();
    populateDropdowns();
  }

  /* ──────────────────────────────────────────
     RENDER TABLE
  ────────────────────────────────────────── */
  function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function renderTable() {
    schedulesBody.innerHTML = '';
    headerSub.textContent = pairs.length > 0
      ? `${pairs.length} schedule${pairs.length === 1 ? '' : 's'} · IST default timezone`
      : 'No schedules configured';

    if (pairs.length === 0) { emptyState.classList.add('show'); return; }
    emptyState.classList.remove('show');

    pairs.forEach(p => {
      const row = document.createElement('tr');

      // Get start/stop times from cron
      const startTime = p.startRec ? cronToTimeDays(p.startRec.cron_expression).time : '—';
      const stopTime  = p.stopRec  ? cronToTimeDays(p.stopRec.cron_expression).time  : '—';

      // Days from either record
      const refCron = (p.startRec || p.stopRec)?.cron_expression || '';
      const { days } = cronToTimeDays(refCron);
      const dayItems = daysLabel(days);

      const dayPillsHtml = dayItems.map(d =>
        `<span class="day-pill${d.daily ? ' daily' : ''}">${d.label}</span>`
      ).join('');

      // Instance label
      const instName = p.target_type === 'rg'
        ? `All VMs in ${esc(p.resource_group)}`
        : esc(p.vm_name || '');
      const instSub = p.target_type === 'rg' ? '' : `<div class="inst-rg">${esc(p.resource_group)}</div>`;
      const instTypeLabel = p.target_type === 'rg' ? 'Resource Group' : 'VM';

      const enabledBadge = p.is_enabled
        ? `<span class="sched-enabled-badge on"><span class="dot green"></span>ENABLED</span>`
        : `<span class="sched-enabled-badge off">DISABLED</span>`;

      const tz = (p.timezone || 'Asia/Kolkata').replace('Asia/Kolkata', 'IST').replace('UTC', 'UTC');

      row.innerHTML = `
        <td>
          <div class="inst-cell">
            <div class="target-label-sm">${instTypeLabel}</div>
            <div class="inst-name">${instName}</div>
            ${instSub}
          </div>
        </td>
        <td class="time-cell">${esc(startTime)}</td>
        <td class="time-cell">${esc(stopTime)}</td>
        <td><div class="days-pills">${dayPillsHtml}</div></td>
        <td style="font-size:11px;color:var(--text-3);">${tz}</td>
        <td>${enabledBadge}</td>
        <td>
          <div class="row-action-btns">
            <button class="btn-row-edit" data-key="${esc(p.key)}">Edit</button>
            <button class="btn-row-delete" data-key="${esc(p.key)}">Delete</button>
          </div>
        </td>`;

      row.querySelector('.btn-row-edit').addEventListener('click', () => openEditForm(p));
      row.querySelector('.btn-row-delete').addEventListener('click', () => openDeleteModal(p));
      schedulesBody.appendChild(row);
    });
  }

  /* ──────────────────────────────────────────
     POPULATE DROPDOWNS
  ────────────────────────────────────────── */
  function populateDropdowns() {
    // VMs
    const vmsSorted = [...allVms].sort((a, b) => a.name.localeCompare(b.name));
    fInstance.innerHTML = '<option value="">— select VM —</option>';
    vmsSorted.forEach(v => {
      const opt = document.createElement('option');
      opt.value = JSON.stringify({ rg: v.resource_group, vm: v.name });
      opt.textContent = `${v.name}  ·  ${v.resource_group}  ·  ${v.power_state}`;
      fInstance.appendChild(opt);
    });

    // RGs
    const rgs = [...new Set(allVms.map(v => v.resource_group))].filter(Boolean).sort();
    fRg.innerHTML = '<option value="">— select resource group —</option>';
    rgs.forEach(rg => {
      const opt = document.createElement('option');
      opt.value = rg; opt.textContent = rg;
      fRg.appendChild(opt);
    });
  }

  /* ──────────────────────────────────────────
     FORM OPEN / CLOSE
  ────────────────────────────────────────── */
  fTargetType.addEventListener('change', () => {
    const isVm = fTargetType.value === 'vm';
    fInstanceWrap.hidden = !isVm;
    fRgWrap.hidden = isVm;
  });

  function openCreateForm() {
    editingKey = null;
    schedFormTitle.textContent = 'Add Schedule';
    btnSaveSched.textContent = 'Save';
    fTargetType.value = 'vm';
    fInstanceWrap.hidden = false;
    fRgWrap.hidden = true;
    fInstance.value = '';
    fRg.value = '';
    fStartTime.value = '09:00';
    fStopTime.value = '21:00';
    fTimezone.value = 'Asia/Kolkata';
    fEnabled.value = 'yes';
    schedError.textContent = '';
    // Default Mon–Fri checked
    dayCheckboxes.forEach(cb => { cb.checked = ['1','2','3','4','5'].includes(cb.value); });
    schedFormPanel.style.display = '';
    schedFormPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openEditForm(p) {
    editingKey = p.key;
    schedFormTitle.textContent = 'Edit Schedule';
    btnSaveSched.textContent = 'Save Changes';
    schedError.textContent = '';

    // Target type
    fTargetType.value = p.target_type;
    fInstanceWrap.hidden = p.target_type !== 'vm';
    fRgWrap.hidden = p.target_type !== 'rg';

    // Instance / RG selection
    if (p.target_type === 'vm') {
      // Find matching option
      const opts = Array.from(fInstance.options);
      const match = opts.find(o => {
        try { const d = JSON.parse(o.value); return d.vm === p.vm_name && d.rg === p.resource_group; } catch { return false; }
      });
      fInstance.value = match ? match.value : '';
    } else {
      fRg.value = p.resource_group;
    }

    // Times
    const refCron = (p.startRec || p.stopRec)?.cron_expression || '';
    const { days } = cronToTimeDays(refCron);
    fStartTime.value = p.startRec ? cronToTimeDays(p.startRec.cron_expression).time : '09:00';
    fStopTime.value  = p.stopRec  ? cronToTimeDays(p.stopRec.cron_expression).time  : '21:00';

    // Days checkboxes
    dayCheckboxes.forEach(cb => { cb.checked = days.includes(Number(cb.value)); });

    fTimezone.value = p.timezone || 'Asia/Kolkata';
    fEnabled.value = p.is_enabled ? 'yes' : 'no';

    schedFormPanel.style.display = '';
    schedFormPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeForm() {
    schedFormPanel.style.display = 'none';
    editingKey = null;
  }

  btnAddNew.addEventListener('click', openCreateForm);
  btnCancelSched.addEventListener('click', closeForm);

  /* ──────────────────────────────────────────
     SAVE
  ────────────────────────────────────────── */
  btnSaveSched.addEventListener('click', async () => {
    schedError.textContent = '';

    const targetType = fTargetType.value;
    const timezone   = fTimezone.value;
    const isEnabled  = fEnabled.value === 'yes';
    const startTime  = fStartTime.value;
    const stopTime   = fStopTime.value;

    // Get selected days
    const selectedDays = dayCheckboxes.filter(cb => cb.checked).map(cb => Number(cb.value));

    // Validate
    let rg = '', vmName = null;
    if (targetType === 'vm') {
      if (!fInstance.value) { schedError.textContent = 'Please select a VM.'; return; }
      try { const d = JSON.parse(fInstance.value); rg = d.rg; vmName = d.vm; } catch { schedError.textContent = 'Invalid VM selection.'; return; }
    } else {
      rg = fRg.value;
      if (!rg) { schedError.textContent = 'Please select a resource group.'; return; }
    }
    if (!startTime && !stopTime) { schedError.textContent = 'Set at least a start or stop time.'; return; }

    const startCron = startTime ? timeDaysToCron(startTime, selectedDays) : null;
    const stopCron  = stopTime  ? timeDaysToCron(stopTime, selectedDays)  : null;

    const instLabel = vmName ? `${vmName} (${rg})` : rg;
    btnSaveSched.disabled = true;
    btnSaveSched.textContent = 'Saving…';

    try {
      if (editingKey === null) {
        // CREATE — post start + stop records
        const promises = [];
        if (startCron) promises.push(api('/api/schedules', 'POST', {
          name: `${instLabel} – auto-start`,
          target_type: targetType, resource_group: rg, vm_name: vmName,
          action: 'start', cron_expression: startCron, timezone, is_enabled: isEnabled
        }));
        if (stopCron) promises.push(api('/api/schedules', 'POST', {
          name: `${instLabel} – auto-stop`,
          target_type: targetType, resource_group: rg, vm_name: vmName,
          action: 'stop', cron_expression: stopCron, timezone, is_enabled: isEnabled
        }));
        await Promise.all(promises);
        toast(`Schedule for ${instLabel} created.`, 'success');
      } else {
        // EDIT — update existing start/stop records
        const pair = pairs.find(p => p.key === editingKey);
        if (!pair) throw new Error('Schedule not found locally.');
        const promises = [];
        if (pair.startRec && startCron) {
          promises.push(api(`/api/schedules/${pair.startRec.id}`, 'PUT', {
            name: pair.startRec.name, target_type: targetType,
            resource_group: rg, vm_name: vmName,
            action: 'start', cron_expression: startCron, timezone, is_enabled: isEnabled
          }));
        } else if (!pair.startRec && startCron) {
          promises.push(api('/api/schedules', 'POST', {
            name: `${instLabel} – auto-start`,
            target_type: targetType, resource_group: rg, vm_name: vmName,
            action: 'start', cron_expression: startCron, timezone, is_enabled: isEnabled
          }));
        }
        if (pair.stopRec && stopCron) {
          promises.push(api(`/api/schedules/${pair.stopRec.id}`, 'PUT', {
            name: pair.stopRec.name, target_type: targetType,
            resource_group: rg, vm_name: vmName,
            action: 'stop', cron_expression: stopCron, timezone, is_enabled: isEnabled
          }));
        } else if (!pair.stopRec && stopCron) {
          promises.push(api('/api/schedules', 'POST', {
            name: `${instLabel} – auto-stop`,
            target_type: targetType, resource_group: rg, vm_name: vmName,
            action: 'stop', cron_expression: stopCron, timezone, is_enabled: isEnabled
          }));
        }
        await Promise.all(promises);
        toast(`Schedule for ${instLabel} updated.`, 'success');
      }

      closeForm();
      await loadAll();
    } catch (e) {
      schedError.textContent = e.message || 'Failed to save.';
    } finally {
      btnSaveSched.disabled = false;
      btnSaveSched.textContent = editingKey === null ? 'Save' : 'Save Changes';
    }
  });

  /* ──────────────────────────────────────────
     DELETE
  ────────────────────────────────────────── */
  function openDeleteModal(p) {
    const label = p.vm_name ? `${p.vm_name} (${p.resource_group})` : p.resource_group;
    deletingIds = [p.startRec?.id, p.stopRec?.id].filter(Boolean);
    deleteDesc.textContent = `Delete all schedules for "${label}"? This cannot be undone.`;
    deleteModal.classList.add('open');
    btnDelConfirm.focus();
  }
  btnDelCancel.addEventListener('click', () => deleteModal.classList.remove('open'));
  deleteModal.addEventListener('click', e => { if (e.target === deleteModal) deleteModal.classList.remove('open'); });

  btnDelConfirm.addEventListener('click', async () => {
    btnDelConfirm.disabled = true; btnDelConfirm.textContent = 'Deleting…';
    try {
      await Promise.all(deletingIds.map(id => api(`/api/schedules/${id}`, 'DELETE')));
      toast('Schedule deleted.', 'success');
      deleteModal.classList.remove('open');
      await loadAll();
    } catch (e) {
      toast(e.message || 'Delete failed.', 'error');
    } finally {
      btnDelConfirm.disabled = false; btnDelConfirm.textContent = 'Delete';
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { deleteModal.classList.remove('open'); closeForm(); }
  });

  /* ── INIT ── */
  fetchProfile();
  loadAll();
});
