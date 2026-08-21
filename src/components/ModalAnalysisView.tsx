import React, { useState, useEffect, useMemo, useRef } from "react";
import GraphicsView from "./GraphicsView";
import GlobalMatrixInspector from "./GlobalMatrixInspector";
import {
  Play,
  Loader2,
  Waves,
  ChevronRight,
  Zap,
  X,
  Grid3X3,
  MousePointer2,
  Info,
  CheckCircle2,
  TableProperties,
  Download,
} from "lucide-react";
import { useTheme } from "./ThemeContext";
import { authenticatedFetch } from "../lib/api";
import { downloadTablePng } from "../lib/matrixImage";
import { useFitScale } from "../lib/useFitScale";
import {
  buildAnimatedTraceCoordinates,
  hasDisplacementEncoding,
} from "../lib/plotly_deformation";

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const buildModalCacheKey = (structure: any, numModes: number) =>
  `modal-analysis:${numModes}:${hashString(JSON.stringify(structure))}`;

type MatrixKind = "stiffness" | "mass" | "transformation";
type MatrixFrame = "local" | "global";

const buildTransformationMatrix = (rotation: number[][] | undefined): number[][] | null => {
  if (!rotation) return null;
  const T = Array.from({ length: 12 }, () => new Array(12).fill(0));
  for (let block = 0; block < 4; block++) {
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        T[block * 3 + row][block * 3 + col] = rotation[row][col];
      }
    }
  }
  return T;
};

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
  const [animationEnabled, setAnimationEnabled] = useState(true);
  const [selectedElementId, setSelectedElementId] = useState<number | null>(null);
  const [elementMatrices, setElementMatrices] = useState<any>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [matrixKind, setMatrixKind] = useState<MatrixKind>("stiffness");
  const [matrixFrame, setMatrixFrame] = useState<MatrixFrame>("local");
  const [globalMatrixOpen, setGlobalMatrixOpen] = useState(false);
  const { theme } = useTheme();
  const {
    containerRef: matrixContainerRef,
    contentRef: matrixTableRef,
    contentNode: matrixTableNode,
    wrapperStyle: matrixWrapperStyle,
    contentStyle: matrixContentStyle,
  } = useFitScale<HTMLDivElement, HTMLTableElement>();

  const vizCache = useRef<Map<string, any>>(new Map());
  const modalResultCache = useRef<Map<string, any>>(new Map());
  const elementMatrixCache = useRef<Map<string, any>>(new Map());
  const matrixRequestId = useRef(0);

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
        matrixRequestId.current += 1;
        setSelectedElementId(null);
        setElementMatrices(null);
        setMatrixError(null);
        setGlobalMatrixOpen(false);
        vizCache.current.clear();
        elementMatrixCache.current.clear();
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

  const prepareModalView = (analysisData: any) => {
    setResults(analysisData);
    setVizData(null);

    let optimalScale = scale;
    if (analysisData.frequencies?.length > 0) {
      if (structure.nodes?.length > 0 && analysisData.mode_shapes) {
        const coords = structure.nodes.map((n: any) => n.coords);
        const spans = [0, 1, 2].map((axis) => {
          const values = coords.map((coord: any) => Number(coord[axis]) || 0);
          return Math.max(...values) - Math.min(...values);
        });
        const globalSpan = Math.max(...spans, 1e-9);
        const maxDisplacementByAxis = [0, 0, 0];

        Object.values(analysisData.mode_shapes).forEach((nodeShapes: any) => {
          const vectors = Array.isArray(nodeShapes?.[0])
            ? nodeShapes
            : Array.isArray(nodeShapes)
              ? [nodeShapes]
              : Object.values(nodeShapes ?? {});
          vectors.forEach((displacement: any) => {
            if (!Array.isArray(displacement)) return;
            for (let axis = 0; axis < 3; axis++) {
              maxDisplacementByAxis[axis] = Math.max(
                maxDisplacementByAxis[axis],
                Math.abs(Number(displacement[axis]) || 0),
              );
            }
          });
        });

        // Un único límite basado en el largo hacía que un puente angosto pudiera
        // desplazarse cientos de milímetros en Y/Z y colapsar visualmente. Cada
        // componente se limita ahora al 10% de SU dimensión original. Para una
        // dimensión plana (span≈0) se usa una pequeña fracción del largo global,
        // suficiente para ver el modo sin inventar una geometría desproporcionada.
        const MAX_AXIS_DEFORMATION_RATIO = 1.00;
        const SCALE_STEPS = 10;
        const safeScaleCandidates = maxDisplacementByAxis.flatMap((maxDisplacement, axis) => {
          if (maxDisplacement <= 1e-12) return [];
          const referenceSpan = spans[axis] > globalSpan * 1e-6
            ? spans[axis]
            : globalSpan * 0.08;
          return [(referenceSpan * MAX_AXIS_DEFORMATION_RATIO) / maxDisplacement];
        });
        const safeMaxScale = safeScaleCandidates.length > 0
          ? Math.min(...safeScaleCandidates)
          : scale;

        if (Number.isFinite(safeMaxScale) && safeMaxScale > 0) {
          optimalScale = safeMaxScale * 0.5;
          setScaleRange({
            min: 0,
            max: safeMaxScale,
            // Diez posiciones útiles: cada avance se aprecia de inmediato,
            // pero el máximo sigue protegido por el límite geométrico.
            step: Math.max(safeMaxScale / SCALE_STEPS, 1e-9),
          });
        } else {
          optimalScale = 1;
          setScaleRange({ min: 0, max: 1, step: 0.01 });
        }
      }

      setSelectedMode(0);
      setScale(optimalScale);
    }
  };

  const runAnalysis = async () => {
    if (!structure) return;
    setLoading(true);
    matrixRequestId.current += 1;
    setSelectedElementId(null);
    setElementMatrices(null);
    setMatrixError(null);
    setGlobalMatrixOpen(false);
    vizCache.current.clear();
    const cacheKey = buildModalCacheKey(structure, numModes);

    try {
      const inMemory = modalResultCache.current.get(cacheKey);
      let cachedAnalysis = inMemory;
      const persisted = !inMemory ? sessionStorage.getItem(cacheKey) : null;
      if (!cachedAnalysis && persisted) {
        try {
          cachedAnalysis = JSON.parse(persisted);
        } catch {
          sessionStorage.removeItem(cacheKey);
        }
      }

      if (cachedAnalysis) {
        prepareModalView(cachedAnalysis);
        return;
      }

      const resAnalysis = await authenticatedFetch("/api/analysis/modal", {
        method: "POST",
        body: JSON.stringify({ structure, num_modes: numModes }),
      });
      if (!resAnalysis.ok) throw new Error("Kernel failure");
      const analysisData = await resAnalysis.json();
      modalResultCache.current.set(cacheKey, analysisData);
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(analysisData));
      } catch {
        // La caché persistente es opcional; si excede cuota se mantiene la caché en memoria.
      }
      prepareModalView(analysisData);
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

    const baseCacheKey = `${modeIndex}-${theme}-${numModes}-fast-viz`;
    if (vizCache.current.has(baseCacheKey)) {
      const baseViz = vizCache.current.get(baseCacheKey);
      const scaledData = applyClientScaling(baseViz, currentScale);
      setVizData(scaledData);
      return;
    }

    setVizLoading(true);
    try {
      const resViz = await authenticatedFetch(
        `/api/visualization/modal-results?theme=${theme}&scale=1.0&mode_index=${modeIndex}&num_modes=${numModes}&animate=false&detail=2`,
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
    return {
      ...vizData,
      frames: undefined,
      data: vizData.data.map((trace: any) => {
        if (!hasDisplacementEncoding(trace)) {
          return trace;
        }
        const coordinates = buildAnimatedTraceCoordinates(trace, 1, 0, scale);
        return {
          ...trace,
          ...coordinates,
        };
      }),
    };
  };

  const selectElement = async (elementId: number) => {
    if (!structure) return;
    const requestId = ++matrixRequestId.current;
    setSelectedElementId(elementId);
    setMatrixError(null);
    setElementMatrices(null);

    const cacheKey = `${hashString(JSON.stringify(structure))}:${elementId}`;
    const cached = elementMatrixCache.current.get(cacheKey);
    if (cached) {
      setMatrixLoading(false);
      setElementMatrices(cached);
      return;
    }

    setMatrixLoading(true);
    try {
      const response = await authenticatedFetch("/api/analysis/element-matrices", {
        method: "POST",
        body: JSON.stringify({ structure, element_id: elementId }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "No se pudieron recuperar las matrices.");
      }
      const payload = await response.json();
      elementMatrixCache.current.set(cacheKey, payload);
      if (matrixRequestId.current === requestId) setElementMatrices(payload);
    } catch (error: any) {
      if (matrixRequestId.current === requestId) {
        setMatrixError(error?.message || "No se pudieron recuperar las matrices.");
      }
    } finally {
      if (matrixRequestId.current === requestId) setMatrixLoading(false);
    }
  };

  const closeElementInspector = () => {
    matrixRequestId.current += 1;
    setSelectedElementId(null);
    setElementMatrices(null);
    setMatrixError(null);
  };

  const displayVizData = useMemo(() => {
    if (!vizData || !selectedElementId || !structure || !results?.mode_shapes) {
      return vizData;
    }

    const element = structure.elements?.find((candidate: any) => candidate.id === selectedElementId);
    if (!element) return vizData;
    const nodeMap = new Map(structure.nodes?.map((node: any) => [node.id, node]) ?? []);
    const selectedNodes = element.node_ids.map((nodeId: number) => nodeMap.get(nodeId));
    if (selectedNodes.some((node: any) => !node)) return vizData;

    const customdata = selectedNodes.map((node: any) => {
      const displacement = results.mode_shapes?.[node.id]?.[selectedMode] ?? [0, 0, 0];
      return [
        node.coords[0] * 1000,
        node.coords[1] * 1000,
        node.coords[2] * 1000,
        (displacement[0] ?? 0) * 1000,
        (displacement[1] ?? 0) * 1000,
        (displacement[2] ?? 0) * 1000,
        selectedElementId,
      ];
    });
    const selectedTrace = {
      type: "scatter3d",
      mode: "lines+markers",
      x: customdata.map((row: number[]) => row[0] + row[3] * scale),
      y: customdata.map((row: number[]) => row[1] + row[4] * scale),
      z: customdata.map((row: number[]) => row[2] + row[5] * scale),
      customdata,
      meta: { displacementEncoding: "base-delta-real" },
      line: { color: "#F59E0B", width: 11 },
      marker: {
        color: "#FCD34D",
        size: 5,
        line: { color: "#7C2D12", width: 1.5 },
      },
      hovertemplate: `<b>Elemento ${selectedElementId}</b><br>Seleccionado para inspección<extra></extra>`,
      name: `Elemento ${selectedElementId}`,
      showlegend: false,
    };

    return { ...vizData, data: [...vizData.data, selectedTrace] };
  }, [vizData, selectedElementId, structure, results, selectedMode, scale]);

  // Un único encuadre para todos los modos: geometría original + la envolvente
  // máxima de TODOS los vectores modales a la escala visual activa. Así cambiar
  // de modo modifica la deformada, no la relación X/Y/Z ni el tamaño de la caja.
  const sceneReferenceBounds = useMemo(() => {
    const nodes = Array.isArray(structure?.nodes) ? structure.nodes : [];
    if (nodes.length === 0) return undefined;

    const min = [Infinity, Infinity, Infinity] as [number, number, number];
    const max = [-Infinity, -Infinity, -Infinity] as [number, number, number];
    const padding = [0, 0, 0] as [number, number, number];

    for (const node of nodes) {
      const coords = Array.isArray(node?.coords) ? node.coords : [];
      for (let axis = 0; axis < 3; axis++) {
        const valueMm = Number(coords[axis]) * 1_000;
        if (!Number.isFinite(valueMm)) continue;
        min[axis] = Math.min(min[axis], valueMm);
        max[axis] = Math.max(max[axis], valueMm);
      }

      const rawShapes = results?.mode_shapes?.[node?.id] ?? results?.mode_shapes?.[String(node?.id)];
      const modeShapes = Array.isArray(rawShapes?.[0]) ? rawShapes : Array.isArray(rawShapes) ? [rawShapes] : [];
      for (const displacement of modeShapes) {
        for (let axis = 0; axis < 3; axis++) {
          const excursionMm = Math.abs(Number(displacement?.[axis]) || 0) * Math.abs(scale) * 1_000;
          if (Number.isFinite(excursionMm)) padding[axis] = Math.max(padding[axis], excursionMm);
        }
      }
    }

    if (!min.every(Number.isFinite) || !max.every(Number.isFinite)) return undefined;
    return { min, max, padding };
  }, [structure, results, scale]);

  const activeMatrix = matrixKind === "transformation"
    ? buildTransformationMatrix(elementMatrices?.local_axes)
    : elementMatrices?.matrices?.[matrixKind]?.[matrixFrame] ?? null;
  const matrixLabels: string[] = elementMatrices?.dof_labels ?? [];

  const formatMatrixValue = (value: number) => {
    if (!Number.isFinite(value) || Math.abs(value) < 1e-12) return "0";
    const magnitude = Math.abs(value);
    if (magnitude >= 1e5 || magnitude < 1e-3) return value.toExponential(2);
    return Number(value.toPrecision(3)).toString();
  };

  const matrixUnit = matrixKind === "stiffness"
    ? "SI · N/m, N y N·m según los GDL"
    : matrixKind === "mass"
      ? "SI · kg, kg·m y kg·m² según los GDL"
      : "Adimensional · cosenos directores";

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
        <div className="shrink-0 p-2 lg:p-6 border-b border-border-light dark:border-border-dark">
          {/* Header + Button in one row on mobile */}
          <div className="flex items-center justify-between gap-2 mb-2 lg:mb-4">
            <div className="flex-1 min-w-0">
              <p className="hidden lg:block text-[9px] text-accent-primary font-bold uppercase tracking-[0.2em] mb-1 font-mono">
                Structural Engine
              </p>
              <h1 className="text-sm lg:text-2xl font-display font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none truncate">
                Modal <span className="text-accent-primary">Analysis</span>
              </h1>
            </div>
            <button
              onClick={runAnalysis}
              disabled={loading || !structure}
              className="shrink-0 flex items-center justify-center gap-1 bg-accent-primary hover:bg-accent-primary/90 disabled:opacity-50 text-white px-2.5 py-1.5 lg:px-5 lg:py-3 rounded-lg lg:rounded-xl font-display font-bold text-[9px] lg:text-xs uppercase tracking-wider shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={12} />
              ) : (
                <Play size={12} />
              )}
              <span className="hidden sm:inline">Solve</span>
            </button>
          </div>

          {/* Controls in 2 columns on mobile */}
          <div className="grid grid-cols-2 gap-1.5 lg:space-y-4 lg:block lg:mt-6">
            <div className="premium-card-inner p-1.5 lg:p-4 flex items-center justify-between col-span-1">
              <label className="text-[7px] lg:text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider font-mono">
                Modes
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={numModes}
                onChange={(e) => setNumModes(parseInt(e.target.value) || 1)}
                className="w-8 lg:w-14 px-1 lg:px-2 py-0.5 lg:py-1 text-[10px] lg:text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded border border-border-light dark:border-border-dark text-accent-primary focus:outline-none text-center"
              />
            </div>

            <div className="premium-card-inner p-1.5 lg:p-4 col-span-1 lg:col-span-2">
              <div className="flex items-center justify-between mb-0.5 lg:mb-2">
                <label className="text-[7px] lg:text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider font-mono">
                  Scale
                </label>
                <span className="text-[7px] lg:text-[10px] font-mono font-bold text-accent-primary bg-accent-primary/10 px-1 py-0.5 rounded">
                  {scale.toExponential(1)}
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

            <button
              type="button"
              onClick={() => setAnimationEnabled((prev) => !prev)}
              className={`premium-card-inner p-1.5 lg:p-4 col-span-2 flex w-full items-center justify-between cursor-pointer transition-all ${
                animationEnabled
                  ? "border-accent-secondary/40 bg-accent-secondary/10 text-accent-secondary"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              <span className="flex items-center gap-2 text-[7px] lg:text-[10px] font-bold uppercase tracking-wider font-mono">
                <Zap size={12} />
                Animación rápida
              </span>
              <span className="text-[8px] lg:text-[10px] font-mono font-black uppercase">
                {animationEnabled ? "Cliente ON" : "Pausa"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setGlobalMatrixOpen(true)}
              disabled={!results}
              className="premium-card-inner col-span-2 flex w-full cursor-pointer items-center justify-between p-1.5 text-cyan-600 transition-all hover:border-cyan-400/40 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-cyan-300 lg:p-4"
            >
              <span className="flex items-center gap-2 text-[7px] font-bold uppercase tracking-wider font-mono lg:text-[10px]">
                <TableProperties size={13} />
                Ensamble global K / M
              </span>
              <span className="text-[8px] font-mono font-black uppercase lg:text-[10px]">
                Ver completa
              </span>
            </button>
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
        <div className="bg-white/95 dark:bg-bg-dark-panel/95 rounded-[2.5rem] border border-border-light dark:border-border-dark overflow-hidden shadow-2xl transition-all hover:border-unsaac-gold/30 group h-full relative">
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
          {results?.frequencies && !selectedElementId && (
            <div className="absolute top-5 right-5 z-10 pointer-events-none flex items-center gap-2 rounded-xl border border-amber-400/30 bg-white/85 dark:bg-[#101827]/90 px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 shadow-xl backdrop-blur-xl">
              <MousePointer2 size={13} />
              Selecciona una barra · inspecciona K y M
            </div>
          )}
          <GraphicsView
            data={displayVizData}
            loading={loading || vizLoading}
            error={null}
            className="h-full w-full bg-transparent! dark:bg-transparent!"
            onElementSelect={results ? selectElement : undefined}
            animation={{
              enabled: animationEnabled && Boolean(vizData) && !loading && !vizLoading,
              scale,
              fps: 24,
              speedHz: 0.65,
            }}
            sceneReferenceBounds={sceneReferenceBounds}
          />

          {selectedElementId && (
            <section
              aria-label={`Matrices del elemento ${selectedElementId}`}
              className="fixed inset-x-2 bottom-2 z-50 flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-2xl border border-amber-400/30 bg-white/95 shadow-[0_-20px_60px_rgba(15,23,42,0.22)] backdrop-blur-2xl dark:bg-[#0A101C]/95 sm:absolute sm:left-auto sm:right-4 sm:bottom-4 sm:w-[min(760px,calc(100%-2rem))] sm:max-h-[72%] lg:max-h-[70%] lg:rounded-3xl"
            >
              <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200/80 px-4 py-3 dark:border-white/10 lg:px-5 lg:py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-600 dark:text-amber-300">
                    <Grid3X3 size={19} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white lg:text-base">
                        Elemento {selectedElementId}
                      </h3>
                      {elementMatrices && (
                        <span className="hidden items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[8px] font-black uppercase text-emerald-600 dark:text-emerald-300 sm:flex">
                          <CheckCircle2 size={10} /> Simétrica
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[9px] font-mono text-gray-500 dark:text-gray-400">
                      {elementMatrices
                        ? `Nodos ${elementMatrices.node_ids.join("–")} · L = ${elementMatrices.length_m.toFixed(4)} m · ${elementMatrices.properties.section_name}`
                        : "Leyendo sus 12 grados de libertad…"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeElementInspector}
                  aria-label="Cerrar inspector de matrices"
                  className="rounded-xl border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:border-white/10 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <X size={16} />
                </button>
              </header>

              <div className="shrink-0 border-b border-gray-200/80 px-4 py-3 dark:border-white/10 lg:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-black/30" role="tablist" aria-label="Tipo de matriz">
                    {([
                      ["stiffness", "K · Rigidez"],
                      ["mass", "M · Masa"],
                      ["transformation", "T · Transformación"],
                    ] as const).map(([kind, label]) => (
                      <button
                        key={kind}
                        type="button"
                        role="tab"
                        aria-selected={matrixKind === kind}
                        onClick={() => setMatrixKind(kind)}
                        className={`rounded-lg px-3 py-1.5 text-[9px] font-black uppercase tracking-wide transition ${
                          matrixKind === kind
                            ? "bg-white text-amber-700 shadow-sm dark:bg-white/10 dark:text-amber-300"
                            : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {matrixKind !== "transformation" && (
                    <div className="flex rounded-xl border border-gray-200 p-1 dark:border-white/10" role="tablist" aria-label="Sistema de coordenadas">
                      {(["local", "global"] as const).map((frame) => (
                        <button
                          key={frame}
                          type="button"
                          role="tab"
                          aria-selected={matrixFrame === frame}
                          onClick={() => setMatrixFrame(frame)}
                          className={`rounded-lg px-3 py-1.5 text-[9px] font-black uppercase tracking-wide transition ${
                            matrixFrame === frame
                              ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                              : "text-gray-500"
                          }`}
                        >
                          {frame}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-2 flex items-start gap-2 rounded-xl bg-blue-500/5 px-3 py-2 text-[9px] leading-relaxed text-gray-600 dark:text-gray-300">
                  <Info size={13} className="mt-0.5 shrink-0 text-blue-500" />
                  <span>
                    {matrixKind === "transformation"
                      ? <>T rota los 12 GDL locales → globales. Es R (3×3, ejes locales del elemento) repetida en 4 bloques diagonales, uno por cada tríada [u,v,w] o [r<sub>x</sub>,r<sub>y</sub>,r<sub>z</sub>] de cada nodo.</>
                      : <>Filas y columnas siguen <b>[u, v, w, r<sub>x</sub>, r<sub>y</sub>, r<sub>z</sub>]</b> para nodo 1 y nodo 2.
                        {matrixFrame === "local" ? " El eje x local recorre la barra." : " Esta matriz ya está rotada al sistema XYZ del modelo."}</>}
                  </span>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-3 py-3 custom-scrollbar lg:px-5">
                {matrixLoading && (
                  <div className="flex min-h-44 flex-col items-center justify-center gap-3 text-gray-400">
                    <Loader2 size={22} className="animate-spin text-amber-500" />
                    <span className="text-[9px] font-black uppercase tracking-[0.2em]">Calculando solo este elemento</span>
                  </div>
                )}
                {matrixError && !matrixLoading && (
                  <div className="rounded-xl border border-red-400/30 bg-red-500/5 p-4 text-xs text-red-600 dark:text-red-300">
                    {matrixError}
                  </div>
                )}
                {activeMatrix && !matrixLoading && (
                  <>
                    <div className="mb-2 flex items-center justify-between gap-2 text-[8px] font-mono uppercase tracking-wide text-gray-500">
                      <span>
                        {matrixKind === "transformation"
                          ? "Tₑ · 12 × 12"
                          : <>{matrixKind === "stiffness" ? "Kₑ" : "Mₑ"}<sup>{matrixFrame === "local" ? "L" : "G"}</sup> · 12 × 12</>}
                      </span>
                      <span className="flex items-center gap-2">
                        {matrixUnit}
                        <button
                          type="button"
                          onClick={() =>
                            downloadTablePng(
                              matrixTableNode,
                              `elemento-${selectedElementId}-${matrixKind}-${matrixKind === "transformation" ? "" : matrixFrame}.png`,
                              `Elemento ${selectedElementId} · ${matrixKind === "transformation" ? "Tₑ" : `${matrixKind === "stiffness" ? "Kₑ" : "Mₑ"} ${matrixFrame}`} · 12 × 12 · ${matrixUnit}`,
                            )
                          }
                          className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 font-black tracking-wider text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:border-white/10 dark:hover:bg-white/10 dark:hover:text-white"
                        >
                          <Download size={11} /> PNG
                        </button>
                      </span>
                    </div>
                    <div ref={matrixContainerRef}>
                    <div style={matrixWrapperStyle}>
                    <table
                      ref={matrixTableRef}
                      style={matrixContentStyle}
                      className="w-max min-w-full border-separate border-spacing-0 font-mono text-[8px] tabular-nums lg:text-[9px]"
                    >
                      <thead>
                        <tr>
                          <th className="sticky left-0 top-0 z-30 border-b border-r border-gray-200 bg-gray-100 px-2 py-2 text-gray-400 dark:border-white/10 dark:bg-[#111827]">GDL</th>
                          {matrixLabels.map((label) => (
                            <th key={label} className="sticky top-0 z-20 min-w-[70px] border-b border-gray-200 bg-gray-100 px-2 py-2 text-amber-700 dark:border-white/10 dark:bg-[#111827] dark:text-amber-300">
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeMatrix.map((row: number[], rowIndex: number) => (
                          <tr key={matrixLabels[rowIndex] ?? rowIndex}>
                            <th className="sticky left-0 z-10 border-b border-r border-gray-200 bg-gray-100 px-2 py-2 text-amber-700 dark:border-white/10 dark:bg-[#111827] dark:text-amber-300">
                              {matrixLabels[rowIndex]}
                            </th>
                            {row.map((value, columnIndex) => (
                              <td
                                key={`${rowIndex}-${columnIndex}`}
                                title={`[${matrixLabels[rowIndex]}, ${matrixLabels[columnIndex]}] = ${value}`}
                                className={`border-b border-gray-100 px-2 py-2 text-right dark:border-white/5 ${
                                  Math.abs(value) < 1e-12
                                    ? "text-gray-300 dark:text-gray-700"
                                    : value > 0
                                      ? "text-blue-700 dark:text-blue-300"
                                      : "text-rose-600 dark:text-rose-300"
                                } ${rowIndex === columnIndex ? "bg-amber-400/8 font-black" : ""}`}
                              >
                                {formatMatrixValue(value)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                    </div>
                  </>
                )}
              </div>

              {elementMatrices && (
                <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-gray-200/80 px-4 py-2 text-[8px] font-mono text-gray-500 dark:border-white/10 lg:px-5">
                  <span>{elementMatrices.properties.material_name} · mₑ = {elementMatrices.properties.element_mass_kg.toPrecision(4)} kg</span>
                  <span>Masa {elementMatrices.mass_type === "consistent" ? "consistente" : "concentrada"} · lectura bajo demanda</span>
                </footer>
              )}
            </section>
          )}
        </div>
      </div>

      {globalMatrixOpen && structure && (
        <GlobalMatrixInspector
          structure={structure}
          onClose={() => setGlobalMatrixOpen(false)}
        />
      )}
    </div>
  );
};

export default ModalAnalysisView;
