import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  CalendarClock, 
  Users, 
  FileSpreadsheet, 
  Settings, 
  LogOut, 
  User as UserIcon 
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, show: true },
    { name: 'Schedules', path: '/schedules', icon: CalendarClock, show: true },
    { name: 'Users', path: '/users', icon: Users, show: isAdmin },
    { name: 'Audit Logs', path: '/audit', icon: FileSpreadsheet, show: isAdmin },
    { name: 'Settings', path: '/settings', icon: Settings, show: isAdmin },
  ];

  return (
    <aside className="w-60 bg-[#09090b] border-r border-zinc-800 h-screen sticky top-0 flex flex-col justify-between">
      {/* Top Section */}
      <div className="flex flex-col flex-1 py-6">
        {/* Logo and Brand */}
        <div className="px-6 mb-8 flex flex-col">
          <span className="text-sm font-extrabold font-sans text-white tracking-[0.25em] uppercase">
            Gyan
          </span>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-4 space-y-1.5">
          {navItems.map((item) => {
            if (!item.show) return null;
            return (
              <NavLink
                key={item.name}
                to={item.path}
                className={({ isActive }) => `
                  flex items-center px-4 py-2.5 text-xs font-semibold rounded-lg transition-all duration-150 group
                  ${isActive 
                    ? 'bg-zinc-800 text-zinc-100' 
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}
                `}
              >
                <item.icon className="mr-3 h-4 w-4 flex-shrink-0 transition-colors" />
                {item.name}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Bottom User Profile Section */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-950/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-zinc-800 border border-zinc-700/50 flex items-center justify-center text-zinc-300">
              <UserIcon className="h-4 w-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-zinc-200 truncate font-sans">
                {user?.username}
              </span>
              <span className="text-[10px] text-zinc-500 capitalize">
                {user?.role}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-red-400 bg-zinc-900 hover:bg-red-500/10 border border-zinc-800 hover:border-red-500/20 rounded-lg transition-all duration-150"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log Out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
