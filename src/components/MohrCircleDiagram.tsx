import React from "react";
import { X, Info } from "lucide-react";

interface MohrCircleDiagramProps {
  nodeId: number;
  sigmaNormal: number;
  tauShear: number;
  sigma1: number;
  sigma2: number;
  tauMax: number;
  unitLabel: string;
  factor: number;
  onClose: () => void;
}

const fmt = (value: number) => {
  if (!Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e5 || magnitude < 1e-3)) return value.toExponential(2);
  return value.toFixed(3);
};

// Composicion tipo libro (Hibbeler, esfuerzo plano — elemento original + elemento
// en el plano principal): el elemento original con sigma_x/tau_xy en los ejes x,y
// de origen O, y a un angulo theta (el angulo principal), el elemento rotado con
// sigma_max/sigma_min a lo largo de sus propios ejes a,b — sin cortante, porque
// por definicion los planos principales no tienen cortante.
// sigma_y = 0 en este modelo de viga (solo hay eje x local + flexion), asi que el
// elemento original no tiene flecha en la cara y, solo la nota "sigma_y = 0".
const StressCube: React.FC<{ sigmaX: number; tau: number; sigma1: number; sigma2: number; unitLabel: string }> = ({
  sigmaX,
  tau,
  sigma1,
  sigma2,
  unitLabel,
}) => {
  const size = 56;
  const half = size / 2;
  const ox = 78;
  const oy = 96;
  // Posicion FIJA del elemento rotado (no depende del angulo) — evita que a
  // angulos chicos los dos elementos y sus etiquetas queden pegados/superpuestos.
  const rcx = 232;
  const rcy = 168;

  // Angulo principal (planos sin cortante): theta_p = 0.5*atan2(2*tau, sigma_x - sigma_y), sigma_y=0.
  const thetaP = 0.5 * Math.atan2(2 * tau, sigmaX);
  const thetaDeg = (thetaP * 180) / Math.PI;

  const arrow = (cxp: number, cyp: number, angle: number, len: number, outward: boolean, cls: string) => {
    const dx = Math.cos(angle) * len * (outward ? 1 : -1);
    const dy = Math.sin(angle) * len * (outward ? 1 : -1);
    return <line x1={cxp} y1={cyp} x2={cxp + dx} y2={cyp + dy} strokeWidth={2} className={cls} markerEnd="url(#arrowHead)" />;
  };

  return (
    <svg viewBox="0 0 320 220" className="h-full w-full">
      <defs>
        <marker id="arrowHead" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" className="fill-current" />
        </marker>
      </defs>

      {/* Ejes x, y de referencia del elemento original */}
      <line x1={ox - 24} y1={oy} x2={ox + 60} y2={oy} className="stroke-gray-300 dark:stroke-gray-600" strokeWidth={1} />
      <line x1={ox} y1={oy + 24} x2={ox} y2={oy - 60} className="stroke-gray-300 dark:stroke-gray-600" strokeWidth={1} />
      <text x={ox + 64} y={oy + 4} className="fill-gray-400 text-[9px] font-mono">x</text>
      <text x={ox - 4} y={oy - 64} className="fill-gray-400 text-[9px] font-mono">y</text>

      {/* Elemento original: alineado a x,y, esquina en O */}
      <rect x={ox} y={oy - size} width={size} height={size} fill="none" className="stroke-gray-400 dark:stroke-gray-500" strokeWidth={2} />
      {arrow(ox + size, oy - half, 0, 20, sigmaX >= 0, "stroke-amber-500 fill-amber-500")}
      {arrow(ox, oy - half, Math.PI, 20, sigmaX >= 0, "stroke-amber-500 fill-amber-500")}
      {arrow(ox, oy - size, 0, 16, true, "stroke-cyan-500 fill-cyan-500")}
      {arrow(ox + size, oy, Math.PI, 16, true, "stroke-cyan-500 fill-cyan-500")}
      {arrow(ox + size, oy - size, -Math.PI / 2, 16, true, "stroke-cyan-500 fill-cyan-500")}
      {arrow(ox, oy, Math.PI / 2, 16, true, "stroke-cyan-500 fill-cyan-500")}
      <text x={ox + half} y={oy - size - 20} textAnchor="middle" className="fill-amber-600 dark:fill-amber-400 text-[9px] font-mono font-bold">
        σx={fmt(sigmaX)}
      </text>
      <text x={ox + size + 22} y={oy - half} textAnchor="start" className="fill-cyan-600 dark:fill-cyan-400 text-[9px] font-mono font-bold">
        τ={fmt(tau)}
      </text>
      <text x={ox + half} y={oy + 16} textAnchor="middle" className="fill-gray-400 text-[8px] font-mono">σy=0</text>

      {/* Elemento en el plano principal (posicion fija, sin cortante): la
          rotacion va SOLO en este grupo, incluidas sus propias etiquetas — asi
          quedan alineadas a los ejes a/b del elemento, igual que en el libro. */}
      <g transform={`rotate(${-thetaDeg} ${rcx} ${rcy})`}>
        <rect x={rcx - half} y={rcy - half} width={size} height={size} fill="none" className="stroke-gray-400 dark:stroke-gray-500" strokeWidth={2} />
        {arrow(rcx + half, rcy, 0, 22, sigma1 >= 0, "stroke-red-500 fill-red-500")}
        {arrow(rcx - half, rcy, Math.PI, 22, sigma1 >= 0, "stroke-red-500 fill-red-500")}
        {arrow(rcx, rcy - half, -Math.PI / 2, 22, sigma2 >= 0, "stroke-blue-500 fill-blue-500")}
        {arrow(rcx, rcy + half, Math.PI / 2, 22, sigma2 >= 0, "stroke-blue-500 fill-blue-500")}
        <text x={rcx + half + 26} y={rcy + 3} textAnchor="start" className="fill-red-600 dark:fill-red-400 text-[9px] font-mono font-bold">
          σ1={fmt(sigma1)}
        </text>
        <text x={rcx} y={rcy - half - 12} textAnchor="middle" className="fill-blue-600 dark:fill-blue-400 text-[9px] font-mono font-bold">
          σ2={fmt(sigma2)}
        </text>
      </g>

      <text x={(ox + rcx) / 2} y={Math.min(oy, rcy) - 4} textAnchor="middle" className="fill-gray-500 text-[9px] font-mono">
        θp = {thetaDeg.toFixed(1)}°
      </text>
      <text x={160} y={210} textAnchor="middle" className="fill-gray-400 text-[8px] font-mono">
        {unitLabel} · plano principal: sin cortante (por definición)
      </text>
    </svg>
  );
};

