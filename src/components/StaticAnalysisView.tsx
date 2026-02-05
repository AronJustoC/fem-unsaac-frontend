import React, { useState, useEffect } from 'react';
import GraphicsView from './GraphicsView';
import { Play, Loader2, ChevronRight, Activity } from 'lucide-react';
import { useTheme } from './ThemeContext';
import { authenticatedFetch } from '../lib/api';

const StaticAnalysisView: React.FC = () => {
  const [structure, setStructure] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [vizData, setVizData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useTheme();

  const [scale, setScale] = useState(1.0);
  const [scaleRange, setScaleRange] = useState({ min: 0, max: 100, step: 1 });
  const [showTables, setShowTables] = useState<string>('displacements');

  const EmptyState = ({ msg }: { msg: string }) => (
    <div className="text-center py-20 text-gray-500 flex flex-col items-center justify-center bg-black/5 dark:bg-black/20 rounded-3xl border border-dashed border-border-light dark:border-border-dark backdrop-blur-sm">
      <Activity className="mb-4 opacity-10" size={48} />
      <p className="text-[10px] font-mono font-bold uppercase tracking-[0.2em]">{msg}</p>
    </div>
  );

  const loadStructure = () => {
    const saved = localStorage.getItem('fem_structure_data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setStructure(parsed);
        setResults(null);
        setVizData(null);
      } catch (e) {
        console.error("Error parsing", e);
      }
    }
  };

  useEffect(() => {
    loadStructure();
    const handleStorage = () => loadStructure();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const runAnalysis = async () => {
    if (!structure) return;
    setLoading(true);
    setError(null);
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
          optimalScale = (size * 0.15) / maxDisp;
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
      setError(err.message);
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
  }, [scale, results, structure, theme]);


  return (
    <div className="h-full w-full overflow-hidden flex flex-col-reverse lg:flex-row font-sans relative bg-white dark:bg-bg-dark">
      <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-20 z-0"></div>

      <div className="relative z-40 w-full lg:w-[380px] xl:w-[420px] h-[45vh] lg:h-full flex flex-col bg-white/80 dark:bg-[#0B0F1A]/90 backdrop-blur-xl border-t lg:border-t-0 lg:border-r border-border-light dark:border-border-dark shrink-0 overflow-hidden">
        <div className="shrink-0 p-3 lg:p-6 border-b border-border-light dark:border-border-dark">
          <div className="space-y-2 lg:space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[8px] lg:text-[9px] text-accent-primary font-bold uppercase tracking-[0.2em] mb-1 font-mono">Structural Engine</p>
                <h1 className="text-base lg:text-2xl font-display font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none">
                  Static <span className="text-accent-primary">Analysis</span>
                </h1>
              </div>
            </div>
            <button
              onClick={runAnalysis}
              disabled={loading || !structure}
              className="w-full flex items-center justify-center gap-2 bg-accent-primary hover:bg-accent-primary/90 disabled:opacity-50 text-white px-4 py-2 lg:px-5 lg:py-3 rounded-xl font-display font-bold text-xs uppercase tracking-wider shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              {loading ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />}
              Compute Analysis
            </button>
          </div>

          {/* Scale Slider */}
          <div className="premium-card-inner p-2 lg:p-4 space-y-1 lg:space-y-3 mt-2 lg:mt-0">
            <div className="flex items-center justify-between">
              <label className="text-[8px] lg:text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest font-mono">Scale</label>
              <span className="text-[8px] lg:text-[10px] font-mono font-bold text-accent-primary bg-accent-primary/10 px-2 py-0.5 rounded-md">
                {scale.toExponential(2)}
              </span>
            </div>
            <input
              type="range" 
              min={scaleRange.min} 
              max={scaleRange.max} 
              step={scaleRange.step} 
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="w-full h-1 bg-gray-200 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-accent-primary"
            />
          </div>
        </div>

        {/* TABS */}
        <div className="shrink-0 px-3 py-2 lg:px-6 lg:py-4">
          <div className="flex p-1 bg-gray-100/50 dark:bg-black/20 rounded-2xl border border-border-light dark:border-border-dark">
            {[
              { id: 'displacements', label: 'Displacements' },
              { id: 'reactions', label: 'Reactions' },
              { id: 'forces', label: 'Internal Forces' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setShowTables(tab.id)}
                className={`flex-1 py-2.5 px-2 text-[10px] font-bold uppercase tracking-tight rounded-xl transition-all cursor-pointer font-display ${
                  showTables === tab.id 
                    ? 'bg-white dark:bg-bg-dark text-accent-primary shadow-sm ring-1 ring-black/5 dark:ring-white/5' 
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* RESULTS DATA - Scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 lg:px-6 pb-6 space-y-2 lg:space-y-4">
          {showTables === 'displacements' && (
            results?.displacements ? Object.entries(results.displacements).map(([nodeId, disp]: [string, any]) => (
              <div key={nodeId} className="premium-card p-4 group">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-accent-primary rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                    <span className="text-xs font-display font-black text-gray-900 dark:text-white uppercase tracking-widest">Node {nodeId}</span>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-accent-primary transition-colors" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((axis, i) => (
                    <div key={axis} className="premium-card-inner p-2 group-hover:border-accent-primary/20 transition-all">
                      <span className="text-[8px] text-gray-500 font-bold uppercase mb-0.5 block tracking-wider font-mono">{axis}</span>
                      <span className="text-[11px] font-mono font-bold text-gray-900 dark:text-gray-100 truncate block tracking-tighter">
                        {disp[i]?.toExponential(4) || "0.0000E+0"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )) : <EmptyState msg="Awaiting compute results..." />
          )}

          {showTables === 'reactions' && (
            results?.reactions && Object.keys(results.reactions).length > 0 ? Object.entries(results.reactions).map(([nodeId, reac]: [string, any]) => (
              <div key={nodeId} className="premium-card p-4 group">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-accent-secondary rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                    <span className="text-xs font-display font-black text-gray-900 dark:text-white uppercase tracking-widest">Reaction {nodeId}</span>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-accent-secondary transition-colors" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'].map((axis, i) => {
                    const val = reac[i];
                    const isSignificant = Math.abs(val) > 1e-4;
                    return (
                      <div key={axis} className={`premium-card-inner p-2 transition-all ${isSignificant ? 'opacity-100 group-hover:border-accent-secondary/20' : 'opacity-30'}`}>
                        <span className="text-[8px] text-gray-500 font-bold uppercase mb-0.5 block font-mono">{axis}</span>
                        <span className={`text-[11px] font-mono font-bold truncate block tracking-tighter ${isSignificant ? 'text-accent-secondary' : 'text-gray-500'}`}>
                          {val?.toFixed(4) || "0.0000"}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )) : <EmptyState msg="No significant reactions found." />
          )}

          {showTables === 'forces' && (
            results?.element_forces ? Object.entries(results.element_forces).map(([elId, forces]: [string, any]) => (
              <div key={elId} className="premium-card p-4 group">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-accent-danger rounded-full shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
                    <span className="text-xs font-display font-black text-gray-900 dark:text-white uppercase tracking-widest">Element {elId}</span>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-accent-danger transition-colors" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="premium-card-inner p-2 group-hover:border-accent-danger/20 transition-all">
                    <span className="text-[8px] text-gray-500 font-bold uppercase mb-0.5 block font-mono">Axial (N)</span>
                    <span className="text-[11px] font-mono font-bold text-gray-900 dark:text-gray-100 truncate block tracking-tighter">{forces.N1?.toFixed(4)}</span>
                  </div>
                  <div className="premium-card-inner p-2 group-hover:border-accent-danger/20 transition-all">
                    <span className="text-[8px] text-gray-500 font-bold uppercase mb-0.5 block font-mono">Moment Y (Nm)</span>
                    <span className="text-[11px] font-mono font-bold text-gray-900 dark:text-gray-100 truncate block tracking-tighter">{forces.M1y?.toFixed(4)}</span>
                  </div>
                </div>
              </div>
            )) : <EmptyState msg="Internal mechanics not calculated." />
          )}
        </div>
      </div>

      {/* RIGHT PANEL - 3D Visualization */}
      <div className="relative z-10 flex-1 p-4 lg:p-8 flex flex-col overflow-hidden bg-white dark:bg-bg-dark h-[55vh] lg:h-full">
        <div className="bg-white/80 dark:bg-bg-dark-panel/90 backdrop-blur-md rounded-[2.5rem] border border-border-light dark:border-border-dark overflow-hidden shadow-2xl transition-all hover:border-unsaac-gold/30 group h-full relative">
          <GraphicsView 
            data={vizData} 
            loading={loading} 
            error={error} 
            className="h-full w-full bg-transparent! dark:bg-transparent!" 
          />
          
          {results && (
            <div className="absolute top-6 left-6 z-10 p-4 premium-card-inner backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-accent-secondary animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                <span className="text-[10px] font-mono font-black text-gray-400 uppercase tracking-widest">Static Solution Ready</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StaticAnalysisView;
