import React, { useState, useEffect, useRef } from "react";
import GraphicsView from "./GraphicsView";
import { Play, Loader2, Waves, ChevronRight } from "lucide-react";
import { useTheme } from "./ThemeContext";
import { authenticatedFetch } from "../lib/api";

const ModalAnalysisView: React.FC = () => {
  const [structure, setStructure] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [vizData, setVizData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [vizLoading, setVizLoading] = useState(false);
  const [scale, setScale] = useState(1.0);
  const [scaleRange, setScaleRange] = useState({ min: 0, max: 100, step: 1 });
  const [numModes, setNumModes] = useState(12);
  const [selectedMode, setSelectedMode] = useState<number>(0);
  const { theme } = useTheme();

  const vizCache = useRef<Map<string, any>>(new Map());
  const displacementCache = useRef<Map<string, any>>(new Map());

  const EmptyState = ({ msg }: { msg: string }) => (
    <div className="text-center py-20 text-gray-500 flex flex-col items-center justify-center bg-black/5 dark:bg-black/40 rounded-3xl border border-dashed border-border-light dark:border-border-dark backdrop-blur-sm">
      <Waves className="mb-4 opacity-10" size={48} />
      <p className="text-[10px] font-mono font-bold uppercase tracking-[0.2em]">
        {msg}
      </p>
    </div>
  );

  const loadStructure = () => {
    const saved = localStorage.getItem("fem_structure_data");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.restraints) {
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
          parsed.restraints = Object.fromEntries(
            Object.entries(parsed.restraints).map(
              ([nodeId, dofs]: [string, any]) => [
                nodeId,
                Array.isArray(dofs)
                  ? dofs.map((dof: string) => mapDofToBackend(dof))
                  : dofs,
              ],
            ),
          );
        }
        setStructure(parsed);
        setResults(null);
        setVizData(null);
        vizCache.current.clear();
        displacementCache.current.clear();
      } catch (e) {
        console.error("Error parsing", e);
      }
    }
  };

  useEffect(() => {
    loadStructure();
    const handleStorage = () => loadStructure();
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const runAnalysis = async () => {
    if (!structure) return;
    setLoading(true);
    vizCache.current.clear();
    try {
      const resAnalysis = await authenticatedFetch("/api/analysis/modal", {
        method: "POST",
        body: JSON.stringify({ structure, num_modes: numModes }),
      });
      if (!resAnalysis.ok) throw new Error("Kernel failure");
      const analysisData = await resAnalysis.json();
      setResults(analysisData);

      let optimalScale = scale;
      if (analysisData.frequencies?.length > 0) {
        if (structure.nodes?.length > 0 && analysisData.mode_shapes) {
          const coords = structure.nodes.map((n: any) => n.coords);
          const size =
            Math.max(
              Math.max(...coords.map((c: any) => c[0])) -
                Math.min(...coords.map((c: any) => c[0])),
              Math.max(...coords.map((c: any) => c[1])) -
                Math.min(...coords.map((c: any) => c[1])),
              Math.max(...coords.map((c: any) => c[2])) -
                Math.min(...coords.map((c: any) => c[2])),
            ) || 1.0;

          let maxDisp = 0;
          Object.values(analysisData.mode_shapes).forEach((shapes: any) => {
            const d = shapes[0];
            if (d) {
              const mag = Math.sqrt(d[0] ** 2 + d[1] ** 2 + d[2] ** 2);
              maxDisp = Math.max(maxDisp, mag);
            }
          });

          if (maxDisp > 0) {
            optimalScale = (size * 0.15) / maxDisp;
            const order = Math.pow(10, Math.floor(Math.log10(optimalScale)));
            setScaleRange({
              min: 0,
              max: optimalScale * 2.5,
              step: order / 20,
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

  const updateVisualization = async (
    modeIndex: number,
    currentScale: number,
    currentResults?: any,
  ) => {
    const activeResults = currentResults || results;
    if (!activeResults || !structure) return;

    const baseCacheKey = `${modeIndex}-${theme}`;
    if (vizCache.current.has(baseCacheKey)) {
      const baseViz = vizCache.current.get(baseCacheKey);
      const scaledData = applyClientScaling(baseViz, currentScale);
      setVizData(scaledData);
      return;
    }

    setVizLoading(true);
    try {
      const resViz = await authenticatedFetch(
        `/api/visualization/modal-results?theme=${theme}&scale=1.0&mode_index=${modeIndex}&num_modes=${numModes}`,
        {
          method: "POST",
          body: JSON.stringify(structure),
        },
      );

      if (resViz.ok) {
        const vizResData = await resViz.json();
        vizCache.current.set(baseCacheKey, vizResData);
        const scaledData = applyClientScaling(vizResData, currentScale);
        setVizData(scaledData);
      }
    } catch (e: any) {
      console.error("Error fetching viz base:", e);
    } finally {
      setVizLoading(false);
    }
  };

  const applyClientScaling = (vizData: any, scale: number) => {
    if (!vizData || !vizData.data) return vizData;
    const newViz = JSON.parse(JSON.stringify(vizData));
    newViz.data.forEach((trace: any) => {
      if (trace.customdata && trace.mode === "lines") {
        const n = trace.customdata.length;
        const newX = new Array(n);
        const newY = new Array(n);
        const newZ = new Array(n);

        for (let i = 0; i < n; i++) {
          const row = trace.customdata[i];
          if (!row || row[0] === null) {
            newX[i] = null;
            newY[i] = null;
            newZ[i] = null;
          } else {
            newX[i] = row[0] + row[3] * scale;
            newY[i] = row[1] + row[4] * scale;
            newZ[i] = row[2] + row[5] * scale;
          }
        }
        trace.x = newX;
        trace.y = newY;
        trace.z = newZ;
      }
    });
    return newViz;
  };

  useEffect(() => {
    if (results && structure) {
      updateVisualization(selectedMode, scale);
    }
  }, [scale, selectedMode, theme]);

  const formatFreq = (val: number) => {
    if (Math.abs(val) < 1e-9) return "0.00";
    if (Math.abs(val) < 0.01) return val.toExponential(3);
    return val.toFixed(3);
  };

  return (
    <div className="h-full w-full overflow-hidden flex flex-col-reverse lg:flex-row font-sans relative bg-white dark:bg-bg-dark">
      <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-20 z-0"></div>

      <div className="relative z-40 w-full lg:w-[380px] xl:w-[420px] h-[50vh] lg:h-full flex flex-col bg-white/80 dark:bg-[#0B0F1A]/90 backdrop-blur-xl border-t lg:border-t-0 lg:border-r border-border-light dark:border-border-dark shrink-0">
        <div className="shrink-0 p-5 lg:p-6 border-b border-border-light dark:border-border-dark">
          <div className="space-y-4 lg:space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[9px] text-accent-primary font-bold uppercase tracking-[0.2em] mb-1 font-mono">
                  Structural Engine
                </p>
                <h1 className="text-xl lg:text-2xl font-display font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none">
                  Modal <span className="text-accent-primary">Analysis</span>
                </h1>
              </div>
            </div>
            <button
              onClick={runAnalysis}
              disabled={loading || !structure}
              className="w-full flex items-center justify-center gap-2 bg-accent-primary hover:bg-accent-primary/90 disabled:opacity-50 text-white px-5 py-3 rounded-xl font-display font-bold text-xs uppercase tracking-wider shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Play size={16} />
              )}
              Solve Modal Analysis
            </button>
          </div>

          <div className="space-y-3 lg:space-y-4 mt-4 lg:mt-6">
            <div className="premium-card-inner p-3 lg:p-4 flex items-center justify-between">
              <label className="text-[9px] lg:text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest font-mono">
                Modes to compute
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={numModes}
                onChange={(e) => setNumModes(parseInt(e.target.value) || 1)}
                className="w-12 lg:w-14 px-1 lg:px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-accent-primary focus:outline-none text-center"
              />
            </div>

            <div className="premium-card-inner p-3 lg:p-4 space-y-2 lg:space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[9px] lg:text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest font-mono">
                  Deformation Scale
                </label>
                <span className="text-[9px] lg:text-[10px] font-mono font-bold text-accent-primary bg-accent-primary/10 px-2 py-0.5 rounded-md">
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
        </div>

        <div className="shrink-0 px-3 py-2 lg:px-6 lg:py-4">
          <div className="flex p-1 bg-gray-100/50 dark:bg-black/20 rounded-2xl border border-border-light dark:border-border-dark">
            <div className="flex-1 py-2 px-2 text-[9px] lg:text-[10px] font-bold uppercase tracking-tight rounded-xl bg-white dark:bg-bg-dark text-accent-primary shadow-sm ring-1 ring-black/5 dark:ring-white/5 text-center font-display">
              Vibration Modes
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 lg:px-6 py-2 lg:py-4 pb-6 space-y-2 lg:space-y-3">
          {results?.frequencies ? (
            results.frequencies.map((freq: number, idx: number) => (
              <button
                key={idx}
                onClick={() => setSelectedMode(idx)}
                className={`w-full text-left p-4 premium-card flex items-center justify-between group cursor-pointer ${selectedMode === idx ? "ring-2 ring-accent-primary/50 bg-accent-primary/5 border-accent-primary/30 scale-[1.02]" : ""}`}
              >
                <div className="flex items-center gap-4">
                  <span
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black transition-colors ${selectedMode === idx ? "bg-accent-primary text-white" : "bg-gray-50 dark:bg-bg-dark text-gray-400 border border-border-light dark:border-border-dark"}`}
                  >
                    {idx + 1}
                  </span>
                  <div className="flex flex-col">
                    <span
                      className={`text-sm font-black font-display ${selectedMode === idx ? "text-accent-primary" : "text-gray-700 dark:text-gray-300"}`}
                    >
                      {formatFreq(freq)} Hz
                    </span>
                    <span className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-tighter">
                      {formatFreq(freq * 2 * Math.PI)} rad/s
                    </span>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <span className="text-[10px] font-mono font-bold text-gray-500 dark:text-gray-400">
                    {freq > 1e-9 ? (1 / freq).toFixed(3) + "s" : "∞"}
                  </span>
                  <ChevronRight
                    size={14}
                    className={`transition-transform ${selectedMode === idx ? "text-accent-primary translate-x-1" : "text-gray-300 dark:text-gray-700"}`}
                  />
                </div>
              </button>
            ))
          ) : (
            <EmptyState msg="Initialize modal solver..." />
          )}
        </div>
      </div>

      {/* RIGHT PANEL - 3D Visualization */}
      <div className="relative z-10 flex-1 p-4 lg:p-8 flex flex-col overflow-hidden bg-white dark:bg-bg-dark h-[55vh] lg:h-full">
        <div className="bg-white/80 dark:bg-bg-dark-panel/90 backdrop-blur-md rounded-[2.5rem] border border-border-light dark:border-border-dark overflow-hidden shadow-2xl transition-all hover:border-unsaac-gold/30 group h-full relative">
          {results?.frequencies && (
            <div className="absolute top-6 left-6 z-10 p-4 lg:p-5 premium-card-inner backdrop-blur-xl border-accent-primary/20 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex items-center gap-3 mb-2 lg:mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-accent-primary animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>
                <h2 className="text-[10px] lg:text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] font-mono">
                  Mode {selectedMode + 1}
                </h2>
              </div>
              <div className="flex gap-4 lg:gap-6">
                <div className="flex flex-col">
                  <span className="text-[7px] lg:text-[8px] font-bold text-gray-500 uppercase font-mono">
                    Frequency
                  </span>
                  <span className="text-xs lg:text-sm font-black text-accent-primary font-display">
                    {formatFreq(results.frequencies[selectedMode])} Hz
                  </span>
                </div>
                <div className="flex flex-col border-l border-border-light dark:border-border-dark pl-4 lg:pl-6">
                  <span className="text-[7px] lg:text-[8px] font-bold text-gray-500 uppercase font-mono">
                    Period
                  </span>
                  <span className="text-xs lg:text-sm font-black text-gray-700 dark:text-gray-200 font-display">
                    {results.frequencies[selectedMode] > 1e-9
                      ? (1 / results.frequencies[selectedMode]).toFixed(4)
                      : "∞"}{" "}
                    s
                  </span>
                </div>
              </div>
            </div>
          )}
          <GraphicsView
            data={vizData}
            loading={loading || vizLoading}
            error={null}
            className="h-full w-full bg-transparent! dark:bg-transparent!"
          />
        </div>
      </div>
    </div>
  );
};

export default ModalAnalysisView;
