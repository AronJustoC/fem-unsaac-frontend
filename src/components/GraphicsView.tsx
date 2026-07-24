import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Maximize2, Minimize2, Download, Box, RotateCcw } from "lucide-react";
import { useTheme } from "./ThemeContext";
import { getPlotlyTheme } from "../lib/plotly_theme";

interface GraphicsViewProps {
  data: any;
  loading: boolean;
  error: string | null;
  className?: string;
  animation?: {
    enabled: boolean;
    scale: number;
    fps?: number;
    speedHz?: number;
  };
  onElementSelect?: (elementId: number) => void;
}

const GraphicsView: React.FC<GraphicsViewProps> = ({
  data,
  loading,
  error,
  className,
  animation,
  onElementSelect,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<any>(null);
  const clickBindingRef = useRef<{ graphDiv: any; handler: (event: any) => void } | null>(null);
  const { theme } = useTheme();
  // Estado para cargar Plotly dinámicamente solo en el cliente
  const [PlotComponent, setPlotComponent] = useState<any>(null);
  const [plotlyApi, setPlotlyApi] = useState<any>(null);

  useEffect(() => {
    // Importación dinámica para evitar error 'self is not defined' en SSR.
    // La fábrica y restyle() comparten la MISMA instancia de Plotly. Usar el
    // componente preempaquetado junto a plotly.js-dist-min duplicaba Plotly y
    // restyle() reemplazaba los listeners de selección durante la animación.
    Promise.all([
      import("react-plotly.js/factory"),
      import("plotly.js-dist-min"),
    ]).then(([plotlyFactory, plotlyModule]) => {
      const nextPlotly = (plotlyModule as any).default ?? plotlyModule;
      (window as any).Plotly = nextPlotly;
      setPlotlyApi(nextPlotly);
      const createPlotlyComponent = (plotlyFactory as any).default ?? plotlyFactory;
      setPlotComponent(() => createPlotlyComponent(nextPlotly));
    });
  }, []);

  // Acumula el encuadre a lo largo de toda la sesion de un mismo grafico (barrido
  // de frecuencia, animacion, cambio de modo): solo CRECE, nunca se achica. Sin
  // esto, cada frame recalculaba rango/camara de cero a partir de SU propia
  // geometria nomas — resultado: los ejes "saltaban" (se re-encuadraban) en cada
  // paso, y si un frame necesitaba menos rango que el anterior, el siguiente
  // frame con mas amplitud quedaba recortado contra ese encuadre mas chico.
  // Se reinicia solo si la estructura de fondo cambia (misma heuristica barata:
  // firma de tipo+longitud de cada trazo — se mantiene igual entre frecuencias/
  // frames de animacion, cambia si es una estructura distinta).
  const sceneAccumRef = useRef<{ signature: string; min: number[]; max: number[] } | null>(null);

  const sceneFraming = useMemo(() => {
    if (!data?.layout?.scene || !Array.isArray(data?.data)) return null;

    const signature = data.data.map((t: any) => `${t.type}:${t.x?.length ?? 0}`).join("|");

    const minCoords = [Infinity, Infinity, Infinity];
    const maxCoords = [-Infinity, -Infinity, -Infinity];
    const grow = (axisIndex: number, value: number) => {
      if (!Number.isFinite(value)) return;
      if (value < minCoords[axisIndex]) minCoords[axisIndex] = value;
      if (value > maxCoords[axisIndex]) maxCoords[axisIndex] = value;
    };

    data.data.forEach((trace: any) => {
      (["x", "y", "z"] as const).forEach((axisKey, axisIndex) => {
        const values = trace?.[axisKey];
        if (!Array.isArray(values)) return;
        for (const value of values) grow(axisIndex, Number(value));
      });

      // La animacion (restyle en cada frame, ver más abajo) mueve estos trazos por
      // fuera de este cálculo — que corre una sola vez por `data`, no por frame. Sin
      // esto, el rango queda ajustado a la fase inicial nomás y la oscilación real
      // (que puede llegar más lejos en otra fase) se recorta contra el borde del eje.
      // customdata ya trae la amplitud real/imag por eje (misma convención que usa
      // el loop de animación): la excursión máxima en cualquier fase es hypot(re,im).
      if (Array.isArray(trace?.customdata)) {
        for (const row of trace.customdata) {
          if (!Array.isArray(row) || row[0] === null || row[0] === undefined) continue;
          const [x, y, z] = row;
          if (row.length >= 9) {
            const [, , , dxR, dyR, dzR, dxI, dyI, dzI] = row;
            grow(0, Number(x) - Math.hypot(dxR, dxI)); grow(0, Number(x) + Math.hypot(dxR, dxI));
            grow(1, Number(y) - Math.hypot(dyR, dyI)); grow(1, Number(y) + Math.hypot(dyR, dyI));
            grow(2, Number(z) - Math.hypot(dzR, dzI)); grow(2, Number(z) + Math.hypot(dzR, dzI));
          } else if (row.length >= 6) {
            const [, , , dx, dy, dz] = row;
            grow(0, Number(x) - Math.abs(dx)); grow(0, Number(x) + Math.abs(dx));
            grow(1, Number(y) - Math.abs(dy)); grow(1, Number(y) + Math.abs(dy));
            grow(2, Number(z) - Math.abs(dz)); grow(2, Number(z) + Math.abs(dz));
          }
        }
      }
    });
    if (!minCoords.every(Number.isFinite)) return null;

    const previous = sceneAccumRef.current;
    const merged = previous && previous.signature === signature
      ? {
        min: minCoords.map((v, i) => Math.min(v, previous.min[i])),
        max: maxCoords.map((v, i) => Math.max(v, previous.max[i])),
      }
      : { min: minCoords, max: maxCoords };
    sceneAccumRef.current = { signature, min: merged.min, max: merged.max };
    const [minCoordsAcc, maxCoordsAcc] = [merged.min, merged.max];

    const spans = minCoordsAcc.map((min, i) => Math.max(maxCoordsAcc[i] - min, 1e-6));
    const globalSpan = Math.max(...spans, 1);

    // Rango por eje con margen propio (no forzado igual entre ejes): una estructura
    // larga y chata (puente) debe verse larga y chata, no aplastada en un cubo.
    // Margen chico (8%): solo lo justo para no cortar el sólido/las etiquetas, sin
    // dejar la estructura chica y perdida en medio de un cuadro casi vacío.
    const range = minCoordsAcc.map((min, i) => {
      const span = spans[i];
      const margin = span > 1e-6 ? span * 0.08 : globalSpan * 0.06;
      return [min - margin, maxCoordsAcc[i] + margin];
    });

    // Ojo de camara adaptado a la relacion de aspecto real: ejes cortos retroceden
    // mas (se ven desde afuera), el eje mas largo se acerca (con aspectmode='data'
    // ya ocupa toda la escena; alejarse mas solo lo aplasta en diagonal). Misma
    // formula que el backend usa para Editor/Estatico/Modal (_adaptive_camera_eye
    // en visualization/plotly_engine.py) — unica logica de camara para todo el front.
    const maxRangeSpan = Math.max(...spans);
    const eyeComponent = (span: number) => {
      const ratio = span / maxRangeSpan;
      return Math.max(0.7, Math.min(1.9, 1.35 / (ratio + 0.35)));
    };

    return {
      range: { x: range[0], y: range[1], z: range[2] },
      eye: { x: eyeComponent(spans[0]), y: eyeComponent(spans[1]), z: eyeComponent(spans[2]) },
    };
  }, [data]);

  const themeAwareLayout = useMemo(() => {
    if (!data?.layout) return null;
    const plotTheme = getPlotlyTheme(theme);

    const withAxisTheme = (axis: any = {}) => ({
      ...axis,
      title: typeof axis.title === "string"
        ? { text: axis.title, font: { color: plotTheme.text } }
        : {
          ...axis.title,
          font: { ...(axis.title?.font ?? {}), color: axis.title?.font?.color ?? plotTheme.text },
        },
      gridcolor: axis.gridcolor ?? plotTheme.grid,
      zerolinecolor: axis.zerolinecolor ?? plotTheme.zeroLine,
      linecolor: axis.linecolor ?? plotTheme.axisLine,
      tickfont: { ...(axis.tickfont ?? {}), color: axis.tickfont?.color ?? plotTheme.subtleText },
      color: axis.color ?? plotTheme.mutedText,
      showspikes: false,
    });

    const nextLayout: any = {
      ...data.layout,
      autosize: true,
      margin: data.layout.margin ?? { l: 0, r: 0, b: 0, t: 0 },
      paper_bgcolor: plotTheme.paperBackground,
      plot_bgcolor: plotTheme.plotBackground,
      font: { ...(data.layout.font ?? {}), color: plotTheme.mutedText, family: "Inter, Arial, sans-serif" },
      hoverlabel: {
        ...(data.layout.hoverlabel ?? {}),
        bgcolor: data.layout.hoverlabel?.bgcolor ?? plotTheme.hoverBackground,
        bordercolor: data.layout.hoverlabel?.bordercolor ?? plotTheme.hoverBorder,
        font: {
          ...(data.layout.hoverlabel?.font ?? {}),
          color: data.layout.hoverlabel?.font?.color ?? plotTheme.text,
        },
      },
      uirevision: data.layout.uirevision ?? `graphics-${theme}`,
      hovermode: data.layout.hovermode ?? "closest",
    };

    Object.keys(nextLayout).forEach((key) => {
      if (/^[xy]axis\d*$/.test(key)) {
        nextLayout[key] = withAxisTheme(nextLayout[key]);
      }
    });

    if (data.layout.scene) {
      // aspectmode/rango/camara: una sola logica para las 4 vistas (Editor, Estatico,
      // Modal, Armonico), calculada aca a partir de las coordenadas reales de los
      // trazos — no de lo que cada backend/builder haya puesto por su cuenta. Evita
      // que una vista quede "premium" y las demas aplastadas por drift entre
      // implementaciones separadas.
      nextLayout.scene = {
        ...data.layout.scene,
        bgcolor: data.layout.scene.bgcolor ?? plotTheme.plotBackground,
        xaxis: withAxisTheme({ ...data.layout.scene?.xaxis, range: sceneFraming?.range.x ?? data.layout.scene?.xaxis?.range }),
        yaxis: withAxisTheme({ ...data.layout.scene?.yaxis, range: sceneFraming?.range.y ?? data.layout.scene?.yaxis?.range }),
        zaxis: withAxisTheme({ ...data.layout.scene?.zaxis, range: sceneFraming?.range.z ?? data.layout.scene?.zaxis?.range }),
        aspectmode: "data",
        dragmode: "orbit",
        camera: sceneFraming
          ? {
            eye: sceneFraming.eye,
            up: { x: 0, y: 0, z: 1 },
            center: { x: 0, y: 0, z: 0 },
            projection: { type: "perspective" },
          }
          : data.layout.scene?.camera,
      };
    }

    return nextLayout;
  }, [data, theme, sceneFraming]);


  const toggleFullscreen = () => {
    if (!isFullscreen) {
      if (containerRef.current?.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const downloadImage = () => {
    if (plotRef.current && plotRef.current.el) {
      // Accedemos a Plotly a través del elemento interno o window si fuera necesario, 
      // pero react-plotly.js expone el método en el componente subyacente a menudo.
      // Mejor usamos la referencia global que suele inyectar o el método downloadImage de la instancia.
      // Como workaround seguro:
      const plotlyLib = plotlyApi ?? (window as any).Plotly;
      if (plotlyLib) {
        plotlyLib.downloadImage(plotRef.current.el, {
          format: "png",
          width: 1920,
          height: 1080,
          filename: "fem_visualization",
        });
      }
    }
  };

  const resetView = () => {
    if (plotRef.current && plotRef.current.el && data?.layout?.scene?.camera) {
      const plotlyLib = plotlyApi ?? (window as any).Plotly;
      if (plotlyLib) {
        plotlyLib.relayout(plotRef.current.el, {
          "scene.camera": data.layout.scene.camera,
        });
      }
    }
  };

  const handlePlotClick = useCallback((event: any) => {
    if (!onElementSelect) return;
    const customdata = event?.points?.[0]?.customdata;
    const rawElementId = Array.isArray(customdata)
      ? customdata[6]
      : customdata;
    const elementId = Number(rawElementId);
    if (Number.isInteger(elementId) && elementId > 0) {
      onElementSelect(elementId);
    }
  }, [onElementSelect]);

  const bindPlotEvents = useCallback((_figure: any, graphDiv: any) => {
    const previous = clickBindingRef.current;
    if (previous) {
      previous.graphDiv?.removeListener?.("plotly_click", previous.handler);
      clickBindingRef.current = null;
    }
    if (onElementSelect && graphDiv?.on) {
      graphDiv.on("plotly_click", handlePlotClick);
      clickBindingRef.current = { graphDiv, handler: handlePlotClick };
    }
  }, [handlePlotClick, onElementSelect]);

  useEffect(() => () => {
    const binding = clickBindingRef.current;
    binding?.graphDiv?.removeListener?.("plotly_click", binding.handler);
  }, []);

  useEffect(() => {
    if (!animation?.enabled || !data?.data || !PlotComponent) return;

    const plotlyLib = plotlyApi ?? (window as any).Plotly;
    const plotElement = plotRef.current?.el;
    if (!plotlyLib || !plotElement) return;

    const animatedTraces = data.data
      .map((trace: any, index: number) => ({ trace, index }))
      .filter(({ trace }: any) => (
        trace?.customdata
        && Array.isArray(trace.customdata)
        && trace.customdata.some((row: any) => Array.isArray(row) && row.length >= 6)
      ));

    const meshDeformTraces = data.data
      .map((trace: any, index: number) => ({ trace, index }))
      .filter(({ trace }: any) => trace?.type === "mesh3d" && trace?.meta?.rigidMeshDeform);

    if (animatedTraces.length === 0 && meshDeformTraces.length === 0) return;

    // Transición corta desde la posición YA dibujada (p.ej. al cambiar de
    // frecuencia/modo) hacia la nueva, en vez de saltar de golpe. Se captura ANTES
    // de que este efecto toque nada — es literalmente lo que Plotly tenía pintado
    // del render anterior.
    const TRANSITION_MS = 350;
    const transitionStartedAt = performance.now();
    const transitionFrom = new Map<number, { x: any[]; y: any[]; z: any[] }>();
    [...animatedTraces, ...meshDeformTraces].forEach(({ index }: any) => {
      const current = plotElement.data?.[index];
      if (current?.x) {
        transitionFrom.set(index, { x: [...current.x], y: [...current.y], z: [...current.z] });
      }
    });

    let frameId = 0;
    let lastFrame = 0;
    const fps = Math.max(12, Math.min(animation.fps ?? 24, 60));
    const frameMs = 1000 / fps;
    const speedHz = animation.speedHz ?? 0.65;
    const startedAt = performance.now();

    // El restyle continuo de la animación reinicia el gesto de mouse (drag/scroll) del
    // usuario sobre la escena gl3d a mitad de camino. Plotly hace stopPropagation() del
    // wheel/drag en el canvas gl3d, así que un listener en fase "bubble" nunca lo ve; se
    // captura en fase "capture" (se dispara antes de que Plotly lo detenga) para pausar el
    // restyle mientras hay una interacción activa, y se retoma solo al soltar.
    const INTERACTION_PAUSE_MS = 400;
    let pausedUntil = 0;
    const markInteracting = () => { pausedUntil = performance.now() + INTERACTION_PAUSE_MS; };
    const onPointerMove = (event: PointerEvent) => { if (event.buttons) markInteracting(); };
    plotElement.addEventListener("wheel", markInteracting, { capture: true, passive: true });
    plotElement.addEventListener("pointerdown", markInteracting, { capture: true });
    plotElement.addEventListener("pointermove", onPointerMove, { capture: true });
    plotElement.on?.("plotly_relayouting", markInteracting);
    plotElement.on?.("plotly_relayout", markInteracting);

    const buildScaledCoordinates = (customdata: any[], cosPhase: number, sinPhase: number, scale: number) => {
      const n = customdata.length;
      const x = new Array(n);
      const y = new Array(n);
      const z = new Array(n);

      for (let i = 0; i < n; i++) {
        const row = customdata[i];
        if (!row || row[0] === null) {
          x[i] = null;
          y[i] = null;
          z[i] = null;
        } else if (row.length >= 9) {
          // Respuesta armónica compleja: Re(U e^{iθ}) = Re(U)cosθ - Im(U)sinθ.
          x[i] = row[0] + scale * (row[3] * cosPhase - row[6] * sinPhase);
          y[i] = row[1] + scale * (row[4] * cosPhase - row[7] * sinPhase);
          z[i] = row[2] + scale * (row[5] * cosPhase - row[8] * sinPhase);
        } else {
          x[i] = row[0] + row[3] * cosPhase * scale;
          y[i] = row[1] + row[4] * cosPhase * scale;
          z[i] = row[2] + row[5] * cosPhase * scale;
        }
      }

      return { x, y, z };
    };

    // Rotación mínima que lleva el vector unitario fromDir a toDir, aplicada a v (Rodrigues).
    // Reconstruye la malla sólida deformada solo con la traslación nodal, sin torsión.
    const rotateVectorToAlign = (
      v: [number, number, number],
      fromDir: [number, number, number],
      toDir: [number, number, number],
    ): [number, number, number] => {
      const dot = fromDir[0] * toDir[0] + fromDir[1] * toDir[1] + fromDir[2] * toDir[2];
      if (dot > 0.999999 || dot < -0.999999) return v;
      const axis: [number, number, number] = [
        fromDir[1] * toDir[2] - fromDir[2] * toDir[1],
        fromDir[2] * toDir[0] - fromDir[0] * toDir[2],
        fromDir[0] * toDir[1] - fromDir[1] * toDir[0],
      ];
      const axisLen = Math.hypot(axis[0], axis[1], axis[2]) || 1;
      const ux = axis[0] / axisLen, uy = axis[1] / axisLen, uz = axis[2] / axisLen;
      const s = axisLen;
      const c = dot;
      const uCrossV: [number, number, number] = [uy * v[2] - uz * v[1], uz * v[0] - ux * v[2], ux * v[1] - uy * v[0]];
      const uDotV = ux * v[0] + uy * v[1] + uz * v[2];
      return [
        v[0] * c + uCrossV[0] * s + ux * uDotV * (1 - c),
        v[1] * c + uCrossV[1] * s + uy * uDotV * (1 - c),
        v[2] * c + uCrossV[2] * s + uz * uDotV * (1 - c),
      ];
    };

    const buildDeformedMesh = (trace: any, cosPhase: number, sinPhase: number) => {
      const rmd = trace.meta.rigidMeshDeform;
      const scale = rmd.scale ?? 1;
      const x = trace.x.slice();
      const y = trace.y.slice();
      const z = trace.z.slice();

      const dispAt = (nodeId: string): [number, number, number] => {
        const d = rmd.nodeDisplacement?.[nodeId];
        if (!d) return [0, 0, 0];
        return [
          scale * (d.uxR * cosPhase - d.uxI * sinPhase),
          scale * (d.uyR * cosPhase - d.uyI * sinPhase),
          scale * (d.uzR * cosPhase - d.uzI * sinPhase),
        ];
      };

      (rmd.groups ?? []).forEach((g: any) => {
        const d1 = dispAt(g.n1Id);
        const d2 = dispAt(g.n2Id);
        const c1p: [number, number, number] = [g.c1_0[0] + d1[0], g.c1_0[1] + d1[1], g.c1_0[2] + d1[2]];
        const c2p: [number, number, number] = [g.c2_0[0] + d2[0], g.c2_0[1] + d2[1], g.c2_0[2] + d2[2]];
        const len0 = Math.hypot(g.c2_0[0] - g.c1_0[0], g.c2_0[1] - g.c1_0[1], g.c2_0[2] - g.c1_0[2]) || 1;
        const localX0: [number, number, number] = [
          (g.c2_0[0] - g.c1_0[0]) / len0, (g.c2_0[1] - g.c1_0[1]) / len0, (g.c2_0[2] - g.c1_0[2]) / len0,
        ];
        const lenp = Math.hypot(c2p[0] - c1p[0], c2p[1] - c1p[1], c2p[2] - c1p[2]) || 1;
        const localXp: [number, number, number] = [
          (c2p[0] - c1p[0]) / lenp, (c2p[1] - c1p[1]) / lenp, (c2p[2] - c1p[2]) / lenp,
        ];
        for (let k = 0; k < g.count; k++) {
          const vi = g.start + k;
          const anchor = g.anchor[k] === 0 ? c1p : c2p;
          const rotated = rotateVectorToAlign(g.offset[k], localX0, localXp);
          const nx = anchor[0] + rotated[0];
          const ny = anchor[1] + rotated[1];
          const nz = anchor[2] + rotated[2];
          // Igual que en la posición inicial: ante un valor no finito, se conserva el
          // vértice previo antes que corromper el trace con NaN.
          if (Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz)) {
            x[vi] = nx;
            y[vi] = ny;
            z[vi] = nz;
          }
        }
      });

      return { x, y, z };
    };

    const tick = (now: number) => {
      if (now < pausedUntil) {
        frameId = requestAnimationFrame(tick);
        return;
      }
      if (now - lastFrame >= frameMs) {
        lastFrame = now;
        const elapsedSeconds = (now - startedAt) / 1000;
        const phase = 2 * Math.PI * speedHz * elapsedSeconds;
        const cosPhase = Math.cos(phase);
        const sinPhase = Math.sin(phase);
        const xUpdates: any[] = [];
        const yUpdates: any[] = [];
        const zUpdates: any[] = [];
        const indices: number[] = [];

        animatedTraces.forEach(({ trace, index }: any) => {
          const next = buildScaledCoordinates(trace.customdata, cosPhase, sinPhase, animation.scale);
          xUpdates.push(next.x);
          yUpdates.push(next.y);
          zUpdates.push(next.z);
          indices.push(index);
        });

        meshDeformTraces.forEach(({ trace, index }: any) => {
          const next = buildDeformedMesh(trace, cosPhase, sinPhase);
          xUpdates.push(next.x);
          yUpdates.push(next.y);
          zUpdates.push(next.z);
          indices.push(index);
        });

        const sinceTransition = now - transitionStartedAt;
        if (sinceTransition < TRANSITION_MS && transitionFrom.size > 0) {
          const t = Math.max(0, Math.min(1, sinceTransition / TRANSITION_MS));
          indices.forEach((traceIndex, i) => {
            const from = transitionFrom.get(traceIndex);
            if (!from) return;
            const blend = (targetArr: any[], fromArr: any[]) =>
              targetArr.map((v: number | null, j: number) => {
                const startValue = fromArr[j];
                if (v === null || startValue == null || !Number.isFinite(startValue)) return v;
                return startValue * (1 - t) + v * t;
              });
            xUpdates[i] = blend(xUpdates[i], from.x);
            yUpdates[i] = blend(yUpdates[i], from.y);
            zUpdates[i] = blend(zUpdates[i], from.z);
          });
        }

        try {
          plotlyLib.restyle(plotElement, { x: xUpdates, y: yUpdates, z: zUpdates }, indices);
        } catch {
          // Plotly puede no estar listo durante el primer montaje; el siguiente frame reintenta.
        }
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      plotElement.removeEventListener("wheel", markInteracting, { capture: true } as any);
      plotElement.removeEventListener("pointerdown", markInteracting, { capture: true } as any);
      plotElement.removeEventListener("pointermove", onPointerMove, { capture: true } as any);
      plotElement.removeListener?.("plotly_relayouting", markInteracting);
      plotElement.removeListener?.("plotly_relayout", markInteracting);
    };
  }, [animation?.enabled, animation?.fps, animation?.scale, animation?.speedHz, data, PlotComponent, plotlyApi]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-full ${className} bg-bg-light dark:bg-bg-dark rounded-[2.5rem] border border-border-light dark:border-border-dark transition-all duration-500 overflow-hidden relative group`}>
        <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
        <div className="relative flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-16 h-16 border-2 border-unsaac-red/20 rounded-2xl"></div>
            <div className="absolute inset-0 w-16 h-16 border-t-2 border-unsaac-red rounded-2xl animate-spin"></div>
          </div>
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.4em] animate-pulse">
            Syncing Structural Data
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center h-full ${className} bg-red-500/5 dark:bg-red-500/10 rounded-[2.5rem] border border-red-500/20 transition-all duration-500 overflow-hidden relative`}>
        <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none"></div>
        <div className="relative text-red-500 text-center p-8 max-w-sm">
          <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center mx-auto mb-6">
            <RotateCcw className="animate-reverse-spin" size={24} />
          </div>
          <p className="font-black uppercase tracking-widest mb-2 text-xs">Kernel Exception</p>
          <p className="text-[10px] font-mono opacity-80 break-words leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`flex items-center justify-center h-full ${className} bg-gray-50/50 dark:bg-black/20 rounded-[2.5rem] border border-dashed border-border-light dark:border-border-dark transition-all duration-500 overflow-hidden relative group`}>
        <div className="absolute inset-0 bg-grid-pattern opacity-5 group-hover:opacity-10 transition-opacity"></div>
        <div className="relative text-gray-400 text-center p-8 flex flex-col items-center">
          <div className="mb-6 p-6 bg-white dark:bg-bg-dark rounded-3xl border border-border-light dark:border-border-dark shadow-xl group-hover:scale-110 transition-transform">
            <Box size={48} className="opacity-10" />
          </div>
          <p className="font-black uppercase tracking-[0.2em] text-[10px]">Awaiting Geometry input</p>
          <p className="text-[9px] mt-2 opacity-60 font-medium">Define nodes and elements to begin rendering</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      // Sin esto, un arrastre de un dedo sobre el canvas gl3d lo interpreta el navegador
      // como scroll/pan de la página en touch, y el gesto de orbit de Plotly nunca lo recibe
      // completo (se corta a medio camino cuando la página se mueve debajo).
      style={{ touchAction: "none" }}
      className={`relative group bg-white dark:bg-bg-dark transition-all duration-500 ${isFullscreen ? "w-screen h-screen fixed inset-0 z-[100]" : className || "h-[600px] rounded-[2.5rem]"}`}
    >
      <div
        className={`absolute bottom-8 left-8 z-10 flex gap-3 transition-all duration-500 ${isFullscreen ? "opacity-100" : "opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0"}`}
      >
        <button
          onClick={resetView}
          className="p-3 bg-white/80 dark:bg-bg-dark-panel/80 backdrop-blur-md text-gray-600 dark:text-gray-300 rounded-xl shadow-2xl hover:text-unsaac-red border border-border-light dark:border-border-dark transition-all active:scale-90 cursor-pointer"
          title="Reset Camera"
        >
          <RotateCcw size={18} />
        </button>
        <button
          onClick={downloadImage}
          className="p-3 bg-white/80 dark:bg-bg-dark-panel/80 backdrop-blur-md text-gray-600 dark:text-gray-300 rounded-xl shadow-2xl hover:text-unsaac-red border border-border-light dark:border-border-dark transition-all active:scale-90 cursor-pointer"
          title="Export PNG"
        >
          <Download size={18} />
        </button>
        <button
          onClick={toggleFullscreen}
          className="p-3 bg-white/80 dark:bg-bg-dark-panel/80 backdrop-blur-md text-gray-600 dark:text-gray-300 rounded-xl shadow-2xl hover:text-unsaac-red border border-border-light dark:border-border-dark transition-all active:scale-90 cursor-pointer"
          title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      {PlotComponent ? (
        <PlotComponent
          ref={plotRef}
          data={data.data}
          layout={themeAwareLayout}
          frames={animation?.enabled ? undefined : data.frames}
          onInitialized={bindPlotEvents}
          onUpdate={bindPlotEvents}
          useResizeHandler={true}
          style={{ width: "100%", height: isFullscreen ? "100vh" : "100%" }}
          config={{
            responsive: true,
            displayModeBar: false,
            displaylogo: false,
            scrollZoom: true,
            staticPlot: false,
            fastedit: true,
          }}
        />
      ) : (
        <div className="flex items-center justify-center h-full">
          <div className="text-gray-400 text-sm">Cargando librería gráfica...</div>
        </div>
      )}

      {!isFullscreen && (
        <div className="absolute bottom-4 right-4 pointer-events-none opacity-40 group-hover:opacity-100 transition-opacity">
          <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium bg-white/50 dark:bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
            Girar: Click + Arrastrar | Zoom: Scroll
          </div>
        </div>
      )}
    </div>
  );
};

export default GraphicsView;
