export const hasDisplacementEncoding = (trace: any): boolean =>
  trace?.meta?.displacementEncoding === "base-delta-real"
  || trace?.meta?.displacementEncoding === "complex-re-im";

export const hasComplexDisplacementEncoding = (trace: any): boolean =>
  trace?.meta?.displacementEncoding === "complex-re-im";

export const getTraceDisplacementRows = (trace: any): any[] =>
  trace?.meta?.deformationCoordinates ?? trace?.customdata ?? [];

export const buildAnimatedTraceCoordinates = (
  trace: any,
  cosPhase: number,
  sinPhase: number,
  scale: number,
) => {
  const customdata = getTraceDisplacementRows(trace);
  const isComplexDisplacement = hasComplexDisplacementEncoding(trace);
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
    } else if (isComplexDisplacement && row.length >= 9) {
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
