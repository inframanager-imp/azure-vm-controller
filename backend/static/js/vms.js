document.addEventListener('DOMContentLoaded', () => {
  // --- AUTHENTICATION SHIELD ---
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login';
    return;
  }

  // --- STATE VARIABLES ---
  let vms = [];
  let selectedVms = new Set(); // Stores "resource_group/name"
  let rgsList = [];
  let scheduledVmKeys = new Set(); // Stores keys of VMs that have schedules
  
  // Filters State
  let searchQuery = '';
  let selectedRg = 'all';
  let selectedStatus = 'all';
  
  // Sorting State
  let currentSort = 'name';
  let sortDirection = 'asc';
  
  // Transition Polling state
  // Format: { "resource_group/name": intervalId }
  const activePollers = {};

  // Metrics intervals
  let metricsInterval = null;

  // Time tracker for sync
  let lastSyncTime = Date.now();

  // --- UI ELEMENT SELECTORS ---
  const headerSubtitle = document.getElementById('headerSubtitle');
  const syncStatus = document.getElementById('syncStatus');
  const kpiTotal = document.getElementById('kpiTotal');
  const kpiRunning = document.getElementById('kpiRunning');
  const kpiDeallocated = document.getElementById('kpiDeallocated');
  const btnSync = document.getElementById('btnSync');
  
  // Search & Filters
  const searchInput = document.getElementById('searchInput');
  const btnRgFilter = document.getElementById('btnRgFilter');
  const rgDropdownMenu = document.getElementById('rgDropdownMenu');
  const btnStatusFilter = document.getElementById('btnStatusFilter');
  const statusDropdownMenu = document.getElementById('statusDropdownMenu');
  
  // Selection/Bulk Controls
  const commandLeftDefault = document.getElementById('commandLeftDefault');
  const commandLeftSelected = document.getElementById('commandLeftSelected');
  const selectedCountLabel = document.getElementById('selectedCount');
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  const btnBulkStart = document.getElementById('btnBulkStart');
  const btnBulkRestart = document.getElementById('btnBulkRestart');
  const btnBulkStop = document.getElementById('btnBulkStop');
  const btnBulkClear = document.getElementById('btnBulkClear');
  
  // Table
  const vmsTableBody = document.getElementById('vmsTableBody');
  const emptyState = document.getElementById('emptyState');
  
  // Drawer
  const drawerOverlay = document.getElementById('drawerOverlay');
  const detailDrawer = document.getElementById('detailDrawer');
  const btnDrawerClose = document.getElementById('btnDrawerClose');
  const drawerVmName = document.getElementById('drawerVmName');
  const drawerVmRg = document.getElementById('drawerVmRg');
  const drawerActionStart = document.getElementById('drawerActionStart');
  const drawerActionRestart = document.getElementById('drawerActionRestart');
  const drawerActionStop = document.getElementById('drawerActionStop');
  const configStatus = document.getElementById('configStatus');
  const configPrivateIp = document.getElementById('configPrivateIp');
  const configSize = document.getElementById('configSize');
  const configRg = document.getElementById('configRg');
  const configPublicIp = document.getElementById('configPublicIp');
  const configSchedule = document.getElementById('configSchedule');
  const drawerActivityList = document.getElementById('drawerActivityList');
  
  // Modals
  const confirmModalOverlay = document.getElementById('confirmModalOverlay');
  const modalTitle = document.getElementById('modalTitle');
  const modalDesc = document.getElementById('modalDesc');
  const btnModalCancel = document.getElementById('btnModalCancel');
  const btnModalConfirm = document.getElementById('btnModalConfirm');
  
  // Toast Container
  const toastContainer = document.getElementById('toastContainer');
  
  // Sidebar elements
  const userAvatar = document.getElementById('userAvatar');
  const userName = document.getElementById('userName');
  const userRole = document.getElementById('userRole');
  const btnSignout = document.getElementById('btnSignout');

  // --- API CALL wrapper ---
  async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };
    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(endpoint, options);
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      return;
    }
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'API operation failed');
    }
    return response.json();
  }

  // --- USER PROFILE SETUP ---
  async function fetchUserProfile() {
    try {
      const profile = await apiCall('/api/auth/me');
      userName.textContent = profile.username;
      userRole.textContent = profile.role === 'admin' ? 'Administrator' : 'Operator';
      userAvatar.textContent = profile.username.charAt(0).toUpperCase();
    } catch (err) {
      console.error('Failed to load user profile', err);
      // Clean redirect if auth fails
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
  }

  btnSignout.addEventListener('click', async () => {
    try {
      await apiCall('/api/auth/logout', 'POST');
    } catch (err) {
      console.warn('Server-side logout skipped', err);
    } finally {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
  });

  // --- FETCH VMs DATA ---
  async function fetchVms(showSkeletons = false) {
    if (showSkeletons) {
      renderSkeletons();
    }
    try {
      const data = await apiCall('/api/vms');
      vms = data;
      
      // Update Resource Group filter list dynamically
      const rgs = [...new Set(vms.map(v => v.resource_group))].sort();
      rgsList = rgs;
      renderRgFilterDropdown();
      
      // Compute statistics & refresh view
      updateKpis();
      applyFiltersAndRender();

      // Fetch schedules to populate Scheduled filter
      fetchScheduledVmKeys();
    } catch (err) {
      showToast(err.message || 'Failed to fetch resources from the cloud', 'error');
    }
  }

  async function fetchScheduledVmKeys() {
    try {
      const schedules = await apiCall('/api/schedules');
      scheduledVmKeys.clear();
      if (Array.isArray(schedules)) {
        schedules.forEach(s => {
          if (s.is_enabled) {
            if (s.target_type === 'vm' && s.vm_name) {
              scheduledVmKeys.add(`${s.resource_group}/${s.vm_name}`);
            } else if (s.target_type === 'rg') {
              scheduledVmKeys.add(`rg:${s.resource_group}`);
            }
          }
        });
      }
    } catch { /* silent — filter just won't match anything */ }
  }

  // --- TOAST NOTIFICATIONS ---
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    
    // Type specific icons (Lucide inspired)
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<div class="toast-icon success"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>`;
    } else if (type === 'error') {
      iconSvg = `<div class="toast-icon error"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></div>`;
    } else if (type === 'warning') {
      iconSvg = `<div class="toast-icon warning"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>`;
    } else {
      iconSvg = `<div class="toast-icon info"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></div>`;
    }
    
    toast.innerHTML = `
      ${iconSvg}
      <span class="toast-message">${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Auto dismiss after 4 seconds
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 200);
    }, 4000);
  }

  // --- KPI UPDATING ---
  function updateKpis() {
    const total = vms.length;
    const running = vms.filter(v => v.power_state.toLowerCase().includes('running')).length;
    const deallocated = vms.filter(v => v.power_state.toLowerCase().includes('deallocated') || v.power_state.toLowerCase().includes('stopped')).length;
    
    kpiTotal.textContent = total;
    kpiRunning.textContent = running;
    kpiDeallocated.textContent = deallocated;

    const rgsCount = [...new Set(vms.map(v => v.resource_group))].length;
    headerSubtitle.textContent = `${total} resources across ${rgsCount} resource groups · East US 2`;
  }

  // --- RENDERING ROUTINES ---
  function renderSkeletons() {
    vmsTableBody.innerHTML = `
      <tr class="skeleton-row">
        <td class="col-select"><div class="skeleton-text checkbox"></div></td>
        <td><div class="skeleton-text name"></div><div class="skeleton-text rg"></div></td>
        <td><div class="skeleton-text status"></div></td>
        <td class="col-size"><div class="skeleton-text size"></div></td>
        <td class="col-private-ip"><div class="skeleton-text private-ip"></div></td>
        <td class="col-public-ip"><div class="skeleton-text public-ip"></div></td>
        <td class="col-actions"><div class="skeleton-text actions"></div></td>
      </tr>
      <tr class="skeleton-row">
        <td class="col-select"><div class="skeleton-text checkbox"></div></td>
        <td><div class="skeleton-text name"></div><div class="skeleton-text rg"></div></td>
        <td><div class="skeleton-text status"></div></td>
        <td class="col-size"><div class="skeleton-text size"></div></td>
        <td class="col-private-ip"><div class="skeleton-text private-ip"></div></td>
        <td class="col-public-ip"><div class="skeleton-text public-ip"></div></td>
        <td class="col-actions"><div class="skeleton-text actions"></div></td>
      </tr>
    `;
    emptyState.classList.remove('show');
  }

  function renderRgFilterDropdown() {
    let html = `
      <div class="dropdown-item ${selectedRg === 'all' ? 'checked' : ''}" data-value="all">
        <span>All resource groups</span>
        <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </div>
    `;
    rgsList.forEach(rg => {
      html += `
        <div class="dropdown-item ${selectedRg === rg ? 'checked' : ''}" data-value="${rg}">
          <span>${rg}</span>
          <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
      `;
    });
    rgDropdownMenu.innerHTML = html;
  }

  function applyFiltersAndRender() {
    // 1. Apply Search and Dropdowns Filter
    let filtered = vms.filter(vm => {
      const matchSearch = vm.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          vm.resource_group.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchRg = selectedRg === 'all' || vm.resource_group.toLowerCase() === selectedRg.toLowerCase();
      
      let matchStatus = true;
      if (selectedStatus === 'running') {
        matchStatus = vm.power_state.toLowerCase().includes('running');
      } else if (selectedStatus === 'deallocated') {
        matchStatus = vm.power_state.toLowerCase().includes('deallocated') || vm.power_state.toLowerCase().includes('stopped');
      } else if (selectedStatus === 'scheduled') {
        const vmKey = `${vm.resource_group}/${vm.name}`;
        matchStatus = scheduledVmKeys.has(vmKey) || scheduledVmKeys.has(`rg:${vm.resource_group}`);
      }
      
      return matchSearch && matchRg && matchStatus;
    });

    // 2. Apply Sorting
    filtered.sort((a, b) => {
      let valA = a[currentSort];
      let valB = b[currentSort];
      
      if (currentSort === 'status') {
        valA = a.power_state;
        valB = b.power_state;
      }
      
      valA = (valA || '').toString().toLowerCase();
      valB = (valB || '').toString().toLowerCase();
      
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    // 3. Render
    vmsTableBody.innerHTML = '';
    
    if (filtered.length === 0) {
      emptyState.classList.add('show');
      updateSelectAllState();
      return;
    }
    emptyState.classList.remove('show');

    filtered.forEach(vm => {
      const key = `${vm.resource_group}/${vm.name}`.toLowerCase();
      const isChecked = selectedVms.has(key);
      const isRunning = vm.power_state.toLowerCase().includes('running');
      const isStopped = vm.power_state.toLowerCase().includes('deallocated') || vm.power_state.toLowerCase().includes('stopped');
      const isTransitional = vm.power_state.toLowerCase().includes('starting') ||
                             vm.power_state.toLowerCase().includes('stopping') ||
                             vm.power_state.toLowerCase().includes('restarting');
      
      // Determine allowed button states
      const canStart = vm.allowed_actions.includes('start') && isStopped && !isTransitional;
      const canStop = vm.allowed_actions.includes('stop') && isRunning && !isTransitional;
      const canRestart = vm.allowed_actions.includes('restart') && isRunning && !isTransitional;

      // Status indicator styles
      let dotColor = 'grey';
      let isPulse = false;
      if (isRunning) {
        dotColor = 'green';
      } else if (isTransitional) {
        dotColor = 'amber';
        isPulse = true;
      }

      const row = document.createElement('tr');
      row.className = isChecked ? 'selected' : '';
      row.setAttribute('data-key', key);
      
      // Schedule label
      const scheduleHtml = vm.schedule ? `
        <div class="schedule-chip">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          <span>${vm.schedule}</span>
        </div>
      ` : '';

      row.innerHTML = `
        <td class="col-select">
          <input type="checkbox" class="custom-checkbox row-checkbox" ${isChecked ? 'checked' : ''} aria-label="Select VM ${vm.name}">
        </td>
        <td class="col-name">
          <div style="font-weight: 600; color: var(--text);">${vm.name}</div>
          <div class="sub-rg font-mono">${vm.resource_group}</div>
          ${scheduleHtml}
        </td>
        <td>
          <div class="status-cell">
            <span class="dot ${dotColor}"></span>
            <span class="status-label ${isPulse ? 'pulse' : ''}">${vm.power_state}</span>
          </div>
        </td>
        <td class="col-size font-mono" style="color: var(--text-2);">${vm.size}</td>
        <td class="col-private-ip font-mono" style="color: var(--text-2);">${vm.private_ip || '-'}</td>
        <td class="col-public-ip font-mono" style="color: var(--text-2);">${vm.public_ip || '-'}</td>
        <td class="col-actions">
          <div class="actions-cell">
            <button class="action-icon-btn btn-start" ${canStart ? '' : 'disabled'} title="Start VM">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              <span>Start</span>
            </button>
            <button class="action-icon-btn btn-restart" ${canRestart ? '' : 'disabled'} title="Restart VM">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>
              <span>Restart</span>
            </button>
            <button class="action-icon-btn btn-stop" ${canStop ? '' : 'disabled'} title="Stop VM">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect></svg>
              <span>Stop</span>
            </button>
          </div>
        </td>
      `;

      // --- EVENTS WIRE ON ROWS ---
      
      // Row click triggers detail drawer (excluding checkbox/buttons)
      row.addEventListener('click', (e) => {
        if (e.target.closest('.col-select') || e.target.closest('.col-actions')) {
          return;
        }
        openDrawer(vm);
      });

      // Individual checkbox click
      const checkbox = row.querySelector('.row-checkbox');
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          selectedVms.add(key);
          row.classList.add('selected');
        } else {
          selectedVms.delete(key);
          row.classList.remove('selected');
        }
        updateBulkActionsBar();
        updateSelectAllState();
      });

      // Start action
      row.querySelector('.btn-start').addEventListener('click', () => {
        triggerVmAction(vm, 'start');
      });

      // Restart action
      row.querySelector('.btn-restart').addEventListener('click', () => {
        confirmActionModal(
          'Restart VM',
          `Restart VM '${vm.name}'? Active sessions and processes on this machine will drop.`,
          () => triggerVmAction(vm, 'restart')
        );
      });

      // Stop action
      row.querySelector('.btn-stop').addEventListener('click', () => {
        confirmActionModal(
          'Stop (Deallocate) VM',
          `Stop '${vm.name}'? The machine will be deallocated and powered off; in-memory state and active sessions are lost.`,
          () => triggerVmAction(vm, 'stop')
        );
      });

      vmsTableBody.appendChild(row);
      
      // If VM is currently in transitional state, and has no active poller in UI, launch it!
      if (isTransitional && !activePollers[key]) {
        startStatusPolling(vm.resource_group, vm.name);
      }
    });

    updateSelectAllState();
  }

  // --- SELECTION CONTROL FLOWS ---
  function updateBulkActionsBar() {
    const count = selectedVms.size;
    if (count > 0) {
      selectedCountLabel.textContent = `${count} selected`;
      commandLeftDefault.style.display = 'none';
      commandLeftSelected.style.display = 'flex';
    } else {
      commandLeftDefault.style.display = 'flex';
      commandLeftSelected.style.display = 'none';
    }
  }

  function updateSelectAllState() {
    const rows = vmsTableBody.querySelectorAll('.row-checkbox');
    if (rows.length === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
      return;
    }
    
    let checkedCount = 0;
    rows.forEach(cb => { if (cb.checked) checkedCount++; });
    
    if (checkedCount === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    } else if (checkedCount === rows.length) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    }
  }

  selectAllCheckbox.addEventListener('change', (e) => {
    const checkboxes = vmsTableBody.querySelectorAll('.row-checkbox');
    const checked = e.target.checked;
    
    checkboxes.forEach(cb => {
      const row = cb.closest('tr');
      const key = row.getAttribute('data-key');
      cb.checked = checked;
      if (checked) {
        selectedVms.add(key);
        row.classList.add('selected');
      } else {
        selectedVms.delete(key);
        row.classList.remove('selected');
      }
    });
    updateBulkActionsBar();
  });

  btnBulkClear.addEventListener('click', () => {
    selectedVms.clear();
    const checkboxes = vmsTableBody.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => {
      cb.checked = false;
      cb.closest('tr').classList.remove('selected');
    });
    updateBulkActionsBar();
    updateSelectAllState();
  });

  // --- INDIVIDUAL ACTIONS & TRANSITIONS ---
  async function triggerVmAction(vm, action) {
    const key = `${vm.resource_group}/${vm.name}`.toLowerCase();
    
    // Set immediate UI visual state (Spinner on clicked row / disabled row buttons)
    // Find the row and add spinner class to the action button clicked
    const row = vmsTableBody.querySelector(`tr[data-key="${key}"]`);
    let actionBtn = null;
    let label = 'Starting...';
    
    if (action === 'start') {
      actionBtn = row ? row.querySelector('.btn-start') : null;
      label = 'Starting...';
    } else if (action === 'stop') {
      actionBtn = row ? row.querySelector('.btn-stop') : null;
      label = 'Stopping...';
    } else if (action === 'restart') {
      actionBtn = row ? row.querySelector('.btn-restart') : null;
      label = 'Restarting...';
    }
    
    if (actionBtn) {
      actionBtn.classList.add('spinning');
    }
    
    // Disable all buttons in row
    if (row) {
      row.querySelectorAll('.action-icon-btn').forEach(btn => btn.disabled = true);
      const labelEl = row.querySelector('.status-label');
      const dotEl = row.querySelector('.dot');
      if (labelEl) {
        labelEl.textContent = label;
        labelEl.classList.add('pulse');
      }
      if (dotEl) {
        dotEl.className = 'dot amber';
      }
    }

    // If drawer is open, disable drawer controls and set status label
    if (drawerOverlay.classList.contains('open') && drawerVmName.textContent.toLowerCase() === vm.name.toLowerCase()) {
      drawerActionStart.disabled = true;
      drawerActionRestart.disabled = true;
      drawerActionStop.disabled = true;
      configStatus.textContent = label;
    }

    showToast(`Command '${action}' sent for ${vm.name}.`, 'info');

    try {
      const response = await apiCall(`/api/vms/${vm.resource_group}/${vm.name}/${action}`, 'POST');
      
      // Update in local cache
      const cached = vms.find(v => v.name.toLowerCase() === vm.name.toLowerCase() && v.resource_group.toLowerCase() === vm.resource_group.toLowerCase());
      if (cached) {
        cached.power_state = response.power_state;
      }
      
      // Start polling status
      startStatusPolling(vm.resource_group, vm.name);
    } catch (err) {
      showToast(err.message || `Failed to execute ${action} on ${vm.name}`, 'error');
      // Re-fetch VM list to recover UI status
      fetchVms(false);
    }
  }

  // --- POLLED CACHE VERIFIER ---
  function startStatusPolling(rg, name) {
    const key = `${rg}/${name}`.toLowerCase();
    
    // Clear existing poller if any
    if (activePollers[key]) {
      clearInterval(activePollers[key]);
    }
    
    const intervalId = setInterval(async () => {
      try {
        const response = await apiCall(`/api/vms/${rg}/${name}/status`);
        const powerState = response.power_state;
        
        const isTransitional = powerState.toLowerCase().includes('starting') ||
                               powerState.toLowerCase().includes('stopping') ||
                               powerState.toLowerCase().includes('restarting');
        
        // Update local memory list
        const cached = vms.find(v => v.name.toLowerCase() === name.toLowerCase() && v.resource_group.toLowerCase() === rg.toLowerCase());
        if (cached) {
          cached.power_state = powerState;
        }

        // If open in detail drawer, update it
        if (drawerOverlay.classList.contains('open') && drawerVmName.textContent.toLowerCase() === name.toLowerCase()) {
          configStatus.textContent = powerState;
          
          // Re-enable actions if settled
          if (!isTransitional) {
            updateDrawerActionButtons(cached);
          }
        }
        
        if (!isTransitional) {
          clearInterval(intervalId);
          delete activePollers[key];
          
          // Uptime recalculates on restart or running
          if (cached) {
            // Re-fetch stable uptime if VM just booted
            if (powerState.toLowerCase().includes('running')) {
              // Quick fetch list to reload uptime without full skeleton loader
              const data = await apiCall('/api/vms');
              const freshlyFetched = data.find(v => v.name.toLowerCase() === name.toLowerCase() && v.resource_group.toLowerCase() === rg.toLowerCase());
              if (freshlyFetched) {
                cached.uptime = freshlyFetched.uptime;
              }
            } else {
              cached.uptime = '—';
            }
          }
          
          // Update KPI metrics
          updateKpis();
          applyFiltersAndRender();
          
          const settledWord = powerState.toLowerCase().includes('running') ? 'started' : 
                              powerState.toLowerCase().includes('deallocated') ? 'stopped (deallocated)' : 'settled';
          showToast(`VM '${name}' successfully ${settledWord}.`, 'success');
        } else {
          // If still transitioning, update status label in row
          const row = vmsTableBody.querySelector(`tr[data-key="${key}"]`);
          if (row) {
            const labelEl = row.querySelector('.status-label');
            if (labelEl) labelEl.textContent = powerState;
          }
        }
      } catch (err) {
        console.error('Polling error', err);
        clearInterval(intervalId);
        delete activePollers[key];
      }
    }, 4000);
    
    activePollers[key] = intervalId;
  }

  // --- BULK OPERATIONS FLOW ---
  btnBulkStart.addEventListener('click', () => {
    executeBulkAction('start');
  });

  btnBulkStop.addEventListener('click', () => {
    const count = getEligibleBulkCount('stop');
    if (count === 0) {
      showToast('No selected VMs are running and eligible to stop.', 'warning');
      return;
    }
    confirmActionModal(
      'Bulk Stop VMs',
      `Stop the ${count} selected running VMs? In-memory state and sessions will be lost on these machines.`,
      () => executeBulkAction('stop')
    );
  });

  btnBulkRestart.addEventListener('click', () => {
    const count = getEligibleBulkCount('restart');
    if (count === 0) {
      showToast('No selected VMs are running and eligible to restart.', 'warning');
      return;
    }
    confirmActionModal(
      'Bulk Restart VMs',
      `Restart the ${count} selected running VMs? All active sessions will drop.`,
      () => executeBulkAction('restart')
    );
  });

  function getEligibleBulkCount(action) {
    let count = 0;
    selectedVms.forEach(key => {
      const parts = key.split('/');
      const vm = vms.find(v => v.resource_group.toLowerCase() === parts[0] && v.name.toLowerCase() === parts[1]);
      if (vm) {
        const isRunning = vm.power_state.toLowerCase().includes('running');
        const isStopped = vm.power_state.toLowerCase().includes('deallocated') || vm.power_state.toLowerCase().includes('stopped');
        const isTransitional = vm.power_state.toLowerCase().includes('starting') ||
                               vm.power_state.toLowerCase().includes('stopping') ||
                               vm.power_state.toLowerCase().includes('restarting');
        
        if (!isTransitional) {
          if (action === 'start' && isStopped && vm.allowed_actions.includes('start')) count++;
          if (action === 'stop' && isRunning && vm.allowed_actions.includes('stop')) count++;
          if (action === 'restart' && isRunning && vm.allowed_actions.includes('restart')) count++;
        }
      }
    });
    return count;
  }

  function executeBulkAction(action) {
    const keysToProcess = [...selectedVms];
    let processedCount = 0;
    
    keysToProcess.forEach(key => {
      const parts = key.split('/');
      const vm = vms.find(v => v.resource_group.toLowerCase() === parts[0] && v.name.toLowerCase() === parts[1]);
      if (vm) {
        const isRunning = vm.power_state.toLowerCase().includes('running');
        const isStopped = vm.power_state.toLowerCase().includes('deallocated') || vm.power_state.toLowerCase().includes('stopped');
        const isTransitional = vm.power_state.toLowerCase().includes('starting') ||
                               vm.power_state.toLowerCase().includes('stopping') ||
                               vm.power_state.toLowerCase().includes('restarting');
        
        let eligible = false;
        if (!isTransitional) {
          if (action === 'start' && isStopped && vm.allowed_actions.includes('start')) eligible = true;
          if (action === 'stop' && isRunning && vm.allowed_actions.includes('stop')) eligible = true;
          if (action === 'restart' && isRunning && vm.allowed_actions.includes('restart')) eligible = true;
        }

        if (eligible) {
          triggerVmAction(vm, action);
          processedCount++;
        }
      }
    });

    if (processedCount > 0) {
      // Clear selection after action triggers
      selectedVms.clear();
      updateBulkActionsBar();
      updateSelectAllState();
      // Render to show spinning loaders immediately
      applyFiltersAndRender();
    } else if (action === 'start') {
      showToast('No selected VMs are stopped and eligible to start.', 'warning');
    }
  }

  // --- CONFIRMATION MODAL OVERLAY ---
  let onModalConfirmCallback = null;
  
  function confirmActionModal(title, description, onConfirm) {
    modalTitle.textContent = title;
    modalDesc.textContent = description;
    onModalConfirmCallback = onConfirm;
    
    confirmModalOverlay.classList.add('open');
    btnModalConfirm.focus();
    
    // Trap focus inside modal
    confirmModalOverlay.addEventListener('keydown', trapModalFocus);
  }

  function closeModal() {
    confirmModalOverlay.classList.remove('open');
    onModalConfirmCallback = null;
    confirmModalOverlay.removeEventListener('keydown', trapModalFocus);
  }

  btnModalCancel.addEventListener('click', closeModal);
  confirmModalOverlay.addEventListener('click', (e) => {
    if (e.target === confirmModalOverlay) {
      closeModal();
    }
  });

  btnModalConfirm.addEventListener('click', () => {
    if (onModalConfirmCallback) {
      onModalConfirmCallback();
    }
    closeModal();
  });

  function trapModalFocus(e) {
    if (e.key === 'Tab') {
      const focusables = confirmModalOverlay.querySelectorAll('button');
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    } else if (e.key === 'Escape') {
      closeModal();
    }
  }

  // --- SYNC AZURE FLOW ---
  btnSync.addEventListener('click', async () => {
    btnSync.classList.add('spin');
    btnSync.disabled = true;
    showToast('Syncing with Azure subscription cache...', 'info');
    
    try {
      await apiCall('/api/sync', 'POST');
      lastSyncTime = Date.now();
      updateLastSyncedText();
      await fetchVms(false);
      showToast('Cache sync complete. KPI counts updated.', 'success');
    } catch (err) {
      showToast(err.message || 'Azure cache sync failed.', 'error');
    } finally {
      btnSync.classList.remove('spin');
      btnSync.disabled = false;
    }
  });

  function updateLastSyncedText() {
    const diff = Math.floor((Date.now() - lastSyncTime) / 1000);
    if (diff < 60) {
      syncStatus.textContent = 'Last synced just now';
    } else {
      const mins = Math.floor(diff / 60);
      syncStatus.textContent = `Last synced ${mins}m ago`;
    }
  }
  setInterval(updateLastSyncedText, 10000);

  // --- DETAILED SLIDE-OVER DRAWER ---
  async function openDrawer(vm) {
    drawerVmName.textContent = vm.name;
    drawerVmRg.textContent = vm.resource_group;
    
    configStatus.textContent = vm.power_state;
    configPrivateIp.textContent = vm.private_ip || '-';
    configSize.textContent = vm.size;
    configRg.textContent = vm.resource_group;
    configPublicIp.textContent = vm.public_ip || '-';
    configSchedule.textContent = vm.schedule || '—';
    
    updateDrawerActionButtons(vm);
    
    // Render placeholders for metrics sparkline
    drawLoadingSparklines();
    
    // Load activity log list stub
    renderActivityList(vm);

    // Open slideover
    drawerOverlay.classList.add('open');
    btnDrawerClose.focus();
    drawerOverlay.addEventListener('keydown', trapDrawerFocus);

    // Load actual metrics data points from backend
    try {
      const metricsData = await apiCall(`/api/vms/${vm.resource_group}/${vm.name}/metrics`);
      
      const cpu = metricsData.cpu;
      const mem = metricsData.memory;
      const net = metricsData.network;

      // Draw SVGs
      drawSparkline(document.getElementById('sparklineCpu'), cpu);
      drawSparkline(document.getElementById('sparklineMemory'), mem);
      drawSparkline(document.getElementById('sparklineNetwork'), net);

      // Set current top metrics labels
      document.getElementById('metricCpu').textContent = `${cpu[cpu.length - 1]}%`;
      document.getElementById('metricMemory').textContent = `${(mem[mem.length - 1] / 10).toFixed(1)} GiB`;
      document.getElementById('metricNetwork').textContent = `${net[net.length - 1]} KB/s`;
    } catch (err) {
      console.error('Failed to load drawer metrics', err);
    }
  }

  function updateDrawerActionButtons(vm) {
    const isRunning = vm.power_state.toLowerCase().includes('running');
    const isStopped = vm.power_state.toLowerCase().includes('deallocated') || vm.power_state.toLowerCase().includes('stopped');
    const isTransitional = vm.power_state.toLowerCase().includes('starting') ||
                           vm.power_state.toLowerCase().includes('stopping') ||
                           vm.power_state.toLowerCase().includes('restarting');
                           
    drawerActionStart.disabled = !vm.allowed_actions.includes('start') || !isStopped || isTransitional;
    drawerActionRestart.disabled = !vm.allowed_actions.includes('restart') || !isRunning || isTransitional;
    drawerActionStop.disabled = !vm.allowed_actions.includes('stop') || !isRunning || isTransitional;

    // Reset list of event listeners by replacing buttons
    const newStart = drawerActionStart.cloneNode(true);
    const newRestart = drawerActionRestart.cloneNode(true);
    const newStop = drawerActionStop.cloneNode(true);
    
    drawerActionStart.parentNode.replaceChild(newStart, drawerActionStart);
    drawerActionRestart.parentNode.replaceChild(newRestart, drawerActionRestart);
    drawerActionStop.parentNode.replaceChild(newStop, drawerActionStop);
    
    // Re-assign selectors
    drawerActionStart = document.getElementById('drawerActionStart');
    drawerActionRestart = document.getElementById('drawerActionRestart');
    drawerActionStop = document.getElementById('drawerActionStop');

    drawerActionStart.addEventListener('click', () => triggerVmAction(vm, 'start'));
    drawerActionRestart.addEventListener('click', () => {
      confirmActionModal(
        'Restart VM',
        `Restart VM '${vm.name}'? Active sessions will drop.`,
        () => triggerVmAction(vm, 'restart')
      );
    });
    drawerActionStop.addEventListener('click', () => {
      confirmActionModal(
        'Stop (Deallocate) VM',
        `Stop '${vm.name}'? Compute allocation releases and billing stops.`,
        () => triggerVmAction(vm, 'stop')
      );
    });
  }

  function closeDrawer() {
    drawerOverlay.classList.remove('open');
    drawerOverlay.removeEventListener('keydown', trapDrawerFocus);
  }

  btnDrawerClose.addEventListener('click', closeDrawer);
  drawerOverlay.addEventListener('click', (e) => {
    if (e.target === drawerOverlay) {
      closeDrawer();
    }
  });

  function trapDrawerFocus(e) {
    if (e.key === 'Tab') {
      const focusables = detailDrawer.querySelectorAll('button, a');
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    } else if (e.key === 'Escape') {
      closeDrawer();
    }
  }

  // --- DRAWER SPARKLINE CHART DRAWING ---
  function drawLoadingSparklines() {
    const svgs = ['sparklineCpu', 'sparklineMemory', 'sparklineNetwork'];
    svgs.forEach(id => {
      const svg = document.getElementById(id);
      svg.innerHTML = `
        <line x1="0" y1="18" x2="140" y2="18" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="3,3" />
      `;
    });
    document.getElementById('metricCpu').textContent = '—%';
    document.getElementById('metricMemory').textContent = '— GiB';
    document.getElementById('metricNetwork').textContent = '— KB/s';
  }

  function drawSparkline(svgElement, data) {
    if (!data || data.length === 0) return;
    const width = 140;
    const height = 36;
    const padding = 2;
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    
    const points = data.map((val, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - padding - ((val - min) / range) * (height - 2 * padding);
      return `${x},${y}`;
    });
    
    const pathD = `M ${points.join(' L ')}`;
    const fillD = `${pathD} L ${width},${height} L 0,${height} Z`;
    
    svgElement.innerHTML = `
      <path class="sparkline-fill" d="${fillD}"></path>
      <path class="sparkline-path" d="${pathD}"></path>
    `;
  }

  function renderActivityList(vm) {
    // Generates a mock but realistic list of activity logs for the VM
    const logs = [
      { action: 'Start VM', result: 'success', user: 'admin', time: '1h ago' },
      { action: 'Schedule trigger stop (deallocate)', result: 'success', user: 'scheduler', time: '12h ago' },
      { action: 'Restart VM', result: 'success', user: 'admin', time: '1d ago' },
      { action: 'Update power state cache refresh', result: 'success', user: 'system', time: '2d ago' }
    ];
    
    let html = '';
    logs.forEach(log => {
      const isOk = log.result === 'success';
      html += `
        <div class="activity-item">
          <div class="activity-dot ${isOk ? 'success' : 'failed'}"></div>
          <div class="activity-content">
            <span class="activity-text">
              <strong>${log.action}</strong> by <code>${log.user}</code>
            </span>
            <span class="activity-time">${log.time}</span>
          </div>
        </div>
      `;
    });
    drawerActivityList.innerHTML = html;
  }

  // --- CLIENT-SIDE SEARCH & DROPDOWNS ---
  
  // Search text input
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    applyFiltersAndRender();
  });

  // Resource Group Filter Dropdown Toggle
  btnRgFilter.addEventListener('click', (e) => {
    e.stopPropagation();
    rgDropdownMenu.classList.toggle('show');
    statusDropdownMenu.classList.remove('show');
  });

  rgDropdownMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.dropdown-item');
    if (!item) return;
    
    selectedRg = item.getAttribute('data-value');
    
    // Update button text
    if (selectedRg === 'all') {
      btnRgFilter.querySelector('span').textContent = 'All resource groups';
    } else {
      btnRgFilter.querySelector('span').textContent = selectedRg;
    }
    
    // Update checked styles
    renderRgFilterDropdown();
    applyFiltersAndRender();
    rgDropdownMenu.classList.remove('show');
  });

  // Status Filter Dropdown Toggle
  btnStatusFilter.addEventListener('click', (e) => {
    e.stopPropagation();
    statusDropdownMenu.classList.toggle('show');
    rgDropdownMenu.classList.remove('show');
  });

  statusDropdownMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.dropdown-item');
    if (!item) return;
    
    selectedStatus = item.getAttribute('data-value');
    
    // Update button text
    if (selectedStatus === 'all') {
      btnStatusFilter.querySelector('span').textContent = 'All statuses';
    } else if (selectedStatus === 'running') {
      btnStatusFilter.querySelector('span').textContent = 'Running';
    } else if (selectedStatus === 'scheduled') {
      btnStatusFilter.querySelector('span').textContent = 'Scheduled';
    } else {
      btnStatusFilter.querySelector('span').textContent = 'Deallocated';
    }
    
    // Update checked styles
    statusDropdownMenu.querySelectorAll('.dropdown-item').forEach(el => {
      if (el.getAttribute('data-value') === selectedStatus) {
        el.classList.add('checked');
      } else {
        el.classList.remove('checked');
      }
    });
    
    applyFiltersAndRender();
    statusDropdownMenu.classList.remove('show');
  });

  // Close dropdowns on clicking outside
  document.addEventListener('click', () => {
    rgDropdownMenu.classList.remove('show');
    statusDropdownMenu.classList.remove('show');
  });

  // --- TABLE HEADER SORTING FLOW ---
  const headers = document.querySelectorAll('.data-table th.sortable');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const field = header.getAttribute('data-sort');
      if (currentSort === field) {
        // Toggle direction
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort = field;
        sortDirection = 'asc';
      }

      // Update sort arrow indicators in HTML
      headers.forEach(h => {
        const ind = h.querySelector('.sort-indicator');
        const f = h.getAttribute('data-sort');
        if (f === currentSort) {
          ind.textContent = sortDirection === 'asc' ? '↑' : '↓';
        } else {
          ind.textContent = '';
        }
      });

      applyFiltersAndRender();
    });
  });

  // --- INITIAL LOADING INITIALIZATION ---
  fetchUserProfile();
  fetchVms(true);
  
  // Refresh VMs list every 12 seconds in the background
  setInterval(() => {
    // Only fetch list if drawer is closed and there are no active pollers
    if (!drawerOverlay.classList.contains('open') && Object.keys(activePollers).length === 0) {
      fetchVms(false);
    }
  }, 12000);
});
