import React, { useState } from 'react';
import { ShieldCheck, Loader2, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';

const Auth: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isRegister) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert('Registration successful! Please check your email.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error: any) {
      alert(error.error_description || error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative group">
      {/* Decorative Elements */}
      <div className="absolute -inset-1 bg-gradient-to-r from-brand-blue to-brand-magenta rounded-[2.5rem] blur opacity-20 group-hover:opacity-40 transition-opacity"></div>
      
      <div className="relative flex flex-col items-center justify-center bg-white dark:bg-bg-dark-panel text-gray-900 dark:text-white font-sans border border-border-light dark:border-border-dark p-12 rounded-[2.5rem] shadow-2xl max-w-md w-full mx-auto transition-all">
        <div className="w-16 h-16 bg-brand-blue rounded-2xl flex items-center justify-center text-white mb-8 shadow-xl shadow-brand-blue/20">
          <ShieldCheck size={32} />
        </div>

        <h2 className="text-3xl font-black mb-2 uppercase tracking-tighter text-center">
          Terminal<span className="text-brand-blue">Access</span>
        </h2>
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.4em] mb-10 text-center">
          Secure Structural Engine Gateway
        </p>

        <form onSubmit={handleAuth} className="w-full flex flex-col gap-6">
          <div className="space-y-2">
            <label className="block text-[9px] text-gray-400 font-black uppercase tracking-widest pl-1">Identification Hash</label>
            <input
              type="email"
              placeholder="operator@fem-saas.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-50 dark:bg-black/40 border border-border-light dark:border-border-dark p-4 rounded-2xl focus:border-brand-blue focus:ring-1 focus:ring-brand-blue outline-none text-sm font-mono transition-all"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[9px] text-gray-400 font-black uppercase tracking-widest pl-1">Security Keyphrase</label>
            <input
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-50 dark:bg-black/40 border border-border-light dark:border-border-dark p-4 rounded-2xl focus:border-brand-blue focus:ring-1 focus:ring-brand-blue outline-none text-sm font-mono transition-all"
              required
            />
          </div>
          <button
            disabled={loading}
            className="group flex items-center justify-center gap-3 bg-brand-blue hover:bg-brand-blue/90 disabled:opacity-50 text-white p-4 rounded-2xl shadow-xl shadow-brand-blue/20 transition-all active:scale-95 cursor-pointer font-black text-xs uppercase tracking-widest mt-4"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Zap size={16} className="group-hover:fill-white" />}
            {isRegister ? 'Initialize Account' : 'Establish Connection'}
          </button>
        </form>

        <button
          onClick={() => setIsRegister(!isRegister)}
          className="mt-10 text-[9px] text-gray-400 hover:text-brand-blue font-black uppercase tracking-widest transition-colors cursor-pointer border-b border-transparent hover:border-brand-blue/30 pb-1"
        >
          {isRegister ? 'Existing Operator Login' : 'Register New Station'}
        </button>
      </div>
    </div>
  );
};

export default Auth;
