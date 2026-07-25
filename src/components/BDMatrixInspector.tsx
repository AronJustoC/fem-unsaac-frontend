import React, { useEffect, useState } from "react";
import { CheckCircle2, Download, Info, Loader2, X } from "lucide-react";
import { authenticatedFetch } from "../lib/api";
import { downloadTablePng } from "../lib/matrixImage";
import { useFitScale } from "../lib/useFitScale";

interface BDMatrixInspectorProps {
  structure: any;
  initialElementId: number;
  onClose: () => void;
}

type RowKey = "axial" | "torsion" | "bend_z_end_i" | "bend_z_end_j" | "bend_y_end_i" | "bend_y_end_j";

const rowTabs: { key: RowKey; label: string; hint: string }[] = [
  { key: "axial", label: "Axial", hint: "constante en x, D=E" },
  { key: "torsion", label: "Torsión", hint: "constante en x, D=G" },
  { key: "bend_z_end_i", label: "Flex. Z · extremo i", hint: "curvatura Hermite en x=0, D=E" },
  { key: "bend_z_end_j", label: "Flex. Z · extremo j", hint: "curvatura Hermite en x=L, D=E" },
  { key: "bend_y_end_i", label: "Flex. Y · extremo i", hint: "curvatura Hermite en x=0, D=E" },
  { key: "bend_y_end_j", label: "Flex. Y · extremo j", hint: "curvatura Hermite en x=L, D=E" },
];

const formatCompact = (value: number) => {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1e4 || (Math.abs(value) > 0 && Math.abs(value) < 1e-2)) {
    return value.toExponential(3);
  }
  return value.toFixed(4);
};

