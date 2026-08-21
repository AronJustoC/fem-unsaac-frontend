import React, { useState, useEffect, useRef } from 'react';
import GraphicsView from './GraphicsView';
import { Play, Loader2, ChevronRight, Activity, ShieldCheck, ShieldAlert, Gauge, Sigma } from 'lucide-react';
import { useTheme } from './ThemeContext';
import { authenticatedFetch } from '../lib/api';

type FailureStatus = 'safe' | 'warning' | 'yielding' | 'not_applicable';

interface StressEndAssessment {
  sigma_von_mises_pa: number;
  sigma_normal_pa: number;
  tau_shear_pa: number;
  sigma_1_pa: number;
  sigma_2_pa: number;
  tau_max_pa: number;
  utilization: number;
  safety_factor: number | null;
  status: FailureStatus;
}

interface ElementFailureAssessment {
  element_id: number;
  material_name?: string | null;
  yield_strength_pa: number;
  criterion: string;
  governing_end: 'i' | 'j' | null;
  max_von_mises_pa: number;
  utilization: number;
  safety_factor: number | null;
  status: FailureStatus;
  section_dimensions_assumed: boolean;
  end_i: StressEndAssessment;
  end_j: StressEndAssessment;
  capacity: {
    axial_yield_n: number;
    bending_y_yield_nm: number;
    bending_z_yield_nm: number;
    torsion_yield_nm: number;
  };
  demand: {
    axial_force_n: number;
    bending_y_nm: number;
    bending_z_nm: number;
    torsion_nm: number;
  };
}

interface FailureSummary {
  criterion: string;
  is_safe: boolean;
  critical_element_id: number | null;
  critical_end: 'i' | 'j' | null;
  max_von_mises_pa: number;
  max_utilization: number;
  min_safety_factor: number | null;
  safe_elements: number;
  warning_elements: number;
  yielding_elements: number;
  not_applicable_elements: number;
}

const toMpa = (value: number | null | undefined) => Number(value || 0) / 1e6;
const formatMpa = (value: number | null | undefined) => `${toMpa(value).toFixed(2)} MPa`;
const formatEngineering = (value: number | null | undefined, unit: string) => {
  const numeric = Number(value || 0);
  if (Math.abs(numeric) >= 1e6) return `${(numeric / 1e6).toFixed(2)} MN${unit}`;
  if (Math.abs(numeric) >= 1e3) return `${(numeric / 1e3).toFixed(2)} kN${unit}`;
  return `${numeric.toFixed(2)} N${unit}`;
};

const statusMeta: Record<FailureStatus, { label: string; dot: string; badge: string; ring: string }> = {
  safe: {
    label: 'Seguro',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20',
    ring: 'ring-emerald-500/50',
  },
  warning: {
    label: 'Atención',
    dot: 'bg-amber-500',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20',
    ring: 'ring-amber-500/50',
  },
  yielding: {
    label: 'Fluencia',
    dot: 'bg-red-500',
    badge: 'bg-red-500/10 text-red-600 dark:text-red-300 border-red-500/20',
    ring: 'ring-red-500/60',
  },
  not_applicable: {
    label: 'No aplica',
    dot: 'bg-gray-400',
    badge: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
    ring: 'ring-gray-400/40',
  },
};

