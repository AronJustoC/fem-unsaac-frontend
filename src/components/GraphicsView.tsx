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
      nextLayout.scene = {
        ...data.layout.scene,
        bgcolor: data.layout.scene.bgcolor ?? plotTheme.plotBackground,
        xaxis: withAxisTheme(data.layout.scene?.xaxis),
        yaxis: withAxisTheme(data.layout.scene?.yaxis),
        zaxis: withAxisTheme(data.layout.scene?.zaxis),
      };
    }

    return nextLayout;
  }, [data, theme]);


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

    if (animatedTraces.length === 0) return;

    let frameId = 0;
    let lastFrame = 0;
    const fps = Math.max(12, Math.min(animation.fps ?? 24, 60));
    const frameMs = 1000 / fps;
    const speedHz = animation.speedHz ?? 0.65;
    const startedAt = performance.now();

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

    const tick = (now: number) => {
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
