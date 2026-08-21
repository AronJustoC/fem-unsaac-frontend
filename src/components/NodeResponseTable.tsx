import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  CircleDot,
  FileSpreadsheet,
  Grid3X3,
  Info,
  MapPinned,
  Search,
  TableProperties,
  X,
} from "lucide-react";
import MohrCircleDiagram from "./MohrCircleDiagram";

type Quantity = "displacement" | "velocity" | "acceleration" | "stress";
type TableMode = "measurement" | Quantity;

const DIRECTIONAL_QUANTITIES: Quantity[] = ["displacement", "velocity", "acceleration"];

interface NodeResponseTableProps {
  structure: any;
  results: any;
  frequencyIndex: number;
  selectedNodeIds: number[];
  presetNodeIds?: number[];
  onSelectedNodeIdsChange: (nodeIds: number[]) => void;
  onFrequencyIndexChange: (frequencyIndex: number) => void;
  onClose: () => void;
}

export const RMS_FACTOR = 1 / Math.SQRT2;
const PKPK_FACTOR = 2;

const unitOptions: Record<Quantity, { key: string; label: string; factor: number }[]> = {
  displacement: [
    { key: "m", label: "m (0-pk)", factor: 1 },
    { key: "mm", label: "mm (0-pk)", factor: 1_000 },
    { key: "mm_pp", label: "mm (pk-pk)", factor: 1_000 * PKPK_FACTOR },
    { key: "um", label: "µm (0-pk)", factor: 1_000_000 },
    { key: "mil_pp", label: "mil (pk-pk) · API 670", factor: 39_370.0787 * PKPK_FACTOR },
  ],
  velocity: [
    { key: "m_s", label: "m/s (0-pk)", factor: 1 },
    { key: "mm_s", label: "mm/s (0-pk)", factor: 1_000 },
    { key: "mm_s_rms", label: "mm/s RMS · ISO 10816", factor: 1_000 * RMS_FACTOR },
    { key: "in_s", label: "in/s (0-pk)", factor: 39.3700787 },
    { key: "in_s_rms", label: "in/s RMS", factor: 39.3700787 * RMS_FACTOR },
  ],
  acceleration: [
    { key: "m_s2", label: "m/s² (0-pk)", factor: 1 },
    { key: "g", label: "g (0-pk)", factor: 1 / 9.80665 },
    { key: "g_rms", label: "g RMS", factor: (1 / 9.80665) * RMS_FACTOR },
  ],
  stress: [
    { key: "pa", label: "Pa", factor: 1 },
    { key: "kpa", label: "kPa", factor: 1 / 1_000 },
    { key: "mpa", label: "MPa", factor: 1 / 1_000_000 },
    { key: "psi", label: "psi", factor: 1 / 6_894.757 },
  ],
};

const tableTabs: { key: TableMode; label: string }[] = [
  { key: "measurement", label: "Tabla tesis" },
  { key: "displacement", label: "Desplazamiento" },
  { key: "velocity", label: "Velocidad" },
  { key: "acceleration", label: "Aceleración" },
  { key: "stress", label: "Esfuerzo σ" },
];

const formatValue = (value: number) => {
  if (!Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e5 || magnitude < 1e-3)) return value.toExponential(3);
  return value.toFixed(4);
};

type AxisAmplitude = { x: number; y: number; z: number; total: number };
type StressBreakdown = { normal: number; shear: number; sigma1: number; sigma2: number; tauMax: number; vm: number };

export type NodeRow = {
  nodeId: number;
  displacement: AxisAmplitude;
  velocity: AxisAmplitude;
  acceleration: AxisAmplitude;
  stress: StressBreakdown;
};

const getNodeIds = (structure: any): number[] =>
  (Array.isArray(structure?.nodes) ? structure.nodes : [])
    .map((node: any) => Number(node?.id))
    .filter((id: number) => Number.isFinite(id))
    .sort((a: number, b: number) => a - b);

