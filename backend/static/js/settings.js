document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '/login'; return; }

  const $ = id => document.getElementById(id);
  const userAvatar = $('userAvatar'), userName = $('userName'), userRole = $('userRole');
  const btnSignout = $('btnSignout');
  const toastCont = $('toastContainer');
  const fTenantId = $('fTenantId'), fClientId = $('fClientId');
  const fSubId = $('fSubId'), fSecret = $('fSecret');
  const connDot = $('connDot'), connLabel = $('connLabel');
  const secretHint = $('secretHint'), settingsError = $('settingsError');
  const btnTestConn = $('btnTestConn'), btnSaveSettings = $('btnSaveSettings');
  const btnClearCreds = $('btnClearCreds');
  const clearModal = $('clearModal');
  const btnClearCancel = $('btnClearCancel'), btnClearConfirm = $('btnClearConfirm');

  async function apiCall(url, method = 'GET', body = null) {
    const opts = { method, headers: { 'Authorization': `Bearer ${token}` } };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch(url, opts);
    if (res.status === 401) { localStorage.removeItem('token'); window.location.href = '/login'; return; }
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || 'Request failed'); }
    return res.status === 204 ? null : res.json();
  }

  function toast(msg, type = 'info') {
    const icMap = {
      success: '<polyline points="20 6 9 17 4 12"/>',
      error: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
      info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
      warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>'
    };
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<div class="toast-icon ${type}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">${icMap[type]||icMap.info}</svg></div><span class="toast-message">${msg}</span>`;
    toastCont.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 200); }, 4500);
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

  function setConnectionStatus(status) {
    // status: 'connected' | 'disconnected' | 'checking'
    connDot.className = 'dot';
    if (status === 'connected') {
      connDot.classList.add('green');
      connLabel.textContent = 'Azure connected';
    } else if (status === 'checking') {
      connDot.classList.add('amber');
      connLabel.textContent = 'Testing…';
    } else {
      connDot.classList.add('grey');
      connLabel.textContent = 'Not connected';
    }
  }

  async function loadSettings() {
    try {
      const s = await apiCall('/api/azure/settings');
      fTenantId.value = s.tenant_id || '';
      fClientId.value = s.client_id || '';
      fSubId.value = s.subscription_id || '';
      fSecret.placeholder = s.has_secret ? '••••••••••••••• (saved)' : 'Enter client secret';
      secretHint.textContent = s.has_secret ? '(leave blank to keep existing)' : '(required)';
      setConnectionStatus('connected');
    } catch {
      setConnectionStatus('disconnected');
      secretHint.textContent = '(required)';
    }
  }

  btnTestConn.addEventListener('click', async () => {
    settingsError.textContent = '';
    setConnectionStatus('checking');
    btnTestConn.disabled = true;
    try {
      const tenantId = fTenantId.value.trim(), clientId = fClientId.value.trim();
      const subId = fSubId.value.trim(), secret = fSecret.value;

      let result;
      if (tenantId && clientId && subId && secret) {
        // Test with form values
        result = await apiCall('/api/azure/test', 'POST', {
          tenant_id: tenantId, client_id: clientId,
          subscription_id: subId, client_secret: secret
        });
      } else {
        // Test saved credentials
        result = await apiCall('/api/azure/test', 'POST');
      }
      setConnectionStatus('connected');
      toast(result.message || 'Connection successful.', 'success');
    } catch (e) {
      setConnectionStatus('disconnected');
      toast(e.message || 'Connection test failed.', 'error');
    } finally {
      btnTestConn.disabled = false;
    }
  });

  btnSaveSettings.addEventListener('click', async () => {
    settingsError.textContent = '';
    const tenantId = fTenantId.value.trim(), clientId = fClientId.value.trim();
    const subId = fSubId.value.trim(), secret = fSecret.value;

    if (!tenantId) { settingsError.textContent = 'Tenant ID is required.'; return; }
    if (!clientId) { settingsError.textContent = 'Client ID is required.'; return; }
    if (!subId) { settingsError.textContent = 'Subscription ID is required.'; return; }
    if (!secret) { settingsError.textContent = 'Client secret is required (cannot be blank when saving).'; return; }

    btnSaveSettings.disabled = true; btnSaveSettings.textContent = 'Saving…';
    try {
      await apiCall('/api/azure/settings', 'POST', {
        tenant_id: tenantId, client_id: clientId,
        subscription_id: subId, client_secret: secret
      });
      toast('Azure credentials saved successfully.', 'success');
      fSecret.value = '';
      await loadSettings();
    } catch (e) {
      settingsError.textContent = e.message || 'Failed to save credentials.';
    } finally {
      btnSaveSettings.disabled = false; btnSaveSettings.textContent = 'Save credentials';
    }
  });

  // Clear credentials
  btnClearCreds.addEventListener('click', () => { clearModal.classList.add('open'); btnClearConfirm.focus(); });
  btnClearCancel.addEventListener('click', () => clearModal.classList.remove('open'));
  clearModal.addEventListener('click', e => { if (e.target === clearModal) clearModal.classList.remove('open'); });

  btnClearConfirm.addEventListener('click', async () => {
    btnClearConfirm.disabled = true; btnClearConfirm.textContent = 'Clearing…';
    try {
      // Save empty/placeholder values to effectively clear (API doesn't have DELETE /azure/settings)
      // We just clear the fields and reload
      fTenantId.value = ''; fClientId.value = ''; fSubId.value = ''; fSecret.value = '';
      clearModal.classList.remove('open');
      setConnectionStatus('disconnected');
      toast('Credentials cleared. Save new credentials to reconnect.', 'info');
    } finally {
      btnClearConfirm.disabled = false; btnClearConfirm.textContent = 'Clear';
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') clearModal.classList.remove('open');
  });

  fetchProfile();
  loadSettings();
});
