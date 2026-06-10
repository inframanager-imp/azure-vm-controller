import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon, ShieldCheck, ShieldAlert, Key, Link2, Loader2, Info } from 'lucide-react';
import { useToast } from '../components/Toast';
import GlassCard from '../components/GlassCard';
import api from '../utils/api';

const Settings = () => {
  const { addToast } = useToast();
  
  const [formData, setFormData] = useState({
    tenant_id: '',
    client_id: '',
    client_secret: '',
    subscription_id: ''
  });
  
  const [hasSecret, setHasSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testLoading, setTestLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('untested'); // 'untested', 'success', 'failed'
  const [errorMessage, setErrorMessage] = useState('');

  // Fetch saved configuration settings
  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await api.get('/azure/settings');
      setFormData({
        tenant_id: response.data.tenant_id,
        client_id: response.data.client_id,
        client_secret: response.data.has_secret ? '••••••••••••••••' : '',
        subscription_id: response.data.subscription_id
      });
      setHasSecret(response.data.has_secret);
    } catch (err) {
      console.warn("Azure settings not yet configured:", err);
      // It's normal to get 404 if not configured yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  // Save Settings to Database
  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.tenant_id || !formData.client_id || !formData.subscription_id) {
      addToast('Please enter all required connection fields.', 'warning');
      return;
    }

    // Check if secret is modified or left as placeholder
    const isPlaceholderSecret = formData.client_secret === '••••••••••••••••';
    if (!isPlaceholderSecret && !formData.client_secret) {
      addToast('Client secret cannot be empty.', 'warning');
      return;
    }

    setSaveLoading(true);
    try {
      // If secret is the placeholder, we shouldn't send the literal placeholder,
      // but wait, the backend endpoint expects AzureSettingsCreate which contains client_secret.
      // So let's make sure if it is the placeholder, we warn the user or handle it.
      // In this setup, we require the user to re-enter the secret if they modify settings, 
      // or we send what they entered.
      if (isPlaceholderSecret) {
        addToast('Please re-enter your client secret to save changes.', 'warning');
        setSaveLoading(false);
        return;
      }

      const response = await api.post('/azure/settings', formData);
      addToast('Azure configuration saved successfully.', 'success');
      
      // Update form state with obfuscated secret
      setFormData(prev => ({ ...prev, client_secret: '••••••••••••••••' }));
      setHasSecret(true);
      setConnectionStatus('untested'); // Reset testing status
    } catch (err) {
      console.error(err);
      addToast(err.response?.data?.detail || 'Failed to save configuration settings.', 'error');
    } finally {
      setSaveLoading(false);
    }
  };

  // Test connection using current form fields (even if unsaved)
  const handleTestConnection = async () => {
    setTestLoading(true);
    setConnectionStatus('testing');
    setErrorMessage('');
    
    try {
      const isPlaceholderSecret = formData.client_secret === '••••••••••••••••';
      
      let payload = null;
      // If secret is not placeholder, we can test the current form inputs.
      // If secret IS the placeholder, we send null (the API route will test the saved DB settings).
      if (!isPlaceholderSecret) {
        payload = formData;
      }
      
      const response = await api.post('/azure/test', payload);
      setConnectionStatus('success');
      addToast(response.data.message, 'success');
    } catch (err) {
      console.error(err);
      setConnectionStatus('failed');
      const detail = err.response?.data?.detail || 'Failed to authenticate with Azure.';
      setErrorMessage(detail);
      addToast('Azure authentication check failed.', 'error');
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Role Requirement Warning banner */}
      <GlassCard className="border border-teal-500/20 bg-teal-500/5 flex items-start space-x-4">
        <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 mt-0.5 flex-shrink-0">
          <Info className="h-5 w-5" />
        </div>
        <div className="text-xs text-slate-300 leading-relaxed">
          <h4 className="font-semibold text-white mb-1">Service Principal IAM Access Requirement</h4>
          <p>
            To manage VMs, the Azure Service Principal (Client ID) configured below requires the <strong>Virtual Machine Contributor</strong> role assigned at the Subscription level or within the specific target Resource Groups.
          </p>
        </div>
      </GlassCard>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-500 border-t-transparent"></div>
          <span className="text-sm text-slate-400">Loading configurations...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Settings Fields Card */}
          <GlassCard className="md:col-span-2 border border-[#1c1e2d] space-y-6">
            <h3 className="text-lg font-bold font-sans text-white border-b border-[#1c1e2d] pb-3">
              Service Principal Credentials
            </h3>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Tenant ID */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Tenant ID (Directory ID) *
                </label>
                <input
                  type="text"
                  value={formData.tenant_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, tenant_id: e.target.value }))}
                  placeholder="e.g. f83b320c-...."
                  className="w-full px-4 py-2.5 text-sm rounded-xl text-slate-200 glass-input"
                  required
                />
              </div>

              {/* Client ID */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Client ID (Application/Service Principal AppId) *
                </label>
                <input
                  type="text"
                  value={formData.client_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, client_id: e.target.value }))}
                  placeholder="e.g. 5d120a10-...."
                  className="w-full px-4 py-2.5 text-sm rounded-xl text-slate-200 glass-input"
                  required
                />
              </div>

              {/* Client Secret */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Client Secret (Secret Value) *
                </label>
                <input
                  type="password"
                  value={formData.client_secret}
                  onChange={(e) => setFormData(prev => ({ ...prev, client_secret: e.target.value }))}
                  placeholder={hasSecret ? '••••••••••••••••' : 'Enter client secret'}
                  className="w-full px-4 py-2.5 text-sm rounded-xl text-slate-200 glass-input"
                  required={!hasSecret}
                />
              </div>

              {/* Subscription ID */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Subscription ID *
                </label>
                <input
                  type="text"
                  value={formData.subscription_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, subscription_id: e.target.value }))}
                  placeholder="e.g. c9a832f0-...."
                  className="w-full px-4 py-2.5 text-sm rounded-xl text-slate-200 glass-input"
                  required
                />
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-xl btn-primary text-sm transition-all duration-150 disabled:opacity-50"
                >
                  {saveLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Save Configuration</span>
                </button>
              </div>
            </form>
          </GlassCard>

          {/* Test connection panel */}
          <div className="space-y-6">
            <GlassCard className="border border-[#1c1e2d] flex flex-col justify-between h-full">
              <div className="space-y-4">
                <h3 className="text-lg font-bold font-sans text-white border-b border-[#1c1e2d] pb-3">
                  Connection Health
                </h3>
                
                {/* Status Indicator */}
                <div className="py-6 flex flex-col items-center justify-center text-center">
                  {connectionStatus === 'untested' && (
                    <div className="space-y-2">
                      <div className="h-12 w-12 rounded-full bg-[#07080c]/50 border border-[#1c1e2d] flex items-center justify-center text-slate-500 mx-auto">
                        <Link2 className="h-6 w-6" />
                      </div>
                      <span className="text-xs text-slate-400 font-medium block">Untested Connection</span>
                    </div>
                  )}

                  {connectionStatus === 'testing' && (
                    <div className="space-y-2">
                      <Loader2 className="h-10 w-10 animate-spin text-teal-400 mx-auto" />
                      <span className="text-xs text-teal-400 font-semibold block animate-pulse">Checking credentials...</span>
                    </div>
                  )}

                  {connectionStatus === 'success' && (
                    <div className="space-y-2">
                      <div className="h-12 w-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
                        <ShieldCheck className="h-6 w-6 text-glow-green" />
                      </div>
                      <span className="text-xs text-emerald-400 font-semibold block">Authentication Verified</span>
                    </div>
                  )}

                  {connectionStatus === 'failed' && (
                    <div className="space-y-2 max-w-xs">
                      <div className="h-12 w-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mx-auto">
                        <ShieldAlert className="h-6 w-6" />
                      </div>
                      <span className="text-xs text-red-400 font-semibold block">Verification Failed</span>
                      <p className="text-[10px] text-red-500 leading-normal bg-red-950/20 p-2.5 rounded-lg border border-red-900/10 break-words max-h-24 overflow-y-auto">
                        {errorMessage}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Test Button */}
              <button
                onClick={handleTestConnection}
                disabled={testLoading || (!hasSecret && !formData.client_secret)}
                className="w-full py-2.5 rounded-xl btn-secondary transition-all text-xs font-semibold active:scale-95 disabled:opacity-35 disabled:pointer-events-none"
              >
                {testLoading ? 'Testing...' : 'Test Connection'}
              </button>
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