export const buildNodeRows = (structure: any, results: any, frequencyIndex: number): NodeRow[] => {
  const omega = 2 * Math.PI * Number(results?.frequencies_sweep?.[frequencyIndex] ?? 0);

  return getNodeIds(structure).map((nodeId: number) => {
    const comp = results?.node_displacement_components?.[String(nodeId)] ?? {};
    const axisAmplitude = (real?: number[], imag?: number[]) =>
      Math.hypot(Number(real?.[frequencyIndex] ?? 0), Number(imag?.[frequencyIndex] ?? 0));

    const dispX = axisAmplitude(comp.ux_real_m, comp.ux_imag_m);
    const dispY = axisAmplitude(comp.uy_real_m, comp.uy_imag_m);
    const dispZ = axisAmplitude(comp.uz_real_m, comp.uz_imag_m);
    const total = Math.hypot(dispX, dispY, dispZ);

    const nodeSeries = results?.node_response_series?.[String(nodeId)] ?? {};
    const stressAt = (key: string) => Number(nodeSeries?.[key]?.[frequencyIndex] ?? 0);

    return {
      nodeId,
      displacement: { x: dispX, y: dispY, z: dispZ, total },
      velocity: { x: omega * dispX, y: omega * dispY, z: omega * dispZ, total: omega * total },
      acceleration: {
        x: omega ** 2 * dispX,
        y: omega ** 2 * dispY,
        z: omega ** 2 * dispZ,
        total: omega ** 2 * total,
      },
      stress: {
        normal: stressAt("stress_normal_pa"),
        shear: stressAt("stress_shear_pa"),
        sigma1: stressAt("stress_sigma1_pa"),
        sigma2: stressAt("stress_sigma2_pa"),
        tauMax: stressAt("stress_taumax_pa"),
        vm: stressAt("stress_pa"),
      },
    };
  });
};

const getCriticalNodeIds = (results: any, limit = 8): number[] =>
  Object.entries(results?.node_response_series ?? {})
    .map(([nodeId, series]: [string, any]) => ({
      nodeId: Number(nodeId),
      peak: Math.max(0, ...(Array.isArray(series?.displacement_m) ? series.displacement_m.map(Number) : [0])),
    }))
    .filter(({ nodeId }) => Number.isFinite(nodeId))
    .sort((a, b) => b.peak - a.peak)
    .slice(0, limit)
    .map(({ nodeId }) => nodeId);

const stressColumns: { key: keyof StressBreakdown; label: string }[] = [
  { key: "normal", label: "σ normal" },
  { key: "shear", label: "τ corte" },
  { key: "sigma1", label: "σ1 (principal)" },
  { key: "sigma2", label: "σ2 (principal)" },
  { key: "tauMax", label: "τ máx (Mohr)" },
  { key: "vm", label: "σ Von Mises" },
];

const escapeXml = (value: string | number) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const xmlCell = (value: string | number, styleId?: string) => {
  const numeric = typeof value === "number" && Number.isFinite(value);
  return `<Cell${styleId ? ` ss:StyleID="${styleId}"` : ""}><Data ss:Type="${numeric ? "Number" : "String"}">${escapeXml(numeric ? value : String(value))}</Data></Cell>`;
};

