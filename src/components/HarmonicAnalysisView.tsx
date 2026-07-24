import React, { useEffect, useMemo, useRef, useState } from "react";
import GraphicsView from "./GraphicsView";
import ImpedanceMatrixInspector from "./ImpedanceMatrixInspector";
import NodeResponseTable from "./NodeResponseTable";
import BDMatrixInspector from "./BDMatrixInspector";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronRight,
  Gauge,
  Loader2,
  Play,
  SlidersHorizontal,
  Waves,
  Workflow,
} from "lucide-react";
import { useTheme } from "./ThemeContext";
import { authenticatedFetch } from "../lib/api";
import { getPlotlyTheme } from "../lib/plotly_theme";
import GlobalMatrixInspector from "./GlobalMatrixInspector";

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

type MetricKey = "displacement_m" | "velocity_m_s" | "acceleration_m_s2" | "stress_pa";

type HarmonicNodeSeries = Partial<Record<MetricKey, number[]>>;

type HarmonicNodeSummary = Partial<Record<MetricKey | "frequency_hz" | "stress_peak_pa" | "stress_peak_frequency_hz", number>>;

type HarmonicNodeComponents = Partial<Record<"ux_real_m" | "ux_imag_m" | "uy_real_m" | "uy_imag_m" | "uz_real_m" | "uz_imag_m", number[]>>;

type ElementMetricKey = `${MetricKey}_i` | `${MetricKey}_j`;
type HarmonicElementSeries = Partial<Record<ElementMetricKey, number[]>>;

type HarmonicResults = {
  frequencies_sweep: number[];
  response_amplitudes: Record<string, number[]>;
  node_response_series?: Record<string, HarmonicNodeSeries>;
  node_displacement_components?: Record<string, HarmonicNodeComponents>;
  node_peak_summary?: Record<string, HarmonicNodeSummary>;
  element_response_series?: Record<string, HarmonicElementSeries>;
  peak_node_id?: number | null;
  peak_frequency?: number | null;
  peak_amplitude?: number | null;
};

type NodePeak = {
  nodeId: string;
  frequency: number;
  amplitude: number;
  velocity: number;
  acceleration: number;
  stress: number;
  stressPeak: number;
  index: number;
};

type UnbalancedDirection = {
  x: number;
  y: number;
  z: number;
};

const palette = ["#3B82F6", "#10B981", "#DAA520", "#EF4444", "#8B0000", "#8B5CF6"];
const MAX_ALL_NODE_TRACES = 120;

const metricOptions: { key: MetricKey; label: string; axis: string; unit: string }[] = [
  { key: "displacement_m", label: "Desp", axis: "Desplazamiento |u| (mm)", unit: "mm" },
  { key: "velocity_m_s", label: "Vel", axis: "Velocidad |v| (mm/s)", unit: "mm/s" },
  { key: "acceleration_m_s2", label: "Acel", axis: "Aceleración |a| (m/s²)", unit: "m/s²" },
  { key: "stress_pa", label: "σ alt", axis: "Esfuerzo alternante σa (MPa)", unit: "MPa" },
];

const metricConfig = (key: MetricKey) => metricOptions.find((metric) => metric.key === key) ?? metricOptions[0];

const metricDisplayValue = (value: number, key: MetricKey) => {
  if (key === "displacement_m" || key === "velocity_m_s") return value * 1_000;
  if (key === "stress_pa") return value / 1_000_000;
  return value;
};

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

const formatMetric = (value: number, key: MetricKey) => {
  if (!Number.isFinite(value)) return "--";
  const display = metricDisplayValue(value, key);
  if (key === "acceleration_m_s2") {
    const g = value / 9.80665;
    return `${display.toExponential(3)} m/s² (${g.toFixed(2)} g)`;
  }
  if (key === "stress_pa") return `${display.toFixed(2)} MPa`;
  if (Math.abs(display) < 1e-6) return `0.00 ${metricConfig(key).unit}`;
  return `${display.toExponential(3)} ${metricConfig(key).unit}`;
};

const getMetricSeries = (results: HarmonicResults, nodeId: string, metric: MetricKey): number[] => {
  const series = results.node_response_series?.[nodeId]?.[metric];
  if (Array.isArray(series)) return series;
  if (metric === "displacement_m") return results.response_amplitudes?.[nodeId] ?? [];
  return [];
};

