import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Download,
  Grid3X3,
  Info,
  Loader2,
  MousePointer2,
  TableProperties,
  X,
} from "lucide-react";
import { authenticatedFetch } from "../lib/api";
import { downloadCanvasPng, downloadTablePng } from "../lib/matrixImage";
import { useFitScale } from "../lib/useFitScale";

type MatrixScope = "full" | "free";
type ValueMode = "magnitude" | "real" | "imag";

interface ImpedanceMatrixInspectorProps {
  structure: any;
  initialFrequencyHz: number;
  dampingRatio: number;
  onClose: () => void;
}

interface HeatmapProps {
  values: number[][];
  dimension: number;
  rowStart: number;
  colStart: number;
  windowSize: number;
  fileName: string;
  onPick: (rowBin: number, colBin: number) => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const formatCompact = (value: number) => {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1e4 || (Math.abs(value) > 0 && Math.abs(value) < 1e-2)) {
    return value.toExponential(2);
  }
  return value.toLocaleString("es-PE", { maximumFractionDigits: 3 });
};

const formatCellValue = (real: number, imag: number, mode: ValueMode) => {
  if (mode === "real") return formatCompact(real);
  if (mode === "imag") return formatCompact(imag);
  return formatCompact(Math.sqrt(real * real + imag * imag));
};

const cellIsZero = (real: number, imag: number) =>
  Math.abs(real) < 1e-12 && Math.abs(imag) < 1e-12;

// Reutiliza el mismo mapa de calor logarítmico que el inspector K/M — aquí ya llega
// como magnitud |Z_ij| calculada en el backend, así que el render es idéntico.
const MatrixHeatmap: React.FC<HeatmapProps> = ({
  values,
  dimension,
  rowStart,
  colStart,
  windowSize,
  fileName,
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

    const pixels = 1440;
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
        const hue = 275 - normalized * 235;
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
        aria-label={`Mapa completo de |Z(ω)| ${dimension} por ${dimension}`}
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
      <button
        type="button"
        onClick={() => downloadCanvasPng(canvasRef.current, fileName)}
        className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1.5 text-[8px] font-black uppercase tracking-wider text-gray-200 backdrop-blur-md transition hover:bg-black/80 hover:text-white"
      >
        <Download size={11} /> PNG
      </button>
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between rounded-lg bg-black/60 px-2.5 py-1.5 text-[8px] font-bold uppercase tracking-wider text-gray-300 backdrop-blur-md">
        <span>Menor |Z|</span>
        <span className="h-1.5 w-24 rounded-full bg-gradient-to-r from-purple-700 via-fuchsia-400 via-amber-400 to-red-500" />
        <span>Mayor |Z|</span>
      </div>
    </div>
  );
};

