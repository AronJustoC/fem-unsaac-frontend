import React, { useState, useEffect } from 'react';
import GraphicsView from './GraphicsView';
import { Play, Loader2, Music } from 'lucide-react';
import { useTheme } from './ThemeContext';
import { authenticatedFetch } from '../lib/api';

const ModalAnalysisView: React.FC = () => {
  const [structure, setStructure] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [vizData, setVizData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [scale, setScale] = useState(1.0);
  const [scaleRange, setScaleRange] = useState({ min: 0, max: 100, step: 1 });
  const [numModes, setNumModes] = useState(12);
  const [selectedMode, setSelectedMode] = useState<number>(0);
  const { theme } = useTheme();

  const loadStructure = () => {
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
    try {
      const resAnalysis = await authenticatedFetch('/api/analysis/modal', {
        method: 'POST',
        body: JSON.stringify({ structure, num_modes: numModes }),
      });
      if (!resAnalysis.ok) throw new Error("Kernel failure");
      const analysisData = await resAnalysis.json();
      setResults(analysisData);
      
      let optimalScale = scale;
      if (analysisData.frequencies?.length > 0) {
        // Auto-scale logic based on first mode
        if (structure.nodes?.length > 0 && analysisData.mode_shapes) {
           const coords = structure.nodes.map((n: any) => n.coords);
           const size = Math.max(
             Math.max(...coords.map((c:any)=>c[0])) - Math.min(...coords.map((c:any)=>c[0])),
             Math.max(...coords.map((c:any)=>c[1])) - Math.min(...coords.map((c:any)=>c[1])),
             Math.max(...coords.map((c:any)=>c[2])) - Math.min(...coords.map((c:any)=>c[2]))
           ) || 1.0;

           let maxDisp = 0;
           // Check first mode (index 0)
           Object.values(analysisData.mode_shapes).forEach((shapes: any) => {
             const d = shapes[0]; // First mode
             if (d) {
                const mag = Math.sqrt(d[0]**2 + d[1]**2 + d[2]**2);
                maxDisp = Math.max(maxDisp, mag);
             }
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

        setSelectedMode(0);
        setScale(optimalScale);
        await updateVisualization(0, optimalScale, analysisData);
      }
    } catch (err: any) {
      console.error("Analysis error:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateVisualization = async (modeIndex: number, currentScale: number, currentResults?: any) => {
    if (!currentResults && !results) return;
    try {
      const resViz = await authenticatedFetch(`/api/visualization/modal-results?theme=${theme}&scale=${currentScale}&mode_index=${modeIndex}&num_modes=${numModes}`, {
        method: 'POST',
        body: JSON.stringify(structure),
      });
      if (resViz.ok) {
        const vizResData = await resViz.json();
        setVizData(vizResData);
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (results && structure) {
      updateVisualization(selectedMode, scale);
    }
  }, [scale, selectedMode]);

  const EmptyState = ({ msg }: { msg: string }) => (
    <div className="text-center py-20 text-gray-500 flex flex-col items-center justify-center bg-black/5 dark:bg-black/40 rounded-[2rem] border border-dashed border-border-light dark:border-border-dark">
      <Music className="mb-4 opacity-10" size={48} />
      <p className="text-[10px] font-black uppercase tracking-[0.2em]">{msg}</p>
    </div>
  );

  const formatFreq = (val: number) => {
    if (Math.abs(val) < 1e-9) return "0.00";
    if (Math.abs(val) < 0.01) return val.toExponential(3);
    return val.toFixed(3);
  };

  return (
    <div className="h-screen w-full overflow-hidden flex font-sans relative">
      <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-30 z-0"></div>

      {/* LEFT SIDEBAR - Controls & Results */}
      <div className="relative z-10 w-full lg:w-[35%] flex flex-col bg-white/95 dark:bg-bg-dark-panel/95 backdrop-blur-md border-r border-border-light dark:border-border-dark overflow-hidden">
        {/* SIDEBAR HEADER */}
        <div className="shrink-0 p-6 border-b border-border-light dark:border-border-dark">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[8px] text-gray-400 font-bold uppercase tracking-[0.3em] mb-1">FRECUENCIA DINÁMICA</p>
              <h1 className="text-2xl font-display font-black text-gray-900 dark:text-white uppercase tracking-tighter">
                TERMINAL MODAL
              </h1>
            </div>
            <button
              onClick={runAnalysis}
              disabled={loading || !structure}
              className="flex items-center gap-2 bg-unsaac-red hover:bg-unsaac-red/90 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              {loading ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />}
              RESOLVER
            </button>
          </div>

          {/* Controls: Modes + Scale */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-black/20 p-3 rounded-xl border border-unsaac-red/10 dark:border-brand-navy/30 flex-1">
              <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest shrink-0">MODOS</label>
              <input
                type="number" min="1" max="50" value={numModes}
                onChange={(e) => setNumModes(parseInt(e.target.value) || 1)}
                className="w-16 px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-unsaac-red focus:outline-none text-center"
              />
            </div>
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-black/20 p-3 rounded-xl border border-unsaac-red/10 dark:border-brand-navy/30 flex-1">
              <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest shrink-0">ESCALA</label>
              <input
                type="range" 
                min={scaleRange.min} 
                max={scaleRange.max} 
                step={scaleRange.step} 
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                className="flex-1 h-1 bg-gray-200 dark:bg-bg-dark rounded-lg appearance-none cursor-pointer accent-unsaac-red"
              />
              <input
                type="number" value={scale.toExponential(2)}
                readOnly
                className="w-20 px-2 py-1 text-[10px] font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-unsaac-red focus:outline-none text-center"
              />
            </div>
          </div>
        </div>

        {/* TAB LABEL */}
        <div className="shrink-0 px-6 pt-4">
          <div className="flex p-1 bg-gray-100 dark:bg-black/40 rounded-xl border border-unsaac-red/10 dark:border-brand-navy/30">
            <div className="flex-1 py-2 px-2 text-[8px] font-black uppercase tracking-wider bg-white dark:bg-bg-dark text-unsaac-gold rounded-lg shadow-md">
              MODOS DE VIBRACIÓN
            </div>
          </div>
        </div>

        {/* RESULTS DATA - Scrollable */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4 space-y-3">
          {results?.frequencies ? results.frequencies.map((freq: number, idx: number) => (
            <button key={idx} onClick={() => setSelectedMode(idx)} className={`w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between group cursor-pointer ${selectedMode === idx ? 'bg-unsaac-gold/5 border-unsaac-gold/40 scale-[1.02] shadow-lg' : 'bg-gray-50 dark:bg-black/20 border-unsaac-red/10 dark:border-brand-navy/30 hover:border-unsaac-gold/30'}`}>
              <div className="flex items-center gap-4">
                <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black ${selectedMode === idx ? 'bg-unsaac-gold text-white' : 'bg-white dark:bg-bg-dark text-gray-400 border border-border-light dark:border-border-dark'}`}>{idx + 1}</span>
                <div className="flex flex-col">
                  <span className={`text-sm font-black ${selectedMode === idx ? 'text-unsaac-gold' : 'text-gray-700 dark:text-gray-300'}`}>{formatFreq(freq)} Hz</span>
                  <span className="text-[9px] font-mono font-bold text-gray-400 uppercase">{formatFreq(freq * 2 * Math.PI)} rad/s</span>
                </div>
              </div>
              <div className="text-right flex flex-col font-mono text-[11px] font-bold text-gray-500 dark:text-gray-400">
                {freq > 1e-9 ? (1 / freq).toFixed(2) + "s" : "∞"}
              </div>
            </button>
          )) : <EmptyState msg="Iniciar resolvedor modal..." />}
        </div>
      </div>

      {/* RIGHT PANEL - 3D Visualization */}
      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 bg-white dark:bg-bg-dark relative">
          {/* Optional overlay for frequency display */}
          {results?.frequencies && (
            <div className="absolute top-6 left-6 z-10 bg-white/90 dark:bg-bg-dark-panel/90 backdrop-blur-sm px-4 py-3 rounded-xl border border-unsaac-red/20 dark:border-brand-navy/30 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-unsaac-red animate-pulse"></div>
                <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Modo {selectedMode + 1}</h2>
              </div>
              <div className="flex gap-4 font-mono mt-2">
                <span className="text-xs font-bold text-unsaac-red">{formatFreq(results.frequencies[selectedMode])} Hz</span>
                <span className="text-xs font-bold text-gray-400">{results.frequencies[selectedMode] > 1e-9 ? (1 / results.frequencies[selectedMode]).toFixed(4) : "∞"} s</span>
              </div>
            </div>
          )}
          <GraphicsView data={vizData} loading={loading} error={null} />
        </div>
      </div>
    </div>
  );
};

export default ModalAnalysisView;
