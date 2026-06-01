import React, { useEffect, useMemo, useState } from "react";
import GraphicsView from "./GraphicsView";
import {
  AlertTriangle,
  BarChart3,
  ChevronRight,
  Gauge,
  Loader2,
  Play,
  SlidersHorizontal,
  Waves,
} from "lucide-react";
import { useTheme } from "./ThemeContext";
import { authenticatedFetch } from "../lib/api";
import { getPlotlyTheme } from "../lib/plotly_theme";

type HarmonicResults = {
  frequencies_sweep: number[];
  response_amplitudes: Record<string, number[]>;
  peak_node_id?: number | null;
  peak_frequency?: number | null;
  peak_amplitude?: number | null;
};

type NodePeak = {
  nodeId: string;
  frequency: number;
  amplitude: number;
  index: number;
};

type UnbalancedDirection = {
  x: number;
  y: number;
  z: number;
};

const palette = ["#3B82F6", "#10B981", "#DAA520", "#EF4444", "#8B0000", "#8B5CF6"];
const MAX_ALL_NODE_TRACES = 120;

const formatFrequency = (value: number) => {
  if (!Number.isFinite(value)) return "--";
  if (Math.abs(value) < 0.01) return value.toExponential(2);
  return value.toFixed(2);
};

const formatAmplitude = (value: number) => {
  if (!Number.isFinite(value)) return "--";
  if (Math.abs(value) < 1e-9) return "0.00E+0";
  return value.toExponential(3);
};

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

const hasExcitationLoad = (structure: any) => {
  const loads = Array.isArray(structure?.loads) ? structure.loads : [];
  return loads.some((load: any) =>
    ["fx", "fy", "fz", "mx", "my", "mz"].some((key) => Math.abs(Number(load?.[key] ?? 0)) > 0),
  );
};

const getAvailableNodeIds = (structure: any): string[] => {
  if (!Array.isArray(structure?.nodes)) return [];
  return structure.nodes
    .map((node: any) => Number(node?.id))
    .filter((nodeId: number) => Number.isFinite(nodeId))
    .sort((a: number, b: number) => a - b)
    .map((nodeId: number) => String(nodeId));
};

const directionNorm = (direction: UnbalancedDirection) =>
  Math.hypot(Number(direction.x), Number(direction.y), Number(direction.z));

const getNodePeaks = (results: HarmonicResults | null): NodePeak[] => {
  if (!results) return [];

  const frequencies = results.frequencies_sweep || [];
  return Object.entries(results.response_amplitudes || {})
    .map(([nodeId, amplitudes]) => {
      let amplitude = 0;
      let index = 0;
      amplitudes.forEach((value, idx) => {
        const safeValue = Number(value);
        if (Number.isFinite(safeValue) && safeValue > amplitude) {
          amplitude = safeValue;
          index = idx;
        }
      });
      return {
        nodeId,
        amplitude,
        index,
        frequency: frequencies[index] ?? 0,
      };
    })
    .sort((a, b) => b.amplitude - a.amplitude);
};

