import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

export interface PlotlyCamera {
  eye?: Partial<Vector3>;
  center?: Partial<Vector3>;
  up?: Partial<Vector3>;
  projection?: { type?: "perspective" | "orthographic" };
}

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

interface CompletePlotlyCamera {
  eye: Vector3;
  center: Vector3;
  up: Vector3;
  projection: { type: "perspective" | "orthographic" };
}

interface Position {
  x: number;
  y: number;
}

interface AxisTriadProps {
  camera?: PlotlyCamera | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  visible?: boolean;
}

export interface AxisTriadHandle {
  updateCamera: (camera: PlotlyCamera) => void;
}

const DEFAULT_POSITION: Position = { x: 0.1, y: 0.82 };
const DEFAULT_CAMERA: CompletePlotlyCamera = {
  eye: { x: 1.25, y: 1.25, z: 1.25 },
  center: { x: 0, y: 0, z: 0 },
  up: { x: 0, y: 0, z: 1 },
  projection: { type: "perspective" },
};
const GIZMO_SIZE = 116;
const ORIGIN = GIZMO_SIZE / 2;
const AXIS_LENGTH = 42;

const AXES = [
  { key: "x", label: "X", vector: { x: 1, y: 0, z: 0 }, color: "#f97346" },
  { key: "y", label: "Y", vector: { x: 0, y: 1, z: 0 }, color: "#22c779" },
  { key: "z", label: "Z", vector: { x: 0, y: 0, z: 1 }, color: "#2457e6" },
] as const;

const dot = (a: Vector3, b: Vector3) => a.x * b.x + a.y * b.y + a.z * b.z;

const cross = (a: Vector3, b: Vector3): Vector3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

const subtract = (a: Vector3, b: Vector3): Vector3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});

const normalize = (value: Vector3, fallback: Vector3): Vector3 => {
  const length = Math.hypot(value.x, value.y, value.z);
  if (!Number.isFinite(length) || length < 1e-8) return fallback;
  return { x: value.x / length, y: value.y / length, z: value.z / length };
};

