import React, { useState, useEffect } from 'react';
import GraphicsView from './GraphicsView';
import { Play, Table, Loader2 } from 'lucide-react';
import { useTheme } from './ThemeContext';
import { authenticatedFetch } from '../lib/api';

const StaticAnalysisView: React.FC = () => {
  const [structure, setStructure] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [vizData, setVizData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.0);
  const [scaleRange, setScaleRange] = useState({ min: 0, max: 200, step: 1 });
  const [showTables, setShowTables] = useState('displacements');
  const { theme } = useTheme();

  const EmptyState = ({ msg }: { msg: string }) => (
    <div className="text-center py-20 text-gray-500 flex flex-col items-center justify-center bg-black/5 dark:bg-black/40 rounded-[2rem] border border-dashed border-border-light dark:border-border-dark">
      <Table className="mb-4 opacity-10" size={48} />
      <p className="text-[10px] font-black uppercase tracking-[0.2em]">{msg}</p>
    </div>
  );

  useEffect(() => {
    const saved = localStorage.getItem('fem_structure_data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.restraints) {
          const mapDofToBackend = (dof: string): string => {
            const mapping: Record<string, string> = {
              'tx': 'ux', 'ty': 'uy', 'tz': 'uz',
              'rx': 'rx', 'ry': 'ry', 'rz': 'rz'
            };
            return mapping[dof.toLowerCase()] || dof.toLowerCase();
          };
          parsed.restraints = Object.fromEntries(
            Object.entries(parsed.restraints).map(([nodeId, dofs]: [string, any]) => [
              nodeId,
              Array.isArray(dofs) ? dofs.map((dof: string) => mapDofToBackend(dof)) : dofs
            ])
          );
        }
        setStructure(parsed);
      } catch (e) {
        console.error("Error parsing structure data", e);
      }
    }
  }, []);

  const runAnalysis = async () => {
    if (!structure) return;
    setLoading(true);
    try {
      const resAnalysis = await authenticatedFetch('/api/analysis/static', {
        method: 'POST',
        body: JSON.stringify(structure),
      });

      if (!resAnalysis.ok) {
        const errorData = await resAnalysis.json().catch(() => ({ detail: 'Error desconocido' }));
        throw new Error(errorData.detail || "Error en el cálculo estructural");
      }
      const analysisData = await resAnalysis.json();
      setResults(analysisData);

      // Auto-scale logic
      let optimalScale = scale;
      if (analysisData.displacements && structure.nodes.length > 0) {
        const coords = structure.nodes.map((n: any) => n.coords);
        const xs = coords.map((c: any) => c[0]);
        const ys = coords.map((c: any) => c[1]);
        const zs = coords.map((c: any) => c[2]);
        const size = Math.max(
          Math.max(...xs) - Math.min(...xs),
          Math.max(...ys) - Math.min(...ys),
          Math.max(...zs) - Math.min(...zs)
        ) || 1.0;

        let maxDisp = 0;
        Object.values(analysisData.displacements).forEach((d: any) => {
          const mag = Math.sqrt(d[0] ** 2 + d[1] ** 2 + d[2] ** 2);
          maxDisp = Math.max(maxDisp, mag);
        });

        if (maxDisp > 0) {
          // Target deformation: 15% of model size
          optimalScale = (size * 0.15) / maxDisp;
          
          // Clamp scale to reasonable limits for UI sliders (unless extreme)
          if (optimalScale < 1e-6 || optimalScale > 1e6) {
             console.warn("Extreme scale detected:", optimalScale);
          }

          // Update slider range dynamically
          const order = Math.pow(10, Math.floor(Math.log10(optimalScale)));
          setScaleRange({
            min: 0,
            max: optimalScale * 2.5,
            step: order / 20
          });
        }
      }
      setScale(optimalScale);

      const resViz = await authenticatedFetch(`/api/visualization/static-results?theme=${theme}&scale=${optimalScale}`, {
        method: 'POST',
        body: JSON.stringify(structure),
      });

      if (!resViz.ok) throw new Error("Error al generar la visualización");
      const vizResData = await resViz.json();
      setVizData(vizResData);

    } catch (err: any) {
      console.error("Analysis error:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (results && structure) {
      const updateViz = async () => {
        try {
          const resViz = await authenticatedFetch(`/api/visualization/static-results?theme=${theme}&scale=${scale}`, {
            method: 'POST',
            body: JSON.stringify(structure),
          });
          if (resViz.ok) {
            const data = await resViz.json();
            setVizData(data);
          }
        } catch (e) { }
      };
      updateViz();
    }
  }, [scale]);

  return (
    <div className="h-screen w-full overflow-hidden flex font-sans relative">
      <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-30 z-0"></div>

      {/* LEFT SIDEBAR - Controls & Results */}
      <div className="relative z-10 w-full lg:w-[35%] flex flex-col bg-white/95 dark:bg-bg-dark-panel/95 backdrop-blur-md border-r border-border-light dark:border-border-dark overflow-hidden">
        {/* SIDEBAR HEADER */}
        <div className="shrink-0 p-6 border-b border-border-light dark:border-border-dark">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[8px] text-gray-400 font-bold uppercase tracking-[0.3em] mb-1">STRUCTURAL VERIFICATION</p>
              <h1 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">
                STATIC TERMINAL
              </h1>
            </div>
            <button
              onClick={runAnalysis}
              disabled={loading || !structure}
              className="flex items-center gap-2 bg-brand-blue hover:bg-brand-blue/90 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              {loading ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />}
              COMPUTE
            </button>
          </div>

          {/* Scale Slider */}
          <div className="flex items-center gap-3 bg-gray-50 dark:bg-black/20 p-3 rounded-xl border border-border-light dark:border-border-dark">
            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest shrink-0">SCALE</label>
            <input
              type="range" 
              min={scaleRange.min} 
              max={scaleRange.max} 
              step={scaleRange.step} 
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="flex-1 h-1 bg-gray-200 dark:bg-bg-dark rounded-lg appearance-none cursor-pointer accent-brand-blue"
            />
            <input
              type="number" value={scale.toExponential(2)}
              readOnly
              className="w-20 px-2 py-1 text-[10px] font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-brand-blue focus:outline-none text-center"
            />
          </div>
        </div>

        {/* TABS */}
        <div className="shrink-0 px-6 pt-4">
          <div className="flex p-1 bg-gray-100 dark:bg-black/40 rounded-xl border border-border-light dark:border-border-dark">
            {[
              { id: 'displacements', label: 'DISPLACEMENTS', color: 'text-brand-blue' },
              { id: 'reactions', label: 'REACTIONS', color: 'text-brand-green' },
              { id: 'forces', label: 'INTERNAL FORCES', color: 'text-brand-magenta' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setShowTables(tab.id)}
                className={`flex-1 py-2 px-2 text-[8px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                  showTables === tab.id ? `bg-white dark:bg-bg-dark ${tab.color} shadow-md` : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* RESULTS DATA - Scrollable */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4 space-y-4">
          {showTables === 'displacements' && (
            results?.displacements ? Object.entries(results.displacements).map(([nodeId, disp]: [string, any]) => (
              <div key={nodeId} className="p-4 bg-gray-50 dark:bg-black/20 rounded-xl border border-border-light dark:border-border-dark group hover:border-brand-blue/50 transition-all duration-300">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-4 bg-brand-blue rounded-full"></div>
                    <span className="text-[10px] font-black text-brand-blue uppercase tracking-widest">Node {nodeId}</span>
                  </div>
                  <span className="text-[8px] font-mono font-bold text-gray-400">SI: m / rad</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((axis, i) => (
                    <div key={axis} className="bg-white dark:bg-bg-dark p-2 rounded-lg border border-border-light dark:border-border-dark group-hover:border-brand-blue/20 transition-all">
                      <span className="text-[7px] text-gray-400 font-black uppercase mb-0.5 block tracking-tighter">{axis}</span>
                      <span className="text-[10px] font-mono font-bold text-gray-900 dark:text-brand-blue truncate block">{disp[i]?.toExponential(4) || "0.0000E+0"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )) : <EmptyState msg="Awaiting structural computation..." />
          )}

          {showTables === 'reactions' && (
            results?.reactions && Object.keys(results.reactions).length > 0 ? Object.entries(results.reactions).map(([nodeId, reac]: [string, any]) => (
              <div key={nodeId} className="p-4 bg-gray-50 dark:bg-black/20 rounded-xl border border-border-light dark:border-border-dark group hover:border-brand-green/50 transition-all duration-300">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-4 bg-brand-green rounded-full"></div>
                    <span className="text-[10px] font-black text-brand-green uppercase tracking-widest">Reaction {nodeId}</span>
                  </div>
                  <span className="text-[8px] font-mono font-bold text-gray-400">SI: N / Nm</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'].map((axis, i) => {
                    const val = reac[i];
                    const isSignificant = Math.abs(val) > 1e-4;
                    return (
                      <div key={axis} className={`bg-white dark:bg-bg-dark p-2 rounded-lg border border-border-light dark:border-border-dark transition-all ${isSignificant ? 'opacity-100' : 'opacity-20'}`}>
                        <span className="text-[7px] text-gray-400 font-black uppercase mb-0.5 block">{axis}</span>
                        <span className={`text-[10px] font-mono font-bold truncate block ${isSignificant ? 'text-brand-green' : 'text-gray-500'}`}>{val?.toFixed(4) || "0.0000"}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )) : <EmptyState msg="No significant reactions detected." />
          )}

          {showTables === 'forces' && (
            results?.element_forces ? Object.entries(results.element_forces).map(([elId, forces]: [string, any]) => (
              <div key={elId} className="p-4 bg-gray-50 dark:bg-black/20 rounded-xl border border-border-light dark:border-border-dark group hover:border-brand-magenta/50 transition-all duration-300">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-4 bg-brand-magenta rounded-full"></div>
                    <span className="text-[10px] font-black text-brand-magenta uppercase tracking-widest">Element {elId}</span>
                  </div>
                  <span className="text-[8px] font-mono font-bold text-gray-400">Local Vector</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white dark:bg-bg-dark p-2 rounded-lg border border-border-light dark:border-border-dark group-hover:border-brand-magenta/20 transition-all">
                    <span className="text-[7px] text-gray-400 font-black uppercase mb-0.5 block">Axial (N)</span>
                    <span className="text-[10px] font-mono font-bold text-gray-900 dark:text-brand-magenta truncate block">{forces.N1?.toFixed(4)}</span>
                  </div>
                  <div className="bg-white dark:bg-bg-dark p-2 rounded-lg border border-border-light dark:border-border-dark group-hover:border-brand-magenta/20 transition-all">
                    <span className="text-[7px] text-gray-400 font-black uppercase mb-0.5 block">Moment Y (Nm)</span>
                    <span className="text-[10px] font-mono font-bold text-gray-900 dark:text-brand-magenta truncate block">{forces.M1y?.toFixed(4)}</span>
                  </div>
                </div>
              </div>
            )) : <EmptyState msg="Internal mechanics not computed." />
          )}
        </div>
      </div>

      {/* RIGHT PANEL - 3D Visualization */}
      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 bg-white dark:bg-bg-dark relative">
          <GraphicsView data={vizData} loading={loading} error={null} />
        </div>
      </div>
    </div>
  );
};

export default StaticAnalysisView;
