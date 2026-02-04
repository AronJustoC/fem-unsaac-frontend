import React, { useState, useEffect } from 'react';
import StructureEditor from './StructureEditor';
import GraphicsView from './GraphicsView';
import Navbar from './Navbar';
import { ThemeProvider, useTheme } from './ThemeContext';
import { supabase } from '../lib/supabase';
import { authenticatedFetch } from '../lib/api';
import type { Session } from '@supabase/supabase-js';

const AppContent: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [vizData, setVizData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: Session | null) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleVisualize = async (structure: any) => {
    // Mapear DOF del frontend al formato del backend
    const mapDofToBackend = (dof: string): string => {
      const mapping: Record<string, string> = {
        'tx': 'ux', 'ty': 'uy', 'tz': 'uz',
        'rx': 'rx', 'ry': 'ry', 'rz': 'rz'
      };
      return mapping[dof.toLowerCase()] || dof.toLowerCase();
    };

    const structureToSave = {
      ...structure,
      restraints: Object.fromEntries(
        Object.entries(structure.restraints).map(([nodeId, dofs]: [string, any]) => [
          nodeId,
          Array.from(new Set(dofs.map((dof: string) => mapDofToBackend(dof))))
        ])
      )
    };

    localStorage.setItem('fem_structure_data', JSON.stringify(structureToSave));

    setLoading(true);
    setError(null);
    try {
      const response = await authenticatedFetch(`/api/visualization/structure?theme=${theme}`, {
        method: 'POST',
        body: JSON.stringify(structureToSave),
      });

      if (!response.ok) {
        const errorDetail = await response.json();
        throw new Error(errorDetail.detail || 'Error al obtener la visualización');
      }

      const data = await response.json();
      setVizData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-light dark:bg-bg-dark transition-all duration-500 font-sans">
      <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-50"></div>
      
      <Navbar />
      
      <main className="relative z-10 max-w-screen-2xl mx-auto p-4 lg:p-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5">
            <StructureEditor onVisualize={handleVisualize} />
          </div>
          <div className="lg:col-span-7">
            <div className="sticky top-28 space-y-6">
              <div className="flex items-center gap-3 mb-2 px-2">
                <div className="w-1.5 h-6 bg-unsaac-red rounded-full"></div>
                <h2 className="text-sm font-display font-black text-gray-400 uppercase tracking-[0.3em]">
                  Motor de Geometría 3D
                </h2>
              </div>
              <div className="bg-white dark:bg-bg-dark-panel rounded-[2.5rem] border border-border-light dark:border-border-dark overflow-hidden shadow-2xl transition-all hover:border-unsaac-gold/30 group h-[600px] relative">
                <GraphicsView 
                  data={vizData} 
                  loading={loading} 
                  error={error} 
                  className="h-full w-full"
                />
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-[9px] font-mono text-white/70">
                    Aceleración por GPU
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 py-10 px-8 border-t border-border-light dark:border-border-dark mt-20 bg-bg-light/30 dark:bg-bg-dark/30 backdrop-blur-xl">
        <div className="max-w-screen-2xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="space-y-2 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <div className="w-1 h-4 bg-unsaac-red"></div>
              <p className="text-[11px] font-display font-black uppercase tracking-[0.3em] text-text-light dark:text-text-dark">
                EPIM UNSAAC <span className="text-unsaac-gold opacity-80">—</span> Tesis v1.0.0
              </p>
            </div>
            <p className="text-[10px] font-sans font-medium uppercase tracking-[0.2em] text-text-light/30 dark:text-text-dark/30">
              © 2026 Escuela Profesional de Ingeniería Mecánica - UNSAAC
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center sm:items-end gap-1">
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-unsaac-red"></div>
                <div className="w-2 h-2 rounded-full bg-unsaac-gold"></div>
              </div>
              <span className="text-[8px] font-mono font-bold text-text-light/20 dark:text-text-dark/20 uppercase tracking-widest">
                Excelencia Académica
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
};

export default App;