const getElementMetricSeries = (results: HarmonicResults, elementId: string, end: "i" | "j", metric: MetricKey): number[] =>
  results.element_response_series?.[elementId]?.[`${metric}_${end}` as ElementMetricKey] ?? [];

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
  const nodeIds = new Set([
    ...Object.keys(results.response_amplitudes || {}),
    ...Object.keys(results.node_response_series || {}),
    ...Object.keys(results.node_peak_summary || {}),
  ]);

  return Array.from(nodeIds)
    .map((nodeId) => {
      const summary = results.node_peak_summary?.[nodeId];
      const dispSeries = getMetricSeries(results, nodeId, "displacement_m");
      let amplitude = Number(summary?.displacement_m ?? 0);
      let index = 0;
      if (!Number.isFinite(amplitude) || amplitude <= 0) {
        dispSeries.forEach((value, idx) => {
          const safeValue = Number(value);
          if (Number.isFinite(safeValue) && safeValue > amplitude) {
            amplitude = safeValue;
            index = idx;
          }
        });
      } else {
        const summaryFreq = Number(summary?.frequency_hz);
        index = frequencies.findIndex((freq) => Math.abs(freq - summaryFreq) < 1e-9);
        if (index < 0) index = 0;
      }
      return {
        nodeId,
        amplitude,
        index,
        frequency: Number(summary?.frequency_hz ?? frequencies[index] ?? 0),
        velocity: Number(summary?.velocity_m_s ?? getMetricSeries(results, nodeId, "velocity_m_s")[index] ?? 0),
        acceleration: Number(summary?.acceleration_m_s2 ?? getMetricSeries(results, nodeId, "acceleration_m_s2")[index] ?? 0),
        stress: Number(summary?.stress_pa ?? getMetricSeries(results, nodeId, "stress_pa")[index] ?? 0),
        stressPeak: Number(summary?.stress_peak_pa ?? summary?.stress_pa ?? 0),
      };
    })
    .sort((a, b) => b.amplitude - a.amplitude);
};

const buildFrequencyChart = (
  results: HarmonicResults,
  selectedNodeId: string,
  useLogScale: boolean,
  theme: string,
  activeMetric: MetricKey,
) => {
  const plotTheme = getPlotlyTheme(theme === "dark" ? "dark" : "light");
  const frequencies = results.frequencies_sweep || [];
  const metric = metricConfig(activeMetric);
  const allNodeIds = new Set([
    ...Object.keys(results.response_amplitudes || {}),
    ...Object.keys(results.node_response_series || {}),
  ]);
  const entries = Array.from(allNodeIds).map((nodeId) => [nodeId, getMetricSeries(results, nodeId, activeMetric)] as [string, number[]]);
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
      y: amplitudes.map((value) => metricDisplayValue(Number(value), activeMetric)),
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
        `<b>%{fullData.name}</b><br>Frecuencia de excitación: %{x:.3f} Hz<br>${metric.axis}: %{y:.4e}<extra></extra>`,
    })),
    layout: {
      autosize: true,
      margin: { l: 82, r: 32, t: 58, b: 78 },
      paper_bgcolor: plotTheme.paperBackground,
      plot_bgcolor: plotTheme.plotBackground,
      font: { color: plotTheme.mutedText, family: "Inter, Arial, sans-serif" },
      title: {
        text: selectedNodeId === "all"
          ? `${metric.axis} — ${isAllNodesLimited ? `top ${MAX_ALL_NODE_TRACES} nodos críticos` : "todos los nodos"}`
          : `${metric.axis} — Nodo ${selectedNodeId}`,
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
        title: { text: metric.axis, font: { color: plotTheme.text, size: 12 } },
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
      uirevision: `${theme}-${selectedNodeId}-${activeMetric}-${useLogScale ? "log" : "linear"}`,
    },
  };
};


