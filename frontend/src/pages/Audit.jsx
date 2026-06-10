import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, Search, Filter, ShieldCheck, ShieldAlert, Calendar } from 'lucide-react';
import { useToast } from '../components/Toast';
import GlassCard from '../components/GlassCard';
import api from '../utils/api';

const Audit = () => {
  const { addToast } = useToast();
  
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filter states
  const [filterUser, setFilterUser] = useState('');
  const [filterVm, setFilterVm] = useState('');
  const [filterAction, setFilterAction] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterUser) params.username = filterUser;
      if (filterVm) params.vm_name = filterVm;
      if (filterAction) params.action = filterAction;
      
      const response = await api.get('/audit', { params });
      setLogs(response.data);
    } catch (err) {
      console.error(err);
      addToast('Failed to fetch audit log entries.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch logs on filter changes
    const timer = setTimeout(() => {
      fetchLogs();
    }, 300); // Debounce typing filters
    
    return () => clearTimeout(timer);
  }, [filterUser, filterVm, filterAction]);

  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch (e) {
      return dateStr;
    }
  };

  const getResultStyle = (res) => {
    if (res.toLowerCase() === 'success' || res.toLowerCase().startsWith('success:')) {
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    }
    return 'bg-red-500/10 text-red-400 border-red-500/20';
  };

  return (
    <div className="space-y-8">
      {/* Filtering Header panel */}
      <div className="flex flex-col sm:flex-row gap-4 bg-[#11131e]/50 border border-[#1c1e2d] p-4 rounded-2xl">
        {/* User Filter */}
        <div className="relative flex-1">
          <Search className="absolute inset-y-0 left-3 h-4 w-4 my-auto text-slate-500" />
          <input
            type="text"
            placeholder="Filter by operator username..."
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl text-slate-200 glass-input"
          />
        </div>

        {/* VM Filter */}
        <div className="relative flex-1">
          <Search className="absolute inset-y-0 left-3 h-4 w-4 my-auto text-slate-500" />
          <input
            type="text"
            placeholder="Filter by VM name..."
            value={filterVm}
            onChange={(e) => setFilterVm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl text-slate-200 glass-input"
          />
        </div>

        {/* Action Filter */}
        <div className="relative w-full sm:w-48">
          <Filter className="absolute inset-y-0 left-3 h-4 w-4 my-auto text-slate-500" />
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="w-full pl-10 pr-8 py-2 text-sm rounded-xl text-slate-300 glass-input appearance-none bg-[#07080c] font-medium"
          >
            <option value="">All Actions</option>
            <option value="start">start</option>
            <option value="stop">stop</option>
            <option value="restart">restart</option>
            <option value="start (schedule)">start (schedule)</option>
            <option value="stop (schedule)">stop (schedule)</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-500 border-t-transparent"></div>
          <span className="text-sm text-slate-400">Loading audit history...</span>
        </div>
      ) : logs.length === 0 ? (
        <GlassCard className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-12 w-12 rounded-full bg-[#07080c]/50 border border-[#1c1e2d] flex items-center justify-center text-slate-500 mb-4">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-white">No Logs Found</h3>
          <p className="text-sm text-slate-400 max-w-sm mt-1">
            Either no actions have been taken yet, or your filters didn't return any matches.
          </p>
        </GlassCard>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#1c1e2d] glass-panel">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1c1e2d] bg-[#07080c]/50 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-4 px-6">Timestamp</th>
                <th className="py-4 px-6">Operator</th>
                <th className="py-4 px-6">Target VM/RG</th>
                <th className="py-4 px-6">Action</th>
                <th className="py-4 px-6">Execution Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1c1e2d] text-sm text-slate-300">
              {logs.map(log => {
                const isScheduler = log.username.toLowerCase() === 'scheduler';
                const isSuccess = log.result.toLowerCase() === 'success' || log.result.toLowerCase().startsWith('success:');

                return (
                  <tr key={log.id} className="hover:bg-[#161824]/50 transition-colors duration-150">
                    <td className="py-4 px-6 text-slate-400 text-xs">
                      {formatDate(log.timestamp)}
                    </td>
                    <td className="py-4 px-6 font-medium">
                      <span className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        isScheduler ? 'bg-[#14B8A6]/10 text-[#14B8A6]' : 'bg-slate-700/10 text-slate-300'
                      }`}>
                        {log.username}
                      </span>
                    </td>
                    <td className="py-4 px-6 font-semibold text-slate-200">
                      {log.vm_name}
                    </td>
                    <td className="py-4 px-6 capitalize">
                      {log.action}
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getResultStyle(log.result)}`}>
                        {isSuccess ? (
                          <>
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            <span>success</span>
                          </>
                        ) : (
                          <>
                            <ShieldAlert className="h-3 w-3 mr-1 animate-pulse" />
                            <span className="truncate max-w-[200px]" title={log.result}>
                              {log.result}
                            </span>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Audit;
