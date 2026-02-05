import React, { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Box,
  Hash,
  Layers,
  Zap,
  ArrowDown,
  Upload,
  Download,
  Activity,
  Waves,
  ChevronRight,
  RotateCcw
} from "lucide-react";
import Modal from "./ui/Modal";

interface Node {
  id: number;
  coords: [number, number, number];
  mass?: number;
}

interface Material {
  id: number;
  name: string;
  E: number;
  nu: number;
  rho: number;
}

interface Section {
  id: number;
  name: string;
  area: number;
  Iz: number;
  Iy: number;
  J: number;
}

interface Element {
  id: number;
  node_ids: [number, number];
  material_id: number;
  section_id: number;
}

interface Load {
  id: number;
  name: string;
  node_id: number;
  fx: number;
  fy: number;
  fz: number;
  mx: number;
  my: number;
  mz: number;
}

interface StructureData {
  nodes: Node[];
  elements: Element[];
  materials: Material[];
  sections: Section[];
  restraints: Record<number, string[]>;
  loads: Load[];
}

interface StructureEditorProps {
  onVisualize: (data: StructureData) => void;
}

const DOFS = ["ux", "uy", "uz", "rx", "ry", "rz"] as const;

const StructureEditor: React.FC<StructureEditorProps> = ({ onVisualize }) => {
  const [data, setData] = useState<StructureData>(() => {
    // Intentar cargar desde localStorage primero
    const saved = localStorage.getItem("fem_structure_data");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);

        // Mapear DOF antiguos (TX/TY/TZ) al formato del backend (ux/uy/uz)
        let restraints = parsed.restraints || {};
        if (restraints) {
          const mapDofToBackend = (dof: string): string => {
            const mapping: Record<string, string> = {
              tx: "ux",
              ty: "uy",
              tz: "uz",
              rx: "rx",
              ry: "ry",
              rz: "rz",
            };
            return mapping[dof.toLowerCase()] || dof.toLowerCase();
          };

          const validNodeIds = new Set(
            (parsed.nodes || []).map((n: any) => n.id),
          );

          restraints = Object.fromEntries(
            Object.entries(restraints)
              .filter(([nodeId]) => validNodeIds.has(parseInt(nodeId)))
              .map(([nodeId, dofs]) => [
                nodeId,
                Array.isArray(dofs)
                  ? Array.from(new Set(dofs.map((dof: any) => mapDofToBackend(dof))))
                  : dofs,
              ]),
          );
        }

        const validNodeIds = new Set(
          (parsed.nodes || []).map((n: any) => n.id),
        );
        const loads = (parsed.loads || []).filter((l: any) =>
          validNodeIds.has(l.node_id),
        );

        return {
          nodes: parsed.nodes || [],
          elements: parsed.elements || [],
          materials: parsed.materials || [],
          sections: parsed.sections || [],
          restraints: restraints,
          loads: loads,
        };
      } catch (e) {
        console.error("Error parsing saved structure data:", e);
      }
    }

    // Estado inicial por defecto si no hay nada guardado
    return {
      nodes: [
        { id: 1, coords: [0, 0, 0] },
        { id: 2, coords: [5, 0, 0] },
      ],
      elements: [{ id: 1, node_ids: [1, 2], material_id: 1, section_id: 1 }],
      materials: [{ id: 1, name: "Acero A36", E: 210e9, nu: 0.3, rho: 7850 }],
      sections: [
        {
          id: 1,
          name: "Perfil IPE 200",
          area: 0.01,
          Iz: 1e-4,
          Iy: 1e-4,
          J: 2e-4,
        },
      ],
      restraints: {
        1: ["ux", "uy", "uz", "rx", "ry", "rz"],
      },
      loads: [
        {
          id: 1,
          name: "Carga P",
          node_id: 2,
          fx: 0,
          fy: -5000,
          fz: 0,
          mx: 0,
          my: 0,
          mz: 0,
        },
      ],
    };
  });

  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [editingElement, setEditingElement] = useState<Element | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [editingLoad, setEditingLoad] = useState<Load | null>(null);

  const [activeTab, setActiveTab] = useState<
    "nodes" | "elements" | "properties" | "loads"
  >("nodes");

  // Guardar automáticamente en localStorage cada vez que cambie la estructura
  useEffect(() => {
    // Mapear DOF del frontend al formato del backend
    const mapDofToBackend = (dof: string): string => {
      const mapping: Record<string, string> = {
        tx: "ux",
        ty: "uy",
        tz: "uz",
        rx: "rx",
        ry: "ry",
        rz: "rz",
      };
      return mapping[dof.toLowerCase()] || dof.toLowerCase();
    };

    const dataToSave = {
      ...data,
      restraints: Object.fromEntries(
        Object.entries(data.restraints).map(([nodeId, dofs]) => [
          nodeId,
          Array.from(new Set(dofs.map((dof) => mapDofToBackend(dof)))),
        ]),
      ),
    };
    localStorage.setItem("fem_structure_data", JSON.stringify(dataToSave));
  }, [data]);

  const addNode = () => {
    const nextId = Math.max(0, ...data.nodes.map((n) => n.id)) + 1;
    const newNode: Node = { id: nextId, coords: [0, 0, 0] };
    setData((prev) => ({ ...prev, nodes: [...prev.nodes, newNode] }));
    setEditingNode(newNode);
  };

  const removeNode = (id: number) => {
    const newRestraints = { ...data.restraints };
    delete newRestraints[id];
    setData((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== id),
      elements: prev.elements.filter((e) => !e.node_ids.includes(id)),
      restraints: newRestraints,
    }));
  };

  const updateNodeCoord = (id: number, axis: 0 | 1 | 2, value: number) => {
    const val = isNaN(value) ? 0 : value;
    setData((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => {
        if (n.id === id) {
          const newCoords = [...n.coords] as [number, number, number];
          newCoords[axis] = val;
          return { ...n, coords: newCoords };
        }
        return n;
      }),
    }));
    setEditingNode((prev) => {
      if (prev?.id === id) {
        const newCoords = [...prev.coords] as [number, number, number];
        newCoords[axis] = val;
        return { ...prev, coords: newCoords };
      }
      return prev;
    });
  };

  const updateNodeMass = (id: number, value: number) => {
    const val = isNaN(value) ? 0 : value;
    setData((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === id ? { ...n, mass: val } : n)),
    }));
    setEditingNode((prev) => (prev?.id === id ? { ...prev, mass: val } : prev));
  };

  const toggleRestraint = (nodeId: number, dof: string) => {
    const targetDof = dof.toLowerCase();
    setData((prev) => {
      const current = prev.restraints[nodeId] || [];
      const normalizedCurrent = current.map(d => d.toLowerCase());
      
      const updated = normalizedCurrent.includes(targetDof)
        ? normalizedCurrent.filter((d) => d !== targetDof)
        : [...normalizedCurrent, targetDof];
        
      const newRestraints = { ...prev.restraints };
      if (updated.length === 0) delete newRestraints[nodeId];
      else newRestraints[nodeId] = updated;
      return { ...prev, restraints: newRestraints };
    });
  };

  const addElement = () => {
    if (data.nodes.length < 2) return;
    const nextId = Math.max(0, ...data.elements.map((e) => e.id)) + 1;
    const newEl: Element = {
      id: nextId,
      node_ids: [data.nodes[0].id, data.nodes[1].id],
      material_id: data.materials[0]?.id || 1,
      section_id: data.sections[0]?.id || 1,
    };
    setData((prev) => ({ ...prev, elements: [...prev.elements, newEl] }));
    setEditingElement(newEl);
  };

  const removeElement = (id: number) => {
    setData((prev) => ({
      ...prev,
      elements: prev.elements.filter((e) => e.id !== id),
    }));
  };

  const updateElementNodes = (id: number, index: 0 | 1, nodeId: number) => {
    setData((prev) => {
      const updatedElements = prev.elements.map((e) => {
        if (e.id === id) {
          const newNodeIds = [...e.node_ids] as [number, number];
          newNodeIds[index] = nodeId;
          return { ...e, node_ids: newNodeIds };
        }
        return e;
      });
      return { ...prev, elements: updatedElements };
    });
    setEditingElement((prev) => {
      if (prev?.id === id) {
        const newNodeIds = [...prev.node_ids] as [number, number];
        newNodeIds[index] = nodeId;
        return { ...prev, node_ids: newNodeIds };
      }
      return prev;
    });
  };

  const updateElementProperty = (
    id: number,
    field: "material_id" | "section_id",
    value: number,
  ) => {
    setData((prev) => ({
      ...prev,
      elements: prev.elements.map((e) =>
        e.id === id ? { ...e, [field]: value } : e,
      ),
    }));
    setEditingElement((prev) =>
      prev?.id === id ? { ...prev, [field]: value } : prev,
    );
  };

  const addMaterial = () => {
    const nextId = Math.max(0, ...data.materials.map((m) => m.id)) + 1;
    const newMat: Material = {
      id: nextId,
      name: `Material ${nextId} `,
      E: 210e9,
      nu: 0.3,
      rho: 7850,
    };
    setData((prev) => ({ ...prev, materials: [...prev.materials, newMat] }));
    setEditingMaterial(newMat);
  };

  const addSection = () => {
    const nextId = Math.max(0, ...data.sections.map((s) => s.id)) + 1;
    const newSec: Section = {
      id: nextId,
      name: `Sección ${nextId} `,
      area: 0.01,
      Iz: 1e-4,
      Iy: 1e-4,
      J: 2e-4,
    };
    setData((prev) => ({ ...prev, sections: [...prev.sections, newSec] }));
    setEditingSection(newSec);
  };

  const removeMaterial = (id: number) => {
    if (editingMaterial?.id === id) setEditingMaterial(null);
    setData((prev) => ({
      ...prev,
      materials: prev.materials.filter((m) => m.id !== id),
      elements: prev.elements.map((e) =>
        e.material_id === id
          ? {
              ...e,
              material_id: prev.materials.find((m) => m.id !== id)?.id || 0,
            }
          : e,
      ),
    }));
  };

  const removeSection = (id: number) => {
    if (editingSection?.id === id) setEditingSection(null);
    setData((prev) => ({
      ...prev,
      sections: prev.sections.filter((s) => s.id !== id),
      elements: prev.elements.map((e) =>
        e.section_id === id
          ? {
              ...e,
              section_id: prev.sections.find((s) => s.id !== id)?.id || 0,
            }
          : e,
      ),
    }));
  };

  const updateMaterial = (
    id: number,
    field: keyof Omit<Material, "id">,
    value: number | string,
  ) => {
    const val = typeof value === "number" && isNaN(value) ? 0 : value;
    setData((prev) => ({
      ...prev,
      materials: prev.materials.map((m) =>
        m.id === id ? { ...m, [field]: val } : m,
      ),
    }));
    setEditingMaterial((prev) =>
      prev?.id === id ? { ...prev, [field]: val } : prev,
    );
  };

  const updateSection = (
    id: number,
    field: keyof Omit<Section, "id">,
    value: number | string,
  ) => {
    const val = typeof value === "number" && isNaN(value) ? 0 : value;
    setData((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === id ? { ...s, [field]: val } : s,
      ),
    }));
    setEditingSection((prev) =>
      prev?.id === id ? { ...prev, [field]: val } : prev,
    );
  };

  const addLoad = () => {
    if (data.nodes.length === 0) return;

    // Encontrar nodos sin restricciones
    const freeNodes = data.nodes.filter((n) => {
      const restraints = data.restraints[n.id] || [];
      return restraints.length === 0;
    });

    if (freeNodes.length === 0) {
      alert(
        "No hay nodos libres disponibles. Las cargas no se pueden aplicar en apoyos.",
      );
      return;
    }

    const nextId = Math.max(0, ...data.loads.map((l) => l.id)) + 1;
    const newLoad: Load = {
      id: nextId,
      name: `Carga ${nextId}`,
      node_id: freeNodes[0].id,
      fx: 0,
      fy: 0,
      fz: 0,
      mx: 0,
      my: 0,
      mz: 0,
    };
    setData((prev) => ({ ...prev, loads: [...prev.loads, newLoad] }));
    setEditingLoad(newLoad);
  };

  const removeLoad = (id: number) => {
    if (editingLoad?.id === id) setEditingLoad(null);
    setData((prev) => ({
      ...prev,
      loads: prev.loads.filter((l) => l.id !== id),
    }));
  };

  const updateLoad = (
    id: number,
    field: keyof Omit<Load, "id">,
    value: number | string,
  ) => {
    const val = typeof value === "number" && isNaN(value) ? 0 : value;
    setData((prev) => ({
      ...prev,
      loads: prev.loads.map((l) => (l.id === id ? { ...l, [field]: val } : l)),
    }));
    setEditingLoad((prev) =>
      prev?.id === id ? { ...prev, [field]: val } : prev,
    );
  };

  const handleCloseLoadModal = () => {
    setEditingLoad(null);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target?.result as string);
        
        if (!importedData.nodes || !Array.isArray(importedData.nodes)) {
          throw new Error("Formato JSON inválido: Faltan nodos");
        }

        const mapDofToBackend = (dof: string): string => {
          const mapping: Record<string, string> = {
            tx: "ux", ty: "uy", tz: "uz",
            rx: "rx", ry: "ry", rz: "rz",
          };
          return mapping[dof.toLowerCase()] || dof.toLowerCase();
        };

        const processedRestraints: Record<number, string[]> = {};
        if (importedData.restraints) {
          Object.entries(importedData.restraints).forEach(([nodeId, dofs]) => {
            if (Array.isArray(dofs)) {
              processedRestraints[parseInt(nodeId)] = Array.from(new Set(dofs.map((d: any) => mapDofToBackend(String(d)))));
            }
          });
        }

        const newData: StructureData = {
          nodes: importedData.nodes || [],
          elements: importedData.elements || [],
          materials: importedData.materials || [],
          sections: importedData.sections || [],
          restraints: processedRestraints,
          loads: importedData.loads || [],
        };

        setData(newData);
        alert("Estructura importada exitosamente");
      } catch (err: any) {
        console.error("Error importing JSON:", err);
        alert("Error al importar JSON: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportJSON = () => {
    const dataStr = JSON.stringify(data, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = 'fem_structure.json';
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const isLoadValid = (load: Load): boolean => {
    // Verificar que tenga al menos un componente no cero
    return (
      load.fx !== 0 ||
      load.fy !== 0 ||
      load.fz !== 0 ||
      load.mx !== 0 ||
      load.my !== 0 ||
      load.mz !== 0
    );
  };

  const isNodeRestricted = (nodeId: number): boolean => {
    const restraints = data.restraints[nodeId] || [];
    return restraints.length > 0;
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-bg-dark-panel rounded-[2.5rem] border border-unsaac-red/20 dark:border-brand-navy/30 overflow-hidden shadow-2xl transition-all duration-500">
      <header className="flex items-center justify-between px-8 py-6 border-b border-unsaac-red/20 dark:border-brand-navy/30 bg-gray-50/30 dark:bg-black/20">
        <div className="flex items-center gap-4">
          <div className="bg-unsaac-red/10 p-2 rounded-xl text-unsaac-red border border-unsaac-red/20">
            <Hash size={20} />
          </div>
          <div>
            <h2 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-[0.2em] font-display">
              Mesh<span className="text-unsaac-red">Architect</span>
            </h2>
            <p className="text-[8px] text-gray-400 font-bold uppercase tracking-widest mt-0.5 font-display">
              Configuración Geométrica
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            id="json-import-input"
            accept=".json"
            onChange={handleImportJSON}
            className="hidden"
          />
          <button
            onClick={() => document.getElementById('json-import-input')?.click()}
            className="p-2.5 bg-gray-100 dark:bg-black/40 text-gray-600 dark:text-gray-400 hover:text-unsaac-red dark:hover:text-unsaac-gold rounded-xl border border-border-light dark:border-border-dark transition-all active:scale-95 cursor-pointer shadow-sm"
            title="Importar JSON"
          >
            <Upload size={14} />
          </button>
          <button
            onClick={handleExportJSON}
            className="p-2.5 bg-gray-100 dark:bg-black/40 text-gray-600 dark:text-gray-400 hover:text-unsaac-red dark:hover:text-unsaac-gold rounded-xl border border-border-light dark:border-border-dark transition-all active:scale-95 cursor-pointer shadow-sm"
            title="Exportar JSON"
          >
            <Download size={14} />
          </button>
          
          <button
            onClick={() => onVisualize(data)}
            className="group flex items-center gap-2 bg-unsaac-red hover:bg-unsaac-red/90 text-white px-5 py-2.5 rounded-xl font-display font-black text-[10px] uppercase tracking-widest shadow-lg shadow-unsaac-red/20 transition-all active:scale-95 cursor-pointer"
          >
            <Zap size={14} className="group-hover:fill-white transition-all" />
            Visualizar
          </button>
        </div>
      </header>

      <nav className="flex px-6 py-4 gap-2 bg-gray-50/30 dark:bg-black/20 backdrop-blur-md border-b border-border-light dark:border-border-dark sticky top-0 z-10 overflow-x-auto no-scrollbar">
        {[
          {
            id: "nodes",
            label: "Nodos",
            icon: Hash,
            color: "text-unsaac-red",
            bg: "bg-unsaac-red/10",
          },
          {
            id: "elements",
            label: "Elementos",
            icon: Box,
            color: "text-unsaac-gold",
            bg: "bg-unsaac-gold/10",
          },
          {
            id: "properties",
            label: "Biblioteca",
            icon: Layers,
            color: "text-brand-navy",
            bg: "bg-brand-navy/10",
          },
          {
            id: "loads",
            label: "Cargas",
            icon: ArrowDown,
            color: "text-red-500",
            bg: "bg-red-500/10",
          },
        ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-3 px-6 py-3 rounded-2xl text-[10px] font-display font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap ${
                activeTab === tab.id
                ? "bg-white dark:bg-bg-dark-panel text-gray-900 dark:text-white shadow-xl shadow-accent-primary/10 border border-accent-primary/20"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-white/5"
            }`}
          >
            <tab.icon
              size={14}
              className={activeTab === tab.id ? tab.color : "opacity-40"}
            />
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-white dark:bg-bg-dark-panel">
        <div className="max-w-4xl mx-auto space-y-10">
          {activeTab === "nodes" && (
            <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex items-center justify-between mb-6 px-2">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-4 bg-unsaac-red rounded-full"></div>
                  <h3 className="text-[10px] font-display font-black text-gray-400 uppercase tracking-[0.3em]">
                    Matriz de Nodos
                  </h3>
                </div>
                  <button
                    onClick={addNode}
                    className="group flex items-center gap-2 text-[10px] font-display font-black text-unsaac-red uppercase tracking-widest hover:opacity-70 transition-all cursor-pointer"
                  >

                  <Plus
                    size={14}
                    className="group-hover:rotate-90 transition-transform"
                  />
                  Añadir Nodo
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                {data.nodes.map((node) => (
                  <div key={node.id} className="relative group">
                    <button
                      onClick={() => setEditingNode(node)}
                      className="w-full flex flex-col items-center justify-center premium-card p-6 rounded-2xl hover:scale-[1.02] cursor-pointer"
                    >
                      <div className="text-[9px] font-display font-black text-unsaac-red uppercase tracking-widest mb-2 opacity-50">
                        REF_NODO
                      </div>
                      <span className="text-2xl font-black text-gray-900 dark:text-white mb-3 font-mono">
                        {node.id.toString().padStart(2, "0")}
                      </span>
                      <div className="flex items-center gap-2 px-3 py-1.5 premium-card-inner">
                        <span className="text-[10px] text-gray-500 dark:text-unsaac-red font-mono font-bold tracking-tighter">
                          {node.coords.map((c) => c.toFixed(2)).join(" , ")}
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeNode(node.id);
                      }}
                      className="absolute -top-1 -right-1 p-2.5 bg-white dark:bg-bg-dark text-red-500 hover:bg-red-500 hover:text-white rounded-xl shadow-xl border border-border-light dark:border-border-dark opacity-0 group-hover:opacity-100 transition-all active:scale-90 cursor-pointer"
                      title="Eliminar Nodo"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === "elements" && (
            <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex items-center justify-between mb-6 px-2">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-4 bg-unsaac-gold rounded-full"></div>
                  <h3 className="text-[10px] font-display font-black text-gray-400 uppercase tracking-[0.3em]">
                    Mapa de Conectividad
                  </h3>
                </div>
                  <button
                    onClick={addElement}
                    className="group flex items-center gap-2 text-[10px] font-display font-black text-unsaac-gold uppercase tracking-widest hover:opacity-70 transition-all cursor-pointer"
                  >

                  <Plus
                    size={14}
                    className="group-hover:rotate-90 transition-transform"
                  />
                  Añadir Elemento
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                {data.elements.map((el) => (
                  <div key={el.id} className="relative group">
                    <button
                      onClick={() => setEditingElement(el)}
                      className="w-full flex flex-col items-center justify-center premium-card p-6 rounded-2xl hover:scale-[1.02] cursor-pointer"
                    >
                      <div className="text-[9px] font-display font-black text-unsaac-gold uppercase tracking-widest mb-2 opacity-50">
                        REF_ELEM
                      </div>
                      <span className="text-2xl font-black text-gray-900 dark:text-white mb-3 font-mono">
                        {el.id.toString().padStart(2, "0")}
                      </span>
                      <div className="flex items-center gap-3 px-4 py-1.5 premium-card-inner">
                        <span className="text-[10px] text-gray-400 font-black font-mono">
                          N{el.node_ids[0]}
                        </span>
                        <ChevronRight size={10} className="text-unsaac-gold" />
                        <span className="text-[10px] text-gray-400 font-black font-mono">
                          N{el.node_ids[1]}
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeElement(el.id);
                      }}
                      className="absolute -top-1 -right-1 p-2.5 bg-white dark:bg-bg-dark text-red-500 hover:bg-red-500 hover:text-white rounded-xl shadow-xl border border-border-light dark:border-border-dark opacity-0 group-hover:opacity-100 transition-all active:scale-90 cursor-pointer"
                      title="Eliminar Elemento"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === "properties" && (
            <section className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-10">
              <div>
                <div className="flex items-center justify-between mb-6 px-2">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-4 bg-unsaac-red rounded-full"></div>
                    <h3 className="text-[10px] font-display font-black text-gray-400 uppercase tracking-[0.3em]">
                      Biblioteca de Materiales
                    </h3>
                  </div>
                    <button
                      onClick={addMaterial}
                      className="text-[10px] font-display font-black text-unsaac-red uppercase tracking-widest hover:opacity-70 transition-all cursor-pointer"
                    >

                    + Nuevo Material
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                  {data.materials.map((m) => (
                    <div key={m.id} className="relative group">
                      <button
                        onClick={() => setEditingMaterial(m)}
                        className="w-full flex flex-col items-center justify-center premium-card p-6 rounded-2xl hover:scale-[1.02] cursor-pointer"
                      >
                        <div className="text-[9px] font-display font-black text-unsaac-red uppercase tracking-widest mb-2 opacity-50">
                          REF_MAT
                        </div>
                        <span className="text-sm font-black text-gray-900 dark:text-white mb-2 truncate max-w-full px-2 font-display">
                          {m.name.toUpperCase()}
                        </span>
                        <div className="w-12 h-1 bg-unsaac-red/30 rounded-full group-hover:w-20 transition-all duration-500"></div>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeMaterial(m.id);
                        }}
                        className="absolute -top-1 -right-1 p-2 bg-white dark:bg-bg-dark text-red-500 hover:bg-red-500 hover:text-white rounded-xl shadow-xl border border-border-light dark:border-border-dark opacity-0 group-hover:opacity-100 transition-all active:scale-90 cursor-pointer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-6 px-2">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-4 bg-unsaac-gold rounded-full"></div>
                    <h3 className="text-[10px] font-display font-black text-gray-400 uppercase tracking-[0.3em]">
                      Catálogo de Perfiles
                    </h3>
                  </div>
                    <button
                      onClick={addSection}
                      className="text-[10px] font-display font-black text-unsaac-gold uppercase tracking-widest hover:opacity-70 transition-all cursor-pointer"
                    >

                    + Nuevo Perfil
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                  {data.sections.map((s) => (
                    <div key={s.id} className="relative group">
                      <button
                        onClick={() => setEditingSection(s)}
                        className="w-full flex flex-col items-center justify-center premium-card p-6 rounded-2xl hover:scale-[1.02] cursor-pointer"
                      >
                        <div className="text-[9px] font-display font-black text-unsaac-gold uppercase tracking-widest mb-2 opacity-50">
                          REF_SEC
                        </div>
                        <span className="text-sm font-black text-gray-900 dark:text-white mb-2 truncate max-w-full px-2 font-display">
                          {s.name.toUpperCase()}
                        </span>
                        <div className="w-12 h-1 bg-unsaac-gold/30 rounded-full group-hover:w-20 transition-all duration-500"></div>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSection(s.id);
                        }}
                        className="absolute -top-1 -right-1 p-2 bg-white dark:bg-bg-dark text-red-500 hover:bg-red-500 hover:text-white rounded-xl shadow-xl border border-border-light dark:border-border-dark opacity-0 group-hover:opacity-100 transition-all active:scale-90 cursor-pointer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeTab === "loads" && (
            <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex items-center justify-between mb-6 px-2">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-4 bg-red-500 rounded-full"></div>
                  <h3 className="text-[10px] font-display font-black text-gray-400 uppercase tracking-[0.3em]">
                    Casos de Carga
                  </h3>
                </div>
                  <button
                    onClick={addLoad}
                    className="group flex items-center gap-2 text-[10px] font-display font-black text-red-500 uppercase tracking-widest hover:opacity-70 transition-all cursor-pointer"
                  >

                  <Plus
                    size={14}
                    className="group-hover:rotate-90 transition-transform"
                  />
                  Añadir Caso de Carga
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {data.loads.map((load) => (
                  <div key={load.id} className="relative group">
                    <button
                      onClick={() => setEditingLoad(load)}
                      className="w-full flex flex-col items-start premium-card p-6 rounded-2xl hover:scale-[1.02] cursor-pointer"
                    >
                      <div className="flex justify-between w-full mb-4">
                        <div className="text-[9px] font-display font-black text-red-500 uppercase tracking-widest opacity-50">
                          REF_CARGA
                        </div>
                        <div className="text-[10px] font-black text-gray-400 font-mono">
                          NODO {load.node_id}
                        </div>
                      </div>
                      <span className="text-lg font-black text-gray-900 dark:text-white mb-4 truncate w-full text-left font-display">
                        {load.name}
                      </span>

                      <div className="grid grid-cols-3 gap-2 w-full">
                        {[
                          { label: "Fx", val: load.fx },
                          { label: "Fy", val: load.fy },
                          { label: "Fz", val: load.fz },
                          { label: "Mx", val: load.mx },
                          { label: "My", val: load.my },
                          { label: "Mz", val: load.mz },
                        ]
                          .filter((c) => c.val !== 0)
                          .map((c) => (
                            <div
                              key={c.label}
                              className="flex items-center gap-1.5 px-2 py-1 premium-card-inner"
                            >
                              <span className="text-[8px] text-gray-400 font-black font-display">
                                {c.label}
                              </span>
                              <span className="text-[9px] text-gray-900 dark:text-white font-mono font-bold">
                                {c.val}
                              </span>
                            </div>
                          ))}
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeLoad(load.id);
                      }}
                      className="absolute -top-1 -right-1 p-2.5 bg-white dark:bg-bg-dark text-red-500 hover:bg-red-500 hover:text-white rounded-xl shadow-xl border border-border-light dark:border-border-dark opacity-0 group-hover:opacity-100 transition-all active:scale-90 cursor-pointer"
                      title="Eliminar Carga"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <Modal
        isOpen={!!editingNode}
        onClose={() => setEditingNode(null)}
        title={`Editar Nodo #${editingNode?.id}`}
      >
        {editingNode && (
          <div className="space-y-6">
            <div className="space-y-4">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Coordenadas (m)
              </label>
              <div className="grid grid-cols-3 gap-3">
                {["X", "Y", "Z"].map((axis, i) => (
                  <div key={axis} className="space-y-1">
                    <label className="text-[10px] text-gray-500">{axis}</label>
                    <input
                      type="number"
                      value={editingNode.coords[i]}
                      onChange={(e) =>
                        updateNodeCoord(
                          editingNode.id,
                          i as 0 | 1 | 2,
                          parseFloat(e.target.value),
                        )
                      }
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-unsaac-red/10 dark:border-brand-navy/30 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-unsaac-gold/20 focus:border-unsaac-gold outline-none transition-all dark:text-white"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Masa Puntual (kg)
              </label>
              <input
                type="number"
                value={editingNode.mass || 0}
                onChange={(e) =>
                  updateNodeMass(editingNode.id, parseFloat(e.target.value))
                }
                className="w-full bg-gray-50 dark:bg-gray-900 border border-unsaac-red/10 dark:border-brand-navy/30 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-unsaac-gold/20 focus:border-unsaac-gold outline-none transition-all dark:text-white"
              />
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Restricciones (DOF)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {DOFS.map((dof) => {
                  const isActive = (
                    data.restraints[editingNode.id] || []
                  ).includes(dof);
                  return (
                    <button
                      key={dof}
                      onClick={() => toggleRestraint(editingNode.id, dof)}
                      className={`py-2 rounded-lg text-xs font-bold transition-all border ${
                        isActive
                          ? "bg-unsaac-red border-unsaac-red text-white shadow-lg shadow-unsaac-red/20"
                          : "bg-white dark:bg-gray-900 border-unsaac-red/10 dark:border-brand-navy/30 text-gray-400 dark:text-gray-500 hover:border-unsaac-gold"
                      }`}
                    >
                      {dof}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={() => setEditingNode(null)}
              className="w-full bg-unsaac-red hover:bg-unsaac-red/90 text-white py-3 rounded-xl font-bold text-sm transition-opacity"
            >
              Cerrar
            </button>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!editingElement}
        onClose={() => setEditingElement(null)}
        title={`Editar Elemento #${editingElement?.id} `}
      >
        {editingElement && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Nodo Inicio (N1)
                </label>
                <select
                  value={editingElement.node_ids[0]}
                  onChange={(e) =>
                    updateElementNodes(
                      editingElement.id,
                      0,
                      parseInt(e.target.value),
                    )
                  }
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-unsaac-red/10 dark:border-brand-navy/30 rounded-lg px-3 py-2 text-sm outline-none dark:text-white"
                >
                  {data.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      Nodo {n.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Nodo Fin (N2)
                </label>
                <select
                  value={editingElement.node_ids[1]}
                  onChange={(e) =>
                    updateElementNodes(
                      editingElement.id,
                      1,
                      parseInt(e.target.value),
                    )
                  }
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-unsaac-red/10 dark:border-brand-navy/30 rounded-lg px-3 py-2 text-sm outline-none dark:text-white"
                >
                  {data.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      Nodo {n.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Material
                </label>
                <select
                  value={editingElement.material_id}
                  onChange={(e) =>
                    updateElementProperty(
                      editingElement.id,
                      "material_id",
                      parseInt(e.target.value),
                    )
                  }
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-unsaac-red/10 dark:border-brand-navy/30 rounded-lg px-3 py-2 text-sm outline-none dark:text-white"
                >
                  {data.materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Sección
                </label>
                <select
                  value={editingElement.section_id}
                  onChange={(e) =>
                    updateElementProperty(
                      editingElement.id,
                      "section_id",
                      parseInt(e.target.value),
                    )
                  }
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-unsaac-red/10 dark:border-brand-navy/30 rounded-lg px-3 py-2 text-sm outline-none dark:text-white"
                >
                  {data.sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={() => setEditingElement(null)}
              className="w-full bg-unsaac-red hover:bg-unsaac-red/90 text-white py-3 rounded-xl font-bold text-sm transition-opacity"
            >
              Cerrar
            </button>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!editingMaterial}
        onClose={() => setEditingMaterial(null)}
        title={`Editar Material: ${editingMaterial?.name} `}
      >
        {editingMaterial && (
          <div className="space-y-5">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Nombre del Material
              </label>
              <input
                type="text"
                value={editingMaterial.name}
                onChange={(e) =>
                  updateMaterial(editingMaterial.id, "name", e.target.value)
                }
                className="w-full bg-gray-50 dark:bg-gray-900 border border-unsaac-red/10 dark:border-brand-navy/30 rounded-lg px-3 py-2 text-sm outline-none dark:text-white"
                placeholder="Ej. Acero A36"
              />
            </div>
            {[
              {
                label: "Módulo de Elasticidad (E) [Pa]",
                field: "E",
                val: editingMaterial.E,
              },
              {
                label: "Relación de Poisson (ν)",
                field: "nu",
                val: editingMaterial.nu,
              },
              {
                label: "Densidad (ρ) [kg/m³]",
                field: "rho",
                val: editingMaterial.rho,
              },
            ].map((item) => (
              <div key={item.field} className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  {item.label}
                </label>
                <input
                  type="number"
                  value={item.val}
                  onChange={(e) =>
                    updateMaterial(
                      editingMaterial.id,
                      item.field as any,
                      parseFloat(e.target.value),
                    )
                  }
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-unsaac-red/10 dark:border-brand-navy/30 rounded-lg px-3 py-2 text-sm outline-none dark:text-white"
                />
              </div>
            ))}
            <button
              onClick={() => setEditingMaterial(null)}
              className="w-full bg-unsaac-red hover:bg-unsaac-red/90 text-white py-3 rounded-xl font-bold text-sm transition-opacity mt-4"
            >
              Guardar
            </button>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!editingSection}
        onClose={() => setEditingSection(null)}
        title={`Editar Sección: ${editingSection?.name} `}
      >
        {editingSection && (
          <div className="space-y-5">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Nombre de la Sección
              </label>
              <input
                type="text"
                value={editingSection.name}
                onChange={(e) =>
                  updateSection(editingSection.id, "name", e.target.value)
                }
                className="w-full bg-gray-50 dark:bg-gray-900 border border-unsaac-red/10 dark:border-brand-navy/30 rounded-lg px-3 py-2 text-sm outline-none dark:text-white"
                placeholder="Ej. Viga I"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Área (m²)", field: "area", val: editingSection.area },
                { label: "Iz (m⁴)", field: "Iz", val: editingSection.Iz },
                { label: "Iy (m⁴)", field: "Iy", val: editingSection.Iy },
                { label: "J (m⁴)", field: "J", val: editingSection.J },
              ].map((item) => (
                <div key={item.field} className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    {item.label}
                  </label>
                  <input
                    type="number"
                    value={item.val}
                    onChange={(e) =>
                      updateSection(
                        editingSection.id,
                        item.field as any,
                        parseFloat(e.target.value),
                      )
                    }
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-unsaac-red/10 dark:border-brand-navy/30 rounded-lg px-3 py-2 text-sm outline-none dark:text-white"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={() => setEditingSection(null)}
              className="w-full bg-unsaac-red hover:bg-unsaac-red/90 text-white py-3 rounded-xl font-bold text-sm transition-opacity mt-4"
            >
              Guardar
            </button>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!editingLoad}
        onClose={handleCloseLoadModal}
        title={`Editar Carga #${editingLoad?.id} `}
      >
        {editingLoad && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Nombre de la Carga
              </label>
              <input
                type="text"
                value={editingLoad.name}
                onChange={(e) =>
                  updateLoad(editingLoad.id, "name", e.target.value)
                }
                className="w-full bg-gray-50 dark:bg-gray-900 border border-unsaac-red/10 dark:border-brand-navy/30 rounded-lg px-3 py-2 text-sm outline-none dark:text-white"
                placeholder="Ej. Carga Viva, Peso Propio, etc."
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Nodo de Aplicación
              </label>
              <select
                value={editingLoad.node_id}
                onChange={(e) => {
                  const newNodeId = parseInt(e.target.value);
                  if (isNodeRestricted(newNodeId)) {
                    alert(
                      "No se puede aplicar una carga en un nodo con restricciones (apoyo).",
                    );
                    return;
                  }
                  updateLoad(editingLoad.id, "node_id", newNodeId);
                }}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-unsaac-red/10 dark:border-brand-navy/30 rounded-lg px-3 py-2 text-sm outline-none dark:text-white"
              >
                {data.nodes.map((n) => {
                  const isRestricted = isNodeRestricted(n.id);
                  return (
                    <option
                      key={n.id}
                      value={n.id}
                      disabled={isRestricted}
                      className={isRestricted ? "text-gray-400" : ""}
                    >
                      Nodo {n.id} ({n.coords.join(", ")})
                      {isRestricted ? " - APOYO" : ""}
                    </option>
                  );
                })}
              </select>
              {isNodeRestricted(editingLoad.node_id) && (
                <p className="text-[10px] text-red-500 font-semibold">
                  ⚠️ Este nodo tiene restricciones (es un apoyo)
                </p>
              )}
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-bold text-unsaac-gold uppercase tracking-widest flex items-center gap-2">
                <ArrowDown size={12} /> Fuerzas (N)
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: "fx", label: "Fx" },
                  { id: "fy", label: "Fy" },
                  { id: "fz", label: "Fz" },
                ].map((f) => (
                  <div key={f.id} className="space-y-1">
                    <label className="text-[10px] text-gray-500 font-bold">
                      {f.label}
                    </label>
                    <input
                      type="number"
                      value={editingLoad[f.id as keyof Load] as number}
                      onChange={(e) =>
                        updateLoad(
                          editingLoad.id,
                          f.id as any,
                          parseFloat(e.target.value),
                        )
                      }
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-unsaac-red/10 dark:border-brand-navy/30 rounded-lg px-3 py-2 text-sm outline-none dark:text-white focus:border-unsaac-gold/50 transition-colors"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-bold text-brand-navy uppercase tracking-widest flex items-center gap-2">
                <RotateCcw size={12} /> Momentos (N·m)
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: "mx", label: "Mx" },
                  { id: "my", label: "My" },
                  { id: "mz", label: "Mz" },
                ].map((m) => (
                  <div key={m.id} className="space-y-1">
                    <label className="text-[10px] text-gray-500 font-bold">
                      {m.label}
                    </label>
                    <input
                      type="number"
                      value={editingLoad[m.id as keyof Load] as number}
                      onChange={(e) =>
                        updateLoad(
                          editingLoad.id,
                          m.id as any,
                          parseFloat(e.target.value),
                        )
                      }
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-unsaac-red/10 dark:border-brand-navy/30 rounded-lg px-3 py-2 text-sm outline-none dark:text-white focus:border-brand-navy/50 transition-colors"
                    />
                  </div>
                ))}
              </div>
            </div>

            {!isLoadValid(editingLoad) && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3">
                <p className="text-[11px] text-red-600 dark:text-red-400 font-semibold">
                  ⚠️ La carga debe tener al menos un componente diferente de
                  cero
                </p>
              </div>
            )}

            <button
              onClick={() => {
                if (!isLoadValid(editingLoad)) {
                  alert(
                    "La carga debe tener al menos un componente (Fx, Fy, Fz, Mx, My o Mz) diferente de cero.",
                  );
                  return;
                }
                if (isNodeRestricted(editingLoad.node_id)) {
                  const confirm = window.confirm(
                    "⚠️ Este nodo tiene restricciones (es un apoyo). ¿Está seguro de aplicar una carga aquí? Esto puede no tener sentido físico.",
                  );
                  if (!confirm) return;
                }
                // Cerramos usando la misma lógica unificada
                handleCloseLoadModal();
              }}
              className="w-full bg-unsaac-red hover:bg-unsaac-red/90 text-white py-3 rounded-xl font-bold text-sm transition-opacity mt-2"
            >
              Guardar Carga
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
};
export default StructureEditor;
