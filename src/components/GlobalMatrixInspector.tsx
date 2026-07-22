import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Grid3X3,
  Info,
  Loader2,
  MousePointer2,
  TableProperties,
  Workflow,
  X,
} from "lucide-react";
import { authenticatedFetch } from "../lib/api";

type MatrixKind = "stiffness" | "mass";
type MatrixScope = "full" | "free";

interface GlobalMatrixInspectorProps {
  structure: any;
  onClose: () => void;
}

interface HeatmapProps {
  values: number[][];
  dimension: number;
  rowStart: number;
  colStart: number;
  windowSize: number;
  onPick: (rowBin: number, colBin: number) => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const formatMatrixValue = (value: number) => {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-12) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 1e5 || magnitude < 1e-3) return value.toExponential(2);
  return Number(value.toPrecision(4)).toString();
};

const formatCompact = (value: number) => {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1e4 || (Math.abs(value) > 0 && Math.abs(value) < 1e-2)) {
    return value.toExponential(2);
  }
  return value.toLocaleString("es-PE", { maximumFractionDigits: 3 });
};

const MatrixHeatmap: React.FC<HeatmapProps> = ({
  values,
  dimension,
  rowStart,
  colStart,
  windowSize,
  onPick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bins = values.length;

  const logarithmicRange = useMemo(() => {
    const logs = values
      .flat()
      .filter((value) => value > 0)
      .map((value) => Math.log10(value));
    return {
      min: logs.length ? Math.min(...logs) : 0,
      max: logs.length ? Math.max(...logs) : 1,
    };
  }, [values]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bins) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const pixels = 720;
    canvas.width = pixels;
    canvas.height = pixels;
    context.fillStyle = "#070B12";
    context.fillRect(0, 0, pixels, pixels);
    const cell = pixels / bins;
    const logSpan = Math.max(logarithmicRange.max - logarithmicRange.min, 1e-12);

    values.forEach((row, rowIndex) => {
      row.forEach((value, columnIndex) => {
        if (value <= 0) return;
        const normalized = clamp(
          (Math.log10(value) - logarithmicRange.min) / logSpan,
          0,
          1,
        );
        const hue = 215 - normalized * 205;
        const lightness = 32 + normalized * 30;
        context.fillStyle = `hsl(${hue} 88% ${lightness}%)`;
        context.fillRect(
          columnIndex * cell,
          rowIndex * cell,
          Math.ceil(cell) + 0.3,
          Math.ceil(cell) + 0.3,
        );
      });
    });

    context.strokeStyle = "rgba(255,255,255,0.25)";
    context.lineWidth = Math.max(1, pixels / 500);
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(pixels, pixels);
    context.stroke();

    const selectedRowBin = clamp(
      Math.floor(((rowStart + windowSize / 2) * bins) / Math.max(dimension, 1)),
      0,
      bins - 1,
    );
    const selectedColBin = clamp(
      Math.floor(((colStart + windowSize / 2) * bins) / Math.max(dimension, 1)),
      0,
      bins - 1,
    );
    context.strokeStyle = "#FBBF24";
    context.lineWidth = Math.max(3, pixels / 180);
    context.strokeRect(
      selectedColBin * cell + 1,
      selectedRowBin * cell + 1,
      Math.max(cell - 2, 4),
      Math.max(cell - 2, 4),
    );
  }, [bins, colStart, dimension, logarithmicRange, rowStart, values, windowSize]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#070B12] shadow-inner">
      <canvas
        ref={canvasRef}
        aria-label={`Mapa completo de matriz ${dimension} por ${dimension}`}
        className="block aspect-square w-full cursor-crosshair"
        onClick={(event) => {
          const rectangle = event.currentTarget.getBoundingClientRect();
          const colBin = clamp(
            Math.floor(((event.clientX - rectangle.left) / rectangle.width) * bins),
            0,
            bins - 1,
          );
          const rowBin = clamp(
            Math.floor(((event.clientY - rectangle.top) / rectangle.height) * bins),
            0,
            bins - 1,
          );
          onPick(rowBin, colBin);
        }}
      />
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between rounded-lg bg-black/60 px-2.5 py-1.5 text-[8px] font-bold uppercase tracking-wider text-gray-300 backdrop-blur-md">
        <span>Menor |valor|</span>
        <span className="h-1.5 w-24 rounded-full bg-gradient-to-r from-blue-700 via-cyan-400 via-amber-400 to-red-500" />
        <span>Mayor |valor|</span>
      </div>
    </div>
  );
};

