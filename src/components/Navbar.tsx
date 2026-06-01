import React, { useState, useEffect } from "react";
import { Sun, Moon, LogIn, Menu, X, Layout, Activity, BarChart3, ShieldCheck, ChevronRight, User, Waves, Radio } from "lucide-react";
import { useTheme } from "./ThemeContext";
import { supabase } from "../lib/supabase";
import ProjectManager from "./ProjectManager";
import Modal from "./ui/Modal";
import Auth from "./Auth";

const Navbar: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [session, setSession] = useState<any>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
    setIsMenuOpen(false);
  };

  const navLinks = [
    { name: "Editor", shortName: "Editor", href: "/", icon: Layout },
    { name: "Análisis Estático", shortName: "Estático", href: "/analisis-estatico", icon: BarChart3 },
    { name: "Análisis Modal", shortName: "Modal", href: "/analisis-modal", icon: Activity },
    { name: "Respuesta Armónica", shortName: "Armónica", href: "/analisis-armonico", icon: Waves },
    { name: "Procesamiento de Señales", shortName: "Señales", href: "/procesamiento-senales", icon: Radio },
  ];

  return (
    <>
      <nav className="bg-white/70 dark:bg-[#0B0F1A]/70 backdrop-blur-xl border-b border-gray-200 dark:border-white/5 px-4 lg:px-6 py-3 lg:py-4 sticky top-0 z-50 transition-all duration-500">
        <div className="flex justify-between items-center mx-auto max-w-screen-2xl gap-4 lg:gap-8">
          {/* Logo */}
          <a href="/" className="flex items-center gap-3 lg:gap-4 group shrink-0">
            <div className="relative">
              <div className="absolute -inset-2 bg-gradient-to-tr from-unsaac-red/20 to-unsaac-gold/20 rounded-full blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <img
                src="/logoEpim.png"
                alt="EPIM Logo"
                className="w-8 h-8 lg:w-10 lg:h-10 object-contain relative z-10"
              />
            </div>
            <div className="flex flex-col border-l border-gray-200 dark:border-white/10 pl-3 lg:pl-4">
              <span className="text-sm lg:text-lg font-display font-black tracking-tight leading-none text-gray-900 dark:text-white">
                EPIM <span className="text-unsaac-red">UNSAAC</span>
              </span>
              <span className="text-[8px] lg:text-[9px] font-display font-bold uppercase tracking-[0.2em] lg:tracking-[0.25em] text-gray-500 dark:text-unsaac-gold/80 mt-0.5 lg:mt-1">
                Ingeniería Mecánica
              </span>
            </div>
          </a>

          {/* Desktop Navigation Links */}
          <div className="hidden lg:flex items-center gap-2">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-all group border border-transparent hover:border-gray-200 dark:hover:border-white/10"
              >
                <link.icon size={16} strokeWidth={2} className="text-gray-400 group-hover:text-accent-primary transition-colors" />
                <span className="tracking-tight">{link.name}</span>
              </a>
            ))}
          </div>

          {/* Desktop Right Actions */}
          <div className="hidden lg:flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:text-unsaac-red dark:hover:text-unsaac-gold transition-all active:scale-90"
              title={`Modo ${theme === "light" ? "oscuro" : "claro"}`}
            >
              {theme === "light" ? <Moon size={18} strokeWidth={1.5} /> : <Sun size={18} strokeWidth={1.5} />}
            </button>
            
            {session ? (
              <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                <div className="w-8 h-8 rounded-full bg-accent-primary/10 flex items-center justify-center text-accent-primary">
                  <User size={16} />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-900 dark:text-white truncate max-w-[120px]">
                    {session.user.email}
                  </span>
                  <button 
                    onClick={handleLogout}
                    className="text-[9px] font-black uppercase tracking-wider text-accent-primary hover:underline text-left"
                  >
                    Salir
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-primary hover:bg-accent-primary/90 text-white text-xs font-black uppercase tracking-wider transition-all active:scale-95"
              >
                <LogIn size={16} />
                Ingresar
              </button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMenuOpen(true)}
            className="lg:hidden p-2.5 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 text-gray-900 dark:text-white transition-all active:scale-90 group relative"
            aria-label="Abrir menú"
          >
            <Menu size={22} strokeWidth={2} />
          </button>
        </div>
      </nav>

      <div 
        className={`fixed inset-0 z-[60] bg-black/40 dark:bg-[#05070a]/80 backdrop-blur-sm transition-all duration-700 ease-in-out ${
          isMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsMenuOpen(false)}
      />

      <aside 
        className={`fixed top-0 right-0 bottom-0 z-[70] w-full max-w-[400px] bg-white dark:bg-[#0B0F1A] border-l border-gray-200 dark:border-white/5 shadow-2xl transition-transform duration-700 ease-in-out flex flex-col lg:hidden ${
          isMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-white/5">
          <div className="flex flex-col">
            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-unsaac-red">Navegación</h2>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium mt-1">Plataforma de Análisis FEM</p>
          </div>
          <button 
            onClick={() => setIsMenuOpen(false)}
            className="p-2.5 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 text-gray-500 transition-all active:scale-90"
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
          <section>
            <div className="space-y-2">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center justify-between p-4 rounded-2xl text-sm font-bold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5 transition-all group border border-transparent hover:border-gray-200 dark:hover:border-white/10"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-400 group-hover:text-accent-primary transition-colors">
                      <link.icon size={18} strokeWidth={1.5} />
                    </div>
                    <span className="tracking-tight">{link.name}</span>
                  </div>
                  <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                </a>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-4 px-4">
              <div className="h-[1px] flex-1 bg-gray-100 dark:bg-white/5" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Proyectos</span>
              <div className="h-[1px] flex-1 bg-gray-100 dark:bg-white/5" />
            </div>
            <div className="px-2">
              <ProjectManager />
            </div>
          </section>
        </div>

        <div className="p-6 bg-gray-50/50 dark:bg-white/[0.02] border-t border-gray-100 dark:border-white/5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              {session ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent-primary/10 flex items-center justify-center text-accent-primary">
                    <User size={20} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-900 dark:text-white truncate max-w-[150px]">
                      {session.user.email}
                    </span>
                    <button 
                      onClick={handleLogout}
                      className="text-[10px] font-black uppercase tracking-widest text-accent-primary hover:underline text-left mt-0.5"
                    >
                      Cerrar Sesión
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setIsAuthModalOpen(true);
                    setIsMenuOpen(false);
                  }}
                  className="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-accent-primary hover:opacity-80 transition-opacity"
                >
                  <LogIn size={18} />
                  Iniciar Sesión
                </button>
              )}
            </div>

            <button
              onClick={toggleTheme}
              className="p-3 rounded-2xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:text-accent-primary dark:hover:text-accent-secondary transition-all active:scale-90"
              title={`Modo ${theme === "light" ? "oscuro" : "claro"}`}
            >
              {theme === "light" ? <Moon size={20} strokeWidth={1.5} /> : <Sun size={20} strokeWidth={1.5} />}
            </button>
          </div>
          
          <div className="flex items-center gap-2 text-[9px] font-bold text-gray-400 uppercase tracking-widest justify-center">
            <ShieldCheck size={12} className="text-accent-primary" />
            <span>Academic Edition v2.0</span>
          </div>
        </div>
      </aside>

      <Modal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)}
        title="Acceso de Usuario"
      >
        <Auth />
      </Modal>
    </>
  );
};

export default Navbar;