const applyClientScaling = (vizData: any, scale: number) => {
  if (!vizData?.data) return vizData;
  return {
    ...vizData,
    frames: undefined,
    data: vizData.data.map((trace: any) => {
      if (!trace.customdata || !String(trace.mode ?? "").includes("lines")) return trace;
      const n = trace.customdata.length;
      const newX = new Array(n);
      const newY = new Array(n);
      const newZ = new Array(n);
      for (let i = 0; i < n; i++) {
        const row = trace.customdata[i];
        if (!row || row[0] === null) {
          newX[i] = null; newY[i] = null; newZ[i] = null;
        } else {
          newX[i] = row[0] + row[3] * scale;
          newY[i] = row[1] + row[4] * scale;
          newZ[i] = row[2] + row[5] * scale;
        }
      }
      return { ...trace, x: newX, y: newY, z: newZ };
    }),
  };
};

// El motor gráfico que reusamos de Estático/Modal colorea SIEMPRE por magnitud de
// desplazamiento (así construyó su colorbar "Deformación (mm)"), no tiene noción
// de Vel/Acel/Esfuerzo, y el trazo "Nodos" es un color plano fijo (ni siquiera en
// desplazamiento). Acá se recolorea con los valores reales:
// - Líneas "Deformada N": por elemento (element_response_series, extremos i/j —
//   anclados a los nodos), interpolando a lo largo de cada segmento (misma
//   agrupación que ya usa el backend: una tanda de puntos por elemento, separada
//   por null). Se deja el propio color de Estático solo para Desplazamiento.
// - Marcador "Nodos": por nodo (node_response_series), SIEMPRE (las 4 pestañas) —
//   para que los nodos críticos salten a la vista en rojo, no solo la línea.
// La geometría/curvatura no se toca, solo el color.
const recolorByMetric = (
  vizData: any,
  structure: any,
  results: HarmonicResults | null,
  activeMetric: MetricKey,
  frequencyIndex: number,
) => {
  if (!vizData?.data || !results) return vizData;
  const metric = metricConfig(activeMetric);
  const elementSeries = results.element_response_series ?? {};
  const nodeSeries = results.node_response_series ?? {};
  const keyI = `${activeMetric}_i`;
  const keyJ = `${activeMetric}_j`;
  const recolorLines = activeMetric !== "displacement_m";

  let globalMin = Infinity;
  let globalMax = -Infinity;

  const isDeformadaLine = (trace: any) =>
    trace.type === "scatter3d" && String(trace.name ?? "").startsWith("Deformada") && Array.isArray(trace.customdata);

  const withLineColor = vizData.data.map((trace: any) => {
    if (!isDeformadaLine(trace)) return trace;
    // Ancho mas grande SIEMPRE (tambien en Desplazamiento, que no se recolorea
    // acá — usa el color nativo del backend, solo se engorda la línea).
    if (!recolorLines) return { ...trace, line: { ...trace.line, width: 8 } };
    const n = trace.customdata.length;
    const newColor: (number | null)[] = new Array(n).fill(null);
    let runStart = 0;
    for (let i = 0; i <= n; i++) {
      const row = i < n ? trace.customdata[i] : null;
      const boundary = i === n || !row || row[6] === null || row[6] === undefined;
      if (!boundary) continue;
      const runLen = i - runStart;
      if (runLen > 0) {
        const elementId = trace.customdata[runStart]?.[6];
        const series = (elementSeries as any)[String(elementId)];
        const vI = Number(series?.[keyI]?.[frequencyIndex] ?? 0);
        const vJ = Number(series?.[keyJ]?.[frequencyIndex] ?? 0);
        for (let k = 0; k < runLen; k++) {
          const t = runLen > 1 ? k / (runLen - 1) : 0;
          const display = metricDisplayValue(vI + (vJ - vI) * t, activeMetric);
          newColor[runStart + k] = display;
          if (display < globalMin) globalMin = display;
          if (display > globalMax) globalMax = display;
        }
      }
      runStart = i + 1;
    }
    return { ...trace, line: { ...trace.line, color: newColor } };
  });

  let colorbarAssigned = false;
  const withLineScale = withLineColor.map((trace: any) => {
    if (!recolorLines || !Number.isFinite(globalMin) || !isDeformadaLine(trace)) {
      return trace;
    }
    const cmax = globalMax > globalMin ? globalMax : globalMin + 1e-6;
    const wasColorbarHolder = !!trace.line?.showscale;
    const nextLine = { ...trace.line, width: 8, cmin: globalMin, cmax, colorscale: "Jet" };
    if (wasColorbarHolder && !colorbarAssigned) {
      colorbarAssigned = true;
      nextLine.colorbar = {
        ...(trace.line?.colorbar ?? {}),
        title: { ...(trace.line?.colorbar?.title ?? {}), text: `${metric.label} (${metric.unit})` },
      };
    }
    return { ...trace, line: nextLine };
  });

  // Nodos: en el mismo orden que structure.nodes (process_nodes preserva orden e
  // id tal cual vienen del wire format), sin customdata propio en el trazo del
  // backend — por eso el mapeo es por índice, no por id embebido en el trazo.
  const nodeIds: number[] = Array.isArray(structure?.nodes) ? structure.nodes.map((n: any) => Number(n?.id)) : [];
  let nodeMin = Infinity;
  let nodeMax = -Infinity;
  const nodeValues = nodeIds.map((nodeId) => {
    const raw = Number(nodeSeries[String(nodeId)]?.[activeMetric]?.[frequencyIndex] ?? 0);
    const display = metricDisplayValue(raw, activeMetric);
    if (display < nodeMin) nodeMin = display;
    if (display > nodeMax) nodeMax = display;
    return display;
  });
  const nodeCmax = nodeMax > nodeMin ? nodeMax : nodeMin + 1e-6;

  const finalized = withLineScale.map((trace: any) => {
    if (trace.type !== "scatter3d" || trace.name !== "Nodos" || !Number.isFinite(nodeMin) || nodeValues.length !== (trace.x?.length ?? -1)) {
      return trace;
    }
    return {
      ...trace,
      marker: {
        ...trace.marker,
        size: 10,
        color: nodeValues,
        colorscale: "Jet",
        cmin: nodeMin,
        cmax: nodeCmax,
        opacity: 1,
        line: { color: "rgba(15,23,42,0.85)", width: 1.5 },
      },
      hovertext: nodeIds.map((nodeId, i) => `<b>Nodo ${nodeId}</b><br>${metric.label}: ${nodeValues[i].toFixed(3)} ${metric.unit}`),
    };
  });

  return { ...vizData, data: finalized };
};