const buildFrequencyChart = (
  results: HarmonicResults,
  selectedNodeId: string,
  useLogScale: boolean,
  theme: string,
) => {
  const plotTheme = getPlotlyTheme(theme === "dark" ? "dark" : "light");
  const frequencies = results.frequencies_sweep || [];
  const entries = Object.entries(results.response_amplitudes || {});
  const filteredEntries = selectedNodeId === "all"
    ? entries
    : entries.filter(([nodeId]) => nodeId === selectedNodeId);

  const rankedEntries = selectedNodeId === "all"
    ? [...filteredEntries].sort(([, a], [, b]) => {
      const maxA = a.reduce((max, value) => Math.max(max, Number.isFinite(Number(value)) ? Number(value) : 0), 0);
      const maxB = b.reduce((max, value) => Math.max(max, Number.isFinite(Number(value)) ? Number(value) : 0), 0);
      return maxB - maxA;
    })
    : filteredEntries;
  const visibleEntries = (rankedEntries.length > 0 ? rankedEntries : entries.slice(0, 1)).slice(0, selectedNodeId === "all" ? MAX_ALL_NODE_TRACES : 1);
  const isAllNodesLimited = selectedNodeId === "all" && rankedEntries.length > visibleEntries.length;
  const showManyNodes = selectedNodeId === "all";

  return {
    data: visibleEntries.map(([nodeId, amplitudes], index) => ({
      type: "scattergl",
      mode: showManyNodes ? "lines" : "lines+markers",
      x: frequencies,
      y: amplitudes,
      name: `Nodo ${nodeId}`,
      line: {
        color: palette[index % palette.length],
        width: showManyNodes ? 1.8 : 3.5,
      },
      marker: {
        size: showManyNodes ? 0 : 5,
        color: palette[index % palette.length],
      },
      hovertemplate:
        "<b>%{fullData.name}</b><br>Frecuencia de excitación: %{x:.3f} Hz<br>Amplitud de respuesta |u|: %{y:.4e} m<extra></extra>",
    })),
    layout: {
      autosize: true,
      margin: { l: 82, r: 32, t: 58, b: 78 },
      paper_bgcolor: plotTheme.paperBackground,
      plot_bgcolor: plotTheme.plotBackground,
      font: { color: plotTheme.mutedText, family: "Inter, Arial, sans-serif" },
      title: {
        text: selectedNodeId === "all"
          ? `Respuesta armónica — ${isAllNodesLimited ? `top ${MAX_ALL_NODE_TRACES} nodos críticos` : "todos los nodos"}`
          : `Respuesta armónica — Nodo ${selectedNodeId}`,
        x: 0.02,
        xanchor: "left",
        font: { color: plotTheme.text, size: 15 },
      },
      showlegend: selectedNodeId === "all" && visibleEntries.length <= 36,
      legend: {
        orientation: "h",
        x: 0,
        y: 1.12,
        bgcolor: plotTheme.legendBackground,
        bordercolor: plotTheme.legendBorder,
        borderwidth: 1,
        font: { color: plotTheme.text, size: 10 },
      },
      xaxis: {
        title: { text: "Frecuencia de excitación, f (Hz)", font: { color: plotTheme.text, size: 12 } },
        gridcolor: plotTheme.grid,
        zerolinecolor: plotTheme.zeroLine,
        linecolor: plotTheme.axisLine,
        tickfont: { color: plotTheme.subtleText, size: 10 },
      },
      yaxis: {
        title: { text: "Amplitud de respuesta, |u| (m)", font: { color: plotTheme.text, size: 12 } },
        type: useLogScale ? "log" : "linear",
        gridcolor: plotTheme.grid,
        zerolinecolor: plotTheme.zeroLine,
        linecolor: plotTheme.axisLine,
        tickfont: { color: plotTheme.subtleText, size: 10 },
      },
      hoverlabel: {
        bgcolor: plotTheme.hoverBackground,
        bordercolor: plotTheme.hoverBorder,
        font: { color: plotTheme.text },
      },
      hovermode: "closest",
      uirevision: `${theme}-${selectedNodeId}-${useLogScale ? "log" : "linear"}`,
    },
  };
};

