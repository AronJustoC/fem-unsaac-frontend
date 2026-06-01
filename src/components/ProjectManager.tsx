import React, { useState, useEffect, useRef } from 'react';
import { FolderOpen, Save, Zap, Play, ChevronDown, Loader2, Pencil, Trash2, X, Plus } from 'lucide-react';
import { authenticatedFetch } from '../lib/api';
import { supabase } from '../lib/supabase';
import Auth from './Auth';
import Modal from './ui/Modal';

interface Project {
  id: string;
  name: string;
  created_at: string;
  structure_data: any;
}

const ProjectManager: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  
  const [showNameInput, setShowNameInput] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectToRename, setProjectToRename] = useState<Project | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        resetUI();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const resetUI = () => {
    setShowNameInput(false);
    setNewProjectName('');
    setProjectToRename(null);
    setDeleteConfirm(null);
    setMessage(null);
  };

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const fetchProjects = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setProjects([]);
        return;
      }
      setLoading(true);
      const response = await authenticatedFetch('/api/projects');
      
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      } else {
        console.error('Error al obtener proyectos:', response.statusText);
      }
    } catch (error) {
      console.error('Error al obtener proyectos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchProjects();
    }
  }, [isOpen]);

  const handleSave = async (asNew: boolean = false) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setShowAuthModal(true);
        return;
      }
      setMessage(null);
      const structureData = localStorage.getItem('fem_structure_data');
      
      if (!structureData) {
        setMessage({ type: 'error', text: 'No hay datos para guardar.' });
        return;
      }

      if (asNew || !currentProjectId) {
        setShowNameInput(true);
        setProjectToRename(null);
        return;
      }

      setSaving(true);
      const response = await authenticatedFetch(`/api/projects/${currentProjectId}`, {
        method: 'PUT',
        body: JSON.stringify({
            structure_data: JSON.parse(structureData)
        })
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Proyecto actualizado.' });
        fetchProjects();
      } else {
        setMessage({ type: 'error', text: 'Error al actualizar.' });
      }
    } catch (error) {
      console.error('Error al guardar proyecto:', error);
      setMessage({ type: 'error', text: 'Error de conexión.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNew = async () => {
    if (!newProjectName.trim()) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setShowAuthModal(true);
        return;
      }
      setSaving(true);
      const structureData = localStorage.getItem('fem_structure_data');
      if (!structureData) return;

      const body = {
        name: newProjectName,
        structure_data: JSON.parse(structureData)
      };

      const response = await authenticatedFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify(body)
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentProjectId(data.id);
        setMessage({ type: 'success', text: 'Proyecto guardado.' });
        setShowNameInput(false);
        setNewProjectName('');
        fetchProjects();
      } else {
        setMessage({ type: 'error', text: 'Error al guardar.' });
      }
    } catch (error) {
       setMessage({ type: 'error', text: 'Error de conexión.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRenameSubmit = async () => {
    if (!projectToRename || !newProjectName.trim()) return;

    try {
        setSaving(true);
        const response = await authenticatedFetch(`/api/projects/${projectToRename.id}`, {
            method: 'PUT',
            body: JSON.stringify({ name: newProjectName })
        });

        if (response.ok) {
            fetchProjects();
            setMessage({ type: 'success', text: 'Renombrado correctamente.' });
            setShowNameInput(false);
            setProjectToRename(null);
            setNewProjectName('');
        } else {
            setMessage({ type: 'error', text: 'Error al renombrar.' });
        }
    } catch (error) {
        setMessage({ type: 'error', text: 'Error de conexión.' });
    } finally {
        setSaving(false);
    }
  };


  // Load project from API
  const handleLoad = async (project: Project) => {
    try {
      localStorage.setItem('fem_structure_data', JSON.stringify(project.structure_data));
      setCurrentProjectId(project.id);
      window.dispatchEvent(new Event('storage'));
      setMessage({ type: 'success', text: 'Cargado.' });
      setTimeout(() => setIsOpen(false), 800); 
    } catch (error) {
      console.error('Error al cargar proyecto:', error);
      setMessage({ type: 'error', text: 'Error al cargar.' });
    }
  };

  const startRename = (e: React.MouseEvent, project: Project) => {
      e.stopPropagation();
      setProjectToRename(project);
      setNewProjectName(project.name);
      setShowNameInput(true);
  };

  const handleDelete = async (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    try {
      const response = await authenticatedFetch(`/api/projects/${project.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        if (currentProjectId === project.id) setCurrentProjectId(null);
        fetchProjects();
        setDeleteConfirm(null);
        setMessage({ type: 'success', text: 'Eliminado.' });
      } else {
        setMessage({ type: 'error', text: 'Error al eliminar.' });
      }
    } catch (error) {
      console.error('Error al eliminar proyecto:', error);
      setMessage({ type: 'error', text: 'Error de conexión.' });
    }
  };

  const handleLoadElement = () => {
    const elementStructure = generateSimpleElement();
    localStorage.setItem('fem_structure_data', JSON.stringify(elementStructure));
    setCurrentProjectId(null); // Clear current project ID as this is a new "unsaved" state
    window.dispatchEvent(new Event('storage'));
    setMessage({ type: 'success', text: 'Ejemplo cargado.' });
    setTimeout(() => setIsOpen(false), 800);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setShowAuthModal(false);
        fetchProjects();
      } else {
        setProjects([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <Modal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)}
        title="Acceso de Usuario"
      >
        <Auth />
        <p className="mt-4 text-center text-[10px] text-gray-400 uppercase font-black tracking-widest">
          Inicia sesión para guardar tus proyectos en la nube
        </p>
      </Modal>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group flex items-center gap-2 bg-white/80 dark:bg-black/40 hover:bg-white dark:hover:bg-black/60 text-gray-900 dark:text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest border border-border-light dark:border-border-dark shadow-lg transition-all active:scale-95 cursor-pointer backdrop-blur-md"
      >
        <FolderOpen size={14} className="group-hover:scale-110 transition-transform" />
        Gestor de Proyectos
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          {/* Menu Content */}
          <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-zinc-900 rounded-2xl border border-border-light dark:border-zinc-800 shadow-2xl overflow-hidden z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border-light dark:border-zinc-800 bg-gray-50/50 dark:bg-black/20">
              <h3 className="text-[10px] font-display font-black text-gray-900 dark:text-white uppercase tracking-[0.2em]">
                Gestor de Proyectos
              </h3>
              <p className="text-[8px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                Guardar, Cargar y Administrar
              </p>
            </div>

            {/* Notifications */}
            {message && (
                <div className={`px-4 py-2 text-[10px] font-bold text-center ${message.type === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                    {message.text}
                </div>
            )}

            {/* Input View (Save New / Rename) */}
            {showNameInput ? (
                <div className="p-4 space-y-3 bg-gray-50 dark:bg-zinc-900/50">
                    <div className="flex justify-between items-center">
                        <label className="text-[9px] font-black uppercase text-gray-500">
                            {projectToRename ? 'Renombrar Proyecto' : 'Nuevo Proyecto'}
                        </label>
                        <button onClick={() => resetUI()} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                            <X size={12} />
                        </button>
                    </div>
                    <input 
                        autoFocus
                        type="text" 
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="Nombre del proyecto..."
                        className="w-full px-3 py-2 bg-white dark:bg-black border border-gray-200 dark:border-zinc-700 rounded-lg text-xs outline-none focus:border-unsaac-gold transition-colors"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') projectToRename ? handleRenameSubmit() : handleSaveNew();
                            if (e.key === 'Escape') resetUI();
                        }}
                    />
                    <button 
                        onClick={() => projectToRename ? handleRenameSubmit() : handleSaveNew()}
                        disabled={!newProjectName.trim() || saving}
                        className="w-full py-2 bg-unsaac-red hover:bg-unsaac-red/90 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50"
                    >
                        {saving ? <Loader2 size={12} className="animate-spin mx-auto" /> : (projectToRename ? 'Renombrar' : 'Guardar')}
                    </button>
                </div>
            ) : (
                /* Main View */
                <>
                    <div className="p-4 space-y-2 border-b border-border-light dark:border-zinc-800">
                    {/* Main Actions */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleSave(false)}
                            disabled={saving}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-3 bg-unsaac-red/10 hover:bg-unsaac-red/20 text-unsaac-red rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            title={currentProjectId ? "Actualizar proyecto existente" : "Guardar como nuevo proyecto"}
                        >
                            {saving ? (
                            <Loader2 size={14} className="animate-spin" />
                            ) : (
                            <Save size={14} />
                            )}
                            {currentProjectId ? 'Actualizar' : 'Guardar'}
                        </button>

                        {currentProjectId && (
                            <button 
                                onClick={() => handleSave(true)}
                                className="px-3 py-3 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-600 dark:text-gray-300 rounded-xl transition-all active:scale-95"
                                title="Guardar como copia"
                            >
                                <Plus size={14} />
                            </button>
                        )}
                    </div>

                    <button
                        onClick={handleLoadElement}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-unsaac-gold/10 hover:bg-unsaac-gold/20 text-unsaac-gold rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 cursor-pointer"
                        title="Cargar un ejemplo de viga simple (borrará el progreso actual no guardado)"
                    >
                        <Zap size={14} />
                        Cargar Ejemplo
                    </button>
                    </div>

                    {/* Stored Projects List */}
                    <div className="p-4">
                    <h4 className="text-[9px] font-display font-black text-gray-400 uppercase tracking-widest mb-3 px-2 flex justify-between items-center">
                        Proyectos Guardados
                        <span className="text-[8px] bg-gray-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-gray-500">{projects.length}</span>
                    </h4>

                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                        <Loader2 size={20} className="animate-spin text-unsaac-red" />
                        </div>
                    ) : projects.length === 0 ? (
                        <div className="py-8 text-center bg-gray-50 dark:bg-zinc-800/50 rounded-xl border border-dashed border-gray-200 dark:border-zinc-700">
                        <p className="text-[9px] text-gray-400 uppercase tracking-widest">Sin proyectos</p>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                        {projects.map((project) => (
                            <div
                            key={project.id}
                            className={`group w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                                deleteConfirm === project.id 
                                    ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30' 
                                    : 'bg-gray-50 dark:bg-black/20 hover:bg-gray-100 dark:hover:bg-black/30 border-border-light dark:border-zinc-800'
                            }`}
                            >
                            {deleteConfirm === project.id ? (
                                <div className="flex-1 flex items-center justify-between animate-in fade-in duration-200">
                                    <span className="text-[9px] font-bold text-red-500 uppercase">¿Eliminar?</span>
                                    <div className="flex gap-2">
                                        <button onClick={(e) => handleDelete(e, project)} className="text-red-600 hover:text-red-700 font-bold text-[9px] uppercase hover:underline">Sí</button>
                                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }} className="text-gray-500 hover:text-gray-700 font-bold text-[9px] uppercase hover:underline">No</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <button
                                        onClick={() => handleLoad(project)}
                                        className="flex-1 flex items-center gap-3 text-left cursor-pointer transition-all active:scale-[0.98]"
                                    >
                                        <Play size={12} className={`${currentProjectId === project.id ? 'text-unsaac-gold' : 'text-green-500'} group-hover:scale-110 transition-transform`} />
                                        <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-black text-gray-900 dark:text-white truncate">
                                            {project.name}
                                        </p>
                                        <p className="text-[8px] text-gray-400 font-mono">
                                            {new Date(project.created_at).toLocaleDateString()}
                                        </p>
                                        </div>
                                    </button>
                                    
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                        onClick={(e) => startRename(e, project)}
                                        className="p-1.5 hover:bg-unsaac-red/10 text-gray-400 hover:text-unsaac-red rounded-lg transition-colors cursor-pointer"
                                        title="Renombrar"
                                        >
                                        <Pencil size={12} />
                                        </button>
                                        <button
                                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(project.id); }}
                                        className="p-1.5 hover:bg-red-500/10 text-gray-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                                        title="Eliminar"
                                        >
                                        <Trash2 size={12} />
                                        </button>
                                    </div>
                                </>
                            )}
                            </div>
                        ))}
                        </div>
                    )}
                    </div>
                </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

function generateSimpleElement() {
  return {
    nodes: [
      { id: 1, coords: [0, 0, 0] },
      { id: 2, coords: [1, 0, 0] }
    ],
    elements: [
      { id: 1, node_ids: [1, 2], material_id: 1, section_id: 1 }
    ],
    materials: [
      { id: 1, name: 'Acero', E: 210e9, nu: 0.3, rho: 7850 }
    ],
    sections: [
      { id: 1, name: 'Sección Estándar', area: 0.01, Iz: 1e-6, Iy: 1e-6, J: 2e-6 }
    ],
    restraints: {
      1: ['ux', 'uy', 'uz', 'rx', 'ry', 'rz']
    },
    loads: []
  };
}

export default ProjectManager;