const BDMatrixInspector: React.FC<BDMatrixInspectorProps> = ({ structure, initialElementId, onClose }) => {
  const [elementId, setElementId] = useState(initialElementId);
  const [rowKey, setRowKey] = useState<RowKey>("axial");
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
    authenticatedFetch("/api/analysis/element-bd-matrices", {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({ structure, element_id: elementId }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const responseError = await response.json().catch(() => null);
          throw new Error(responseError?.detail || "No se pudieron obtener las matrices B/D.");
        }
        return response.json();
      })
      .then((data) => setPayload(data))
      .catch((requestError) => {
        if (requestError?.name !== "AbortError") setError(requestError?.message || "No se pudieron obtener las matrices B/D.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [structure, elementId]);

  const dofLabels: string[] = payload?.dof_labels ?? [];
  const row: number[] = payload?.B?.[rowKey] ?? [];
  const activeTab = rowTabs.find((t) => t.key === rowKey)!;
  const isBending = rowKey.startsWith("bend");
  const D = isBending || rowKey === "axial" ? payload?.D?.E_axial_bending : payload?.D?.G_shear_torsion;
  const maxDiff = payload?.verification?.max_abs_diff;
  const kLocalScale = payload?.verification?.k_local
    ? Math.max(...payload.verification.k_local.flat().map((v: number) => Math.abs(v)))
    : 1;
  const verified = Number.isFinite(maxDiff) && maxDiff < Math.max(kLocalScale * 1e-6, 1e-6);

  return (
    <div className="fixed inset-0 z-[92] flex items-center justify-center bg-slate-950/75 p-2 backdrop-blur-md sm:p-4 lg:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Matrices B y D del elemento"
        className="flex h-full max-h-[820px] w-full max-w-[980px] flex-col overflow-hidden rounded-2xl border border-emerald-400/20 bg-white shadow-[0_30px_100px_rgba(0,0,0,0.5)] dark:bg-[#080D16] sm:rounded-3xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-white/10 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
              <span className="font-mono text-sm font-black">B·D</span>
            </div>
            <div className="min-w-0">
              <p className="text-[8px] font-black uppercase tracking-[0.25em] text-emerald-600 dark:text-emerald-300">
                Deformación-desplazamiento y constitutiva
              </p>
              <h2 className="truncate text-base font-black uppercase tracking-tight text-gray-950 dark:text-white sm:text-xl">
                [B] y [D] de un elemento
              </h2>
              {payload && !payload.error && (
                <p className="truncate text-[9px] font-mono text-gray-500 dark:text-gray-400">
                  Nodos {payload.node_ids?.join("–")} · L = {payload.length_m?.toFixed(4)} m
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-2.5 py-1.5 dark:border-white/10">
              <span className="text-[8px] font-black uppercase tracking-wider text-gray-400">Elemento</span>
              <input
                type="number"
                min={1}
                value={elementId}
                onChange={(event) => setElementId(Math.max(1, Number(event.target.value) || 1))}
                className="w-16 bg-transparent font-mono text-sm font-black text-emerald-700 outline-none dark:text-emerald-300"
                aria-label="Número de elemento"
              />
            </label>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar inspector B/D"
              className="rounded-xl border border-gray-200 p-2.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 dark:border-white/10 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <X size={17} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar p-4 sm:p-6">
          {loading && (
            <div className="flex min-h-44 flex-col items-center justify-center gap-3 text-gray-400">
              <Loader2 size={22} className="animate-spin text-emerald-500" />
              <span className="text-[9px] font-black uppercase tracking-[0.2em]">Derivando B y D del elemento</span>
            </div>
          )}
          {error && !loading && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/5 p-4 text-xs text-red-600 dark:text-red-300">{error}</div>
          )}

          {payload && !error && !loading && (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                  <span className="block text-[7px] font-black uppercase tracking-wider text-gray-400">D activo en esta fila</span>
                  <span className="font-mono text-[11px] font-black text-emerald-700 dark:text-emerald-300">
                    {rowKey === "torsion" ? "G" : "E"} = {formatCompact(D)} Pa
                  </span>
                </div>
                <div
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[9px] font-black uppercase ${
                    verified
                      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {verified ? <CheckCircle2 size={14} /> : null}
                  {verified ? "Verificado contra k_local" : `Diferencia: ${formatCompact(maxDiff)}`}
                </div>
              </div>

              <div className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1 dark:bg-black/30" role="tablist" aria-label="Fila de B">
                {rowTabs.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={rowKey === key}
                    onClick={() => setRowKey(key)}
                    className={`rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-wide transition ${
                      rowKey === key
                        ? "bg-white text-emerald-700 shadow-sm dark:bg-white/10 dark:text-emerald-300"
                        : "text-gray-500"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-start gap-2 rounded-xl bg-blue-500/5 px-3 py-2 text-[9px] leading-relaxed text-gray-600 dark:text-gray-300">
                <Info size={13} className="mt-0.5 shrink-0 text-blue-500" />
                <span>
                  {activeTab.hint}. σ* = D · [B]·{"{X}"}ᵉ — fila de 12 componentes, una por grado de libertad local del
                  elemento. {isBending ? "Curvatura Hermite (segunda derivada de la función de forma)." : "Fila lineal (deformación uniforme)."}
                </span>
              </div>

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    downloadTablePng(
                      contentNode,
                      `matriz-B-elemento-${elementId}-${rowKey}.png`,
                      `[B] elemento ${elementId} · ${activeTab.label} · ${rowKey === "torsion" ? "G" : "E"} = ${formatCompact(D)} Pa`,
                    )
                  }
                  className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:border-white/10 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <Download size={11} /> PNG
                </button>
              </div>
              <div
                ref={containerRef}
                className="mt-2 overflow-x-auto rounded-2xl border border-gray-200 dark:border-white/10"
              >
                <div style={wrapperStyle}>
                <table
                  ref={contentRef}
                  style={contentStyle}
                  className="w-max min-w-full border-separate border-spacing-0 font-mono text-[9px] tabular-nums"
                >
                  <thead>
                    <tr>
                      {dofLabels.map((label) => (
                        <th
                          key={label}
                          className="min-w-[86px] border-b border-gray-200 bg-gray-100 px-3 py-2 text-right text-emerald-700 dark:border-white/10 dark:bg-[#111827] dark:text-emerald-300"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {row.map((value, index) => (
                        <td
                          key={index}
                          className={`border-b border-gray-100 px-3 py-2 text-right dark:border-white/5 ${
                            Math.abs(value) < 1e-12 ? "text-gray-300 dark:text-gray-700" : "font-black text-gray-800 dark:text-gray-100"
                          }`}
                        >
                          {formatCompact(value)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
                </div>
              </div>

              <p className="mt-3 text-[8px] font-mono leading-relaxed text-gray-400">
                k_local se arma como Σ ∫[B]ᵀ[D][B] — el "Verificado" arriba confirma que estas B y D, integradas, reproducen
                exactamente la matriz de rigidez que ya usa el solver (no se instancian por separado en el resto del código,
                se pre-integran en k_local).
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default BDMatrixInspector;