const HarmonicAnalysisView: React.FC = () => {
  const [structure, setStructure] = useState<any>(null);
  const [results, setResults] = useState<HarmonicResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freqStart, setFreqStart] = useState(0.5);
  const [freqEnd, setFreqEnd] = useState(80);
  const [numPoints, setNumPoints] = useState(160);
  const [dampingPercent, setDampingPercent] = useState(2);
  const [isUnbalanced, setIsUnbalanced] = useState(false);
  const [unbalancedNodeId, setUnbalancedNodeId] = useState("");
  const [unbalancedMass, setUnbalancedMass] = useState(1);
  const [unbalancedEccentricity, setUnbalancedEccentricity] = useState(0.01);
  const [unbalancedDirection, setUnbalancedDirection] = useState<UnbalancedDirection>({ x: 0, y: 1, z: 0 });
  const [useLogScale, setUseLogScale] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState("all");
  const { theme } = useTheme();

  const availableNodeIds = useMemo(() => getAvailableNodeIds(structure), [structure]);
  const nodePeaks = useMemo(() => getNodePeaks(results), [results]);
  const globalPeak = nodePeaks[0] ?? null;
  const unbalancedMe = unbalancedMass * unbalancedEccentricity;
  const chartData = useMemo(
    () => (results ? buildFrequencyChart(results, selectedNodeId, useLogScale, theme) : null),
    [results, selectedNodeId, theme, useLogScale],
  );

  const EmptyState = ({ msg }: { msg: string }) => (
    <div className="text-center py-20 text-gray-500 flex flex-col items-center justify-center bg-black/5 dark:bg-black/40 rounded-3xl border border-dashed border-border-light dark:border-border-dark backdrop-blur-sm">
      <Waves className="mb-4 opacity-10" size={48} />
      <p className="text-[10px] font-mono font-bold uppercase tracking-[0.2em]">{msg}</p>
    </div>
  );

  const loadStructure = () => {
    const saved = localStorage.getItem("fem_structure_data");
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      if (parsed.restraints) {
        parsed.restraints = Object.fromEntries(
          Object.entries(parsed.restraints).map(([nodeId, dofs]: [string, any]) => [
            nodeId,
            Array.isArray(dofs)
              ? Array.from(new Set(dofs.map((dof: string) => mapDofToBackend(dof))))
              : dofs,
          ]),
        );
      }
      setStructure(parsed);
      setResults(null);
      setError(null);
    } catch (parseError) {
      console.error("Error parsing harmonic structure", parseError);
      setError("No se pudo leer la geometría guardada. Vuelve al editor y guarda/visualiza la estructura.");
    }
  };

  useEffect(() => {
    loadStructure();
    const handleStorage = () => loadStructure();
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (availableNodeIds.length === 0) {
      setUnbalancedNodeId("");
      return;
    }
    if (!availableNodeIds.includes(unbalancedNodeId)) {
      setUnbalancedNodeId(availableNodeIds[0]);
    }
  }, [availableNodeIds, unbalancedNodeId]);

  const runAnalysis = async () => {
    if (!structure) {
      setError("Primero define y visualiza una estructura en el editor.");
      return;
    }

    if (!isUnbalanced && !hasExcitationLoad(structure)) {
      setError("La respuesta armónica requiere al menos una carga nodal no nula para usarla como amplitud o dirección de excitación.");
      return;
    }

    if (isUnbalanced) {
      if (!unbalancedNodeId) {
        setError("Selecciona el nodo donde se aplicará la fuerza por desbalance.");
        return;
      }
      if (unbalancedMass <= 0) {
        setError("La masa desbalanceada m debe ser mayor que cero.");
        return;
      }
      if (unbalancedEccentricity <= 0) {
        setError("La excentricidad e debe ser mayor que cero.");
        return;
      }
      if (directionNorm(unbalancedDirection) <= 1e-12) {
        setError("La dirección del desbalance no puede ser [0, 0, 0].");
        return;
      }
    }

    if (freqEnd <= freqStart) {
      setError("La frecuencia final debe ser mayor que la frecuencia inicial.");
      return;
    }

    if (numPoints < 2 || numPoints > 1000) {
      setError("Usa entre 2 y 1000 puntos de barrido para mantener estable el cálculo.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await authenticatedFetch("/api/analysis/harmonic", {
        method: "POST",
        body: JSON.stringify({
          structure,
          freq_start: freqStart,
          freq_end: freqEnd,
          num_points: numPoints,
          damping_ratio: dampingPercent / 100,
          is_unbalanced: isUnbalanced,
          unbalanced_me: isUnbalanced ? unbalancedMe : 0,
          unbalanced_node_id: isUnbalanced ? Number(unbalancedNodeId) : null,
          unbalanced_direction: isUnbalanced
            ? [unbalancedDirection.x, unbalancedDirection.y, unbalancedDirection.z]
            : [0, 1, 0],
          unbalanced_mass: isUnbalanced ? unbalancedMass : 0,
          unbalanced_eccentricity: isUnbalanced ? unbalancedEccentricity : 0,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Error desconocido" }));
        throw new Error(errorData.detail || "Error en el análisis armónico");
      }

      const analysisData = (await response.json()) as HarmonicResults;
      setResults(analysisData);
      const peaks = getNodePeaks(analysisData);
      setSelectedNodeId(peaks[0]?.nodeId ?? "all");
    } catch (analysisError: any) {
      console.error("Harmonic analysis error:", analysisError.message);
      setError(analysisError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full w-full overflow-hidden flex flex-col-reverse lg:flex-row font-sans relative bg-white dark:bg-bg-dark">
      <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-20 z-0"></div>

      <div className="relative z-40 w-full lg:w-[390px] xl:w-[440px] h-[52vh] lg:h-full flex flex-col bg-white/80 dark:bg-[#0B0F1A]/90 backdrop-blur-xl border-t lg:border-t-0 lg:border-r border-border-light dark:border-border-dark shrink-0 overflow-hidden">
        <div className="shrink-0 p-3 lg:p-6 border-b border-border-light dark:border-border-dark">
          <div className="flex items-center justify-between gap-3 mb-3 lg:mb-5">
            <div className="min-w-0">
              <p className="hidden lg:block text-[9px] text-accent-secondary font-bold uppercase tracking-[0.2em] mb-1 font-mono">
                Frequency Domain
              </p>
              <h1 className="text-sm lg:text-2xl font-display font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none truncate">
                Harmonic <span className="text-accent-secondary">Response</span>
              </h1>
            </div>
            <button
              onClick={runAnalysis}
              disabled={loading || !structure}
              className="shrink-0 flex items-center justify-center gap-1 bg-accent-secondary hover:bg-accent-secondary/90 disabled:opacity-50 text-white px-2.5 py-1.5 lg:px-5 lg:py-3 rounded-lg lg:rounded-xl font-display font-bold text-[9px] lg:text-xs uppercase tracking-wider shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              {loading ? <Loader2 className="animate-spin" size={13} /> : <Play size={13} />}
              <span className="hidden sm:inline">Solve</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="premium-card-inner p-2 lg:p-3">
              <label className="text-[7px] lg:text-[9px] font-bold text-gray-500 uppercase tracking-wider font-mono">
                Start Hz
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={freqStart}
                onChange={(event) => setFreqStart(Number(event.target.value))}
                className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-accent-secondary focus:outline-none"
              />
            </div>
            <div className="premium-card-inner p-2 lg:p-3">
              <label className="text-[7px] lg:text-[9px] font-bold text-gray-500 uppercase tracking-wider font-mono">
                End Hz
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={freqEnd}
                onChange={(event) => setFreqEnd(Number(event.target.value))}
                className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-accent-secondary focus:outline-none"
              />
            </div>
            <div className="premium-card-inner p-2 lg:p-3">
              <label className="text-[7px] lg:text-[9px] font-bold text-gray-500 uppercase tracking-wider font-mono">
                Points
              </label>
              <input
                type="number"
                min="2"
                max="1000"
                value={numPoints}
                onChange={(event) => setNumPoints(Number(event.target.value))}
                className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-accent-secondary focus:outline-none"
              />
            </div>
            <div className="premium-card-inner p-2 lg:p-3">
              <label className="text-[7px] lg:text-[9px] font-bold text-gray-500 uppercase tracking-wider font-mono">
                Damping %
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={dampingPercent}
                onChange={(event) => setDampingPercent(Number(event.target.value))}
                className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-accent-secondary focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2">
            <label className="premium-card-inner p-3 flex items-center justify-between cursor-pointer">
              <span className="flex items-center gap-2 text-[9px] lg:text-[10px] font-bold uppercase tracking-wider text-gray-500 font-mono">
                <SlidersHorizontal size={14} className="text-accent-secondary" />
                Fuerza por desbalance
              </span>
              <input
                type="checkbox"
                checked={isUnbalanced}
                onChange={(event) => setIsUnbalanced(event.target.checked)}
                className="accent-accent-secondary"
              />
            </label>

            {isUnbalanced && (
              <div className="premium-card-inner p-2 lg:p-3 animate-in fade-in slide-in-from-top-2 duration-300 space-y-2">
                <div>
                  <label className="text-[7px] lg:text-[9px] font-bold text-gray-500 uppercase tracking-wider font-mono">
                    Nodo de excitación
                  </label>
                  <select
                    value={unbalancedNodeId}
                    onChange={(event) => setUnbalancedNodeId(event.target.value)}
                    className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-accent-secondary focus:outline-none"
                  >
                    {availableNodeIds.length === 0 && <option value="">Sin nodos</option>}
                    {availableNodeIds.map((nodeId) => (
                      <option key={nodeId} value={nodeId}>
                        Nodo {nodeId}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[7px] lg:text-[9px] font-bold text-gray-500 uppercase tracking-wider font-mono">
                      m (kg)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={unbalancedMass}
                      onChange={(event) => setUnbalancedMass(Number(event.target.value))}
                      className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-accent-secondary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[7px] lg:text-[9px] font-bold text-gray-500 uppercase tracking-wider font-mono">
                      e (m)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={unbalancedEccentricity}
                      onChange={(event) => setUnbalancedEccentricity(Number(event.target.value))}
                      className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-accent-secondary focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[7px] lg:text-[9px] font-bold text-gray-500 uppercase tracking-wider font-mono">
                    Dirección [x, y, z]
                  </label>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    {(["x", "y", "z"] as const).map((axis) => (
                      <input
                        key={axis}
                        aria-label={`Dirección ${axis.toUpperCase()}`}
                        type="number"
                        step="0.1"
                        value={unbalancedDirection[axis]}
                        onChange={(event) =>
                          setUnbalancedDirection((current) => ({
                            ...current,
                            [axis]: Number(event.target.value),
                          }))
                        }
                        className="w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-accent-secondary focus:outline-none"
                      />
                    ))}
                  </div>
                </div>

                <div className="text-[8px] font-mono font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  m·e = <span className="text-accent-secondary">{unbalancedMe.toExponential(3)}</span> kg·m
                </div>
              </div>
            )}

            <label className="premium-card-inner p-3 flex items-center justify-between cursor-pointer">
              <span className="flex items-center gap-2 text-[9px] lg:text-[10px] font-bold uppercase tracking-wider text-gray-500 font-mono">
                <BarChart3 size={14} className="text-accent-secondary" />
                Escala logarítmica
              </span>
              <input
                type="checkbox"
                checked={useLogScale}
                onChange={(event) => setUseLogScale(event.target.checked)}
                className="accent-accent-secondary"
              />
            </label>
          </div>

          <div className="mt-3 premium-card-inner p-3 flex gap-3 text-[9px] leading-relaxed text-gray-500 dark:text-gray-400 font-mono">
            <AlertTriangle size={16} className="text-unsaac-gold shrink-0 mt-0.5" />
            <p>
              Carga normal: se usan las cargas nodales del editor como amplitud F₀. Desbalance: no necesitas cargas del editor; se aplica F(ω)=m·e·ω² en el nodo y dirección seleccionados.
            </p>
          </div>

          {error && (
            <div className="mt-3 p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-mono font-bold leading-relaxed">
              {error}
            </div>
          )}
        </div>

        <div className="shrink-0 px-3 py-2 lg:px-6 lg:py-4">
          <div className="flex p-1 bg-gray-100/50 dark:bg-black/20 rounded-2xl border border-border-light dark:border-border-dark">
            <button
              onClick={() => setSelectedNodeId("all")}
              className={`flex-1 py-2 px-2 text-[9px] lg:text-[10px] font-bold uppercase tracking-tight rounded-xl transition-all font-display cursor-pointer ${selectedNodeId === "all" ? "bg-white dark:bg-bg-dark text-accent-secondary shadow-sm ring-1 ring-black/5 dark:ring-white/5" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"}`}
            >
              All Nodes
            </button>
            <div className="flex-1 py-2 px-2 text-[9px] lg:text-[10px] font-bold uppercase tracking-tight rounded-xl text-gray-400 text-center font-display">
              Peaks
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 lg:px-6 py-2 lg:py-4 pb-6 space-y-2 lg:space-y-3">
          {nodePeaks.length > 0 ? (
            nodePeaks.map((peak) => (
              <button
                key={peak.nodeId}
                onClick={() => setSelectedNodeId(peak.nodeId)}
                className={`w-full text-left p-4 premium-card flex items-center justify-between group cursor-pointer ${selectedNodeId === peak.nodeId ? "ring-2 ring-accent-secondary/50 bg-accent-secondary/5 border-accent-secondary/30 scale-[1.02]" : ""}`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black transition-colors ${selectedNodeId === peak.nodeId ? "bg-accent-secondary text-white" : "bg-gray-50 dark:bg-bg-dark text-gray-400 border border-border-light dark:border-border-dark"}`}>
                    {peak.nodeId}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className={`text-sm font-black font-display ${selectedNodeId === peak.nodeId ? "text-accent-secondary" : "text-gray-700 dark:text-gray-300"}`}>
                      {formatAmplitude(peak.amplitude)} m
                    </span>
                    <span className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-tighter">
                      Peak @ {formatFrequency(peak.frequency)} Hz
                    </span>
                  </div>
                </div>
                <ChevronRight size={14} className={`transition-transform ${selectedNodeId === peak.nodeId ? "text-accent-secondary translate-x-1" : "text-gray-300 dark:text-gray-700"}`} />
              </button>
            ))
          ) : (
            <EmptyState msg="Run harmonic sweep..." />
          )}
        </div>
      </div>

      <div className="relative z-10 flex-1 p-4 lg:p-8 flex flex-col overflow-hidden bg-white dark:bg-bg-dark h-[48vh] lg:h-full">
        <div className="bg-white/80 dark:bg-bg-dark-panel/90 backdrop-blur-md rounded-[2.5rem] border border-border-light dark:border-border-dark overflow-hidden shadow-2xl transition-all hover:border-unsaac-gold/30 group h-full relative">
          {globalPeak && (
            <div className="absolute top-6 left-6 z-10 p-4 lg:p-5 premium-card-inner backdrop-blur-xl border-accent-secondary/20 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex items-center gap-3 mb-2 lg:mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-accent-secondary animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                <h2 className="text-[10px] lg:text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] font-mono">
                  Critical Response
                </h2>
              </div>
              <div className="grid grid-cols-3 gap-4 lg:gap-5">
                <div className="flex flex-col">
                  <span className="text-[7px] lg:text-[8px] font-bold text-gray-500 uppercase font-mono">Node</span>
                  <span className="text-xs lg:text-sm font-black text-accent-secondary font-display">{globalPeak.nodeId}</span>
                </div>
                <div className="flex flex-col border-l border-border-light dark:border-border-dark pl-4">
                  <span className="text-[7px] lg:text-[8px] font-bold text-gray-500 uppercase font-mono">Freq.</span>
                  <span className="text-xs lg:text-sm font-black text-gray-700 dark:text-gray-200 font-display">{formatFrequency(globalPeak.frequency)} Hz</span>
                </div>
                <div className="flex flex-col border-l border-border-light dark:border-border-dark pl-4">
                  <span className="text-[7px] lg:text-[8px] font-bold text-gray-500 uppercase font-mono">|u|</span>
                  <span className="text-xs lg:text-sm font-black text-accent-secondary font-display">{formatAmplitude(globalPeak.amplitude)}</span>
                </div>
              </div>
            </div>
          )}

          {!chartData && !loading && (
            <div className="absolute top-6 right-6 z-10 hidden lg:flex items-center gap-2 premium-card-inner px-4 py-3 text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest">
              <Gauge size={14} className="text-accent-secondary" />
              Frequency Response Function
            </div>
          )}

          <GraphicsView
            data={chartData}
            loading={loading}
            error={error}
            className="h-full w-full bg-transparent! dark:bg-transparent!"
          />
        </div>
      </div>
    </div>
  );
};

export default HarmonicAnalysisView;