const completeVector = (
  value: Partial<Vector3> | undefined,
  fallback: Vector3,
): Vector3 => ({
  x: Number.isFinite(value?.x) ? Number(value?.x) : fallback.x,
  y: Number.isFinite(value?.y) ? Number(value?.y) : fallback.y,
  z: Number.isFinite(value?.z) ? Number(value?.z) : fallback.z,
});

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const AxisTriad = React.forwardRef<AxisTriadHandle, AxisTriadProps>(({
  camera,
  containerRef,
  visible = true,
}, ref) => {
  const [position, setPosition] = useState<Position>(DEFAULT_POSITION);
  const [isDragging, setIsDragging] = useState(false);
  const [liveCamera, setLiveCamera] = useState<PlotlyCamera | null>(camera ?? null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const updateCamera = useCallback((nextCamera: PlotlyCamera) => {
    setLiveCamera((previous) => {
      const coordinates = ["eye", "center", "up"] as const;
      const components = ["x", "y", "z"] as const;
      const unchanged = previous && coordinates.every((coordinate) =>
        components.every((component) =>
          Number(previous?.[coordinate]?.[component] ?? 0)
          === Number(nextCamera?.[coordinate]?.[component] ?? 0),
        ),
      );
      return unchanged ? previous : nextCamera;
    });
  }, []);

  useImperativeHandle(ref, () => ({ updateCamera }), [updateCamera]);

  useEffect(() => {
    if (camera) updateCamera(camera);
  }, [camera, updateCamera]);

  const projectedAxes = useMemo(() => {
    const eye = completeVector(liveCamera?.eye, DEFAULT_CAMERA.eye);
    const center = completeVector(liveCamera?.center, DEFAULT_CAMERA.center);
    const cameraUp = normalize(
      completeVector(liveCamera?.up, DEFAULT_CAMERA.up),
      DEFAULT_CAMERA.up,
    );
    const forward = normalize(
      subtract(center, eye),
      normalize(subtract(DEFAULT_CAMERA.center, DEFAULT_CAMERA.eye), {
        x: 0,
        y: 0,
        z: -1,
      }),
    );

    // Base ortonormal de la cámara: right apunta a la derecha de la pantalla y
    // screenUp hacia arriba. Si la cámara mira casi paralela a su vector "up",
    // se usa un eje auxiliar para que la tríada nunca produzca NaN.
    const auxiliaryUp =
      Math.abs(dot(forward, cameraUp)) > 0.995 ? { x: 0, y: 1, z: 0 } : cameraUp;
    const right = normalize(cross(forward, auxiliaryUp), { x: 1, y: 0, z: 0 });
    const screenUp = normalize(cross(right, forward), { x: 0, y: 1, z: 0 });

    const raw = AXES.map((axis) => ({
      ...axis,
      dx: dot(axis.vector, right),
      dy: -dot(axis.vector, screenUp),
      depth: dot(axis.vector, forward),
    }));
    const maxProjection = Math.max(
      ...raw.map((axis) => Math.hypot(axis.dx, axis.dy)),
      1e-6,
    );
    const scale = AXIS_LENGTH / maxProjection;

    // Se dibujan primero los ejes que apuntan al fondo para conservar la
    // sensación de profundidad cuando dos proyecciones se cruzan.
    return raw
      .map((axis) => ({
        ...axis,
        dx: axis.dx * scale,
        dy: axis.dy * scale,
      }))
      .sort((a, b) => a.depth - b.depth);
  }, [liveCamera]);

  const moveToPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const halfSize = GIZMO_SIZE / 2;
    const centerX = clamp(
      event.clientX - rect.left - dragOffsetRef.current.x,
      halfSize,
      Math.max(halfSize, rect.width - halfSize),
    );
    const centerY = clamp(
      event.clientY - rect.top - dragOffsetRef.current.y,
      halfSize,
      Math.max(halfSize, rect.height - halfSize),
    );
    setPosition({ x: centerX / rect.width, y: centerY / rect.height });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - (rect.left + rect.width / 2),
      y: event.clientY - (rect.top + rect.height / 2),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  };

  const finishDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.05 : 0.015;
    let next = position;
    if (event.key === "ArrowLeft") next = { ...position, x: position.x - step };
    if (event.key === "ArrowRight") next = { ...position, x: position.x + step };
    if (event.key === "ArrowUp") next = { ...position, y: position.y - step };
    if (event.key === "ArrowDown") next = { ...position, y: position.y + step };
    if (event.key === "Home") next = DEFAULT_POSITION;
    if (next === position) return;
    event.preventDefault();
    event.stopPropagation();
    setPosition({
      x: clamp(next.x, 0.04, 0.96),
      y: clamp(next.y, 0.04, 0.96),
    });
  };

  return (
    <div
      data-testid="axis-triad"
      role="button"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      aria-label="Indicador de ejes XYZ. Arrastra para moverlo; pulsa Inicio para restablecerlo."
      title="Indicador XYZ · Arrastra para mover · Doble clic para restablecer"
      onPointerDown={handlePointerDown}
      onPointerMove={moveToPointer}
      onPointerUp={finishDragging}
      onPointerCancel={finishDragging}
      onDoubleClick={() => setPosition(DEFAULT_POSITION)}
      onKeyDown={handleKeyDown}
      className={`absolute z-20 touch-none select-none rounded-2xl outline-none transition-[filter,background-color,opacity] focus-visible:ring-2 focus-visible:ring-unsaac-red/70 ${
        visible ? "visible opacity-100" : "invisible pointer-events-none opacity-0"
      } ${
        isDragging
          ? "cursor-grabbing bg-white/30 dark:bg-black/20 drop-shadow-xl"
          : "cursor-grab hover:bg-white/20 dark:hover:bg-black/15"
      }`}
      style={{
        width: GIZMO_SIZE,
        height: GIZMO_SIZE,
        left: `clamp(${GIZMO_SIZE / 2}px, ${position.x * 100}%, calc(100% - ${GIZMO_SIZE / 2}px))`,
        top: `clamp(${GIZMO_SIZE / 2}px, ${position.y * 100}%, calc(100% - ${GIZMO_SIZE / 2}px))`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <svg
        width={GIZMO_SIZE}
        height={GIZMO_SIZE}
        viewBox={`0 0 ${GIZMO_SIZE} ${GIZMO_SIZE}`}
        aria-hidden="true"
        className="overflow-visible drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)] dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
      >
        {projectedAxes.map((axis) => {
          const length = Math.hypot(axis.dx, axis.dy);
          const endX = ORIGIN + axis.dx;
          const endY = ORIGIN + axis.dy;

          if (length < 7) {
            return (
              <g key={axis.key} data-axis={axis.key}>
                <circle
                  cx={ORIGIN}
                  cy={ORIGIN}
                  r={5}
                  fill="none"
                  stroke={axis.color}
                  strokeWidth={3}
                />
                <circle cx={ORIGIN} cy={ORIGIN} r={1.8} fill={axis.color} />
                <text
                  x={ORIGIN + 9}
                  y={ORIGIN - 8}
                  fill={axis.color}
                  fontSize={15}
                  fontWeight={800}
                  fontFamily="Inter, Arial, sans-serif"
                >
                  {axis.label}
                </text>
              </g>
            );
          }

          const ux = axis.dx / length;
          const uy = axis.dy / length;
          const baseX = endX - ux * 10;
          const baseY = endY - uy * 10;
          const perpendicularX = -uy * 4.5;
          const perpendicularY = ux * 4.5;
          const labelX = endX + ux * 9;
          const labelY = endY + uy * 9;

          return (
            <g key={axis.key} data-axis={axis.key}>
              <line
                x1={ORIGIN}
                y1={ORIGIN}
                x2={baseX + ux * 2}
                y2={baseY + uy * 2}
                stroke={axis.color}
                strokeWidth={4}
                strokeLinecap="round"
              />
              <polygon
                points={`${endX},${endY} ${baseX + perpendicularX},${baseY + perpendicularY} ${baseX - perpendicularX},${baseY - perpendicularY}`}
                fill={axis.color}
              />
              <text
                x={labelX}
                y={labelY}
                fill={axis.color}
                fontSize={15}
                fontWeight={800}
                fontFamily="Inter, Arial, sans-serif"
                textAnchor={Math.abs(ux) < 0.25 ? "middle" : ux > 0 ? "start" : "end"}
                dominantBaseline={Math.abs(uy) < 0.25 ? "middle" : uy > 0 ? "hanging" : "auto"}
              >
                {axis.label}
              </text>
            </g>
          );
        })}
        <circle
          cx={ORIGIN}
          cy={ORIGIN}
          r={4.5}
          className="fill-slate-700 stroke-white dark:fill-slate-100 dark:stroke-slate-900"
          strokeWidth={1.5}
        />
        <text
          x={ORIGIN + 7}
          y={ORIGIN + 13}
          className="fill-slate-500 dark:fill-slate-300"
          fontSize={9}
          fontWeight={800}
          fontFamily="Inter, Arial, sans-serif"
        >
          O
        </text>
      </svg>
    </div>
  );
});

AxisTriad.displayName = "AxisTriad";

export default AxisTriad;
