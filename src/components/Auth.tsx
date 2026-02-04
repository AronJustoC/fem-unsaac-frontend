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
    <div className="flex flex-col items-center justify-center w-full max-w-sm mx-auto">
      <div className="w-12 h-12 bg-unsaac-red rounded-xl flex items-center justify-center text-white mb-6 shadow-lg shadow-unsaac-red/20">
        <ShieldCheck size={24} />
      </div>

      <h2 className="text-2xl font-display font-black mb-1 uppercase tracking-tighter text-center text-gray-900 dark:text-white">
        Unsaac<span className="text-unsaac-red">FEM</span>
      </h2>
      <p className="text-[8px] text-gray-400 font-bold uppercase tracking-[0.3em] mb-8 text-center">
        Acceso Estructural
      </p>

      <form onSubmit={handleAuth} className="w-full flex flex-col gap-4">
        <div className="space-y-1">
          <label className="block text-[8px] text-gray-400 font-black uppercase tracking-widest pl-1">Correo</label>
          <input
            type="email"
            placeholder="usuario@unsaac.edu.pe"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-gray-50 dark:bg-black/20 border border-border-light dark:border-border-dark p-3 rounded-xl focus:border-unsaac-gold outline-none text-xs font-mono transition-all"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="block text-[8px] text-gray-400 font-black uppercase tracking-widest pl-1">Contraseña</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-gray-50 dark:bg-black/20 border border-border-light dark:border-border-dark p-3 rounded-xl focus:border-unsaac-gold outline-none text-xs font-mono transition-all"
            required
          />
        </div>
        <button
          disabled={loading}
          className="group flex items-center justify-center gap-2 bg-unsaac-red hover:bg-unsaac-red/90 disabled:opacity-50 text-white p-3 rounded-xl shadow-lg shadow-unsaac-red/10 transition-all active:scale-95 cursor-pointer font-black text-[10px] uppercase tracking-widest mt-2"
        >
          {loading ? <Loader2 className="animate-spin" size={14} /> : <Zap size={14} className="group-hover:fill-white" />}
          {isRegister ? 'Crear Cuenta' : 'Iniciar Sesión'}
        </button>
      </form>

      <button
        onClick={() => setIsRegister(!isRegister)}
        className="mt-6 text-[8px] text-gray-400 hover:text-unsaac-red font-black uppercase tracking-widest transition-colors cursor-pointer"
      >
        {isRegister ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
      </button>
    </div>
  );
};

export default Auth;
