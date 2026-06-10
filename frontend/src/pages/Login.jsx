import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Lock, User as UserIcon, Loader2 } from 'lucide-react';
import logo from '../assets/logo.png';
import GlassCard from '../components/GlassCard';

const Login = () => {
  const { login } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      addToast('Please enter both username and password.', 'warning');
      return;
    }

    setLoading(true);
    try {
      await login(username, password);
      addToast('Welcome to Gyan VM Manager!', 'success');
      navigate('/');
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.detail || 'Invalid username or password.';
      addToast(errMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 relative">
      <div className="w-full max-w-md">
        <GlassCard className="border border-slate-700/50 shadow-xl p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <img src={logo} alt="Gyan Logo" className="h-14 w-auto mb-3 object-contain" />
            <h2 className="text-2xl font-bold font-sans text-white tracking-wide">
              Gyan Azure VM Manager
            </h2>
            <p className="text-xs uppercase tracking-[0.25em] text-[#14B8A6] mt-2 font-medium">
              AI You Can Trust
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Username Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Username
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <UserIcon className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="w-full pl-10 pr-4 py-3 text-sm rounded-xl text-slate-200 glass-input"
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Lock className="h-4 w-4" />
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full pl-10 pr-4 py-3 text-sm rounded-xl text-slate-200 glass-input"
                  required
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center py-3 px-4 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-semibold text-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-teal-500/20"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Authenticating...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </GlassCard>
      </div>
    </div>
  );
};

export default Login;