const GlobalMatrixInspector: React.FC<GlobalMatrixInspectorProps> = ({
  structure,
  onClose,
}) => {
  const [matrixKind, setMatrixKind] = useState<MatrixKind>("stiffness");
  const [matrixScope, setMatrixScope] = useState<MatrixScope>("full");
  const [rowStart, setRowStart] = useState(0);
  const [colStart, setColStart] = useState(0);
  const [windowSize, setWindowSize] = useState(12);
  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    authenticatedFetch("/api/analysis/global-matrices", {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({
        structure,
        matrix_kind: matrixKind,
        matrix_scope: matrixScope,
        row_start: rowStart,
        col_start: colStart,
        window_size: windowSize,
        heatmap_bins: 64,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const responseError = await response.json().catch(() => null);
          throw new Error(responseError?.detail || "No se pudo ensamblar la matriz global.");
        }
        return response.json();
      })
      .then((responsePayload) => setPayload(responsePayload))
      .catch((requestError) => {
        if (requestError?.name !== "AbortError") {
          setError(requestError?.message || "No se pudo ensamblar la matriz global.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [colStart, matrixKind, matrixScope, rowStart, structure, windowSize]);

  const selectKind = (kind: MatrixKind) => {
    setMatrixKind(kind);
    setRowStart(0);
    setColStart(0);
  };

  const selectScope = (scope: MatrixScope) => {
    setMatrixScope(scope);
    setRowStart(0);
    setColStart(0);
  };

  const pickHeatmapCell = (rowBin: number, colBin: number) => {
    if (!payload) return;
    const dimension = payload.matrix.dimension;
    const bins = payload.heatmap.bins;
    const centerRow = Math.floor(((rowBin + 0.5) * dimension) / bins);
    const centerCol = Math.floor(((colBin + 0.5) * dimension) / bins);
    const maxStart = Math.max(dimension - windowSize, 0);
    setRowStart(clamp(centerRow - Math.floor(windowSize / 2), 0, maxStart));
    setColStart(clamp(centerCol - Math.floor(windowSize / 2), 0, maxStart));
  };

  const matrixSymbol = matrixKind === "stiffness" ? "K" : "M";
  const scopedSymbol = matrixScope === "free" ? `${matrixSymbol}ff` : matrixSymbol;
  const unit = matrixKind === "stiffness"
    ? "SI mixto: N/m, N y N·m"
    : "SI mixto: kg, kg·m y kg·m²";
  const activeWindow = payload?.window;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/75 p-2 backdrop-blur-md sm:p-4 lg:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Ensamble global de matrices"
        className="flex h-full max-h-[980px] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-cyan-400/20 bg-white shadow-[0_30px_100px_rgba(0,0,0,0.5)] dark:bg-[#080D16] sm:rounded-3xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-white/10 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-300">
              <Workflow size={21} />
            </div>
            <div className="min-w-0">
              <p className="text-[8px] font-black uppercase tracking-[0.25em] text-cyan-600 dark:text-cyan-300">
                Ecuación modal ensamblada
              </p>
              <h2 className="truncate text-base font-black uppercase tracking-tight text-gray-950 dark:text-white sm:text-xl">
                Matrices globales de toda la estructura
              </h2>
              <p className="hidden text-[9px] text-gray-500 dark:text-gray-400 sm:block">
                Cada término reúne las contribuciones de los elementos conectados al mismo GDL global.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ensamble global"
            className="rounded-xl border border-gray-200 p-2.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 dark:border-white/10 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X size={17} />
          </button>
        </header>

        <div className="shrink-0 border-b border-gray-200 px-4 py-3 dark:border-white/10 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-black/30" role="tablist" aria-label="Matriz global">
              {([
                ["stiffness", "K · Rigidez"],
                ["mass", "M · Masa"],
              ] as const).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  role="tab"
                  aria-selected={matrixKind === kind}
                  onClick={() => selectKind(kind)}
                  className={`rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-wide transition sm:px-4 ${
                    matrixKind === kind
                      ? "bg-white text-cyan-700 shadow-sm dark:bg-white/10 dark:text-cyan-300"
                      : "text-gray-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex rounded-xl border border-gray-200 p-1 dark:border-white/10" role="tablist" aria-label="Etapa del ensamble">
              {([
                ["full", "Completa"],
                ["free", "Libre modal"],
              ] as const).map(([scope, label]) => (
                <button
                  key={scope}
                  type="button"
                  role="tab"
                  aria-selected={matrixScope === scope}
                  onClick={() => selectScope(scope)}
                  className={`rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-wide transition sm:px-4 ${
                    matrixScope === scope
                      ? "bg-gray-950 text-white dark:bg-white dark:text-gray-950"
                      : "text-gray-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading && !payload && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-gray-400">
            <Loader2 size={30} className="animate-spin text-cyan-500" />
            <span className="text-[9px] font-black uppercase tracking-[0.25em]">Ensamblando K y M globales</span>
          </div>
        )}

        {error && !payload && (
          <div className="m-5 rounded-2xl border border-red-400/30 bg-red-500/5 p-5 text-sm text-red-600 dark:text-red-300">
            {error}
          </div>
        )}

        {payload && (
          <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-4 sm:px-6">
              {[
                ["Dimensión", `${payload.matrix.dimension} × ${payload.matrix.dimension}`],
                ["Términos ≠ 0", payload.matrix.nnz.toLocaleString("es-PE")],
                ["Densidad", `${(payload.matrix.density * 100).toFixed(3)} %`],
                ["GDL", `${payload.metadata.free_dofs} libres · ${payload.metadata.constrained_dofs} restringidos`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                  <span className="block text-[7px] font-black uppercase tracking-wider text-gray-400">{label}</span>
                  <strong className="text-[10px] font-black text-gray-800 dark:text-gray-100 sm:text-xs">{value}</strong>
                </div>
              ))}
            </div>

            <div className="grid min-h-0 gap-4 px-4 pb-4 sm:px-6 lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.45fr)]">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-gray-800 dark:text-gray-100">
                      <Grid3X3 size={14} className="text-cyan-500" /> Matriz completa
                    </h3>
                    <p className="text-[8px] text-gray-500">Mapa disperso de los {payload.matrix.dimension ** 2} términos</p>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[8px] font-black uppercase text-emerald-600 dark:text-emerald-300">
                    <CheckCircle2 size={10} /> Simétrica
                  </span>
                </div>

                <MatrixHeatmap
                  values={payload.heatmap.values}
                  dimension={payload.matrix.dimension}
                  rowStart={activeWindow.row_start}
                  colStart={activeWindow.col_start}
                  windowSize={activeWindow.size}
                  onPick={pickHeatmapCell}
                />

                <div className="flex items-start gap-2 rounded-xl border border-cyan-400/15 bg-cyan-500/5 p-3 text-[9px] leading-relaxed text-gray-600 dark:text-gray-300">
                  <MousePointer2 size={13} className="mt-0.5 shrink-0 text-cyan-500" />
                  Haz clic en cualquier zona del mapa para abrir sus valores. La diagonal concentra los términos propios; fuera de ella aparecen los acoplamientos entre GDL.
                </div>
              </div>

              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-gray-800 dark:text-gray-100">
                      <TableProperties size={14} className="text-amber-500" /> Ventana numérica
                    </h3>
                    <p className="text-[8px] text-gray-500">{scopedSymbol} · {unit}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="text-[7px] font-black uppercase text-gray-400">
                      Fila inicial
                      <input
                        aria-label="Fila inicial de la matriz"
                        type="number"
                        min={1}
                        max={payload.matrix.dimension}
                        value={activeWindow.row_start + 1}
                        onChange={(event) => setRowStart(clamp(Number(event.target.value) - 1, 0, Math.max(payload.matrix.dimension - windowSize, 0)))}
                        className="ml-1 w-16 rounded-lg border border-gray-200 bg-white px-2 py-1.5 font-mono text-[9px] text-gray-900 dark:border-white/10 dark:bg-black/20 dark:text-white"
                      />
                    </label>
                    <label className="text-[7px] font-black uppercase text-gray-400">
                      Columna
                      <input
                        aria-label="Columna inicial de la matriz"
                        type="number"
                        min={1}
                        max={payload.matrix.dimension}
                        value={activeWindow.col_start + 1}
                        onChange={(event) => setColStart(clamp(Number(event.target.value) - 1, 0, Math.max(payload.matrix.dimension - windowSize, 0)))}
                        className="ml-1 w-16 rounded-lg border border-gray-200 bg-white px-2 py-1.5 font-mono text-[9px] text-gray-900 dark:border-white/10 dark:bg-black/20 dark:text-white"
                      />
                    </label>
                    <label className="text-[7px] font-black uppercase text-gray-400">
                      Tamaño
                      <select
                        aria-label="Tamaño de ventana de matriz"
                        value={windowSize}
                        onChange={(event) => {
                          setWindowSize(Number(event.target.value));
                          setRowStart(0);
                          setColStart(0);
                        }}
                        className="ml-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 font-mono text-[9px] text-gray-900 dark:border-white/10 dark:bg-black/20 dark:text-white"
                      >
                        {[6, 12, 18, 24, 36].map((size) => <option key={size} value={size}>{size}×{size}</option>)}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="relative max-h-[52vh] overflow-auto rounded-2xl border border-gray-200 custom-scrollbar dark:border-white/10 lg:max-h-[510px]">
                  {loading && (
                    <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/70 backdrop-blur-sm dark:bg-[#080D16]/70">
                      <Loader2 size={20} className="animate-spin text-cyan-500" />
                    </div>
                  )}
                  <table className="w-max min-w-full border-separate border-spacing-0 font-mono text-[8px] tabular-nums sm:text-[9px]">
                    <thead>
                      <tr>
                        <th className="sticky left-0 top-0 z-30 border-b border-r border-gray-200 bg-gray-100 px-2 py-2 text-gray-400 dark:border-white/10 dark:bg-[#111827]">GDL</th>
                        {activeWindow.col_labels.map((label: string, index: number) => (
                          <th key={`${label}-${index}`} className="sticky top-0 z-20 min-w-[78px] border-b border-gray-200 bg-gray-100 px-2 py-2 text-cyan-700 dark:border-white/10 dark:bg-[#111827] dark:text-cyan-300">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeWindow.values.map((row: number[], rowIndex: number) => (
                        <tr key={`${activeWindow.row_labels[rowIndex]}-${rowIndex}`}>
                          <th className="sticky left-0 z-10 border-b border-r border-gray-200 bg-gray-100 px-2 py-2 text-cyan-700 dark:border-white/10 dark:bg-[#111827] dark:text-cyan-300">
                            {activeWindow.row_labels[rowIndex]}
                          </th>
                          {row.map((value, columnIndex) => (
                            <td
                              key={`${rowIndex}-${columnIndex}`}
                              title={`${activeWindow.row_labels[rowIndex]} × ${activeWindow.col_labels[columnIndex]} = ${value}`}
                              className={`border-b border-gray-100 px-2 py-2 text-right dark:border-white/5 ${
                                Math.abs(value) < 1e-12
                                  ? "text-gray-300 dark:text-gray-700"
                                  : value > 0
                                    ? "text-blue-700 dark:text-blue-300"
                                    : "text-rose-600 dark:text-rose-300"
                              } ${activeWindow.row_global_indices[rowIndex] === activeWindow.col_global_indices[columnIndex] ? "bg-amber-400/8 font-black" : ""}`}
                            >
                              {formatMatrixValue(value)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/5">
                    <span className="text-[7px] font-black uppercase tracking-wider text-gray-400">Rango absoluto</span>
                    <p className="font-mono text-[9px] font-bold text-gray-700 dark:text-gray-200">
                      {formatCompact(payload.matrix.min_nonzero_abs)} → {formatCompact(payload.matrix.max_abs)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/5">
                    <span className="text-[7px] font-black uppercase tracking-wider text-gray-400">Modelo ensamblado</span>
                    <p className="text-[9px] font-bold text-gray-700 dark:text-gray-200">
                      {payload.metadata.node_count} nodos · {payload.metadata.element_count} elementos
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mx-4 mb-4 flex flex-col gap-2 rounded-2xl border border-amber-400/20 bg-amber-500/5 p-3 sm:mx-6 sm:flex-row sm:items-center sm:justify-between sm:p-4">
              <div className="flex items-start gap-2 text-[9px] text-gray-600 dark:text-gray-300">
                <Info size={14} className="mt-0.5 shrink-0 text-amber-500" />
                <span>
                  {matrixScope === "full"
                    ? `${matrixSymbol} = Σ Aₑᵀ ${matrixSymbol}ₑᴳ Aₑ · matriz ensamblada antes de eliminar los apoyos.`
                    : "Kff φᵢ = ωᵢ² Mff φᵢ · estas son las matrices reducidas que entran al solucionador modal."}
                  {matrixKind === "mass" && matrixScope === "free" && payload.metadata.mass_regularized
                    ? ` Mff incluye ${payload.metadata.regularization_value.toExponential(1)} en su diagonal, igual que el solver.`
                    : ""}
                </span>
              </div>
              <span className="shrink-0 font-mono text-[10px] font-black text-amber-700 dark:text-amber-300">
                {matrixScope === "free" ? "det(Kff − ω²Mff) = 0" : `${matrixSymbol}[Gₑ,Gₑ] += ${matrixSymbol}ₑᴳ`}
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default GlobalMatrixInspector;
