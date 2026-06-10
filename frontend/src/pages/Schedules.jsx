import React, { useEffect, useState } from 'react';
import { Calendar, Plus, Trash2, Power, Play, Square, Info, ShieldAlert, Loader2, HelpCircle } from 'lucide-react';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import GlassCard from '../components/GlassCard';
import api from '../utils/api';

const TIMEZONES = [
  'Asia/Kolkata',
  'UTC',
  'America/New_York',
  'Europe/London',
  'Asia/Singapore'
];

const PRESETS = [
  { name: 'Custom Cron Expression', cron: '', timezone: '' },
  { name: 'Stop weekdays at 8 PM IST', cron: '0 20 * * 1-5', timezone: 'Asia/Kolkata' },
  { name: 'Start weekdays at 9 AM IST', cron: '0 9 * * 1-5', timezone: 'Asia/Kolkata' },
  { name: 'Stop daily at 10 PM IST', cron: '0 22 * * *', timezone: 'Asia/Kolkata' },
  { name: 'Start daily at 8 AM IST', cron: '0 8 * * *', timezone: 'Asia/Kolkata' }
];

const Schedules = () => {
  const { addToast } = useToast();
  const { user } = useAuth();
  
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vms, setVms] = useState([]);
  const [rgs, setRgs] = useState([]);
  
  // Form/Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    target_type: 'vm', // 'vm' or 'rg'
    resource_group: '',
    vm_name: '',
    action: 'start', // 'start' or 'stop'
    cron_expression: '',
    timezone: 'Asia/Kolkata',
    is_enabled: true
  });

  const [presetIndex, setPresetIndex] = useState(0);

  // Fetch Schedules & VMs for Target selection
  const fetchData = async () => {
    setLoading(true);
    try {
      const [schedRes, vmRes, rgRes] = await Promise.all([
        api.get('/schedules'),
        api.get('/vms'),
        api.get('/vms/resource-groups')
      ]);
      setSchedules(schedRes.data);
      setVms(vmRes.data);
      setRgs(rgRes.data);
    } catch (err) {
      console.error(err);
      addToast('Failed to fetch schedules configuration data.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Handle Preset Select Change
  const handlePresetChange = (index) => {
    setPresetIndex(index);
    const preset = PRESETS[index];
    if (preset.cron) {
      setFormData(prev => ({
        ...prev,
        cron_expression: preset.cron,
        timezone: preset.timezone
      }));
    }
  };

  // Open Create/Edit Modal
  const openModal = (schedule = null) => {
    if (schedule) {
      setEditingSchedule(schedule);
      setFormData({
        name: schedule.name,
        target_type: schedule.target_type,
        resource_group: schedule.resource_group,
        vm_name: schedule.vm_name || '',
        action: schedule.action,
        cron_expression: schedule.cron_expression,
        timezone: schedule.timezone,
        is_enabled: schedule.is_enabled
      });
      // Check if matches any preset
      const matchIdx = PRESETS.findIndex(p => p.cron === schedule.cron_expression && p.timezone === schedule.timezone);
      setPresetIndex(matchIdx >= 0 ? matchIdx : 0);
    } else {
      setEditingSchedule(null);
      // Pick first RG as default if available
      const defaultRg = rgs.length > 0 ? rgs[0] : '';
      const defaultVm = vms.filter(v => v.resource_group === defaultRg)[0]?.name || '';
      
      setFormData({
        name: '',
        target_type: 'vm',
        resource_group: defaultRg,
        vm_name: defaultVm,
        action: 'start',
        cron_expression: '0 9 * * 1-5',
        timezone: 'Asia/Kolkata',
        is_enabled: true
      });
      setPresetIndex(2); // Default to start weekdays preset
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSchedule(null);
  };

  // Save Schedule (Create/Update)
  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.cron_expression || !formData.resource_group) {
      addToast('Please fill out all required fields.', 'warning');
      return;
    }
    if (formData.target_type === 'vm' && !formData.vm_name) {
      addToast('Please select a target Virtual Machine.', 'warning');
      return;
    }

    setFormLoading(true);
    try {
      if (editingSchedule) {
        await api.put(`/schedules/${editingSchedule.id}`, formData);
        addToast('Schedule updated successfully.', 'success');
      } else {
        await api.post('/schedules', formData);
        addToast('Schedule created successfully.', 'success');
      }
      closeModal();
      fetchData();
    } catch (err) {
      console.error(err);
      addToast(err.response?.data?.detail || 'Failed to save schedule settings.', 'error');
    } finally {
      setFormLoading(false);
    }
  };

  // Delete Schedule
  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;
    try {
      await api.delete(`/schedules/${id}`);
      addToast('Schedule deleted.', 'success');
      fetchData();
    } catch (err) {
      console.error(err);
      addToast('Failed to delete schedule.', 'error');
    }
  };

  // Toggle Schedule Enabled status directly
  const handleToggle = async (schedule) => {
    const updatedData = {
      name: schedule.name,
      target_type: schedule.target_type,
      resource_group: schedule.resource_group,
      vm_name: schedule.vm_name || '',
      action: schedule.action,
      cron_expression: schedule.cron_expression,
      timezone: schedule.timezone,
      is_enabled: !schedule.is_enabled
    };
    try {
      await api.put(`/schedules/${schedule.id}`, updatedData);
      addToast(`Schedule successfully ${!schedule.is_enabled ? 'enabled' : 'disabled'}.`, 'success');
      fetchData();
    } catch (err) {
      console.error(err);
      addToast('Failed to toggle schedule.', 'error');
    }
  };

  // Filter VMs based on selected Resource Group in Form
  const filteredVmsForSelect = vms.filter(v => v.resource_group === formData.resource_group);

  return (
    <div className="space-y-8">
      {/* Page Header Actions */}
      <div className="flex justify-between items-center bg-slate-900/20 border border-white/5 p-4 rounded-2xl backdrop-blur-md">
        <div className="flex items-center space-x-2 text-slate-400 text-xs">
          <Info className="h-4 w-4 text-teal-400" />
          <span>Schedules operate automatically using background workers. Timezones are respected.</span>
        </div>
        
        <button
          onClick={() => openModal()}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-semibold text-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98] shadow-lg shadow-teal-500/20"
        >
          <Plus className="h-4 w-4" />
          <span>Create Schedule</span>
        </button>
      </div>

      {/* Schedule List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-500 border-t-transparent"></div>
          <span className="text-sm text-slate-400">Loading schedules...</span>
        </div>
      ) : schedules.length === 0 ? (
        <GlassCard className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-12 w-12 rounded-full bg-slate-800/40 border border-white/5 flex items-center justify-center text-slate-500 mb-4">
            <Calendar className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-white">No Schedules Configured</h3>
          <p className="text-sm text-slate-400 max-w-sm mt-1">
            Create automated crontabs to start and stop VMs/Resource Groups to save costs during off-peak hours.
          </p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {schedules.map((schedule) => {
            const isVmTarget = schedule.target_type === 'vm';
            const isStart = schedule.action === 'start';
            
            return (
              <GlassCard key={schedule.id} className={`border border-white/5 flex flex-col justify-between ${!schedule.is_enabled ? 'opacity-60' : ''}`} hover>
                {/* Header details */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="text-lg font-bold text-white tracking-wide font-sans">{schedule.name}</h4>
                    <div className="flex items-center space-x-2 mt-2">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        isStart ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {isStart ? 'Start' : 'Stop (Deallocate)'}
                      </span>
                      <span className="text-xs text-slate-400">
                        Targeting {isVmTarget ? `VM: ${schedule.vm_name}` : `RG: ${schedule.resource_group}`}
                      </span>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    onClick={() => handleToggle(schedule)}
                    className={`h-6 w-11 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${
                      schedule.is_enabled ? 'bg-teal-500' : 'bg-slate-800'
                    }`}
                  >
                    <div className={`bg-white h-5 w-5 rounded-full shadow-md transform duration-200 ${
                      schedule.is_enabled ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* Cron & Next Runs */}
                <div className="bg-slate-950/40 border border-white/5 p-4 rounded-xl space-y-3 mb-4 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Cron Expression:</span>
                    <span className="font-semibold text-slate-200">{schedule.cron_expression} ({schedule.timezone})</span>
                  </div>
                  
                  {schedule.is_enabled && schedule.next_run_times?.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Upcoming Run Times:</span>
                      {schedule.next_run_times.map((run, idx) => (
                        <div key={idx} className="flex items-center space-x-1.5 text-slate-300">
                          <div className="h-1 w-1 rounded-full bg-teal-400" />
                          <span>{run}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Controls Footer */}
                <div className="flex justify-between items-center text-xs text-slate-500 border-t border-white/5 pt-4">
                  <span>Created by: <strong className="text-slate-400">{schedule.created_by}</strong></span>
                  
                  <div className="flex space-x-2">
                    <button
                      onClick={() => openModal(schedule)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800/40 hover:bg-slate-800 text-slate-300 border border-white/5 transition-colors duration-150 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(schedule.id)}
                      className="p-1.5 rounded-lg bg-red-950/10 hover:bg-red-950/20 text-red-400 border border-red-950/30 transition-colors duration-150"
                      title="Delete Schedule"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Create / Edit Schedule Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg animate-in fade-in zoom-in-95 duration-200">
            <GlassCard className="border border-white/10 shadow-2xl overflow-y-auto max-h-[90vh]">
              <h3 className="text-xl font-bold font-sans text-white mb-6">
                {editingSchedule ? 'Edit Schedule Settings' : 'Create New Schedule'}
              </h3>

              <form onSubmit={handleSave} className="space-y-5">
                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Schedule Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Stop VMs at Night"
                    className="w-full px-4 py-2.5 text-sm rounded-xl text-slate-200 glass-input"
                    required
                  />
                </div>

                {/* Target Type */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Target Type
                    </label>
                    <select
                      value={formData.target_type}
                      onChange={(e) => {
                        const type = e.target.value;
                        const defaultRg = rgs.length > 0 ? rgs[0] : '';
                        const defaultVm = vms.filter(v => v.resource_group === defaultRg)[0]?.name || '';
                        setFormData(prev => ({
                          ...prev,
                          target_type: type,
                          resource_group: defaultRg,
                          vm_name: type === 'vm' ? defaultVm : ''
                        }));
                      }}
                      className="w-full px-4 py-2.5 text-sm rounded-xl text-slate-300 glass-input appearance-none bg-slate-950"
                    >
                      <option value="vm">Single VM</option>
                      <option value="rg">Whole Resource Group</option>
                    </select>
                  </div>

                  {/* Action */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Action Type
                    </label>
                    <select
                      value={formData.action}
                      onChange={(e) => setFormData(prev => ({ ...prev, action: e.target.value }))}
                      className="w-full px-4 py-2.5 text-sm rounded-xl text-slate-300 glass-input appearance-none bg-slate-950"
                    >
                      <option value="start">Start VM(s)</option>
                      <option value="stop">Stop (Deallocate) VM(s)</option>
                    </select>
                  </div>
                </div>

                {/* Target Selections */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Resource Group */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Resource Group *
                    </label>
                    <select
                      value={formData.resource_group}
                      onChange={(e) => {
                        const rg = e.target.value;
                        const defaultVm = vms.filter(v => v.resource_group === rg)[0]?.name || '';
                        setFormData(prev => ({
                          ...prev,
                          resource_group: rg,
                          vm_name: formData.target_type === 'vm' ? defaultVm : ''
                        }));
                      }}
                      className="w-full px-4 py-2.5 text-sm rounded-xl text-slate-300 glass-input appearance-none bg-slate-950"
                      required
                    >
                      {rgs.length === 0 && <option value="">No RGs Available</option>}
                      {rgs.map(rg => (
                        <option key={rg} value={rg}>{rg}</option>
                      ))}
                    </select>
                  </div>

                  {/* VM Name (only if target_type is vm) */}
                  {formData.target_type === 'vm' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Virtual Machine *
                      </label>
                      <select
                        value={formData.vm_name}
                        onChange={(e) => setFormData(prev => ({ ...prev, vm_name: e.target.value }))}
                        className="w-full px-4 py-2.5 text-sm rounded-xl text-slate-300 glass-input appearance-none bg-slate-950"
                        required={formData.target_type === 'vm'}
                      >
                        {filteredVmsForSelect.length === 0 && <option value="">No VMs in this RG</option>}
                        {filteredVmsForSelect.map(v => (
                          <option key={v.name} value={v.name}>{v.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Preset Dropdown helper */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Schedule Presets
                  </label>
                  <select
                    value={presetIndex}
                    onChange={(e) => handlePresetChange(parseInt(e.target.value))}
                    className="w-full px-4 py-2.5 text-sm rounded-xl text-slate-300 glass-input appearance-none bg-slate-950"
                  >
                    {PRESETS.map((p, idx) => (
                      <option key={idx} value={idx}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* Cron & Timezone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Cron Input */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Cron Expression *
                    </label>
                    <input
                      type="text"
                      value={formData.cron_expression}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, cron_expression: e.target.value }));
                        setPresetIndex(0); // Mark as custom
                      }}
                      placeholder="e.g. 0 20 * * 1-5"
                      className="w-full px-4 py-2.5 text-sm rounded-xl text-slate-200 glass-input"
                      required
                    />
                  </div>

                  {/* Timezone Select */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Timezone
                    </label>
                    <select
                      value={formData.timezone}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, timezone: e.target.value }));
                        setPresetIndex(0); // Mark as custom
                      }}
                      className="w-full px-4 py-2.5 text-sm rounded-xl text-slate-300 glass-input appearance-none bg-slate-950"
                    >
                      {TIMEZONES.map(tz => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Help text for cron */}
                <div className="text-[10px] text-slate-500 bg-slate-950/20 border border-white/5 p-3 rounded-xl flex items-start space-x-2">
                  <HelpCircle className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-400">Cron syntax support:</strong> standard 5-field crontabs (minute, hour, day of month, month, day of week). For example, <code className="text-teal-400 font-semibold">0 20 * * 1-5</code> triggers weekdays at 8:00 PM.
                  </div>
                </div>

                {/* Submit button footer */}
                <div className="flex justify-end space-x-3 border-t border-white/5 pt-4">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 border border-white/5 transition-all duration-150"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formLoading}
                    className="flex items-center space-x-2 px-5 py-2 rounded-lg bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-semibold text-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                  >
                    {formLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    <span>{editingSchedule ? 'Save Changes' : 'Create Schedule'}</span>
                  </button>
                </div>
              </form>
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
};

export default Schedules;
