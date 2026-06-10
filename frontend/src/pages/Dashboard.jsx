import React, { useEffect, useState, useCallback } from 'react';
import { Play, Square, RotateCw, Search, RefreshCw, Layers, ShieldAlert, Cpu } from 'lucide-react';
import { useToast } from '../components/Toast';
import GlassCard from '../components/GlassCard';
import ConfirmModal from '../components/ConfirmModal';
import api from '../utils/api';

const Dashboard = () => {
  const { addToast } = useToast();
  
  const [vms, setVms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [rgFilter, setRgFilter] = useState('');
  const [rgs, setRgs] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    action: '', // 'stop' or 'restart'
    vm: null
  });

  // Fetch VMs list from cache
  const fetchVms = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await api.get('/vms');
      setVms(response.data);
      
      // Extract unique resource groups for filter list
      const groups = [...new Set(response.data.map(vm => vm.resource_group))];
      setRgs(groups.sort());
    } catch (err) {
      console.error(err);
      addToast(err.response?.data?.detail || 'Failed to fetch virtual machines.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  // Set up 20s auto-refresh
  useEffect(() => {
    fetchVms(true);
    
    const interval = setInterval(() => {
      fetchVms(false);
    }, 20000); // Poll every 20s
    
    return () => clearInterval(interval);
  }, [fetchVms]);

  // Manual Trigger for Backend VM Cache reload
  const handleSyncCache = async () => {
    setIsSyncing(true);
    try {
      await api.post('/vms/refresh');
      addToast('Syncing with Azure...', 'info');
      await fetchVms(false);
    } catch (err) {
      console.error(err);
      addToast('Failed to trigger Azure sync.', 'error');
    } finally {
      setTimeout(() => setIsSyncing(false), 800);
    }
  };

  // Run VM power actions
  const handleVmAction = async (vm, action) => {
    const originalState = vm.power_state;
    const actionMap = {
      start: 'Starting',
      stop: 'Stopping',
      restart: 'Restarting'
    };

    // 1. Immediately update transitional state in the UI (Correction #5 touch)
    setVms(prevVms =>
      prevVms.map(item =>
        item.name === vm.name && item.resource_group === vm.resource_group
          ? { ...item, power_state: actionMap[action] }
          : item
      )
    );

    addToast(`Command '${action}' sent for ${vm.name}.`, 'info');

    // 2. Perform API call
    try {
      const res = await api.post(`/vms/${vm.resource_group}/${vm.name}/${action}`);
      addToast(`VM '${vm.name}' successfully ${action === 'stop' ? 'stopped (deallocated)' : action + 'ed'}.`, 'success');
      
      // Update UI with final status returned
      setVms(prevVms =>
        prevVms.map(item =>
          item.name === vm.name && item.resource_group === vm.resource_group
            ? { ...item, power_state: res.data.power_state }
            : item
        )
      );
    } catch (err) {
      console.error(err);
      addToast(err.response?.data?.detail || `Failed to execute ${action} on ${vm.name}.`, 'error');
      
      // Revert status to original on error
      setVms(prevVms =>
        prevVms.map(item =>
          item.name === vm.name && item.resource_group === vm.resource_group
            ? { ...item, power_state: originalState }
            : item
        )
      );
    }
  };

  // Open confirmation modal for Stop / Restart
  const openConfirmModal = (vm, action) => {
    setConfirmModal({
      isOpen: true,
      action,
      vm
    });
  };

  const closeConfirmModal = () => {
    setConfirmModal({
      isOpen: false,
      action: '',
      vm: null
    });
  };

  const confirmAction = () => {
    const { vm, action } = confirmModal;
    if (vm && action) {
      handleVmAction(vm, action);
    }
    closeConfirmModal();
  };

  // Filter VM List based on search and RG selection
  const filteredVms = vms.filter(vm => {
    const matchesSearch = vm.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRg = rgFilter === '' || vm.resource_group.toLowerCase() === rgFilter.toLowerCase();
    return matchesSearch && matchesRg;
  });

  const getStatusStyle = (state) => {
    const s = state.toLowerCase();
    if (s.includes('running')) {
      return {
        pill: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-glow-green',
        dot: 'bg-emerald-500 animate-pulse'
      };
    }
    if (s.includes('deallocated')) {
      return {
        pill: 'bg-red-500/10 text-red-400 border-red-500/20',
        dot: 'bg-red-500'
      };
    }
    if (s.includes('starting') || s.includes('stopping') || s.includes('restarting')) {
      return {
        pill: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        dot: 'bg-amber-500 animate-spin-slow'
      };
    }
    return {
      pill: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
      dot: 'bg-slate-500'
    };
  };

  return (
    <div className="space-y-8">
      {/* Top Banner/Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <GlassCard className="flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-teal-500/10 text-teal-400">
            <Cpu className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Virtual Machines</p>
            <h3 className="text-2xl font-bold text-white">{vms.length}</h3>
          </div>
        </GlassCard>
        
        <GlassCard className="flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
            <Play className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Running VMs</p>
            <h3 className="text-2xl font-bold text-white">
              {vms.filter(vm => vm.power_state.toLowerCase().includes('running')).length}
            </h3>
          </div>
        </GlassCard>

        <GlassCard className="flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-red-500/10 text-red-400">
            <Square className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Stopped VMs</p>
            <h3 className="text-2xl font-bold text-white">
              {vms.filter(vm => vm.power_state.toLowerCase().includes('deallocated')).length}
            </h3>
          </div>
        </GlassCard>
      </div>

      {/* Filter and Controls Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/20 border border-white/5 p-4 rounded-2xl backdrop-blur-md">
        <div className="flex flex-1 flex-col sm:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute inset-y-0 left-3 h-4 w-4 my-auto text-slate-500" />
            <input
              type="text"
              placeholder="Search by VM name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm rounded-xl text-slate-200 glass-input"
            />
          </div>

          {/* RG Filter Select */}
          <div className="relative">
            <Layers className="absolute inset-y-0 left-3 h-4 w-4 my-auto text-slate-500" />
            <select
              value={rgFilter}
              onChange={(e) => setRgFilter(e.target.value)}
              className="pl-10 pr-8 py-2 text-sm rounded-xl text-slate-300 glass-input appearance-none bg-slate-950 font-medium"
            >
              <option value="">All Resource Groups</option>
              {rgs.map(rg => (
                <option key={rg} value={rg}>{rg}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Cache sync status controls */}
        <button
          onClick={handleSyncCache}
          disabled={isSyncing}
          className="flex items-center justify-center space-x-2 px-4 py-2 rounded-xl bg-slate-800/40 hover:bg-slate-800 text-slate-300 border border-white/5 transition-all duration-150 active:scale-95 text-sm font-semibold"
        >
          <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>Sync Azure Portal</span>
        </button>
      </div>

      {/* Main VM List Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-500 border-t-transparent"></div>
          <span className="text-sm text-slate-400">Querying Azure subscriptions...</span>
        </div>
      ) : filteredVms.length === 0 ? (
        <GlassCard className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-12 w-12 rounded-full bg-slate-800/40 border border-white/5 flex items-center justify-center text-slate-500 mb-4">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-white">No Virtual Machines Found</h3>
          <p className="text-sm text-slate-400 max-w-sm mt-1">
            Either you haven't configured Azure credentials in Settings, or your user account doesn't have VM/RG access permissions assigned yet.
          </p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredVms.map((vm) => {
            const isRunning = vm.power_state.toLowerCase().includes('running');
            const isStopped = vm.power_state.toLowerCase().includes('deallocated');
            const isTransitional = vm.power_state.toLowerCase().includes('starting') ||
                                   vm.power_state.toLowerCase().includes('stopping') ||
                                   vm.power_state.toLowerCase().includes('restarting');
            
            // Check allowed actions mapped from backend grants
            const canStart = vm.allowed_actions.includes('start');
            const canStop = vm.allowed_actions.includes('stop');
            const canRestart = vm.allowed_actions.includes('restart');

            const status = getStatusStyle(vm.power_state);

            return (
              <GlassCard key={`${vm.resource_group}/${vm.name}`} className="flex flex-col justify-between border border-white/5 hover:border-white/10 shadow-lg" hover>
                {/* Header */}
                <div className="mb-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <h4 className="text-lg font-bold text-white truncate font-sans">{vm.name}</h4>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{vm.resource_group}</p>
                    </div>
                    {/* Status Pill */}
                    <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${status.pill}`}>
                      <div className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                      <span>{vm.power_state}</span>
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-2 text-xs border-t border-white/5 py-4 text-slate-400">
                  <div className="flex justify-between">
                    <span>Region:</span>
                    <span className="font-semibold text-slate-300">{vm.location}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>VM Size:</span>
                    <span className="font-semibold text-slate-300">{vm.size}</span>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-4">
                  {/* Start Button */}
                  <button
                    onClick={() => handleVmAction(vm, 'start')}
                    disabled={isTransitional || isRunning || !canStart}
                    className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/15 disabled:opacity-30 disabled:pointer-events-none transition-all duration-150"
                    title="Start Virtual Machine"
                  >
                    <Play className="h-4 w-4 mb-1" />
                    <span className="text-[10px] font-semibold">Start</span>
                  </button>

                  {/* Stop Button */}
                  <button
                    onClick={() => openConfirmModal(vm, 'stop')}
                    disabled={isTransitional || isStopped || !canStop}
                    className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/15 disabled:opacity-30 disabled:pointer-events-none transition-all duration-150"
                    title="Stop (Deallocate) Virtual Machine to cease billing"
                  >
                    <Square className="h-4 w-4 mb-1" />
                    <span className="text-[10px] font-semibold">Stop</span>
                  </button>

                  {/* Restart Button (Correction #6: Hidden/Disabled if VM is not running) */}
                  <button
                    onClick={() => openConfirmModal(vm, 'restart')}
                    disabled={isTransitional || !isRunning || !canRestart}
                    className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/15 disabled:opacity-30 disabled:pointer-events-none transition-all duration-150"
                    title="Restart Virtual Machine"
                  >
                    <RotateCw className="h-4 w-4 mb-1" />
                    <span className="text-[10px] font-semibold">Restart</span>
                  </button>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={closeConfirmModal}
        onConfirm={confirmAction}
        title={confirmModal.action === 'stop' ? 'Stop (Deallocate) VM' : 'Restart VM'}
        message={
          confirmModal.action === 'stop'
            ? `Are you sure you want to stop (deallocate) VM '${confirmModal.vm?.name}'? This releases compute resource allocations and stops billing.`
            : `Are you sure you want to restart VM '${confirmModal.vm?.name}'? Active processes will be terminated.`
        }
        confirmText={confirmModal.action === 'stop' ? 'Stop (Deallocate)' : 'Restart'}
        type={confirmModal.action === 'stop' ? 'danger' : 'warning'}
      />
    </div>
  );
};

export default Dashboard;
