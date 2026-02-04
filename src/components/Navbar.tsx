import React, { useState, useEffect } from "react";
import { Sun, Moon, LogIn, LogOut } from "lucide-react";
import { useTheme } from "./ThemeContext";
import { supabase } from "../lib/supabase";
import ProjectManager from "./ProjectManager";
import Modal from "./ui/Modal";
import Auth from "./Auth";

const Navbar: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [session, setSession] = useState<any>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) setIsAuthModalOpen(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (

    <nav className="bg-bg-light/80 dark:bg-bg-dark/80 backdrop-blur-md border-b border-border-light dark:border-border-dark px-6 py-4 sticky top-0 z-50 transition-all duration-300">
      <div className="flex justify-between items-center mx-auto max-w-screen-2xl">
        <a href="/" className="flex items-center gap-3 group">
          <div className="flex items-center justify-center bg-unsaac-red p-2 rounded-xl text-white font-black text-xs shadow-lg shadow-unsaac-red/20 transform group-hover:scale-105 transition-transform duration-300">
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 fill-current"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12 2L4 5V10C4 15.55 7.41 20.74 12 22C16.59 20.74 20 15.55 20 10V5L12 2ZM12 4.14L18 6.39V10C18 14.41 15.44 18.57 12 19.84C8.56 18.57 6 14.41 6 10V6.39L12 4.14Z" />
              <text
                x="12"
                y="15"
                textAnchor="middle"
                fontSize="6"
                fontWeight="bold"
                className="fill-white font-mono"
              >
                EPIM
              </text>
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="self-center text-xl font-display font-bold tracking-tight text-text-light dark:text-text-dark leading-none">
              EPIM{" "}
              <span className="text-unsaac-red dark:text-unsaac-gold">
                UNSAAC
              </span>
            </span>
            <span className="text-[10px] font-display font-medium uppercase tracking-[0.2em] text-text-light/40 dark:text-text-dark/40">
              Ingeniería Mecánica
            </span>
          </div>
        </a>

        <div className="hidden md:flex items-center gap-8 font-display">
          <a
            href="/"
            className="text-xs font-bold text-text-light/60 hover:text-unsaac-red dark:text-text-dark/60 dark:hover:text-unsaac-gold transition-colors uppercase tracking-[0.2em] border-b-2 border-transparent hover:border-unsaac-red dark:hover:border-unsaac-gold pb-1"
          >
            Editor
          </a>
          <a
            href="/analisis-estatico"
            className="text-xs font-bold text-text-light/60 hover:text-unsaac-red dark:text-text-dark/60 dark:hover:text-unsaac-gold transition-colors uppercase tracking-[0.2em] border-b-2 border-transparent hover:border-unsaac-red dark:hover:border-unsaac-gold pb-1"
          >
            Análisis Estático
          </a>
          <a
            href="/analisis-modal"
            className="text-xs font-bold text-text-light/60 hover:text-unsaac-red dark:text-text-dark/60 dark:hover:text-unsaac-gold transition-colors uppercase tracking-[0.2em] border-b-2 border-transparent hover:border-unsaac-red dark:hover:border-unsaac-gold pb-1"
          >
            Análisis Modal
          </a>
        </div>

        <div className="flex items-center gap-4">
          <ProjectManager />
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-bg-dark-panel text-gray-600 dark:text-gray-300 hover:border-unsaac-red dark:hover:border-unsaac-gold transition-all active:scale-95 shadow-sm"
            title={`Cambiar a modo ${theme === "light" ? "oscuro" : "claro"}`}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          {session ? (
            <button
              onClick={handleLogout}
              className="p-2.5 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-bg-dark-panel text-unsaac-red hover:bg-unsaac-red/5 dark:hover:bg-unsaac-red/10 transition-all active:scale-95 shadow-sm"
              title="Cerrar Sesión"
            >
              <LogOut size={18} />
            </button>
          ) : (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="p-2.5 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-bg-dark-panel text-unsaac-gold hover:bg-unsaac-gold/5 dark:hover:bg-unsaac-gold/10 transition-all active:scale-95 shadow-sm"
              title="Iniciar Sesión"
            >
              <LogIn size={18} />
            </button>
          )}

          <Modal 
            isOpen={isAuthModalOpen} 
            onClose={() => setIsAuthModalOpen(false)}
            title="Acceso de Usuario"
          >
            <Auth />
          </Modal>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
