import React, { useEffect, useState } from 'react';
import { Users as UsersIcon, Plus, Trash2, Key, Shield, ShieldCheck, Check, X, Loader2, Edit3, Settings } from 'lucide-react';
import { useToast } from '../components/Toast';
import GlassCard from '../components/GlassCard';
import api from '../utils/api';

const Users = () => {
  const { addToast } = useToast();
  
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [azureRgs, setAzureRgs] = useState([]);
  
  // Modal states
  const [userModal, setUserModal] = useState({ isOpen: false, type: 'create', user: null });
  const [grantModal, setGrantModal] = useState({ isOpen: false, user: null });
  
  // User Form State
  const [userForm, setUserForm] = useState({
    username: '',
    email: '',
    role: 'user',
    is_active: true,
    password: ''
  });
  
  // Grants Editor State
  const [userGrants, setUserGrants] = useState([]);
  const [newGrant, setNewGrant] = useState({
    resource_group: '*',
    vm_name: '*',
    can_start: true,
    can_stop: true,
    can_restart: true
  });

  const [formLoading, setFormLoading] = useState(false);

  // Fetch users and Resource groups (to map grants)
  const fetchData = async () => {
    setLoading(true);
    try {
      const [userRes, rgRes] = await Promise.all([
        api.get('/users'),
        api.get('/vms/resource-groups') // Fetch cached groups
      ]);
      setUsers(userRes.data);
      setAzureRgs(rgRes.data);
    } catch (err) {
      console.error(err);
      addToast('Failed to load accounts management configurations.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // User Actions
  const handleOpenUserModal = (type = 'create', user = null) => {
    if (user) {
      setUserForm({
        username: user.username,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        password: '' // Reset pwd is optional on edit
      });
    } else {
      setUserForm({
        username: '',
        email: '',
        role: 'user',
        is_active: true,
        password: ''
      });
    }
    setUserModal({ isOpen: true, type, user });
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (userModal.type === 'create' && !userForm.password) {
      addToast('Password is required for new accounts.', 'warning');
      return;
    }
    
    setFormLoading(true);
    try {
      if (userModal.type === 'create') {
        await api.post('/users', userForm);
        addToast(`Account '${userForm.username}' created.`, 'success');
      } else {
        // Build payload, only submit password if not empty
        const payload = {
          email: userForm.email,
          role: userForm.role,
          is_active: userForm.is_active
        };
        if (userForm.password) {
          payload.password = userForm.password;
        }
        await api.put(`/users/${userModal.user.id}`, payload);
        addToast('Account profile updated successfully.', 'success');
      }
      setUserModal({ isOpen: false, type: 'create', user: null });
      fetchData();
    } catch (err) {
      console.error(err);
      addToast(err.response?.data?.detail || 'Failed to save account settings.', 'error');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteUser = async (id, name) => {
    if (!confirm(`Are you sure you want to permanently delete user '${name}'? This cannot be undone.`)) return;
    try {
      await api.delete(`/users/${id}`);
      addToast('Account deleted successfully.', 'success');
      fetchData();
    } catch (err) {
      console.error(err);
      addToast(err.response?.data?.detail || 'Failed to delete user account.', 'error');
    }
  };

  // Grants Actions
  const handleOpenGrants = (user) => {
    setUserGrants(user.grants || []);
    setNewGrant({
      resource_group: '*',
      vm_name: '*',
      can_start: true,
      can_stop: true,
      can_restart: true
    });
    setGrantModal({ isOpen: true, user });
  };

  const handleAddGrant = () => {
    // Check if duplicate exists
    const duplicate = userGrants.find(
      g => g.resource_group.toLowerCase() === newGrant.resource_group.toLowerCase() &&
           g.vm_name.toLowerCase() === newGrant.vm_name.toLowerCase()
    );
    if (duplicate) {
      addToast('A grant matching this target already exists.', 'warning');
      return;
    }
    
    setUserGrants(prev => [...prev, newGrant]);
    // Reset to defaults
    setNewGrant({
      resource_group: '*',
      vm_name: '*',
      can_start: true,
      can_stop: true,
      can_restart: true
    });
  };

  const handleRemoveGrant = (index) => {
    setUserGrants(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveGrants = async () => {
    setFormLoading(true);
    try {
      await api.post(`/users/${grantModal.user.id}/access`, userGrants);
      addToast('Access grants synchronized successfully.', 'success');
      setGrantModal({ isOpen: false, user: null });
      fetchData();
    } catch (err) {
      console.error(err);
      addToast('Failed to save access grants.', 'error');
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#11131e]/50 border border-[#1c1e2d] p-4 rounded-2xl">
        <div className="flex items-center space-x-2 text-slate-400 text-xs">
          <Shield className="h-4 w-4 text-teal-400" />
          <span>Role-Based Access Control (RBAC): Standard users require explicit grants to control VMs.</span>
        </div>
        
        <button
          onClick={() => handleOpenUserModal('create')}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl btn-primary text-sm transition-all duration-150"
        >
          <Plus className="h-4 w-4" />
          <span>Create Account</span>
        </button>
      </div>

      {/* Users Accounts List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-500 border-t-transparent"></div>
          <span className="text-sm text-slate-400">Loading user profiles...</span>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#1c1e2d] glass-panel">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1c1e2d] bg-[#07080c]/50 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-4 px-6">Username</th>
                <th className="py-4 px-6">Email Address</th>
                <th className="py-4 px-6">Role</th>
                <th className="py-4 px-6">Status</th>
                <th className="py-4 px-6">Assigned Grants</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1c1e2d] text-sm text-slate-300">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-[#161824]/50 transition-colors duration-150">
                  <td className="py-4 px-6 font-semibold text-slate-200">{u.username}</td>
                  <td className="py-4 px-6">{u.email}</td>
                  <td className="py-4 px-6">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                      u.role === 'admin' ? 'bg-teal-500/10 text-teal-400 border-teal-500/20' : 'bg-[#161822] text-slate-300 border-[#252839]'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                      u.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}>
                      {u.is_active ? 'active' : 'disabled'}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    {u.role === 'admin' ? (
                      <span className="text-xs text-slate-500 italic">Full Admin Power</span>
                    ) : (
                      <span className="font-semibold text-slate-200">
                        {u.grants?.length || 0} grant(s)
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex justify-end space-x-2">
                      {/* Access Manager Button (standard users only) */}
                      {u.role !== 'admin' && (
                        <button
                          onClick={() => handleOpenGrants(u)}
                          className="px-2.5 py-1.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-[#14B8A6] border border-teal-500/20 text-xs font-semibold transition-colors duration-150"
                          title="Manage VM / Resource Group Grants"
                        >
                          Permissions
                        </button>
                      )}
                      
                      {/* Edit Button */}
                      <button
                        onClick={() => handleOpenUserModal('edit', u)}
                        className="p-1.5 rounded-lg btn-secondary transition-colors duration-150"
                        title="Edit Account Details"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => handleDeleteUser(u.id, u.username)}
                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all duration-150"
                        title="Delete User"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* User Create / Edit Modal */}
      {userModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <GlassCard className="border border-[#1c1e2d] shadow-2xl">
              <h3 className="text-xl font-bold font-sans text-white mb-6">
                {userModal.type === 'create' ? 'Create New Account' : 'Edit Account Profile'}
              </h3>

              <form onSubmit={handleSaveUser} className="space-y-4">
                {/* Username (cannot change on edit) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Username
                  </label>
                  <input
                    type="text"
                    value={userForm.username}
                    onChange={(e) => setUserForm(prev => ({ ...prev, username: e.target.value }))}
                    disabled={userModal.type === 'edit'}
                    placeholder="e.g. cloudadmin"
                    className="w-full px-4 py-2.5 text-sm rounded-xl text-slate-200 glass-input disabled:opacity-50 disabled:cursor-not-allowed"
                    required
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(e) => setUserForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="e.g. dev@company.com"
                    className="w-full px-4 py-2.5 text-sm rounded-xl text-slate-200 glass-input"
                    required
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    {userModal.type === 'create' ? 'Password *' : 'Reset Password (optional)'}
                  </label>
                  <input
                    type="password"
                    value={userForm.password}
                    onChange={(e) => setUserForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder={userModal.type === 'create' ? 'Enter password' : 'Leave empty to keep current'}
                    className="w-full px-4 py-2.5 text-sm rounded-xl text-slate-200 glass-input"
                    required={userModal.type === 'create'}
                  />
                </div>

                {/* Role & Status Row */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Role */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      System Role
                    </label>
                    <select
                      value={userForm.role}
                      onChange={(e) => setUserForm(prev => ({ ...prev, role: e.target.value }))}
                      className="w-full px-4 py-2.5 text-sm rounded-xl text-slate-300 glass-input appearance-none bg-[#07080c]"
                    >
                      <option value="user">User (RBAC scoped)</option>
                      <option value="admin">Administrator (Full Access)</option>
                    </select>
                  </div>

                  {/* Status Toggle */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Account Status
                    </label>
                    <select
                      value={userForm.is_active}
                      onChange={(e) => setUserForm(prev => ({ ...prev, is_active: e.target.value === 'true' }))}
                      className="w-full px-4 py-2.5 text-sm rounded-xl text-slate-300 glass-input appearance-none bg-[#07080c]"
                    >
                      <option value="true">Active / Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  </div>
                </div>

                {/* Footer buttons */}
                <div className="flex justify-end space-x-3 border-t border-[#1c1e2d] pt-4 mt-6">
                  <button
                    type="button"
                    onClick={() => setUserModal({ isOpen: false, type: 'create', user: null })}
                    className="px-4 py-2 text-sm font-medium rounded-lg btn-secondary transition-all duration-150"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formLoading}
                    className="flex items-center space-x-2 px-5 py-2 rounded-lg btn-primary text-sm transition-all duration-150 disabled:opacity-50"
                  >
                    {formLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    <span>{userModal.type === 'create' ? 'Create User' : 'Save Changes'}</span>
                  </button>
                </div>
              </form>
            </GlassCard>
          </div>
        </div>
      )}

      {/* Access Grants Manager Modal */}
      {grantModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl animate-in fade-in zoom-in-95 duration-200">
            <GlassCard className="border border-[#1c1e2d] shadow-2xl max-h-[85vh] flex flex-col justify-between overflow-hidden">
              {/* Header */}
              <div className="mb-4">
                <h3 className="text-xl font-bold font-sans text-white">
                  Manage Access Permissions
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Assign scopes for user: <strong className="text-teal-400">{grantModal.user?.username}</strong>
                </p>
              </div>

              {/* Body: Form + List */}
              <div className="flex-1 overflow-y-auto space-y-6 pr-1 my-4">
                
                {/* Grant Insertion Form */}
                <div className="bg-[#07080c]/40 border border-[#1c1e2d] p-4 rounded-xl space-y-4">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Add New Scope Grant</span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Resource Group Scope */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Resource Group</label>
                      <select
                        value={newGrant.resource_group}
                        onChange={(e) => setNewGrant(prev => ({ ...prev, resource_group: e.target.value, vm_name: '*' }))}
                        className="w-full px-3 py-2 text-xs rounded-lg text-slate-300 glass-input bg-[#07080c]"
                      >
                        <option value="*">* (All Resource Groups)</option>
                        {azureRgs.map(rg => (
                          <option key={rg} value={rg}>{rg}</option>
                        ))}
                      </select>
                    </div>

                    {/* VM Scope */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">VM Name Scope</label>
                      <input
                        type="text"
                        value={newGrant.vm_name}
                        onChange={(e) => setNewGrant(prev => ({ ...prev, vm_name: e.target.value }))}
                        placeholder="VM name or * for all"
                        className="w-full px-3 py-2 text-xs rounded-lg text-slate-200 glass-input"
                      />
                    </div>
                  </div>

                  {/* Actions Toggles */}
                  <div className="flex items-center space-x-6 pt-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Permitted actions:</span>
                    <label className="flex items-center space-x-1.5 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newGrant.can_start}
                        onChange={(e) => setNewGrant(prev => ({ ...prev, can_start: e.target.checked }))}
                        className="rounded border-[#1c1e2d] bg-[#07080c] text-teal-500 focus:ring-teal-500/20"
                      />
                      <span>Start</span>
                    </label>
                    <label className="flex items-center space-x-1.5 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newGrant.can_stop}
                        onChange={(e) => setNewGrant(prev => ({ ...prev, can_stop: e.target.checked }))}
                        className="rounded border-[#1c1e2d] bg-[#07080c] text-teal-500 focus:ring-teal-500/20"
                      />
                      <span>Stop</span>
                    </label>
                    <label className="flex items-center space-x-1.5 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newGrant.can_restart}
                        onChange={(e) => setNewGrant(prev => ({ ...prev, can_restart: e.target.checked }))}
                        className="rounded border-[#1c1e2d] bg-[#07080c] text-teal-500 focus:ring-teal-500/20"
                      />
                      <span>Restart</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddGrant}
                    className="w-full py-2 rounded-lg btn-secondary transition-all text-xs font-semibold"
                  >
                    Add Scope to List
                  </button>
                </div>

                {/* Scope list table */}
                <div className="space-y-3">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Configured Access Grants</span>
                  
                  {userGrants.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-[#1c1e2d] rounded-xl text-slate-500 text-xs">
                      No scopes assigned yet. User will not see any VMs in the Dashboard.
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-[#1c1e2d] bg-[#07080c]/20">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-[#07080c]/40 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-[#1c1e2d]">
                            <th className="p-3">Resource Group</th>
                            <th className="p-3">VM Scope</th>
                            <th className="p-3 text-center">Start</th>
                            <th className="p-3 text-center">Stop</th>
                            <th className="p-3 text-center">Restart</th>
                            <th className="p-3 text-right">Remove</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1c1e2d] text-slate-300">
                          {userGrants.map((g, idx) => (
                            <tr key={idx} className="hover:bg-[#161824]/50 transition-colors">
                              <td className="p-3 font-semibold text-slate-200">{g.resource_group}</td>
                              <td className="p-3">{g.vm_name}</td>
                              <td className="p-3 text-center">
                                {g.can_start ? <Check className="h-4.5 w-4.5 text-emerald-400 mx-auto" /> : <X className="h-4.5 w-4.5 text-red-500 mx-auto" />}
                              </td>
                              <td className="p-3 text-center">
                                {g.can_stop ? <Check className="h-4.5 w-4.5 text-emerald-400 mx-auto" /> : <X className="h-4.5 w-4.5 text-red-500 mx-auto" />}
                              </td>
                              <td className="p-3 text-center">
                                {g.can_restart ? <Check className="h-4.5 w-4.5 text-emerald-400 mx-auto" /> : <X className="h-4.5 w-4.5 text-red-500 mx-auto" />}
                              </td>
                              <td className="p-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveGrant(idx)}
                                  className="text-red-400 hover:text-red-300"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Save Actions */}
              <div className="flex justify-end space-x-3 border-t border-[#1c1e2d] pt-4">
                <button
                  type="button"
                  onClick={() => setGrantModal({ isOpen: false, user: null })}
                  className="px-4 py-2 text-sm font-medium rounded-lg btn-secondary transition-all duration-150"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveGrants}
                  disabled={formLoading}
                  className="flex items-center space-x-2 px-5 py-2 rounded-lg btn-primary text-sm transition-all duration-150"
                >
                  {formLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Save Access Grants</span>
                </button>
              </div>
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
