import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { RefreshCw, Check, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import api from '../utils/api';

const Navbar = ({ onCacheRefresh }) => {
  const { user } = useAuth();
  const location = useLocation();
  const { addToast } = useToast();
  const [refreshing, setRefreshing] = useState(false);

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/':
        return 'VM Dashboard';
      case '/schedules':
        return 'Schedules Manager';
      case '/users':
        return 'User Accounts & Access';
      case '/audit':
        return 'Audit Logs';
      case '/settings':
        return 'Azure Connection Settings';
      default:
        return 'Gyan Azure VM Manager';
    }
  };

  const handleForceRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await api.post('/vms/refresh');
      addToast('VM cache refresh started.', 'info');
      // Trigger callback if provided
      if (onCacheRefresh) {
        await onCacheRefresh();
      }
    } catch (err) {
      console.error(err);
      addToast('Failed to refresh VM cache.', 'error');
    } finally {
      // Let animation spin for at least 1s for visual feedback
      setTimeout(() => {
        setRefreshing(false);
      }, 1000);
    }
  };

  // Show refresh button only on Dashboard page
  const showRefresh = location.pathname === '/';

  return (
    <header className="h-20 bg-[#0a0b10]/80 border-b border-[#1c1e2d] px-8 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md">
      {/* Title */}
      <div>
        <h1 className="text-lg font-semibold tracking-wide text-slate-100 uppercase">
          {getPageTitle()}
        </h1>
      </div>

      {/* Actions */}
      <div className="flex items-center space-x-6">
        {showRefresh && (
          <button
            onClick={handleForceRefresh}
            disabled={refreshing}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 text-[#14B8A6] text-xs font-semibold transition-all duration-150 active:scale-95"
            title="Force refresh backend VM cache"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Sync Azure'}</span>
          </button>
        )}

        {/* Status Pill */}
        <div className="flex items-center space-x-2 bg-[#07080c]/50 border border-[#1c1e2d] px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Azure Portal Connected</span>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