const MohrCircleDiagram: React.FC<MohrCircleDiagramProps> = ({
  nodeId,
  sigmaNormal,
  tauShear,
  sigma1,
  sigma2,
  tauMax,
  unitLabel,
  factor,
  onClose,
}) => {
  const sx = sigmaNormal * factor;
  const tau = tauShear * factor;
  const s1 = sigma1 * factor;
  const s2 = sigma2 * factor;
  const r = tauMax * factor;
  const center = (s1 + s2) / 2;

  const half = Math.max(r * 1.35, Math.abs(sx - center) * 1.35, 1e-6);
  const domainMinX = center - half;
  const domainMaxX = center + half;
  const domainMinY = -half;
  const domainMaxY = half;

  const pad = 46;
  const plot = 320;
  const svgSize = plot + pad * 2;
  const toX = (v: number) => pad + ((v - domainMinX) / (domainMaxX - domainMinX)) * plot;
  // convencion: tau positivo hacia ARRIBA en este dibujo (no la clasica de reloj de Mohr)
  const toY = (v: number) => pad + plot - ((v - domainMinY) / (domainMaxY - domainMinY)) * plot;

  const cx = toX(center);
  const cy = toY(0);
  const rPx = (r / (domainMaxX - domainMinX)) * plot;

  const pointA = { x: toX(sx), y: toY(tau) };
  const pointB = { x: toX(0), y: toY(-tau) };
  const sigma1Pt = { x: toX(s1), y: toY(0) };
  const sigma2Pt = { x: toX(s2), y: toY(0) };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/80 p-2 backdrop-blur-md sm:p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Círculo de Mohr, nodo ${nodeId}`}
        className="flex max-h-[95vh] w-full max-w-[880px] flex-col overflow-hidden rounded-2xl border border-cyan-400/20 bg-white shadow-[0_30px_100px_rgba(0,0,0,0.5)] dark:bg-[#080D16] sm:rounded-3xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-white/10 sm:px-6">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.25em] text-cyan-600 dark:text-cyan-300">Estado plano de esfuerzo</p>
            <h2 className="text-base font-black uppercase tracking-tight text-gray-950 dark:text-white sm:text-lg">
              Círculo de Mohr · Nodo {nodeId}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar círculo de Mohr"
            className="rounded-xl border border-gray-200 p-2.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 dark:border-white/10 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X size={17} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-[1.3fr_1fr]">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-2 dark:border-white/10 dark:bg-black/20">
              <svg viewBox={`0 0 ${svgSize} ${svgSize}`} className="h-full w-full">
                <line x1={pad} y1={cy} x2={pad + plot} y2={cy} className="stroke-gray-300 dark:stroke-gray-700" strokeWidth={1} />
                <line x1={cx} y1={pad} x2={cx} y2={pad + plot} className="stroke-gray-300 dark:stroke-gray-700" strokeDasharray="4 3" strokeWidth={1} />
                <text x={pad + plot + 6} y={cy + 4} className="fill-gray-500 text-[10px] font-mono">σ</text>
                <text x={cx - 14} y={pad - 6} className="fill-gray-500 text-[10px] font-mono">τ</text>

                <circle cx={cx} cy={cy} r={rPx} fill="none" className="stroke-cyan-500" strokeWidth={2} />
                <line x1={pointA.x} y1={pointA.y} x2={pointB.x} y2={pointB.y} className="stroke-gray-400 dark:stroke-gray-500" strokeWidth={1.5} strokeDasharray="3 3" />

                <circle cx={cx} cy={cy} r={3} className="fill-gray-500" />
                <text x={cx} y={cy + 18} textAnchor="middle" className="fill-gray-500 text-[9px] font-mono">C</text>

                <circle cx={sigma1Pt.x} cy={sigma1Pt.y} r={4} className="fill-red-500" />
                <text x={sigma1Pt.x} y={sigma1Pt.y - 10} textAnchor="middle" className="fill-red-600 dark:fill-red-400 text-[10px] font-mono font-bold">σ1</text>

                <circle cx={sigma2Pt.x} cy={sigma2Pt.y} r={4} className="fill-blue-500" />
                <text x={sigma2Pt.x} y={sigma2Pt.y - 10} textAnchor="middle" className="fill-blue-600 dark:fill-blue-400 text-[10px] font-mono font-bold">σ2</text>

                <circle cx={pointA.x} cy={pointA.y} r={4} className="fill-amber-500" />
                <text x={pointA.x + 8} y={pointA.y - 8} className="fill-amber-600 dark:fill-amber-400 text-[10px] font-mono font-bold">x</text>

                <circle cx={pointB.x} cy={pointB.y} r={4} className="fill-emerald-500" />
                <text x={pointB.x + 8} y={pointB.y - 8} className="fill-emerald-600 dark:fill-emerald-400 text-[10px] font-mono font-bold">y</text>
              </svg>
            </div>

            <div className="flex flex-col gap-3">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-black/20">
                <p className="mb-2 text-[8px] font-black uppercase tracking-widest text-gray-400">Elemento diferencial (cubo de esfuerzos)</p>
                <StressCube sigmaX={sx} tau={tau} sigma1={s1} sigma2={s2} unitLabel={unitLabel} />
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                {[
                  ["σ normal (x)", sx, "text-amber-600 dark:text-amber-400"],
                  ["τ corte", tau, "text-cyan-600 dark:text-cyan-400"],
                  ["σ1 (principal)", s1, "text-red-600 dark:text-red-400"],
                  ["σ2 (principal)", s2, "text-blue-600 dark:text-blue-400"],
                  ["τ máx (radio)", r, "text-gray-600 dark:text-gray-300"],
                  ["Centro C", center, "text-gray-600 dark:text-gray-300"],
                ].map(([label, value, cls]) => (
                  <div key={label as string} className="rounded-xl border border-gray-200 bg-white px-2 py-1.5 dark:border-white/10 dark:bg-white/5">
                    <span className="block text-[7px] font-black uppercase tracking-wider text-gray-400">{label}</span>
                    <span className={`block font-black ${cls}`}>{fmt(value as number)} {unitLabel}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-xl bg-blue-500/5 px-3 py-2 text-[9px] leading-relaxed text-gray-600 dark:text-gray-300">
            <Info size={13} className="mt-0.5 shrink-0 text-blue-500" />
            <span>
              Punto <b>x</b>: estado en la cara transversal del elemento (σ normal, τ). Punto <b>y</b>: cara longitudinal
              (σy=0 en teoría de vigas, τ complementario). σ1/σ2 son donde el círculo cruza el eje σ (τ=0) — planos sin
              cortante. Convención de este dibujo: τ positivo hacia arriba.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};

export default MohrCircleDiagram;