const StaticAnalysisView: React.FC = () => {
  const [structure, setStructure] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [vizData, setVizData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [visualizationLoading, setVisualizationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visualizationRequestRef = useRef(0);
  const { theme } = useTheme();

  const [scale, setScale] = useState(1.0);
  const [scaleRange, setScaleRange] = useState({ min: 0, max: 100, step: 1 });
  const [showTables, setShowTables] = useState<string>('displacements');
  const [selectedElementId, setSelectedElementId] = useState<number | null>(null);
  const [resultMode, setResultMode] = useState<'displacement' | 'utilization'>('displacement');

  const failureSummary = results?.failure_summary as FailureSummary | undefined;

  const selectElement = (elementId: number) => {
    setSelectedElementId(elementId);
    setShowTables('stresses');
    requestAnimationFrame(() => {
      document.getElementById(`element-card-${elementId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const EmptyState = ({ msg }: { msg: string }) => (
    <div className="text-center py-20 text-gray-500 flex flex-col items-center justify-center bg-black/5 dark:bg-black/20 rounded-3xl border border-dashed border-border-light dark:border-border-dark backdrop-blur-sm">
      <Activity className="mb-4 opacity-10" size={48} />
      <p className="text-[10px] font-mono font-bold uppercase tracking-[0.2em]">{msg}</p>
    </div>
  );

  const loadStructure = () => {
    const saved = localStorage.getItem('fem_structure_data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setStructure(parsed);
        setResults(null);
        setVizData(null);
      } catch (e) {
        console.error("Error parsing", e);
      }
    }
  };

  useEffect(() => {
    loadStructure();
    const handleStorage = () => loadStructure();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const runAnalysis = async () => {
    if (!structure) return;
    setLoading(true);
    setError(null);
    setVizData(null);
    try {
      const resAnalysis = await authenticatedFetch('/api/analysis/static', {
        method: 'POST',
        body: JSON.stringify(structure),
      });

      if (!resAnalysis.ok) {
        const errorData = await resAnalysis.json().catch(() => ({ detail: 'Error desconocido' }));
        throw new Error(errorData.detail || "Error en el cálculo estructural");
      }
      const analysisData = await resAnalysis.json();
      if (!analysisData.failure_assessment || !analysisData.failure_summary) {
        throw new Error(
          'El backend activo está desactualizado y no devolvió la evaluación de resistencia. Reinicia el servicio de análisis.'
        );
      }
      setResults(analysisData);

      // Auto-scale logic
      let optimalScale = scale;
      if (analysisData.displacements && structure.nodes.length > 0) {
        const coords = structure.nodes.map((n: any) => n.coords);
        const xs = coords.map((c: any) => c[0]);
        const ys = coords.map((c: any) => c[1]);
        const zs = coords.map((c: any) => c[2]);
        const size = Math.max(
          Math.max(...xs) - Math.min(...xs),
          Math.max(...ys) - Math.min(...ys),
          Math.max(...zs) - Math.min(...zs)
        ) || 1.0;

        let maxDisp = 0;
        Object.values(analysisData.displacements).forEach((d: any) => {
          const mag = Math.sqrt(d[0] ** 2 + d[1] ** 2 + d[2] ** 2);
          maxDisp = Math.max(maxDisp, mag);
        });

        if (maxDisp > 0) {
          optimalScale = (size * 0.15) / maxDisp;
          const order = Math.pow(10, Math.floor(Math.log10(optimalScale)));
          setScaleRange({
            min: 0,
            max: optimalScale * 2.5,
            step: order / 20
          });
        }
      }
      setScale(optimalScale);
    } catch (err: any) {
      console.error("Analysis error:", err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!results || !structure) return;

    const controller = new AbortController();
    const requestId = ++visualizationRequestRef.current;
    const updateViz = async () => {
      setVisualizationLoading(true);
      try {
        const resViz = await authenticatedFetch(`/api/visualization/static-results?theme=${theme}&scale=${scale}&result_mode=${resultMode}`, {
          method: 'POST',
          body: JSON.stringify(structure),
          signal: controller.signal,
        });
        if (!resViz.ok) throw new Error('Error al generar la visualización');

        const data = await resViz.json();
        if (resultMode === 'utilization') {
          const traceNames = (data?.data || []).map((trace: any) => String(trace?.name || ''));
          const hasUtilizationMap = traceNames.some((name: string) => name.startsWith('Utilización'));
          const hasResistanceNodes = traceNames.includes('Nodos · Resistencia');
          if (!hasUtilizationMap || !hasResistanceNodes) {
            throw new Error(
              'La visualización recibida no contiene el mapa de utilización ni los resultados resistentes por nodo. Reinicia el backend.'
            );
          }
        }

        if (requestId === visualizationRequestRef.current) {
          setVizData(data);
          setError(null);
        }
      } catch (requestError: any) {
        if (requestError?.name !== 'AbortError' && requestId === visualizationRequestRef.current) {
          setVizData(null);
          setError(requestError?.message || 'Error al generar la visualización');
        }
      } finally {
        if (requestId === visualizationRequestRef.current) {
          setVisualizationLoading(false);
        }
      }
    };

    updateViz();
    return () => controller.abort();
  }, [scale, results, structure, theme, resultMode]);


  return (
    <div className="h-full w-full overflow-hidden flex flex-col-reverse lg:flex-row font-sans relative bg-white dark:bg-bg-dark">
      <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-20 z-0"></div>

      <aside
        aria-label="Controles y resultados del análisis estático"
        className="relative z-40 w-full lg:w-[380px] xl:w-[420px] h-[45vh] lg:h-full flex flex-col bg-white/80 dark:bg-[#0B0F1A]/90 backdrop-blur-xl border-t lg:border-t-0 lg:border-r border-border-light dark:border-border-dark shrink-0 overflow-y-auto overflow-x-hidden overscroll-contain custom-scrollbar"
      >
        <div className="shrink-0 p-3 lg:p-6 border-b border-border-light dark:border-border-dark">
          <div className="space-y-2 lg:space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[8px] lg:text-[9px] text-accent-primary font-bold uppercase tracking-[0.2em] mb-1 font-mono">Structural Engine</p>
                <h1 className="text-base lg:text-2xl font-display font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none">
                  Static <span className="text-accent-primary">Analysis</span>
                </h1>
              </div>
            </div>
            <button
              onClick={runAnalysis}
              disabled={loading || !structure}
              className="w-full flex items-center justify-center gap-2 bg-accent-primary hover:bg-accent-primary/90 disabled:opacity-50 text-white px-4 py-2 lg:px-5 lg:py-3 rounded-xl font-display font-bold text-xs uppercase tracking-wider shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              {loading ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />}
              Compute Analysis
            </button>
          </div>

          {/* Scale Slider */}
          <div className="premium-card-inner p-2 lg:p-4 space-y-1 lg:space-y-3 mt-2 lg:mt-0">
            <div className="flex items-center justify-between">
              <label className="text-[8px] lg:text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest font-mono">Scale</label>
              <span className="text-[8px] lg:text-[10px] font-mono font-bold text-accent-primary bg-accent-primary/10 px-2 py-0.5 rounded-md">
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

          {results && (
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-2xl border border-border-light bg-gray-100/50 p-1 dark:border-border-dark dark:bg-black/20">
              {([
                ['displacement', 'Deformación'],
                ['utilization', 'Utilización'],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setResultMode(mode)}
                  aria-pressed={resultMode === mode}
                  className={`rounded-xl px-2 py-2 text-[9px] font-display font-black uppercase tracking-tight transition-all ${
                    resultMode === mode
                      ? mode === 'utilization'
                        ? 'bg-amber-500 text-black shadow-sm'
                        : 'bg-white text-accent-primary shadow-sm ring-1 ring-black/5 dark:bg-bg-dark'
                      : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {failureSummary && (
            <button
              type="button"
              onClick={() => {
                setShowTables('stresses');
                if (failureSummary.critical_element_id != null) selectElement(failureSummary.critical_element_id);
              }}
              className={`mt-2 w-full rounded-2xl border p-3 text-left transition-all hover:-translate-y-0.5 ${
                failureSummary.is_safe
                  ? 'border-emerald-500/20 bg-emerald-500/5'
                  : 'border-red-500/30 bg-red-500/10'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-300">
                  {failureSummary.is_safe ? <ShieldCheck size={14} className="text-emerald-500" /> : <ShieldAlert size={14} className="text-red-500" />}
                  {failureSummary.is_safe ? 'Sin fluencia detectada' : 'Fluencia detectada'}
                </span>
                <ChevronRight size={13} className="text-gray-400" />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 font-mono">
                <div>
                  <span className="block text-[7px] uppercase text-gray-400">Crítico</span>
                  <strong className="text-[10px] text-gray-800 dark:text-gray-100">E{failureSummary.critical_element_id ?? '—'} · {failureSummary.critical_end ?? '—'}</strong>
                </div>
                <div>
                  <span className="block text-[7px] uppercase text-gray-400">Utilización</span>
                  <strong className={`text-[10px] ${failureSummary.max_utilization >= 1 ? 'text-red-500' : 'text-amber-500'}`}>{(failureSummary.max_utilization * 100).toFixed(1)} %</strong>
                </div>
                <div>
                  <span className="block text-[7px] uppercase text-gray-400">F.S.</span>
                  <strong className="text-[10px] text-gray-800 dark:text-gray-100">{failureSummary.min_safety_factor?.toFixed(2) ?? '∞'}</strong>
                </div>
              </div>
            </button>
          )}
        </div>

        {/* TABS */}
        <div className="shrink-0 px-3 py-2 lg:px-6 lg:py-4">
          <div className="flex p-1 bg-gray-100/50 dark:bg-black/20 rounded-2xl border border-border-light dark:border-border-dark">
            {[
              { id: 'displacements', label: 'Desplaz.' },
              { id: 'reactions', label: 'Reacciones' },
              { id: 'forces', label: 'Esf. internos' },
              { id: 'stresses', label: 'Resistencia' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setShowTables(tab.id)}
                className={`flex-1 py-2.5 px-2 text-[10px] font-bold uppercase tracking-tight rounded-xl transition-all cursor-pointer font-display ${
                  showTables === tab.id 
                    ? 'bg-white dark:bg-bg-dark text-accent-primary shadow-sm ring-1 ring-black/5 dark:ring-white/5' 
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* RESULTS DATA - Scrollable */}
        <div className="flex-none overflow-visible px-3 lg:px-6 pb-6 space-y-2 lg:space-y-4">
          {showTables === 'displacements' && (
            results?.displacements ? Object.entries(results.displacements).map(([nodeId, disp]: [string, any]) => (
              <div key={nodeId} className="premium-card p-4 group">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-accent-primary rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                    <span className="text-xs font-display font-black text-gray-900 dark:text-white uppercase tracking-widest">Node {nodeId}</span>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-accent-primary transition-colors" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((axis, i) => (
                    <div key={axis} className="premium-card-inner p-2 group-hover:border-accent-primary/20 transition-all">
                      <span className="text-[8px] text-gray-500 font-bold uppercase mb-0.5 block tracking-wider font-mono">{axis}</span>
                      <span className="text-[11px] font-mono font-bold text-gray-900 dark:text-gray-100 truncate block tracking-tighter">
                        {disp[i]?.toExponential(4) || "0.0000E+0"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )) : <EmptyState msg="Awaiting compute results..." />
          )}

          {showTables === 'reactions' && (
            results?.reactions && Object.keys(results.reactions).length > 0 ? Object.entries(results.reactions).map(([nodeId, reac]: [string, any]) => (
              <div key={nodeId} className="premium-card p-4 group">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-accent-secondary rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                    <span className="text-xs font-display font-black text-gray-900 dark:text-white uppercase tracking-widest">Reaction {nodeId}</span>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-accent-secondary transition-colors" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'].map((axis, i) => {
                    const val = reac[i];
                    const isSignificant = Math.abs(val) > 1e-4;
                    return (
                      <div key={axis} className={`premium-card-inner p-2 transition-all ${isSignificant ? 'opacity-100 group-hover:border-accent-secondary/20' : 'opacity-30'}`}>
                        <span className="text-[8px] text-gray-500 font-bold uppercase mb-0.5 block font-mono">{axis}</span>
                        <span className={`text-[11px] font-mono font-bold truncate block tracking-tighter ${isSignificant ? 'text-accent-secondary' : 'text-gray-500'}`}>
                          {val?.toFixed(4) || "0.0000"}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )) : <EmptyState msg="No significant reactions found." />
          )}

          {showTables === 'forces' && (
            results?.element_forces ? Object.entries(results.element_forces).map(([elId, forces]: [string, any]) => (
              <div
                key={elId}
                id={`element-card-${elId}`}
                className={`premium-card p-4 group ${String(selectedElementId) === elId ? 'ring-2 ring-accent-danger' : ''}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-accent-danger rounded-full shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
                    <span className="text-xs font-display font-black text-gray-900 dark:text-white uppercase tracking-widest">Element {elId}</span>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-accent-danger transition-colors" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['N i', forces.fx1, ''], ['N j', forces.fx2, ''],
                    ['Vy i', forces.fy1, ''], ['Vz i', forces.fz1, ''],
                    ['T i', forces.mx1, '·m'], ['My i', forces.my1, '·m'],
                    ['Mz i', forces.mz1, '·m'], ['Mz j', forces.mz2, '·m'],
                  ] as Array<[string, number, string]>).map(([label, value, unit]) => (
                    <div key={label} className="premium-card-inner p-2 group-hover:border-accent-danger/20 transition-all">
                      <span className="text-[8px] text-gray-500 font-bold uppercase mb-0.5 block font-mono">{label}</span>
                      <span className="text-[11px] font-mono font-bold text-gray-900 dark:text-gray-100 truncate block tracking-tighter">
                        {formatEngineering(value, unit)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )) : <EmptyState msg="Internal mechanics not calculated." />
          )}

          {showTables === 'stresses' && (
            results?.failure_assessment && Object.keys(results.failure_assessment).length > 0 ? (
              <>
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-[8px] font-mono leading-relaxed text-gray-500 dark:text-gray-400">
                  <div className="mb-1 flex items-center gap-2 font-black uppercase tracking-wider text-amber-600 dark:text-amber-300">
                    <Sigma size={12} /> Von Mises · inicio de fluencia
                  </div>
                  Verificación elástica en fibras extremas. No incluye pandeo, fatiga, fractura, conexiones ni factores normativos de diseño.
                </div>
                {Object.entries(results.failure_assessment)
                  .sort(([, a]: [string, any], [, b]: [string, any]) => b.utilization - a.utilization)
                  .map(([elId, rawAssessment]: [string, any]) => {
                    const assessment = rawAssessment as ElementFailureAssessment;
                    const meta = statusMeta[assessment.status] ?? statusMeta.not_applicable;
                    const isSelected = String(selectedElementId) === elId;
                    return (
                      <button
                        type="button"
                        key={elId}
                        id={`element-card-${elId}`}
                        onClick={() => {
                          setSelectedElementId(Number(elId));
                          setResultMode('utilization');
                        }}
                        className={`premium-card w-full p-4 text-left group transition-all ${isSelected ? `ring-2 ${meta.ring}` : ''}`}
                      >
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`}></span>
                              <span className="text-xs font-display font-black uppercase tracking-widest text-gray-900 dark:text-white">Elemento {elId}</span>
                            </div>
                            <span className="mt-1 block truncate text-[8px] font-mono text-gray-400">
                              {assessment.material_name || 'Material'} · fy {formatMpa(assessment.yield_strength_pa)}
                            </span>
                            {assessment.section_dimensions_assumed && (
                              <span className="mt-1 block text-[7px] font-mono font-bold uppercase text-amber-500">
                                h/b no definidos · se asumió 0.10 m
                              </span>
                            )}
                          </div>
                          <span className={`shrink-0 rounded-lg border px-2 py-1 text-[8px] font-black uppercase tracking-wider ${meta.badge}`}>
                            {meta.label}
                          </span>
                        </div>

                        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                          <div
                            className={`h-full rounded-full transition-all ${assessment.status === 'yielding' ? 'bg-red-500' : assessment.status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(100, assessment.utilization * 100)}%` }}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {[
                            ['σVM máx.', formatMpa(assessment.max_von_mises_pa)],
                            ['Utilización', `${(assessment.utilization * 100).toFixed(1)} %`],
                            ['Factor seguridad', assessment.safety_factor?.toFixed(2) ?? '∞'],
                            ['Extremo crítico', assessment.governing_end?.toUpperCase() ?? '—'],
                          ].map(([label, value]) => (
                            <div key={label} className="premium-card-inner p-2">
                              <span className="block text-[7px] font-bold uppercase text-gray-400">{label}</span>
                              <strong className="mt-0.5 block truncate text-[11px] font-mono text-gray-800 dark:text-gray-100">{value}</strong>
                            </div>
                          ))}
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {([['i', assessment.end_i], ['j', assessment.end_j]] as const).map(([endLabel, end]) => (
                            <div key={endLabel} className="rounded-xl border border-border-light p-2 dark:border-border-dark">
                              <span className="text-[8px] font-black uppercase text-gray-500">Extremo {endLabel}</span>
                              <div className="mt-1 space-y-0.5 text-[8px] font-mono text-gray-400">
                                <div className="flex justify-between gap-2"><span>σVM</span><strong className="text-gray-700 dark:text-gray-200">{formatMpa(end.sigma_von_mises_pa)}</strong></div>
                                <div className="flex justify-between gap-2"><span>σ normal</span><strong>{formatMpa(end.sigma_normal_pa)}</strong></div>
                                <div className="flex justify-between gap-2"><span>τ corte</span><strong>{formatMpa(end.tau_shear_pa)}</strong></div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-2 rounded-xl border border-amber-500/15 bg-amber-500/5 p-2">
                          <div className="mb-1 flex items-center gap-1.5 text-[8px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-300">
                            <Gauge size={11} /> Demanda / momento de fluencia
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[8px] font-mono text-gray-500">
                            <span>My: {formatEngineering(assessment.demand.bending_y_nm, '·m')}</span>
                            <strong className="text-right">My,f: {formatEngineering(assessment.capacity.bending_y_yield_nm, '·m')}</strong>
                            <span>Mz: {formatEngineering(assessment.demand.bending_z_nm, '·m')}</span>
                            <strong className="text-right">Mz,f: {formatEngineering(assessment.capacity.bending_z_yield_nm, '·m')}</strong>
                            <span>N: {formatEngineering(assessment.demand.axial_force_n, '')}</span>
                            <strong className="text-right">Ny: {formatEngineering(assessment.capacity.axial_yield_n, '')}</strong>
                            <span>T: {formatEngineering(assessment.demand.torsion_nm, '·m')}</span>
                            <strong className="text-right">Ty: {formatEngineering(assessment.capacity.torsion_yield_nm, '·m')}</strong>
                          </div>
                        </div>
                      </button>
                    );
                  })}
              </>
            ) : <EmptyState msg="Ejecuta el análisis para evaluar fluencia y capacidad." />
          )}
        </div>
      </aside>

      {/* RIGHT PANEL - 3D Visualization */}
      <div className="relative z-10 flex-1 p-4 lg:p-8 flex flex-col overflow-hidden bg-white dark:bg-bg-dark h-[55vh] lg:h-full">
        <div className="bg-white/80 dark:bg-bg-dark-panel/90 backdrop-blur-md rounded-[2.5rem] border border-border-light dark:border-border-dark overflow-hidden shadow-2xl transition-all hover:border-unsaac-gold/30 group h-full relative">
          <GraphicsView
            data={vizData}
            loading={loading || visualizationLoading}
            error={error}
            className="h-full w-full bg-transparent! dark:bg-transparent!"
            onElementSelect={results ? selectElement : undefined}
          />
          
          {results && (
            <div className="absolute right-4 top-4 z-10 max-w-[min(420px,calc(100%-2rem))] p-3 lg:p-4 premium-card-inner backdrop-blur-xl shadow-2xl">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${failureSummary?.is_safe !== false ? 'bg-emerald-500' : 'bg-red-500'} animate-pulse`}></div>
                  <span className="text-[9px] font-mono font-black uppercase tracking-widest text-gray-500">
                    {resultMode === 'utilization' ? 'Mapa de utilización' : 'Solución estática'}
                  </span>
                </div>
                {failureSummary && (
                  <span className={`rounded-md px-2 py-1 text-[8px] font-black uppercase ${failureSummary.is_safe ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-red-500/10 text-red-600 dark:text-red-300'}`}>
                    {failureSummary.is_safe ? 'Elástico' : 'Fluencia'}
                  </span>
                )}
              </div>
              {failureSummary && (
                <div className="mt-2 flex items-end justify-between gap-5 font-mono">
                  <div>
                    <span className="block text-[7px] uppercase text-gray-400">Elemento crítico</span>
                    <strong className="text-xs text-gray-800 dark:text-gray-100">E{failureSummary.critical_element_id ?? '—'} · {failureSummary.critical_end ?? '—'}</strong>
                  </div>
                  <div className="text-right">
                    <span className="block text-[7px] uppercase text-gray-400">σVM / fy</span>
                    <strong className={`text-xs ${failureSummary.max_utilization >= 1 ? 'text-red-500' : 'text-amber-500'}`}>
                      {(failureSummary.max_utilization * 100).toFixed(1)} %
                    </strong>
                  </div>
                </div>
              )}
              <p className="mt-2 border-t border-gray-200/70 pt-2 text-[8px] font-mono leading-relaxed text-gray-400 dark:border-white/10">
                Pasa el cursor sobre un nodo para ver {resultMode === 'utilization'
                  ? 'σVM, tensiones, utilización y factor de seguridad.'
                  : 'desplazamientos y rotaciones.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StaticAnalysisView;
