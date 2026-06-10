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
        pill: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/15',
        dot: 'bg-emerald-500 animate-pulse'
      };
    }
    if (s.includes('deallocated')) {
      return {
        pill: 'bg-zinc-800 text-zinc-400 border-zinc-700/50',
        dot: 'bg-zinc-500'
      };
    }
    if (s.includes('starting') || s.includes('stopping') || s.includes('restarting')) {
      return {
        pill: 'bg-amber-500/10 text-amber-400 border-amber-500/15',
        dot: 'bg-amber-500 animate-pulse'
      };
    }
    return {
      pill: 'bg-zinc-800 text-zinc-400 border-zinc-700/50',
      dot: 'bg-zinc-500'
    };
  };

  return (
    <div className="space-y-8">
      {/* Top Banner/Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="p-6 rounded-xl border border-zinc-800 bg-[#18181b]/40">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total Resources</span>
            <Cpu className="h-4 w-4 text-zinc-500" />
          </div>
          <div className="text-3xl font-bold tracking-tight text-white">{vms.length}</div>
          <div className="text-[10px] text-zinc-500 mt-1">Virtual machines active in Azure</div>
        </div>
        
        <div className="p-6 rounded-xl border border-zinc-800 bg-[#18181b]/40">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Running</span>
            <Play className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-3xl font-bold tracking-tight text-emerald-400">
            {vms.filter(vm => vm.power_state.toLowerCase().includes('running')).length}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">Currently powered on</div>
        </div>

        <div className="p-6 rounded-xl border border-zinc-800 bg-[#18181b]/40">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Deallocated</span>
            <Square className="h-4 w-4 text-zinc-500" />
          </div>
          <div className="text-3xl font-bold tracking-tight text-zinc-100">
            {vms.filter(vm => vm.power_state.toLowerCase().includes('deallocated')).length}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">Stopped / billing suspended</div>
        </div>
      </div>

      {/* Filter and Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl border border-zinc-800 bg-[#18181b]/10">
        <div className="flex flex-1 flex-col sm:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute inset-y-0 left-3 h-4 w-4 my-auto text-zinc-500" />
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
            <Layers className="absolute inset-y-0 left-3 h-4 w-4 my-auto text-zinc-500" />
            <select
              value={rgFilter}
              onChange={(e) => setRgFilter(e.target.value)}
              className="pl-10 pr-8 py-2 text-sm rounded-xl text-slate-300 glass-input appearance-none bg-[#09090b] font-medium"
            >
              <option value="">All Resource Groups</option>
              {rgs.map(rg => (
                <option key={rg} value={rg}>{rg}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main VM List Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-500 border-t-transparent"></div>
          <span className="text-sm text-slate-400">Querying Azure subscriptions...</span>
        </div>
      ) : filteredVms.length === 0 ? (
        <GlassCard className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-12 w-12 rounded-full bg-[#09090b]/50 border border-zinc-800 flex items-center justify-center text-slate-500 mb-4">
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
              <GlassCard key={`${vm.resource_group}/${vm.name}`} className="flex flex-col justify-between border border-zinc-800 hover:border-zinc-700 bg-zinc-900/10 shadow-md p-5 rounded-xl" hover>
                {/* Header */}
                <div className="mb-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <h4 className="text-base font-bold text-zinc-100 truncate font-sans">{vm.name}</h4>
                      <p className="text-[11px] text-zinc-500 font-mono mt-0.5 truncate">{vm.resource_group}</p>
                    </div>
                    {/* Status Badge */}
                    <div className={`flex items-center space-x-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${status.pill}`}>
                      <div className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                      <span>{vm.power_state}</span>
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-2 text-xs border-t border-zinc-800/60 py-4 text-zinc-400">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Region</span>
                    <span className="font-mono text-zinc-300 bg-zinc-800/30 px-1.5 py-0.5 rounded border border-zinc-800/40 text-[10px]">{vm.location}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">VM Size</span>
                    <span className="font-mono text-zinc-300 bg-zinc-800/30 px-1.5 py-0.5 rounded border border-zinc-800/40 text-[10px]">{vm.size}</span>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="grid grid-cols-3 gap-2.5 pt-4 border-t border-zinc-800/60 mt-auto">
                  {/* Start Button */}
                  <button
                    onClick={() => handleVmAction(vm, 'start')}
                    disabled={isTransitional || isRunning || !canStart}
                    className="flex items-center justify-center space-x-1.5 py-2 px-1 rounded-lg border text-xs font-semibold bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 border-emerald-500/15 disabled:opacity-20 disabled:pointer-events-none transition-all duration-150"
                    title="Start Virtual Machine"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>Start</span>
                  </button>

                  {/* Stop Button */}
                  <button
                    onClick={() => openConfirmModal(vm, 'stop')}
                    disabled={isTransitional || isStopped || !canStop}
                    className="flex items-center justify-center space-x-1.5 py-2 px-1 rounded-lg border text-xs font-semibold bg-red-500/5 hover:bg-red-500/10 text-red-400 border-red-500/15 disabled:opacity-20 disabled:pointer-events-none transition-all duration-150"
                    title="Stop (Deallocate) Virtual Machine to cease billing"
                  >
                    <Square className="h-3.5 w-3.5" />
                    <span>Stop</span>
                  </button>

                  {/* Restart Button */}
                  <button
                    onClick={() => openConfirmModal(vm, 'restart')}
                    disabled={isTransitional || !isRunning || !canRestart}
                    className="flex items-center justify-center space-x-1.5 py-2 px-1 rounded-lg border text-xs font-semibold bg-amber-500/5 hover:bg-amber-500/10 text-amber-400 border-amber-500/15 disabled:opacity-20 disabled:pointer-events-none transition-all duration-150"
                    title="Restart Virtual Machine"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    <span>Restart</span>
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
