import React from 'react';
import { Sun, Moon, LogOut } from 'lucide-react';
import { useTheme } from './ThemeContext';
import { supabase } from '../lib/supabase';
import ProjectManager from './ProjectManager';

const Navbar: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <nav className="bg-bg-light/80 dark:bg-bg-dark/80 backdrop-blur-md border-b border-border-light dark:border-border-dark px-6 py-4 sticky top-0 z-50 transition-all duration-300">
      <div className="flex justify-between items-center mx-auto max-w-screen-2xl">
        <a href="/" className="flex items-center gap-3 group">
          <div className="bg-brand-blue p-2 rounded-xl text-white font-black text-xs shadow-lg shadow-brand-blue/20 transform group-hover:scale-110 transition-transform">FEM</div>
          <span className="self-center text-xl font-black tracking-tighter uppercase text-text-light dark:text-text-dark">
            SaaS<span className="text-brand-blue">Platform</span>
          </span>
        </a>

        <div className="hidden md:flex items-center gap-8 font-mono">
          <a href="/" className="text-xs font-bold text-text-light/50 hover:text-brand-blue dark:text-text-dark/50 dark:hover:text-brand-blue transition-colors uppercase tracking-[0.2em]">Editor</a>
          <a href="/analisis-estatico" className="text-xs font-bold text-text-light/50 hover:text-brand-blue dark:text-text-dark/50 dark:hover:text-brand-blue transition-colors uppercase tracking-[0.2em]">Estático</a>
          <a href="/analisis-modal" className="text-xs font-bold text-text-light/50 hover:text-brand-magenta dark:text-text-dark/50 dark:hover:text-brand-magenta transition-colors uppercase tracking-[0.2em]">Modal</a>
        </div>

        <div className="flex items-center gap-4">
          <ProjectManager />
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-bg-dark-panel text-gray-600 dark:text-gray-300 hover:border-brand-blue transition-all active:scale-95 shadow-sm"
            title={`Cambiar a modo ${theme === 'light' ? 'oscuro' : 'claro'}`}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          <button
            onClick={handleLogout}
            className="p-2.5 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-bg-dark-panel text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all active:scale-95 shadow-sm"
            title="Desconectar Terminal"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