// 14% del vano principal repartido sobre el peor desplazamiento de TODO el
// barrido de frecuencias (no solo la frecuencia actual, para que no salte al
// mover el slider). Reusable: hace falta tanto en un useMemo (recalculo cuando
// cambian structure/results) como justo después de recibir un resultado nuevo
// (ahí React todavía no actualizó el estado `results`, así que no se puede
// depender del useMemo en ese instante).
const computeAutoScale = (structure: any, results: HarmonicResults | null): number => {
  const nodes = Array.isArray(structure?.nodes) ? structure.nodes : [];
  if (!nodes.length || !results) return 1;
  const coords = nodes.map((n: any) => n.coords ?? [0, 0, 0]);
  const spanOf = (axis: number) => {
    const values = coords.map((c: number[]) => Number(c[axis]) || 0);
    return Math.max(...values) - Math.min(...values);
  };
  const baseSpan = Math.max(spanOf(0), spanOf(1), spanOf(2), 1e-6);

  let maxDisp = 0;
  for (const series of Object.values(results.node_response_series ?? {})) {
    for (const value of (series as HarmonicNodeSeries).displacement_m ?? []) {
      if (Number.isFinite(value) && (value as number) > maxDisp) maxDisp = value as number;
    }
  }
  if (maxDisp <= 0) return 1;
  return Math.min(Math.max((baseSpan * 0.35) / maxDisp, 0.05), 2000);
};

