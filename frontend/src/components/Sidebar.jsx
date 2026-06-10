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
import logo from '../assets/logo.png';

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
    <aside className="w-64 glass-panel border-r border-white/5 h-screen sticky top-0 flex flex-col justify-between">
      {/* Top Section */}
      <div className="flex flex-col flex-1 py-6">
        {/* Logo and Brand */}
        <div className="px-6 mb-8 flex flex-col">
          <div className="flex items-center space-x-3">
            <img src={logo} alt="Gyan Logo" className="h-10 w-auto object-contain" />
          </div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-[#14B8A6] mt-2 font-medium ml-1">
            AI You Can Trust
          </span>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => {
            if (!item.show) return null;
            return (
              <NavLink
                key={item.name}
                to={item.path}
                className={({ isActive }) => `
                  flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-150 group
                  ${isActive 
                    ? 'bg-gradient-to-r from-teal-500/10 to-emerald-500/5 text-[#14B8A6] border-l-2 border-[#14B8A6]' 
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'}
                `}
              >
                <item.icon className="mr-3 h-5 w-5 flex-shrink-0 transition-colors" />
                {item.name}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Bottom User Profile Section */}
      <div className="p-4 border-t border-white/5 bg-slate-950/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <UserIcon className="h-5 w-5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-slate-200 truncate font-sans">
                {user?.username}
              </span>
              <span className="text-[10px] text-slate-500 capitalize">
                {user?.role}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center px-4 py-2.5 text-xs font-semibold text-red-400/80 hover:text-red-400 bg-red-950/10 hover:bg-red-950/20 border border-red-950/30 rounded-xl transition-all duration-150"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log Out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
