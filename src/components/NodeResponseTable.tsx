import React, { useEffect, useMemo, useState } from "react";
import { CircleDot, Grid3X3, Info, TableProperties, X } from "lucide-react";
import MohrCircleDiagram from "./MohrCircleDiagram";

type Quantity = "displacement" | "velocity" | "acceleration" | "stress";

// El esfuerzo (Von Mises) no tiene componentes X/Y/Z: ya es un escalar que combina
// axial + flexion + corte + torsion en un solo numero equivalente. Por eso esta
// cantidad muestra una sola columna en vez de X/Y/Z/Total.
const DIRECTIONAL_QUANTITIES: Quantity[] = ["displacement", "velocity", "acceleration"];

interface NodeResponseTableProps {
  structure: any;
  results: any;
  frequencyIndex: number;
  onClose: () => void;
}

// Nuestra amplitud sale del fasor armonico -> siempre es 0-pk (cero a pico).
// RMS = pk / sqrt(2) y pk-pk = pk * 2 solo valen para una senoidal pura en
// estado estacionario, que es exactamente el caso aca (una frecuencia a la vez).
const RMS_FACTOR = 1 / Math.SQRT2;
const PKPK_FACTOR = 2;

// Factor de conversion DESDE la unidad base SI (m, m/s, m/s^2).
// RMS en mm/s e in/s: severidad de maquinaria segun ISO 10816 / ISO 20816.
// Mil pk-pk: desplazamiento de eje segun API 670 (estandar en monitoreo de turbomaquinaria).
// g RMS: nivel global de aceleracion, uso comun en analisis de rodamientos/engranajes.
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
  // Esfuerzo alternante ya viene en Pa desde el backend (envolvente de Von Mises
  // por nodo). psi es la unidad de esfuerzo mas comun en normas/practica de EEUU.
  stress: [
    { key: "pa", label: "Pa", factor: 1 },
    { key: "kpa", label: "kPa", factor: 1 / 1_000 },
    { key: "mpa", label: "MPa", factor: 1 / 1_000_000 },
    { key: "psi", label: "psi", factor: 1 / 6_894.757 },
  ],
};