const downloadMeasurementWorkbook = (
  structure: any,
  results: any,
  selectedNodeIds: number[],
  frequencyIndex: number,
) => {
  const selectedSet = new Set(selectedNodeIds);
  const frequencies: number[] = Array.isArray(results?.frequencies_sweep)
    ? results.frequencies_sweep.map(Number)
    : [];
  const currentRows = buildNodeRows(structure, results, frequencyIndex)
    .filter((row) => selectedSet.has(row.nodeId));

  const measurementHeader = [
    "Frecuencia [Hz]",
    "Punto",
    "Nodo",
    "Velocidad Y 0-pk [mm/s]",
    "Velocidad Z 0-pk [mm/s]",
    "Velocidad Y RMS [mm/s]",
    "Velocidad Z RMS [mm/s]",
  ];

  const allRows = frequencies.flatMap((frequency, index) => {
    const rowMap = new Map(buildNodeRows(structure, results, index).map((row) => [row.nodeId, row]));
    return selectedNodeIds.flatMap((nodeId, pointIndex) => {
      const row = rowMap.get(nodeId);
      if (!row) return [];
      return [[
        frequency,
        pointIndex + 1,
        nodeId,
        row.velocity.y * 1_000,
        row.velocity.z * 1_000,
        row.velocity.y * 1_000 * RMS_FACTOR,
        row.velocity.z * 1_000 * RMS_FACTOR,
      ]];
    });
  });

  const makeSheet = (name: string, rows: (string | number)[][]) => `
    <Worksheet ss:Name="${escapeXml(name)}">
      <Table>
        <Row>${measurementHeader.map((value) => xmlCell(value, "Header")).join("")}</Row>
        ${rows.map((row) => `<Row>${row.map((value) => xmlCell(value, typeof value === "number" ? "Number" : undefined)).join("")}</Row>`).join("")}
      </Table>
      <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions>
    </Worksheet>`;

  const currentFrequency = Number(frequencies[frequencyIndex] ?? 0);
  const currentSheetRows = currentRows.map((row, pointIndex) => [
    currentFrequency,
    pointIndex + 1,
    row.nodeId,
    row.velocity.y * 1_000,
    row.velocity.z * 1_000,
    row.velocity.y * 1_000 * RMS_FACTOR,
    row.velocity.z * 1_000 * RMS_FACTOR,
  ]);

  const workbook = `<?xml version="1.0"?>
  <?mso-application progid="Excel.Sheet"?>
  <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
    xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:x="urn:schemas-microsoft-com:office:excel"
    xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
    <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
      <Title>Respuesta armónica por nodos de medición</Title>
      <Author>FEM UNSAAC</Author>
      <Created>${new Date().toISOString()}</Created>
    </DocumentProperties>
    <Styles>
      <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Bottom"/><Font ss:FontName="Calibri" ss:Size="11"/></Style>
      <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0891B2" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/></Style>
      <Style ss:ID="Number"><NumberFormat ss:Format="0.0000"/></Style>
    </Styles>
    ${makeSheet("Barrido por frecuencia", allRows)}
    ${makeSheet(`Frecuencia ${currentFrequency.toFixed(3)} Hz`.slice(0, 31), currentSheetRows)}
  </Workbook>`;

  const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `respuesta_armonica_nodos_${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const NodeResponseTable: React.FC<NodeResponseTableProps> = ({
  structure,
  results,
  frequencyIndex,
  selectedNodeIds,
  presetNodeIds = [],
  onSelectedNodeIdsChange,
  onFrequencyIndexChange,
  onClose,
}) => {
  const [tableMode, setTableMode] = useState<TableMode>("measurement");
  const [mohrNodeId, setMohrNodeId] = useState<number | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(true);
  const [nodeSearch, setNodeSearch] = useState("");
  const [unitKey, setUnitKey] = useState<Record<Quantity, string>>({
    displacement: "mm",
    velocity: "mm_s",
    acceleration: "m_s2",
    stress: "mpa",
  });

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const allNodeIds = useMemo(() => getNodeIds(structure), [structure]);
  const allRows = useMemo(() => buildNodeRows(structure, results, frequencyIndex), [structure, results, frequencyIndex]);
  const rowMap = useMemo(() => new Map(allRows.map((row) => [row.nodeId, row])), [allRows]);
  const selectedRows = selectedNodeIds.flatMap((nodeId) => {
    const row = rowMap.get(nodeId);
    return row ? [row] : [];
  });
  const rows = selectedRows.length > 0 ? selectedRows : allRows;
  const frequencies: number[] = Array.isArray(results?.frequencies_sweep) ? results.frequencies_sweep : [];
  const frequencyHz = Number(frequencies[frequencyIndex] ?? 0);
  const quantity: Quantity = tableMode === "measurement" ? "velocity" : tableMode;
  const units = unitOptions[quantity];
  const activeUnit = units.find((unit) => unit.key === unitKey[quantity]) ?? units[0];
  const isDirectional = DIRECTIONAL_QUANTITIES.includes(quantity);
  const columnLabels = isDirectional ? ["X", "Y", "Z", "|Total|"] : stressColumns.map((column) => column.label);
  const filteredNodeIds = allNodeIds.filter((nodeId) => String(nodeId).includes(nodeSearch.trim()));

  const toggleNode = (nodeId: number) => {
    onSelectedNodeIdsChange(
      selectedNodeIds.includes(nodeId)
        ? selectedNodeIds.filter((id) => id !== nodeId)
        : [...selectedNodeIds, nodeId],
    );
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/75 p-2 backdrop-blur-md sm:p-4 lg:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Medición armónica por frecuencia"
        className="flex h-full max-h-[980px] w-full max-w-[1240px] flex-col overflow-hidden rounded-2xl border border-cyan-400/20 bg-white shadow-[0_30px_100px_rgba(0,0,0,0.5)] dark:bg-[#080D16] sm:rounded-3xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-white/10 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-300">
              <TableProperties size={21} />
            </div>
            <div className="min-w-0">
              <p className="text-[8px] font-black uppercase tracking-[0.25em] text-cyan-600 dark:text-cyan-300">
                Respuesta armónica · puntos de medición
              </p>
              <h2 className="truncate text-base font-black uppercase tracking-tight text-gray-950 dark:text-white sm:text-xl">
                Resultados @ {frequencyHz.toFixed(3)} Hz
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selectedNodeIds.length === 0}
              onClick={() => downloadMeasurementWorkbook(structure, results, selectedNodeIds, frequencyIndex)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-[9px] font-black uppercase tracking-wide text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
            >
              <FileSpreadsheet size={15} />
              <span className="hidden sm:inline">Exportar Excel</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar tabla de medición"
              className="rounded-xl border border-gray-200 p-2.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 dark:border-white/10 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <X size={17} />
            </button>
          </div>
        </header>

        <div className="shrink-0 border-b border-gray-200 px-4 py-3 dark:border-white/10 sm:px-6">
          <button
            type="button"
            onClick={() => setSelectorOpen((open) => !open)}
            aria-expanded={selectorOpen}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/5 px-3 py-2 text-left"
          >
            <span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-fuchsia-700 dark:text-fuchsia-300">
              <MapPinned size={14} />
              Nodos de medición
              <span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5">{selectedNodeIds.length} seleccionados</span>
            </span>
            <ChevronDown size={14} className={`text-fuchsia-500 transition-transform ${selectorOpen ? "rotate-180" : ""}`} />
          </button>

          {selectorOpen && (
            <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-black/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative min-w-[190px] flex-1 sm:max-w-xs">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={nodeSearch}
                    onChange={(event) => setNodeSearch(event.target.value)}
                    placeholder="Buscar nodo..."
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-[10px] font-bold text-gray-700 outline-none focus:border-fuchsia-400 dark:border-white/10 dark:bg-[#080D16] dark:text-gray-200"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {presetNodeIds.length > 0 && (
                    <button type="button" onClick={() => onSelectedNodeIdsChange(presetNodeIds)} className="rounded-lg bg-fuchsia-500 px-2.5 py-2 text-[8px] font-black uppercase text-white shadow-sm">
                      Puntos tesis
                    </button>
                  )}
                  <button type="button" onClick={() => onSelectedNodeIdsChange(getCriticalNodeIds(results))} className="rounded-lg bg-amber-500/10 px-2.5 py-2 text-[8px] font-black uppercase text-amber-700 dark:text-amber-300">
                    Top 8 críticos
                  </button>
                  <button type="button" onClick={() => onSelectedNodeIdsChange(allNodeIds)} className="rounded-lg bg-cyan-500/10 px-2.5 py-2 text-[8px] font-black uppercase text-cyan-700 dark:text-cyan-300">
                    Todos
                  </button>
                  <button type="button" onClick={() => onSelectedNodeIdsChange([])} className="rounded-lg bg-gray-200/70 px-2.5 py-2 text-[8px] font-black uppercase text-gray-600 dark:bg-white/10 dark:text-gray-300">
                    Ninguno
                  </button>
                </div>
              </div>
              <div className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto custom-scrollbar">
                {filteredNodeIds.map((nodeId) => {
                  const selected = selectedNodeIds.includes(nodeId);
                  const pointIndex = selectedNodeIds.indexOf(nodeId);
                  return (
                    <button
                      key={nodeId}
                      type="button"
                      onClick={() => toggleNode(nodeId)}
                      aria-pressed={selected}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[9px] font-black transition ${
                        selected
                          ? "border-fuchsia-400 bg-fuchsia-500 text-white shadow-sm"
                          : "border-gray-200 bg-white text-gray-500 hover:border-fuchsia-300 dark:border-white/10 dark:bg-white/5"
                      }`}
                    >
                      {selected && <Check size={11} />}
                      {selected ? `P${pointIndex + 1} · ` : ""}Nodo {nodeId}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {frequencies.length > 1 && (
            <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-gray-200 px-3 py-2 dark:border-white/10">
              <div>
                <div className="mb-1 flex items-center justify-between text-[8px] font-black uppercase tracking-wide text-gray-500">
                  <span>Frecuencia de la tabla</span>
                  <span className="text-cyan-600 dark:text-cyan-300">{frequencyHz.toFixed(3)} Hz · {frequencyIndex + 1}/{frequencies.length}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={frequencies.length - 1}
                  value={frequencyIndex}
                  onChange={(event) => onFrequencyIndexChange(Number(event.target.value))}
                  className="w-full accent-cyan-500"
                  aria-label="Frecuencia de la tabla de medición"
                />
              </div>
              <select
                value={frequencyIndex}
                onChange={(event) => onFrequencyIndexChange(Number(event.target.value))}
                className="max-w-[150px] rounded-lg border border-gray-200 bg-white px-2 py-2 text-[9px] font-black text-cyan-700 outline-none dark:border-white/10 dark:bg-[#080D16] dark:text-cyan-300"
                aria-label="Seleccionar frecuencia exacta"
              >
                {frequencies.map((frequency, index) => (
                  <option key={`${frequency}-${index}`} value={index}>{Number(frequency).toFixed(3)} Hz</option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex max-w-full overflow-x-auto rounded-xl bg-gray-100 p-1 dark:bg-black/30" role="tablist" aria-label="Tipo de tabla">
              {tableTabs.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tableMode === key}
                  onClick={() => setTableMode(key)}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-[8px] font-black uppercase tracking-wide transition sm:px-4 ${
                    tableMode === key
                      ? "bg-white text-cyan-700 shadow-sm dark:bg-white/10 dark:text-cyan-300"
                      : "text-gray-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {tableMode !== "measurement" && (
              <div className="flex max-w-full overflow-x-auto rounded-xl border border-gray-200 p-1 dark:border-white/10" role="tablist" aria-label="Unidad">
                {units.map((unit) => (
                  <button
                    key={unit.key}
                    type="button"
                    role="tab"
                    aria-selected={activeUnit.key === unit.key}
                    onClick={() => setUnitKey((previous) => ({ ...previous, [quantity]: unit.key }))}
                    className={`whitespace-nowrap rounded-lg px-3 py-2 text-[8px] font-black uppercase tracking-wide transition ${
                      activeUnit.key === unit.key
                        ? "bg-gray-950 text-white dark:bg-white dark:text-gray-950"
                        : "text-gray-500"
                    }`}
                  >
                    {unit.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-2 flex items-start gap-2 rounded-xl bg-blue-500/5 px-3 py-2 text-[9px] leading-relaxed text-gray-600 dark:text-gray-300">
            <Info size={13} className="mt-0.5 shrink-0 text-blue-500" />
            <span>
              {tableMode === "measurement"
                ? "Formato tipo tesis: cada punto corresponde a un nodo seleccionado. Se muestran amplitudes fasoriales 0-pk y su equivalente RMS en Y (lateral) y Z (vertical). El Excel incluye todos los puntos del barrido, ordenados por frecuencia."
                : `Amplitud estacionaria de los nodos seleccionados a ${frequencyHz.toFixed(3)} Hz. Cambia la frecuencia con el control superior.`}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar px-3 py-3 lg:px-6">
          {selectedNodeIds.length === 0 ? (
            <div className="flex min-h-44 flex-col items-center justify-center gap-2 text-gray-400">
              <MapPinned size={26} />
              <span className="text-[9px] font-black uppercase tracking-[0.2em]">Selecciona uno o más nodos de medición</span>
            </div>
          ) : tableMode === "measurement" ? (
            <table className="w-max min-w-full border-separate border-spacing-0 font-mono text-[9px] tabular-nums lg:text-[10px]">
              <thead>
                <tr>
                  <th rowSpan={2} className="sticky left-0 top-0 z-30 border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-gray-500 dark:border-white/10 dark:bg-[#111827]">Punto</th>
                  <th rowSpan={2} className="sticky left-[70px] top-0 z-30 border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-gray-500 dark:border-white/10 dark:bg-[#111827]">Nodo</th>
                  <th colSpan={2} className="sticky top-0 z-20 border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-center text-cyan-700 dark:border-white/10 dark:bg-[#111827] dark:text-cyan-300">Respuesta en Velocidad [mm/s]</th>
                  <th colSpan={2} className="sticky top-0 z-20 border-b border-gray-200 bg-gray-100 px-3 py-2 text-center text-cyan-700 dark:border-white/10 dark:bg-[#111827] dark:text-cyan-300">Velocidad RMS [mm/s]</th>
                </tr>
                <tr>
                  {["Dir. Y (Lateral)", "Dir. Z (Vertical)", "Dir. Y (Lateral)", "Dir. Z (Vertical)"].map((label) => (
                    <th key={label} className="sticky top-[33px] z-20 min-w-[135px] border-b border-gray-200 bg-gray-100 px-3 py-2 text-right text-cyan-700 dark:border-white/10 dark:bg-[#111827] dark:text-cyan-300">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedRows.map((row, pointIndex) => (
                  <tr key={row.nodeId}>
                    <th className="sticky left-0 z-10 w-[70px] border-b border-r border-gray-200 bg-white px-3 py-2 text-center text-fuchsia-600 dark:border-white/10 dark:bg-[#080D16] dark:text-fuchsia-300">{pointIndex + 1}</th>
                    <th className="sticky left-[70px] z-10 border-b border-r border-gray-200 bg-white px-3 py-2 text-left text-cyan-700 dark:border-white/10 dark:bg-[#080D16] dark:text-cyan-300">{row.nodeId}</th>
                    <td className="border-b border-gray-100 px-3 py-2 text-right dark:border-white/5">{formatValue(row.velocity.y * 1_000)}</td>
                    <td className="border-b border-gray-100 px-3 py-2 text-right dark:border-white/5">{formatValue(row.velocity.z * 1_000)}</td>
                    <td className="border-b border-gray-100 px-3 py-2 text-right font-black text-amber-700 dark:border-white/5 dark:text-amber-300">{formatValue(row.velocity.y * 1_000 * RMS_FACTOR)}</td>
                    <td className="border-b border-gray-100 px-3 py-2 text-right font-black text-amber-700 dark:border-white/5 dark:text-amber-300">{formatValue(row.velocity.z * 1_000 * RMS_FACTOR)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : rows.length === 0 ? (
            <div className="flex min-h-44 flex-col items-center justify-center gap-2 text-gray-400">
              <Grid3X3 size={22} />
              <span className="text-[9px] font-black uppercase tracking-[0.2em]">Sin resultados de barrido</span>
            </div>
          ) : (
            <table className="w-max min-w-full border-separate border-spacing-0 font-mono text-[9px] tabular-nums lg:text-[10px]">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-gray-400 dark:border-white/10 dark:bg-[#111827]">Nodo</th>
                  {columnLabels.map((label) => (
                    <th key={label} className="sticky top-0 z-20 min-w-[100px] border-b border-gray-200 bg-gray-100 px-3 py-2 text-right text-cyan-700 dark:border-white/10 dark:bg-[#111827] dark:text-cyan-300">
                      {label} ({activeUnit.label})
                    </th>
                  ))}
                  {!isDirectional && (
                    <th className="sticky top-0 z-20 min-w-[70px] border-b border-gray-200 bg-gray-100 px-3 py-2 text-center text-cyan-700 dark:border-white/10 dark:bg-[#111827] dark:text-cyan-300">Mohr</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.nodeId}>
                    <th className="sticky left-0 z-10 border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-left text-cyan-700 dark:border-white/10 dark:bg-[#111827] dark:text-cyan-300">{row.nodeId}</th>
                    {isDirectional ? (
                      <>
                        <td className="border-b border-gray-100 px-3 py-2 text-right dark:border-white/5">{formatValue(row[quantity as "displacement" | "velocity" | "acceleration"].x * activeUnit.factor)}</td>
                        <td className="border-b border-gray-100 px-3 py-2 text-right dark:border-white/5">{formatValue(row[quantity as "displacement" | "velocity" | "acceleration"].y * activeUnit.factor)}</td>
                        <td className="border-b border-gray-100 px-3 py-2 text-right dark:border-white/5">{formatValue(row[quantity as "displacement" | "velocity" | "acceleration"].z * activeUnit.factor)}</td>
                        <td className="border-b border-gray-100 px-3 py-2 text-right font-black text-amber-700 dark:text-amber-300">{formatValue(row[quantity as "displacement" | "velocity" | "acceleration"].total * activeUnit.factor)}</td>
                      </>
                    ) : (
                      <>
                        {stressColumns.map(({ key }) => (
                          <td key={key} className={`border-b border-gray-100 px-3 py-2 text-right dark:border-white/5 ${key === "vm" ? "font-black text-amber-700 dark:text-amber-300" : ""}`}>
                            {formatValue(row.stress[key] * activeUnit.factor)}
                          </td>
                        ))}
                        <td className="border-b border-gray-100 px-3 py-2 text-center dark:border-white/5">
                          <button
                            type="button"
                            onClick={() => setMohrNodeId(row.nodeId)}
                            title="Ver círculo de Mohr"
                            aria-label={`Ver círculo de Mohr del nodo ${row.nodeId}`}
                            className="inline-flex cursor-pointer items-center justify-center rounded-lg p-1.5 text-gray-400 transition hover:bg-cyan-500/10 hover:text-cyan-600 dark:hover:text-cyan-300"
                          >
                            <CircleDot size={14} />
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {mohrNodeId !== null && (() => {
        const row = rows.find((candidate) => candidate.nodeId === mohrNodeId);
        if (!row) return null;
        return (
          <MohrCircleDiagram
            nodeId={mohrNodeId}
            sigmaNormal={row.stress.normal}
            tauShear={row.stress.shear}
            sigma1={row.stress.sigma1}
            sigma2={row.stress.sigma2}
            tauMax={row.stress.tauMax}
            unitLabel={activeUnit.label}
            factor={activeUnit.factor}
            onClose={() => setMohrNodeId(null)}
          />
        );
      })()}
    </div>
  );
};

export default NodeResponseTable;