const ImpedanceMatrixInspector: React.FC<ImpedanceMatrixInspectorProps> = ({
  structure,
  initialFrequencyHz,
  dampingRatio,
  onClose,
}) => {
  const [frequencyHz, setFrequencyHz] = useState(Math.max(0, initialFrequencyHz ?? 1));
  const [matrixScope, setMatrixScope] = useState<MatrixScope>("free");
  const [valueMode, setValueMode] = useState<ValueMode>("magnitude");
  const [rowStart, setRowStart] = useState(0);
  const [colStart, setColStart] = useState(0);
  const [windowSize, setWindowSize] = useState(12);
  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { containerRef, contentRef, contentNode, wrapperStyle, contentStyle } = useFitScale<
    HTMLDivElement,
    HTMLTableElement
  >();

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

    authenticatedFetch("/api/analysis/impedance-matrix", {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({
        structure,
        frequency_hz: frequencyHz,
        damping_ratio: dampingRatio,
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
          throw new Error(responseError?.detail || "No se pudo ensamblar la matriz de impedancia.");
        }
        return response.json();
      })
      .then((responsePayload) => setPayload(responsePayload))
      .catch((requestError) => {
        if (requestError?.name !== "AbortError") {
          setError(requestError?.message || "No se pudo ensamblar la matriz de impedancia.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [colStart, dampingRatio, frequencyHz, matrixScope, rowStart, structure, windowSize]);

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

  const scopedSymbol = matrixScope === "free" ? "Zff" : "Z";
  const activeWindow = payload?.window;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/75 p-2 backdrop-blur-md sm:p-4 lg:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Matriz de impedancia dinamica"
        className="flex h-full max-h-[980px] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-fuchsia-400/20 bg-white shadow-[0_30px_100px_rgba(0,0,0,0.5)] dark:bg-[#080D16] sm:rounded-3xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-white/10 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300">
              <Activity size={21} />
            </div>
            <div className="min-w-0">
              <p className="text-[8px] font-black uppercase tracking-[0.25em] text-fuchsia-600 dark:text-fuchsia-300">
                Ecuación de equilibrio dinámico
              </p>
              <h2 className="truncate text-base font-black uppercase tracking-tight text-gray-950 dark:text-white sm:text-xl">
                Matriz de impedancia Z(ω)
              </h2>
              <p className="hidden text-[9px] text-gray-500 dark:text-gray-400 sm:block">
                Z(ω) = K − ω²M + iωC, con C = amortiguamiento de Rayleigh calibrado al mismo criterio del barrido armónico.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar matriz de impedancia"
            className="rounded-xl border border-gray-200 p-2.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 dark:border-white/10 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X size={17} />
          </button>
        </header>

        <div className="shrink-0 border-b border-gray-200 px-4 py-3 dark:border-white/10 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[7px] font-black uppercase text-gray-400">
                Frecuencia
                <div className="mt-1 flex items-center gap-1">
                  <input
                    aria-label="Frecuencia en Hz"
                    type="number"
                    min={0}
                    step={0.1}
                    value={frequencyHz}
                    onChange={(event) => setFrequencyHz(Math.max(0, Number(event.target.value) || 0))}
                    className="w-20 rounded-lg border border-gray-200 bg-white px-2 py-1.5 font-mono text-[10px] font-bold text-gray-900 dark:border-white/10 dark:bg-black/20 dark:text-white"
                  />
                  <span className="text-[8px] font-bold uppercase text-gray-400">Hz</span>
                </div>
              </label>

              <div className="flex rounded-xl border border-gray-200 p-1 dark:border-white/10" role="tablist" aria-label="Alcance de la matriz">
                {([
                  ["free", "Libre"],
                  ["full", "Completa"],
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

              <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-black/30" role="tablist" aria-label="Representación de valores">
                {([
                  ["magnitude", "|Z|"],
                  ["real", "Re"],
                  ["imag", "Im"],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={valueMode === mode}
                    onClick={() => setValueMode(mode)}
                    className={`rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-wide transition sm:px-4 ${
                      valueMode === mode
                        ? "bg-white text-fuchsia-700 shadow-sm dark:bg-white/10 dark:text-fuchsia-300"
                        : "text-gray-500"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {loading && !payload && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-gray-400">
            <Loader2 size={30} className="animate-spin text-fuchsia-500" />
            <span className="text-[9px] font-black uppercase tracking-[0.25em]">Ensamblando Z(ω)</span>
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
                ["ω", `${formatCompact(payload.matrix.omega_rad_s)} rad/s`],
                ["Amortiguamiento ζ", `${(payload.matrix.damping_ratio * 100).toFixed(2)} %`],
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
                      <Grid3X3 size={14} className="text-fuchsia-500" /> Matriz completa
                    </h3>
                    <p className="text-[8px] text-gray-500">Mapa disperso de |Z(ω)|, {payload.matrix.dimension ** 2} términos</p>
                  </div>
                </div>

                <MatrixHeatmap
                  values={payload.heatmap.values}
                  dimension={payload.matrix.dimension}
                  rowStart={activeWindow.row_start}
                  colStart={activeWindow.col_start}
                  windowSize={activeWindow.size}
                  fileName={`mapa-${scopedSymbol}-${payload.matrix.frequency_hz.toFixed(3)}Hz.png`}
                  onPick={pickHeatmapCell}
                />

                <div className="flex items-start gap-2 rounded-xl border border-fuchsia-400/15 bg-fuchsia-500/5 p-3 text-[9px] leading-relaxed text-gray-600 dark:text-gray-300">
                  <MousePointer2 size={13} className="mt-0.5 shrink-0 text-fuchsia-500" />
                  Haz clic en cualquier zona del mapa para abrir sus valores. El color usa |Z| aunque la tabla de la derecha pueda mostrar Re, Im o |Z| por separado.
                </div>
              </div>

              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-gray-800 dark:text-gray-100">
                      <TableProperties size={14} className="text-amber-500" /> Ventana numérica
                    </h3>
                    <p className="text-[8px] text-gray-500">{scopedSymbol}({payload.matrix.frequency_hz.toFixed(3)} Hz) · N/m, N·s/m, kg y sus acoplamientos rotacionales</p>
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
                    <button
                      type="button"
                      onClick={() =>
                        downloadTablePng(
                          contentNode,
                          `matriz-${scopedSymbol}-${payload.matrix.frequency_hz.toFixed(3)}Hz-${activeWindow.size}x${activeWindow.size}.png`,
                          `${scopedSymbol}(${payload.matrix.frequency_hz.toFixed(3)} Hz) · ${valueMode === "real" ? "parte real" : valueMode === "imag" ? "parte imaginaria" : "magnitud"} · filas ${activeWindow.row_start + 1}–${activeWindow.row_start + activeWindow.size} · columnas ${activeWindow.col_start + 1}–${activeWindow.col_start + activeWindow.size}`,
                        )
                      }
                      className="flex items-center gap-1 self-end rounded-lg border border-gray-200 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:border-white/10 dark:hover:bg-white/10 dark:hover:text-white"
                    >
                      <Download size={11} /> PNG
                    </button>
                  </div>
                </div>

                <div
                  ref={containerRef}
                  className="relative max-h-[52vh] overflow-auto rounded-2xl border border-gray-200 custom-scrollbar dark:border-white/10 lg:max-h-[510px]"
                >
                  {loading && (
                    <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/70 backdrop-blur-sm dark:bg-[#080D16]/70">
                      <Loader2 size={20} className="animate-spin text-fuchsia-500" />
                    </div>
                  )}
                  <div style={wrapperStyle}>
                  <table
                    ref={contentRef}
                    style={contentStyle}
                    className="w-max min-w-full border-separate border-spacing-0 font-mono text-[8px] tabular-nums sm:text-[9px]"
                  >
                    <thead>
                      <tr>
                        <th className="sticky left-0 top-0 z-30 border-b border-r border-gray-200 bg-gray-100 px-2 py-2 text-gray-400 dark:border-white/10 dark:bg-[#111827]">GDL</th>
                        {activeWindow.col_labels.map((label: string, index: number) => (
                          <th key={`${label}-${index}`} className="sticky top-0 z-20 min-w-[78px] border-b border-gray-200 bg-gray-100 px-2 py-2 text-fuchsia-700 dark:border-white/10 dark:bg-[#111827] dark:text-fuchsia-300">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeWindow.values_real.map((row: number[], rowIndex: number) => (
                        <tr key={`${activeWindow.row_labels[rowIndex]}-${rowIndex}`}>
                          <th className="sticky left-0 z-10 border-b border-r border-gray-200 bg-gray-100 px-2 py-2 text-fuchsia-700 dark:border-white/10 dark:bg-[#111827] dark:text-fuchsia-300">
                            {activeWindow.row_labels[rowIndex]}
                          </th>
                          {row.map((realValue, columnIndex) => {
                            const imagValue = activeWindow.values_imag[rowIndex][columnIndex];
                            const isZero = cellIsZero(realValue, imagValue);
                            return (
                              <td
                                key={`${rowIndex}-${columnIndex}`}
                                title={`${activeWindow.row_labels[rowIndex]} × ${activeWindow.col_labels[columnIndex]} = ${realValue} + ${imagValue}i`}
                                className={`border-b border-gray-100 px-2 py-2 text-right dark:border-white/5 ${
                                  isZero
                                    ? "text-gray-300 dark:text-gray-700"
                                    : valueMode === "imag"
                                      ? "text-fuchsia-700 dark:text-fuchsia-300"
                                      : realValue > 0
                                        ? "text-blue-700 dark:text-blue-300"
                                        : "text-rose-600 dark:text-rose-300"
                                } ${activeWindow.row_global_indices[rowIndex] === activeWindow.col_global_indices[columnIndex] ? "bg-amber-400/8 font-black" : ""}`}
                              >
                                {formatCellValue(realValue, imagValue, valueMode)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/5">
                    <span className="text-[7px] font-black uppercase tracking-wider text-gray-400">Rango |Z| absoluto</span>
                    <p className="font-mono text-[9px] font-bold text-gray-700 dark:text-gray-200">
                      {formatCompact(payload.matrix.min_nonzero_abs)} → {formatCompact(payload.matrix.max_abs)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/5">
                    <span className="text-[7px] font-black uppercase tracking-wider text-gray-400">Rayleigh</span>
                    <p className="text-[9px] font-bold text-gray-700 dark:text-gray-200">
                      β = {formatCompact(payload.metadata.rayleigh_beta)} · f₁ = {payload.metadata.first_natural_frequency_hz != null ? `${payload.metadata.first_natural_frequency_hz.toFixed(3)} Hz` : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mx-4 mb-4 flex flex-col gap-2 rounded-2xl border border-amber-400/20 bg-amber-500/5 p-3 sm:mx-6 sm:flex-row sm:items-center sm:justify-between sm:p-4">
              <div className="flex items-start gap-2 text-[9px] text-gray-600 dark:text-gray-300">
                <Info size={14} className="mt-0.5 shrink-0 text-amber-500" />
                <span>
                  {matrixScope === "free"
                    ? "Zff(ω) = Kff − ω²Mff + iωCff · el sistema que realmente se resuelve, Zff·U = F, en cada punto del barrido armónico."
                    : "Z(ω) = K − ω²M + iωC ensamblada antes de eliminar los apoyos."}
                </span>
              </div>
              <span className="shrink-0 font-mono text-[10px] font-black text-amber-700 dark:text-amber-300">
                {scopedSymbol}·U(ω) = F(ω)
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default ImpedanceMatrixInspector;