const quantityTabs: { key: Quantity; label: string }[] = [
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

// u(t) = Re[U e^{iwt}] -> v = iw*U, a = -w^2*U. La magnitud de multiplicar por
// (iw)^n no cambia por eje (|i^n w^n z| = w^n|z|), asi que la amplitud X/Y/Z de
// velocidad/aceleracion sale directo del desplazamiento complejo ya existente,
// sin pedir nada nuevo al backend.
type AxisAmplitude = { x: number; y: number; z: number; total: number };

// Circulo de Mohr por nodo (envolvente entre los extremos de elementos conectados
// a ese nodo, ya calculada en el backend): normal, cortante, los dos principales,
// cortante maximo, y Von Mises como resumen final. Ninguno tiene ejes X/Y/Z —
// son todos estados de esfuerzo en la fibra extrema del elemento, no vectores.
type StressBreakdown = { normal: number; shear: number; sigma1: number; sigma2: number; tauMax: number; vm: number };

type NodeRow = {
  nodeId: number;
  displacement: AxisAmplitude;
  velocity: AxisAmplitude;
  acceleration: AxisAmplitude;
  stress: StressBreakdown;
};

const buildNodeRows = (structure: any, results: any, frequencyIndex: number): NodeRow[] => {
  const nodeIds = (Array.isArray(structure?.nodes) ? structure.nodes : [])
    .map((node: any) => Number(node?.id))
    .filter((id: number) => Number.isFinite(id))
    .sort((a: number, b: number) => a - b);

  const omega = 2 * Math.PI * Number(results?.frequencies_sweep?.[frequencyIndex] ?? 0);

  return nodeIds.map((nodeId: number) => {
    const comp = results?.node_displacement_components?.[String(nodeId)] ?? {};
    const axisAmplitude = (real?: number[], imag?: number[]) =>
      Math.hypot(Number(real?.[frequencyIndex] ?? 0), Number(imag?.[frequencyIndex] ?? 0));

    const dispX = axisAmplitude(comp.ux_real_m, comp.ux_imag_m);
    const dispY = axisAmplitude(comp.uy_real_m, comp.uy_imag_m);
    const dispZ = axisAmplitude(comp.uz_real_m, comp.uz_imag_m);

    const nodeSeries = results?.node_response_series?.[String(nodeId)] ?? {};
    const stressAt = (key: string) => Number(nodeSeries?.[key]?.[frequencyIndex] ?? 0);

    return {
      nodeId,
      displacement: { x: dispX, y: dispY, z: dispZ, total: Math.hypot(dispX, dispY, dispZ) },
      velocity: { x: omega * dispX, y: omega * dispY, z: omega * dispZ, total: omega * Math.hypot(dispX, dispY, dispZ) },
      acceleration: {
        x: omega ** 2 * dispX,
        y: omega ** 2 * dispY,
        z: omega ** 2 * dispZ,
        total: omega ** 2 * Math.hypot(dispX, dispY, dispZ),
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

const stressColumns: { key: keyof StressBreakdown; label: string }[] = [
  { key: "normal", label: "σ normal" },
  { key: "shear", label: "τ corte" },
  { key: "sigma1", label: "σ1 (principal)" },
  { key: "sigma2", label: "σ2 (principal)" },
  { key: "tauMax", label: "τ máx (Mohr)" },
  { key: "vm", label: "σ Von Mises" },
];

const NodeResponseTable: React.FC<NodeResponseTableProps> = ({ structure, results, frequencyIndex, onClose }) => {
  const [quantity, setQuantity] = useState<Quantity>("displacement");
  const [mohrNodeId, setMohrNodeId] = useState<number | null>(null);
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

  const rows = useMemo(() => buildNodeRows(structure, results, frequencyIndex), [structure, results, frequencyIndex]);
  const frequencyHz = Number(results?.frequencies_sweep?.[frequencyIndex] ?? 0);
  const units = unitOptions[quantity];
  const activeUnit = units.find((unit) => unit.key === unitKey[quantity]) ?? units[0];
  const isDirectional = DIRECTIONAL_QUANTITIES.includes(quantity);
  const columnLabels = isDirectional ? ["X", "Y", "Z", "|Total|"] : stressColumns.map((c) => c.label);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/75 p-2 backdrop-blur-md sm:p-4 lg:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Tabla de respuesta por nodo"
        className="flex h-full max-h-[980px] w-full max-w-[1100px] flex-col overflow-hidden rounded-2xl border border-cyan-400/20 bg-white shadow-[0_30px_100px_rgba(0,0,0,0.5)] dark:bg-[#080D16] sm:rounded-3xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-white/10 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-300">
              <TableProperties size={21} />
            </div>
            <div className="min-w-0">
              <p className="text-[8px] font-black uppercase tracking-[0.25em] text-cyan-600 dark:text-cyan-300">
                Respuesta por nodo · X / Y / Z
              </p>
              <h2 className="truncate text-base font-black uppercase tracking-tight text-gray-950 dark:text-white sm:text-xl">
                Tabla de nodos @ {frequencyHz.toFixed(3)} Hz
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar tabla de nodos"
            className="rounded-xl border border-gray-200 p-2.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 dark:border-white/10 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X size={17} />
          </button>
        </header>

        <div className="shrink-0 border-b border-gray-200 px-4 py-3 dark:border-white/10 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-black/30" role="tablist" aria-label="Cantidad">
              {quantityTabs.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={quantity === key}
                  onClick={() => setQuantity(key)}
                  className={`rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-wide transition sm:px-4 ${
                    quantity === key
                      ? "bg-white text-cyan-700 shadow-sm dark:bg-white/10 dark:text-cyan-300"
                      : "text-gray-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex rounded-xl border border-gray-200 p-1 dark:border-white/10" role="tablist" aria-label="Unidad">
              {units.map((unit) => (
                <button
                  key={unit.key}
                  type="button"
                  role="tab"
                  aria-selected={activeUnit.key === unit.key}
                  onClick={() => setUnitKey((prev) => ({ ...prev, [quantity]: unit.key }))}
                  className={`rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-wide transition sm:px-4 ${
                    activeUnit.key === unit.key
                      ? "bg-gray-950 text-white dark:bg-white dark:text-gray-950"
                      : "text-gray-500"
                  }`}
                >
                  {unit.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex items-start gap-2 rounded-xl bg-blue-500/5 px-3 py-2 text-[9px] leading-relaxed text-gray-600 dark:text-gray-300">
            <Info size={13} className="mt-0.5 shrink-0 text-blue-500" />
            <span>
              Amplitud en estado estacionario a la frecuencia animada, nodos en orden ascendente. Cambiá de pestaña
              para ver desplazamiento, velocidad, aceleración o esfuerzo; la unidad se recuerda por separado en cada
              una. {quantity === "stress" && "En Esfuerzo: normal y cortante son la envolvente por nodo del elemento conectado más solicitado; σ1/σ2/τ_máx salen del círculo de Mohr de ese mismo estado (σ_normal, τ_corte, σ_y=0); Von Mises es el resumen final."}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar px-3 py-3 lg:px-6">
          {rows.length === 0 ? (
            <div className="flex min-h-44 flex-col items-center justify-center gap-2 text-gray-400">
              <Grid3X3 size={22} />
              <span className="text-[9px] font-black uppercase tracking-[0.2em]">Sin resultados de barrido</span>
            </div>
          ) : (
            <table className="w-max min-w-full border-separate border-spacing-0 font-mono text-[9px] tabular-nums lg:text-[10px]">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-gray-400 dark:border-white/10 dark:bg-[#111827]">
                    Nodo
                  </th>
                  {columnLabels.map((label) => (
                    <th
                      key={label}
                      className="sticky top-0 z-20 min-w-[100px] border-b border-gray-200 bg-gray-100 px-3 py-2 text-right text-cyan-700 dark:border-white/10 dark:bg-[#111827] dark:text-cyan-300"
                    >
                      {label} ({activeUnit.label})
                    </th>
                  ))}
                  {!isDirectional && (
                    <th className="sticky top-0 z-20 min-w-[70px] border-b border-gray-200 bg-gray-100 px-3 py-2 text-center text-cyan-700 dark:border-white/10 dark:bg-[#111827] dark:text-cyan-300">
                      Mohr
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row: NodeRow) => (
                  <tr key={row.nodeId}>
                    <th className="sticky left-0 z-10 border-b border-r border-gray-200 bg-gray-100 px-3 py-2 text-left text-cyan-700 dark:border-white/10 dark:bg-[#111827] dark:text-cyan-300">
                      {row.nodeId}
                    </th>
                    {isDirectional ? (
                      <>
                        <td className="border-b border-gray-100 px-3 py-2 text-right dark:border-white/5">{formatValue((row[quantity as "displacement" | "velocity" | "acceleration"]).x * activeUnit.factor)}</td>
                        <td className="border-b border-gray-100 px-3 py-2 text-right dark:border-white/5">{formatValue((row[quantity as "displacement" | "velocity" | "acceleration"]).y * activeUnit.factor)}</td>
                        <td className="border-b border-gray-100 px-3 py-2 text-right dark:border-white/5">{formatValue((row[quantity as "displacement" | "velocity" | "acceleration"]).z * activeUnit.factor)}</td>
                        <td className="border-b border-gray-100 px-3 py-2 text-right font-black text-amber-700 dark:text-amber-300">
                          {formatValue((row[quantity as "displacement" | "velocity" | "acceleration"]).total * activeUnit.factor)}
                        </td>
                      </>
                    ) : (
                      <>
                        {stressColumns.map(({ key }) => (
                          <td
                            key={key}
                            className={`border-b border-gray-100 px-3 py-2 text-right dark:border-white/5 ${key === "vm" ? "font-black text-amber-700 dark:text-amber-300" : ""}`}
                          >
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
        const row = rows.find((r) => r.nodeId === mohrNodeId);
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