const HarmonicAnalysisView: React.FC = () => {
  const [structure, setStructure] = useState<any>(null);
  const [motionVizBase, setMotionVizBase] = useState<any>(null);
  const [motionVizLoading, setMotionVizLoading] = useState(false);
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
  const [activeMetric, setActiveMetric] = useState<MetricKey>("displacement_m");
  const [visualMode, setVisualMode] = useState<"motion" | "spectrum">("motion");
  const [animationEnabled, setAnimationEnabled] = useState(true);
  const [selectedFrequencyIndex, setSelectedFrequencyIndex] = useState(0);
  const [visualScale, setVisualScale] = useState(1);
  const [impedanceMatrixOpen, setImpedanceMatrixOpen] = useState(false);
  const [nodeTableOpen, setNodeTableOpen] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<number | null>(null);
  const [bdMatrixOpen, setBdMatrixOpen] = useState(false);
  const [globalMatrixOpen, setGlobalMatrixOpen] = useState(false);
  const { theme } = useTheme();

  const availableNodeIds = useMemo(() => getAvailableNodeIds(structure), [structure]);
  const nodePeaks = useMemo(() => getNodePeaks(results), [results]);
  const globalPeak = nodePeaks[0] ?? null;
  const unbalancedMe = unbalancedMass * unbalancedEccentricity;
  const selectedFrequency = results?.frequencies_sweep?.[selectedFrequencyIndex] ?? null;
  // Escala que hace visible la deformada por default: 14% del vano principal de
  // la estructura repartido sobre el PEOR desplazamiento de TODO el barrido (no
  // solo la frecuencia actual, para que no salte al mover el slider de frecuencia).
  // Sin esto, "Auto" quedaba fijo en 1.00x — invisible en estructuras grandes con
  // respuesta chica (mm) frente al tamaño real (m): parecía que "no animaba".
  const autoScale = useMemo(() => computeAutoScale(structure, results), [structure, results]);
  const chartData = useMemo(
    () => (results ? buildFrequencyChart(results, selectedNodeId, useLogScale, theme, activeMetric) : null),
    [results, selectedNodeId, theme, useLogScale, activeMetric],
  );
  // Reescala en el cliente el viz base (pedido siempre con scale=1.0 y cacheado
  // por frecuencia): mover el slider de escala no vuelve a pegarle al backend.
  const motionData = useMemo(
    () => recolorByMetric(applyClientScaling(motionVizBase, visualScale), structure, results, activeMetric, selectedFrequencyIndex),
    [motionVizBase, visualScale, structure, results, activeMetric, selectedFrequencyIndex],
  );
  const activePlotData = visualMode === "motion" ? motionData : chartData;

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

  // Misma paleta/curvatura Hermite que Estático y Modal: la vista de movimiento
  // se pide al mismo endpoint backend (generate_results_figure) en vez de armarse
  // en el cliente. El color por Vel/Acel/Esfuerzo se recalcula aparte en
  // recolorByMetric (esa función del backend no sabe de esas métricas, solo de
  // desplazamiento). Usa solo la parte REAL del desplazamiento complejo a la
  // frecuencia elegida (fase 0) para la GEOMETRÍA — se pierde el desfase de la
  // parte imaginaria entre grados de libertad ahí, no en el color.
  const motionVizCache = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    if (!results || !structure || visualMode !== "motion") return;
    const frequencyHz = results.frequencies_sweep?.[selectedFrequencyIndex];
    if (!Number.isFinite(frequencyHz)) return;

    const baseCacheKey = `${hashString(JSON.stringify(structure))}:${freqStart}:${freqEnd}:${numPoints}:${dampingPercent}:${isUnbalanced}:${unbalancedMe}:${unbalancedNodeId}:${JSON.stringify(unbalancedDirection)}:${frequencyHz.toFixed(6)}:${theme}`;

    const cached = motionVizCache.current.get(baseCacheKey);
    if (cached) {
      setMotionVizBase(cached);
      return;
    }

    let cancelled = false;
    setMotionVizLoading(true);
    authenticatedFetch(
      `/api/visualization/harmonic-results?frequency_hz=${frequencyHz}&scale=1.0&theme=${theme}`,
      {
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
      },
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        motionVizCache.current.set(baseCacheKey, data);
        setMotionVizBase(data);
      })
      .catch(() => { if (!cancelled) setMotionVizBase(null); })
      .finally(() => { if (!cancelled) setMotionVizLoading(false); });
    return () => { cancelled = true; };
  }, [
    results, structure, visualMode, selectedFrequencyIndex, theme,
    freqStart, freqEnd, numPoints, dampingPercent, isUnbalanced,
    unbalancedMe, unbalancedNodeId, unbalancedDirection, unbalancedMass, unbalancedEccentricity,
  ]);

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
      setVisualScale(computeAutoScale(structure, analysisData));
      const peaks = getNodePeaks(analysisData);
      setSelectedNodeId(peaks[0]?.nodeId ?? "all");
      const peakFreq = Number(peaks[0]?.frequency ?? analysisData.peak_frequency ?? analysisData.frequencies_sweep?.[0] ?? 0);
      const peakIndex = (analysisData.frequencies_sweep || []).reduce((best, freq, idx, arr) =>
        Math.abs(freq - peakFreq) < Math.abs((arr[best] ?? 0) - peakFreq) ? idx : best, 0);
      setSelectedFrequencyIndex(peakIndex);
      setVisualMode("motion");
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

            <div className="premium-card-inner p-1 grid grid-cols-4 gap-1">
              {metricOptions.map((metric) => (
                <button
                  key={metric.key}
                  onClick={() => setActiveMetric(metric.key)}
                  className={`py-2 rounded-xl text-[8px] lg:text-[9px] font-display font-black uppercase tracking-tight transition-all cursor-pointer ${activeMetric === metric.key ? "bg-accent-secondary text-white shadow-sm" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"}`}
                >
                  {metric.label}
                </button>
              ))}
            </div>
            {visualMode === "motion" && (
              <p className="px-1 text-[7px] font-mono text-gray-400">
                La vista 3D usa el mismo motor gráfico que Estático/Modal (curvatura y estilo), recoloreada según la pestaña elegida.
              </p>
            )}

            <div className="premium-card-inner p-1 grid grid-cols-2 gap-1">
              {(["motion", "spectrum"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setVisualMode(mode)}
                  className={`py-2 rounded-xl text-[8px] lg:text-[9px] font-display font-black uppercase tracking-tight transition-all cursor-pointer ${visualMode === mode ? "bg-unsaac-gold text-black shadow-sm" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"}`}
                >
                  {mode === "motion" ? "Movimiento" : "Espectro"}
                </button>
              ))}
            </div>

            {visualMode === "motion" && (
              <button
                type="button"
                onClick={() => setAnimationEnabled((prev) => !prev)}
                className={`premium-card-inner p-2 flex w-full items-center justify-between cursor-pointer transition-all ${
                  animationEnabled
                    ? "border-accent-secondary/40 bg-accent-secondary/10 text-accent-secondary"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                <span className="flex items-center gap-2 text-[7px] lg:text-[9px] font-bold uppercase tracking-wider font-mono">
                  <Waves size={12} />
                  Animación
                </span>
                <span className="text-[8px] font-mono font-black uppercase">
                  {animationEnabled ? "Reproduciendo" : "Pausada"}
                </span>
              </button>
            )}

            {results && results.frequencies_sweep.length > 1 && (
              <div className="premium-card-inner p-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[7px] lg:text-[9px] font-bold text-gray-500 uppercase tracking-wider font-mono">Frecuencia animada</label>
                  <span className="text-[9px] font-mono font-black text-accent-secondary">{selectedFrequency?.toFixed(3)} Hz</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, results.frequencies_sweep.length - 1)}
                  value={selectedFrequencyIndex}
                  onChange={(event) => setSelectedFrequencyIndex(Number(event.target.value))}
                  className="w-full accent-accent-secondary"
                />
                <button
                  type="button"
                  onClick={() => setGlobalMatrixOpen(true)}
                  className="mt-2 flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-sky-400/20 bg-sky-500/5 px-3 py-2 text-sky-700 transition-all hover:bg-sky-500/10 dark:text-sky-300"
                >
                  <span className="flex items-center gap-2 text-[8px] lg:text-[9px] font-bold uppercase tracking-wider font-mono">
                    <Workflow size={12} />
                    Matrices K, M y C globales
                  </span>
                  <span className="text-[8px] font-mono font-black uppercase">Ver</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImpedanceMatrixOpen(true)}
                  className="mt-2 flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/5 px-3 py-2 text-fuchsia-700 transition-all hover:bg-fuchsia-500/10 dark:text-fuchsia-300"
                >
                  <span className="flex items-center gap-2 text-[8px] lg:text-[9px] font-bold uppercase tracking-wider font-mono">
                    <Activity size={12} />
                    Matriz de impedancia Z(ω)
                  </span>
                  <span className="text-[8px] font-mono font-black uppercase">Ver</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNodeTableOpen(true)}
                  className="mt-2 flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/5 px-3 py-2 text-cyan-700 transition-all hover:bg-cyan-500/10 dark:text-cyan-300"
                >
                  <span className="flex items-center gap-2 text-[8px] lg:text-[9px] font-bold uppercase tracking-wider font-mono">
                    <SlidersHorizontal size={12} />
                    Tabla de nodos X/Y/Z
                  </span>
                  <span className="text-[8px] font-mono font-black uppercase">Ver</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBdMatrixOpen(true)}
                  className="mt-2 flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-3 py-2 text-emerald-700 transition-all hover:bg-emerald-500/10 dark:text-emerald-300"
                >
                  <span className="flex items-center gap-2 text-[8px] lg:text-[9px] font-bold uppercase tracking-wider font-mono">
                    <span className="font-black">B·D</span>
                    Matrices [B] y [D] por elemento
                  </span>
                  <span className="text-[8px] font-mono font-black uppercase">Ver</span>
                </button>
              </div>
            )}

            {visualMode === "motion" && (
              <div className="premium-card-inner p-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <label className="text-[7px] lg:text-[9px] font-bold text-gray-500 uppercase tracking-wider font-mono">Escala deformada</label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setVisualScale((value) => Math.max(0.05, Number((value / 1.25).toFixed(2))))}
                      className="w-7 h-6 rounded-lg bg-gray-100 dark:bg-black/30 text-gray-500 hover:text-accent-secondary font-black text-xs"
                      aria-label="Reducir escala de deformada"
                    >
                      −
                    </button>
                    <span className="min-w-14 text-center text-[9px] font-mono font-black text-accent-secondary">{visualScale.toFixed(2)}×</span>
                    <button
                      type="button"
                      onClick={() => setVisualScale((value) => Math.min(Math.max(8, autoScale * 2), Number((value * 1.25).toFixed(2))))}
                      className="w-7 h-6 rounded-lg bg-gray-100 dark:bg-black/30 text-gray-500 hover:text-accent-secondary font-black text-xs"
                      aria-label="Aumentar escala de deformada"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisualScale(autoScale)}
                      className="ml-1 px-2 h-6 rounded-lg bg-unsaac-gold/15 text-[8px] font-black uppercase text-gray-600 dark:text-gray-300 hover:bg-unsaac-gold/25"
                    >
                      Auto
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max={Math.max(8, autoScale * 2)}
                  step="0.05"
                  value={visualScale}
                  onChange={(event) => setVisualScale(Number(event.target.value))}
                  className="w-full accent-unsaac-gold"
                  aria-label="Escala visual de deformada"
                />
                <p className="mt-2 text-[8px] font-mono text-gray-400 leading-relaxed">
                  Solo cambia la visualización; los valores nodales no se alteran.
                </p>
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
              Carga normal: se usan las cargas nodales del editor como amplitud F₀. Unidades industriales: desplazamiento mm, velocidad mm/s, aceleración m/s² (g) y esfuerzo alternante MPa.
            </p>
          </div>

          {error && (
            <div className="mt-3 p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-mono font-bold leading-relaxed">
              {error}
            </div>
          )}

          {selectedElementId != null && results && (
            <div className="mt-3 p-3 rounded-2xl premium-card-inner border border-accent-secondary/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-accent-secondary font-mono">
                  Elemento {selectedElementId}
                </span>
                <button onClick={() => setSelectedElementId(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-[10px] font-bold cursor-pointer">
                  ✕
                </button>
              </div>
              {(() => {
                const iVal = getElementMetricSeries(results, String(selectedElementId), "i", activeMetric)[selectedFrequencyIndex];
                const jVal = getElementMetricSeries(results, String(selectedElementId), "j", activeMetric)[selectedFrequencyIndex];
                return (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="premium-card-inner p-2">
                      <span className="text-[8px] text-gray-500 font-bold uppercase mb-0.5 block font-mono">Extremo i</span>
                      <span className="text-[11px] font-mono font-bold text-gray-900 dark:text-gray-100 block">
                        {Number.isFinite(iVal) ? formatMetric(iVal, activeMetric) : "--"}
                      </span>
                    </div>
                    <div className="premium-card-inner p-2">
                      <span className="text-[8px] text-gray-500 font-bold uppercase mb-0.5 block font-mono">Extremo j</span>
                      <span className="text-[11px] font-mono font-bold text-gray-900 dark:text-gray-100 block">
                        {Number.isFinite(jVal) ? formatMetric(jVal, activeMetric) : "--"}
                      </span>
                    </div>
                  </div>
                );
              })()}
              <button
                type="button"
                onClick={() => setBdMatrixOpen(true)}
                className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-3 py-2 text-[8px] font-bold uppercase tracking-wider text-emerald-700 transition-all hover:bg-emerald-500/10 dark:text-emerald-300"
              >
                Ver matrices [B] y [D]
              </button>
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
                      {formatMetric(peak.amplitude, "displacement_m")}
                    </span>
                    <span className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-tighter">
                      Peak @ {formatFrequency(peak.frequency)} Hz
                    </span>
                    <span className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-[8px] font-mono font-bold uppercase tracking-tight text-gray-400">
                      <span>v {formatMetric(peak.velocity, "velocity_m_s")}</span>
                      <span>a {formatMetric(peak.acceleration, "acceleration_m_s2")}</span>
                      <span>σ {formatMetric(peak.stressPeak, "stress_pa")}</span>
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
            <div className="absolute top-4 right-4 z-10 p-3 lg:p-4 premium-card-inner backdrop-blur-xl border-accent-secondary/20 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex items-center gap-3 mb-2 lg:mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-accent-secondary animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                <h2 className="text-[10px] lg:text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] font-mono">
                  Critical Response
                </h2>
              </div>
              <div className="grid grid-cols-4 gap-3 lg:gap-4">
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
                  <span className="text-xs lg:text-sm font-black text-accent-secondary font-display">{formatMetric(globalPeak.amplitude, "displacement_m")}</span>
                </div>
                <div className="flex flex-col border-l border-border-light dark:border-border-dark pl-4">
                  <span className="text-[7px] lg:text-[8px] font-bold text-gray-500 uppercase font-mono">σa</span>
                  <span className="text-xs lg:text-sm font-black text-gray-700 dark:text-gray-200 font-display">{formatMetric(globalPeak.stressPeak, "stress_pa")}</span>
                </div>
              </div>
            </div>
          )}

          {!activePlotData && !loading && (
            <div className="absolute top-6 right-6 z-10 hidden lg:flex items-center gap-2 premium-card-inner px-4 py-3 text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest">
              <Gauge size={14} className="text-accent-secondary" />
              Frequency Response Function
            </div>
          )}

          <GraphicsView
            data={activePlotData}
            loading={loading || (visualMode === "motion" && motionVizLoading && !motionData)}
            error={error}
            className="h-full w-full bg-transparent! dark:bg-transparent!"
            // El customdata que manda el backend trae el delta SIN escalar (mismo
            // criterio que Modal). El fetch pide siempre scale=1.0 y el reescalado
            // real pasa acá — si esto queda en 1 fijo, la pose estática (con
            // visualScale, p.ej. 5.75x) se ve bien deformada pero al animar el
            // movimiento se reduce a una fracción invisible: "no anima" en la
            // práctica aunque las coordenadas sí cambien cuadro a cuadro.
            animation={{ enabled: visualMode === "motion" && !!motionData && animationEnabled, scale: visualScale, fps: 30, speedHz: 0.45 }}
            onElementSelect={results ? setSelectedElementId : undefined}
          />
        </div>
      </div>

      {globalMatrixOpen && structure && (
        <GlobalMatrixInspector structure={structure} onClose={() => setGlobalMatrixOpen(false)} />
      )}

      {impedanceMatrixOpen && structure && (
        <ImpedanceMatrixInspector
          structure={structure}
          initialFrequencyHz={selectedFrequency ?? 1}
          dampingRatio={dampingPercent / 100}
          onClose={() => setImpedanceMatrixOpen(false)}
        />
      )}

      {nodeTableOpen && structure && results && (
        <NodeResponseTable
          structure={structure}
          results={results}
          frequencyIndex={selectedFrequencyIndex}
          onClose={() => setNodeTableOpen(false)}
        />
      )}

      {bdMatrixOpen && structure && (
        <BDMatrixInspector
          structure={structure}
          initialElementId={selectedElementId ?? Number(structure?.elements?.[0]?.id ?? 1)}
          onClose={() => setBdMatrixOpen(false)}
        />
      )}
    </div>
  );
};

export default HarmonicAnalysisView;
