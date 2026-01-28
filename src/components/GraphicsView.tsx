import React, { useState, useRef, useEffect, useMemo } from "react";
import { Maximize2, Minimize2, Download, Box, RotateCcw } from "lucide-react";
import { useTheme } from "./ThemeContext";

interface GraphicsViewProps {
  data: any;
  loading: boolean;
  error: string | null;
  className?: string;
}

const GraphicsView: React.FC<GraphicsViewProps> = ({
  data,
  loading,
  error,
  className,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<any>(null);
  const { theme } = useTheme();
  // Estado para cargar Plotly dinámicamente solo en el cliente
  const [PlotComponent, setPlotComponent] = useState<any>(null);

  useEffect(() => {
    // Importación dinámica para evitar error 'self is not defined' en SSR
    import("react-plotly.js").then((mod) => {
      setPlotComponent(() => mod.default);
    });
  }, []);

  const isDark = theme === "dark";

  const themeAwareLayout = useMemo(() => {
    if (!data?.layout) return null;

    // We allow the backend to define the core aesthetics (SAP2000 colors)
    // while ensuring the layout remains responsive and fits the container.
    return {
      ...data.layout,
      autosize: true,
      margin: { l: 0, r: 0, b: 0, t: 0 },
      // Transparency allows the styled container's background and rounded corners to show through
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      // We only ensure the scene is properly initialized if not present
      scene: {
        ...data.layout.scene,
        xaxis: { ...data.layout.scene?.xaxis },
        yaxis: { ...data.layout.scene?.yaxis },
        zaxis: { ...data.layout.scene?.zaxis },
      },
    };
  }, [data?.layout, isDark]);

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
      const plotlyLib = (window as any).Plotly;
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
      const plotlyLib = (window as any).Plotly;
      if (plotlyLib) {
        plotlyLib.relayout(plotRef.current.el, {
          "scene.camera": data.layout.scene.camera,
        });
      }
    }
  };

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
      <div className="flex items-center justify-center h-[600px] bg-bg-light dark:bg-bg-dark rounded-[2.5rem] border border-border-light dark:border-border-dark transition-all duration-500 overflow-hidden relative group">
        <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
        <div className="relative flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-16 h-16 border-2 border-brand-blue/20 rounded-2xl"></div>
            <div className="absolute inset-0 w-16 h-16 border-t-2 border-brand-blue rounded-2xl animate-spin"></div>
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
      <div className="flex items-center justify-center h-[600px] bg-red-500/5 dark:bg-red-500/10 rounded-[2.5rem] border border-red-500/20 transition-all duration-500 overflow-hidden relative">
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
      <div className="flex items-center justify-center h-[600px] bg-gray-50/50 dark:bg-black/20 rounded-[2.5rem] border border-dashed border-border-light dark:border-border-dark transition-all duration-500 overflow-hidden relative group">
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
          className="p-3 bg-white/80 dark:bg-bg-dark-panel/80 backdrop-blur-md text-gray-600 dark:text-gray-300 rounded-xl shadow-2xl hover:text-brand-blue border border-border-light dark:border-border-dark transition-all active:scale-90 cursor-pointer"
          title="Reset Camera"
        >
          <RotateCcw size={18} />
        </button>
        <button
          onClick={downloadImage}
          className="p-3 bg-white/80 dark:bg-bg-dark-panel/80 backdrop-blur-md text-gray-600 dark:text-gray-300 rounded-xl shadow-2xl hover:text-brand-blue border border-border-light dark:border-border-dark transition-all active:scale-90 cursor-pointer"
          title="Export PNG"
        >
          <Download size={18} />
        </button>
        <button
          onClick={toggleFullscreen}
          className="p-3 bg-white/80 dark:bg-bg-dark-panel/80 backdrop-blur-md text-gray-600 dark:text-gray-300 rounded-xl shadow-2xl hover:text-brand-blue border border-border-light dark:border-border-dark transition-all active:scale-90 cursor-pointer"
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
          frames={data.frames}
          useResizeHandler={true}
          style={{ width: "100%", height: isFullscreen ? "100vh" : "100%" }}
          config={{
            responsive: true,
            displayModeBar: false,
            displaylogo: false,
            scrollZoom: true,
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
