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
        alert('¡Registro exitoso! Por favor, revisa tu correo electrónico.');
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
      <div className="absolute -inset-1 bg-gradient-to-r from-unsaac-red to-unsaac-gold rounded-[2.5rem] blur opacity-20 group-hover:opacity-40 transition-opacity"></div>
      
      <div className="relative flex flex-col items-center justify-center bg-white dark:bg-bg-dark-panel text-gray-900 dark:text-white font-sans border border-unsaac-red/20 dark:border-brand-navy/30 p-12 rounded-[2.5rem] shadow-2xl max-w-md w-full mx-auto transition-all">
        <div className="w-16 h-16 bg-unsaac-red rounded-2xl flex items-center justify-center text-white mb-8 shadow-xl shadow-unsaac-red/20">
          <ShieldCheck size={32} />
        </div>

        <h2 className="text-3xl font-display font-black mb-2 uppercase tracking-tighter text-center">
          Unsaac<span className="text-unsaac-red">FEM</span>
        </h2>
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.4em] mb-10 text-center">
          Portal de Acceso Estructural Seguro
        </p>

        <form onSubmit={handleAuth} className="w-full flex flex-col gap-6">
          <div className="space-y-2">
            <label className="block text-[9px] text-gray-400 font-black uppercase tracking-widest pl-1">Correo Electrónico</label>
            <input
              type="email"
              placeholder="usuario@unsaac.edu.pe"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-50 dark:bg-black/40 border border-border-light dark:border-border-dark p-4 rounded-2xl focus:border-unsaac-gold focus:ring-1 focus:ring-unsaac-gold outline-none text-sm font-mono transition-all"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[9px] text-gray-400 font-black uppercase tracking-widest pl-1">Contraseña</label>
            <input
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-50 dark:bg-black/40 border border-border-light dark:border-border-dark p-4 rounded-2xl focus:border-unsaac-gold focus:ring-1 focus:ring-unsaac-gold outline-none text-sm font-mono transition-all"
              required
            />
          </div>
          <button
            disabled={loading}
            className="group flex items-center justify-center gap-3 bg-unsaac-red hover:bg-unsaac-red/90 disabled:opacity-50 text-white p-4 rounded-2xl shadow-xl shadow-unsaac-red/20 transition-all active:scale-95 cursor-pointer font-black text-xs uppercase tracking-widest mt-4"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Zap size={16} className="group-hover:fill-white" />}
            {isRegister ? 'Crear Cuenta' : 'Iniciar Sesión'}
          </button>
        </form>

        <button
          onClick={() => setIsRegister(!isRegister)}
          className="mt-10 text-[9px] text-gray-400 hover:text-unsaac-red font-black uppercase tracking-widest transition-colors cursor-pointer border-b border-transparent hover:border-unsaac-red/30 pb-1"
        >
          {isRegister ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
        </button>
      </div>
    </div>
  );
};

export default Auth;
