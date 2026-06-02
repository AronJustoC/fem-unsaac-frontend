// SignalProcessingPage.tsx - Procesamiento de Señales con Exportación Completa
// Incluye: PNG, SVG, PDF vectorial, CSV, JSON
// Compatible con VibrationData/enDAQ; cálculos espectrales pesados vía backend.

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Activity,
  BarChart3,
  Database,
  Clock,
  Download,
  FileJson,
  FolderOpen,
  Gauge,
  History,
  Loader2,
  Palette,
  Play,
  Radio,
  Save,
  Scissors,
  Settings2,
  SlidersHorizontal,
  Table2,
  Upload,
  Waves,
} from 'lucide-react';
import Navbar from './Navbar';
import { ThemeProvider, useTheme } from './ThemeContext';
import {
  computeVibrationDataAnalysis,
  fullBridgeAnalysis,
  parseCSVData,
  calculateSamplingRate,
} from '../lib/signal_api';
import type { FullAnalysisResult, VibrationDataAnalysisResult, VibrationDataFftSpectrum } from '../lib/signal_api';
import { getPlotlyTheme } from '../lib/plotly_theme';

// Types
interface SignalData {
  time: number[];
  acc_x: number[];
  acc_y: number[];
  acc_z: number[];
  timeMetadata?: {
    source: 'seconds' | 'iso' | 'epoch_seconds' | 'epoch_milliseconds';
    origin?: string;
    label: string;
  };
}

interface Segment {
  id: string;
  start: number;
  end: number;
  label: string;
  color: string;
}

interface AnalysisWindowMeta {
  label: string;
  start: number;
  end: number;
  duration: number;
  samples: number;
  source: 'manual' | 'segment';
}

interface PlotDataLabel {
  id: string;
  x: number;
  y: number;
  ax?: number;
  ay?: number;
  xref: string;
  yref: string;
  text: string;
  traceName?: string;
}

interface SavedAnalysis {
  id: string;
  cacheKey: string;
  label: string;
  start: number;
  end: number;
  duration: number;
  samples: number;
  createdAt: string;
  fileName: string;
  samplingRate: number;
  unit: string;
  preprocessMode: PreprocessMode;
  preprocessModes?: PreprocessMode[];
  filterParams?: SignalFilterParams;
  fftWindowType: FFTWindowType;
  result: FullAnalysisResult;
}

interface ChartConfig {
  lineColor: string;
  lineWidth: number;
  backgroundColor: string;
  gridColor: string;
  showGrid: boolean;
  showLegend: boolean;
  titleFontSize: number;
  axisFontSize: number;
}

interface ExportConfig {
  format: 'png' | 'svg' | 'pdf' | 'csv' | 'json' | 'eps' | 'webp';
  width: number;
  height: number;
  dpi: number;
  scale: number;
  includeMetadata: boolean;
  includeTitle: boolean;
  paperSize: 'A4' | 'Letter' | 'Legal' | 'custom';
  orientation: 'portrait' | 'landscape';
}

type ViewMode = 'time' | 'fft' | 'psd' | 'waterfall' | 'envelope' | 'integration' | 'vibrationdata';
type Channel = 'acc_x' | 'acc_y' | 'acc_z' | 'resultant';
type ChannelViewMode = 'single' | 'xyz_parallel' | 'all_parallel' | 'xyz_overlay' | 'all_overlay';
type FFTWindowType = 'rectangular' | 'hann' | 'hamming' | 'blackman' | 'flattop';
type PreprocessMode =
  | 'none'
  | 'demean'
  | 'detrend'
  | 'impact_guard'
  | 'hampel'
  | 'mad_despike'
  | 'median'
  | 'anti_ski_slope'
  | 'lowpass'
  | 'highpass'
  | 'bandpass'
  | 'notch'
  | 'harmonic_notch'
  | 'moving_average'
  | 'exponential'
  | 'savgol';
type IntegrationOutputMode = 'both' | 'velocity' | 'displacement';
type DisplacementUnit = 'm' | 'mm' | 'um';
type PlotCatalogMode = 'time_histories' | 'fft_phase' | 'fft_overall';
type PlotCatalogStyle = 'publication' | 'platform';
type PlotCatalogTimeLayout = 'stacked' | 'full_zoom';

type VibrationBackendChannelState = {
  cacheKey: string;
  result: VibrationDataAnalysisResult;
};

type SpectralSummaryRow = {
  rank: number;
  channel: string;
  source: 'PSD Welch' | 'Aggregate FFT';
  frequencyHz: number;
  energyValue: number | null;
  energyUnit: string;
  amplitudeValue: number | null;
  amplitudeUnit: string;
};

interface SignalFilterParams {
  lowpassCutoffHz: number;
  highpassCutoffHz: number;
  bandpassLowHz: number;
  bandpassHighHz: number;
  notchFreqHz: number;
  notchQ: number;
  harmonicCount: number;
  medianWindowSamples: number;
  hampelWindowSamples: number;
  hampelSigma: number;
  madThreshold: number;
  smoothingWindowSamples: number;
  exponentialAlpha: number;
  savgolWindowSamples: number;
}

const FFT_WINDOW_LABELS: Record<FFTWindowType, string> = {
  rectangular: 'Rectangular',
  hann: 'Hann / Hanning',
  hamming: 'Hamming',
  blackman: 'Blackman',
  flattop: 'Flat top',
};

const PREPROCESS_LABELS: Record<PreprocessMode, string> = {
  none: 'Sin corrección',
  demean: 'Remover media',
  detrend: 'Remover tendencia lineal',
  impact_guard: 'Anti-golpes Hampel + MAD',
  hampel: 'Hampel robusto',
  mad_despike: 'Despiking MAD',
  median: 'Mediana móvil',
  anti_ski_slope: 'Anti ski-slope',
  lowpass: 'Pasa bajo',
  highpass: 'Pasa alto',
  bandpass: 'Pasa banda',
  notch: 'Notch 50/60 Hz',
  harmonic_notch: 'Notch armónico',
  moving_average: 'Media móvil',
  exponential: 'Media exponencial',
  savgol: 'Savitzky-Golay',
};

const PREPROCESS_PIPELINE_ORDER: PreprocessMode[] = [
  'demean',
  'detrend',
  'hampel',
  'mad_despike',
  'impact_guard',
  'median',
  'anti_ski_slope',
  'highpass',
  'lowpass',
  'bandpass',
  'notch',
  'harmonic_notch',
  'moving_average',
  'exponential',
  'savgol',
];

const PREPROCESS_DESCRIPTIONS: Record<PreprocessMode, string> = {
  none: 'Usa la señal cruda, sin corrección ni suavizado.',
  demean: 'Centra la señal eliminando el offset DC.',
  detrend: 'Elimina media y deriva lineal lenta.',
  impact_guard: 'Detecta golpes/picos con Hampel y MAD, y reemplaza por interpolación robusta.',
  hampel: 'Reemplaza valores atípicos locales por la mediana de su ventana.',
  mad_despike: 'Detecta picos globales por desviación absoluta mediana e interpola la zona afectada.',
  median: 'Suaviza picos aislados con una mediana móvil.',
  anti_ski_slope: 'Detrend + anti-golpes + pasa alto para reducir energía falsa cerca de 0 Hz.',
  lowpass: 'Atenúa ruido de alta frecuencia con un IIR local de fase casi cero.',
  highpass: 'Atenúa deriva lenta y offset residual.',
  bandpass: 'Conserva solo el rango modal/frecuencial de interés.',
  notch: 'Elimina una frecuencia estrecha, típicamente 50/60 Hz.',
  harmonic_notch: 'Elimina la frecuencia de línea y sus armónicos dentro del Nyquist.',
  moving_average: 'Suavizado simple; útil para visualización, no para preservar impactos.',
  exponential: 'Suavizado causal rápido con factor alpha.',
  savgol: 'Suaviza preservando mejor la forma local que la media móvil.',
};

const DEFAULT_FILTER_PARAMS: SignalFilterParams = {
  lowpassCutoffHz: 20,
  highpassCutoffHz: 0.5,
  bandpassLowHz: 0.5,
  bandpassHighHz: 20,
  notchFreqHz: 60,
  notchQ: 30,
  harmonicCount: 3,
  medianWindowSamples: 5,
  hampelWindowSamples: 11,
  hampelSigma: 3,
  madThreshold: 6,
  smoothingWindowSamples: 9,
  exponentialAlpha: 0.2,
  savgolWindowSamples: 11,
};

const CHANNEL_VIEW_LABELS: Record<ChannelViewMode, string> = {
  single: 'Individual',
  xyz_parallel: 'XYZ paralelo',
  all_parallel: 'XYZ + R',
  xyz_overlay: 'XYZ superpuesto',
  all_overlay: 'XYZ + R superpuesto',
};

const INTEGRATION_OUTPUT_LABELS: Record<IntegrationOutputMode, string> = {
  both: 'Velocidad + desplazamiento',
  velocity: 'Velocidad',
  displacement: 'Desplazamiento',
};

const DISPLACEMENT_UNIT_LABELS: Record<DisplacementUnit, string> = {
  m: 'm',
  mm: 'mm',
  um: 'µm',
};

const DISPLACEMENT_UNIT_FACTORS: Record<DisplacementUnit, number> = {
  m: 1,
  mm: 1_000,
  um: 1_000_000,
};

const PLOT_CATALOG_LABELS: Record<PlotCatalogMode, string> = {
  time_histories: 'Time History A/V/D',
  fft_phase: 'FFT Magnitud + Fase',
  fft_overall: 'FFT Overall RMS',
};

const PLOT_CATALOG_STYLE_LABELS: Record<PlotCatalogStyle, string> = {
  publication: 'Publicación blanca',
  platform: 'Tema plataforma',
};

const PLOT_CATALOG_TIME_LAYOUT_LABELS: Record<PlotCatalogTimeLayout, string> = {
  stacked: 'Simple vertical',
  full_zoom: 'Completo + zoom',
};

// Color palettes
const COLOR_PALETTES = {
  default: { acc_x: '#3B82F6', acc_y: '#10B981', acc_z: '#EF4444', resultant: '#F59E0B' },
  seismic: { acc_x: '#06B6D4', acc_y: '#8B5CF6', acc_z: '#EC4899', resultant: '#F97316' },
  thermal: { acc_x: '#EF4444', acc_y: '#F59E0B', acc_z: '#22C55E', resultant: '#3B82F6' },
  ocean: { acc_x: '#0EA5E9', acc_y: '#14B8A6', acc_z: '#6366F1', resultant: '#A855F7' },
  custom: { acc_x: '#FF6B6B', acc_y: '#4ECDC4', acc_z: '#45B7D1', resultant: '#FFA07A' },
};

const PAPER_SIZES = {
  A4: { width: 210, height: 297 },
  Letter: { width: 216, height: 279 },
  Legal: { width: 216, height: 356 },
};

const MAX_TIME_PLOT_POINTS = 8_000;
const MAX_FFT_SAMPLES = 131_072;
const MIN_FFT_SAMPLES = 256;
const STANDARD_GRAVITY = 9.80665;
const VIBRATION_BACKEND_BIN_WIDTH_HZ = 1.0;
const VIBRATION_BACKEND_OVERLAP = 0.5;
const WORKSPACE_STORAGE_KEY = 'fem_unsaac_signal_workspace_v3';
const ANALYSIS_STORAGE_KEY = 'fem_unsaac_signal_analysis_cache_v3';
const MAX_SAVED_ANALYSES = 12;

const lowerBound = (values: number[], target: number) => {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

const upperBound = (values: number[], target: number) => {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

const getTimeWindowIndices = (time: number[], range: [number, number]) => {
  if (time.length === 0) return { startIdx: 0, endIdx: -1 };
  const start = Math.min(range[0], range[1]);
  const end = Math.max(range[0], range[1]);
  const startIdx = Math.max(0, Math.min(time.length - 1, lowerBound(time, start)));
  const endIdx = Math.max(startIdx, Math.min(time.length - 1, upperBound(time, end) - 1));
  return { startIdx, endIdx };
};

const floorPowerOfTwo = (value: number) => {
  if (value < 2) return 1;
  return 2 ** Math.floor(Math.log2(value));
};

const ceilPowerOfTwo = (value: number) => {
  if (value < 2) return 1;
  return 2 ** Math.ceil(Math.log2(value));
};

const downsampleMinMax = (
  x: number[],
  y: number[],
  maxPoints = MAX_TIME_PLOT_POINTS
): { x: number[]; y: number[] } => {
  const n = Math.min(x.length, y.length);
  if (n <= maxPoints || maxPoints < 4) {
    return { x, y };
  }

  const bucketSize = Math.max(1, Math.ceil(n / Math.floor(maxPoints / 2)));
  const outX: number[] = [];
  const outY: number[] = [];
  let lastPushed = -1;

  const pushPoint = (idx: number) => {
    if (idx < 0 || idx >= n || idx === lastPushed) return;
    outX.push(x[idx]);
    outY.push(y[idx]);
    lastPushed = idx;
  };

  pushPoint(0);
  for (let start = 1; start < n - 1; start += bucketSize) {
    const end = Math.min(n - 1, start + bucketSize);
    let minIdx = start;
    let maxIdx = start;
    let minVal = y[start];
    let maxVal = y[start];

    for (let i = start + 1; i < end; i++) {
      const value = y[i];
      if (value < minVal) {
        minVal = value;
        minIdx = i;
      }
      if (value > maxVal) {
        maxVal = value;
        maxIdx = i;
      }
    }

    if (minIdx < maxIdx) {
      pushPoint(minIdx);
      pushPoint(maxIdx);
    } else {
      pushPoint(maxIdx);
      pushPoint(minIdx);
    }
  }
  pushPoint(n - 1);

  return { x: outX, y: outY };
};

const computeStats = (data: number[]) => {
  if (data.length === 0) {
    return { points: 0, max: 0, min: 0, rms: 0, maxAbs: 0 };
  }

  let max = -Infinity;
  let min = Infinity;
  let sumSquares = 0;
  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    if (value > max) max = value;
    if (value < min) min = value;
    sumSquares += value * value;
  }

  return {
    points: data.length,
    max,
    min,
    rms: Math.sqrt(sumSquares / data.length),
    maxAbs: Math.max(Math.abs(max), Math.abs(min)),
  };
};

const createEmptyKinematicsData = () => {
  const emptyStats = computeStats([]);
  return {
    accelerationMps2: [] as number[],
    velocityMps: [] as number[],
    displacementM: [] as number[],
    velocityStats: emptyStats,
    displacementStats: emptyStats,
    accelerationScale: STANDARD_GRAVITY,
    driftWarning: false,
    driftRatio: 0,
  };
};

const buildKinematicsDataFromBackend = (result: VibrationDataAnalysisResult | null) => {
  if (!result) return createEmptyKinematicsData();
  const histories = result.time_histories;
  const accelerationSource = histories.acceleration_conditioned_g.length > 0
    ? histories.acceleration_conditioned_g
    : histories.acceleration_g;
  const accelerationMps2 = accelerationSource.map((value) => value * STANDARD_GRAVITY);
  const velocityMps = histories.velocity_mm_s.map((value) => value / 1_000);
  const displacementM = histories.displacement_mm.map((value) => value / 1_000);
  return {
    accelerationMps2,
    velocityMps,
    displacementM,
    velocityStats: computeStats(velocityMps),
    displacementStats: computeStats(displacementM),
    accelerationScale: STANDARD_GRAVITY,
    driftWarning: Boolean(histories.drift?.warning),
    driftRatio: Number(histories.drift?.drift_ratio ?? 0),
  };
};

const buildVibrationSeriesFromBackend = (
  result: VibrationDataAnalysisResult | null,
  historyZoomRange: [number, number]
) => {
  if (!result) {
    return {
      full: { time: [] as number[], accelerationG: [] as number[], velocityMmS: [] as number[], displacementMm: [] as number[] },
      zoom: { time: [] as number[], accelerationG: [] as number[], velocityMmS: [] as number[], displacementMm: [] as number[] },
    };
  }
  const histories = result.time_histories;
  const full = {
    time: histories.time,
    accelerationG: histories.acceleration_g,
    velocityMmS: histories.velocity_mm_s,
    displacementMm: histories.displacement_mm,
  };
  const { startIdx, endIdx } = getTimeWindowIndices(full.time, historyZoomRange);
  const hasZoom = full.time.length > 0 && endIdx >= startIdx;
  return {
    full,
    zoom: {
      time: hasZoom ? full.time.slice(startIdx, endIdx + 1) : [],
      accelerationG: hasZoom ? full.accelerationG.slice(startIdx, endIdx + 1) : [],
      velocityMmS: hasZoom ? full.velocityMmS.slice(startIdx, endIdx + 1) : [],
      displacementMm: hasZoom ? full.displacementMm.slice(startIdx, endIdx + 1) : [],
    },
  };
};

const normalizeBackendFftSpectrum = (spectrum?: VibrationDataFftSpectrum) => ({
  frequencies: spectrum?.frequencies ?? [],
  amplitudes: spectrum?.amplitudes ?? [],
  phasesDeg: spectrum?.phases_deg ?? [],
  engine: spectrum?.engine ?? '',
  unit: spectrum?.unit ?? '',
});

const buildVibrationSpectraFromBackend = (
  result: VibrationDataAnalysisResult | null,
  source: 'fft' | 'aggregate_fft'
) => ({
  acceleration: normalizeBackendFftSpectrum(result?.[source]?.acceleration),
  velocity: normalizeBackendFftSpectrum(result?.[source]?.velocity),
  displacement: normalizeBackendFftSpectrum(result?.[source]?.displacement),
});

const findNearestSpectrumAmplitude = (
  spectrum: VibrationDataFftSpectrum | undefined,
  frequencyHz: number
) => {
  const frequencies = spectrum?.frequencies ?? [];
  const amplitudes = spectrum?.amplitudes ?? [];
  if (frequencies.length === 0 || amplitudes.length === 0) return null;

  let nearestIndex = -1;
  let nearestDelta = Infinity;
  for (let i = 0; i < frequencies.length && i < amplitudes.length; i++) {
    const frequency = frequencies[i];
    if (!Number.isFinite(frequency)) continue;
    const delta = Math.abs(frequency - frequencyHz);
    if (delta < nearestDelta) {
      nearestDelta = delta;
      nearestIndex = i;
    }
  }

  if (nearestIndex < 0) return null;
  const amplitude = amplitudes[nearestIndex];
  return Number.isFinite(amplitude) ? amplitude : null;
};

const buildSpectralSummaryRows = (
  result: VibrationDataAnalysisResult | null,
  channel: string,
  limit = 10
): SpectralSummaryRow[] => {
  if (!result) return [];

  const aggregateSpectrum = result.aggregate_fft?.acceleration;
  const psdSpectrum = result.psd?.acceleration;
  const psdPeaks = [...(psdSpectrum?.peaks ?? [])]
    .filter((peak) => Number.isFinite(peak.frequency_hz) && Number.isFinite(peak.amplitude))
    .sort((a, b) => b.amplitude - a.amplitude)
    .slice(0, limit);

  if (psdPeaks.length > 0) {
    return psdPeaks.map((peak, index) => ({
      rank: index + 1,
      channel,
      source: 'PSD Welch',
      frequencyHz: peak.frequency_hz,
      energyValue: peak.amplitude,
      energyUnit: psdSpectrum?.unit ?? 'unit²/Hz',
      amplitudeValue: findNearestSpectrumAmplitude(aggregateSpectrum, peak.frequency_hz),
      amplitudeUnit: aggregateSpectrum?.unit ?? 'G',
    }));
  }

  return [...(aggregateSpectrum?.peaks ?? [])]
    .filter((peak) => Number.isFinite(peak.frequency_hz) && Number.isFinite(peak.amplitude))
    .sort((a, b) => b.amplitude - a.amplitude)
    .slice(0, limit)
    .map((peak, index) => ({
      rank: index + 1,
      channel,
      source: 'Aggregate FFT',
      frequencyHz: peak.frequency_hz,
      energyValue: null,
      energyUnit: '—',
      amplitudeValue: peak.amplitude,
      amplitudeUnit: aggregateSpectrum?.unit ?? 'G',
    }));
};

const fftInPlace = (real: Float64Array, imag: Float64Array) => {
  const n = real.length;

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tmpReal = real[i];
      real[i] = real[j];
      real[j] = tmpReal;
      const tmpImag = imag[i];
      imag[i] = imag[j];
      imag[j] = tmpImag;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wLenReal = Math.cos(angle);
    const wLenImag = Math.sin(angle);
    const halfLen = len >> 1;

    for (let i = 0; i < n; i += len) {
      let wReal = 1;
      let wImag = 0;

      for (let j = 0; j < halfLen; j++) {
        const evenIdx = i + j;
        const oddIdx = evenIdx + halfLen;
        const oddReal = real[oddIdx] * wReal - imag[oddIdx] * wImag;
        const oddImag = real[oddIdx] * wImag + imag[oddIdx] * wReal;

        real[oddIdx] = real[evenIdx] - oddReal;
        imag[oddIdx] = imag[evenIdx] - oddImag;
        real[evenIdx] += oddReal;
        imag[evenIdx] += oddImag;

        const nextWReal = wReal * wLenReal - wImag * wLenImag;
        wImag = wReal * wLenImag + wImag * wLenReal;
        wReal = nextWReal;
      }
    }
  }
};

const preprocessSignal = (data: number[], mode: PreprocessMode): number[] => {
  const n = data.length;
  if (n === 0 || mode === 'none') return data;

  let sum = 0;
  for (let i = 0; i < n; i++) sum += data[i];
  const mean = sum / n;

  if (mode === 'demean' || n < 2) {
    return data.map((value) => value - mean);
  }

  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += data[i];
    sumXX += i * i;
    sumXY += i * data[i];
  }

  const denominator = n * sumXX - sumX * sumX;
  if (Math.abs(denominator) < 1e-12) {
    return data.map((value) => value - mean);
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return data.map((value, index) => value - (slope * index + intercept));
};

const clampNumber = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

const normalizeOddWindow = (value: number, min = 3, max = 501) => {
  let window = Math.round(Number.isFinite(value) ? value : min);
  window = Math.min(max, Math.max(min, window));
  if (window % 2 === 0) window += window >= max ? -1 : 1;
  return Math.max(min, window);
};

const normalizeFilterParams = (value: Partial<SignalFilterParams> | null | undefined): SignalFilterParams => {
  const source = value ?? {};
  return {
    lowpassCutoffHz: clampNumber(Number(source.lowpassCutoffHz ?? DEFAULT_FILTER_PARAMS.lowpassCutoffHz), 0.001, 100_000),
    highpassCutoffHz: clampNumber(Number(source.highpassCutoffHz ?? DEFAULT_FILTER_PARAMS.highpassCutoffHz), 0, 100_000),
    bandpassLowHz: clampNumber(Number(source.bandpassLowHz ?? DEFAULT_FILTER_PARAMS.bandpassLowHz), 0, 100_000),
    bandpassHighHz: clampNumber(Number(source.bandpassHighHz ?? DEFAULT_FILTER_PARAMS.bandpassHighHz), 0.001, 100_000),
    notchFreqHz: clampNumber(Number(source.notchFreqHz ?? DEFAULT_FILTER_PARAMS.notchFreqHz), 0.001, 100_000),
    notchQ: clampNumber(Number(source.notchQ ?? DEFAULT_FILTER_PARAMS.notchQ), 1, 1_000),
    harmonicCount: Math.round(clampNumber(Number(source.harmonicCount ?? DEFAULT_FILTER_PARAMS.harmonicCount), 1, 20)),
    medianWindowSamples: normalizeOddWindow(Number(source.medianWindowSamples ?? DEFAULT_FILTER_PARAMS.medianWindowSamples), 3, 501),
    hampelWindowSamples: normalizeOddWindow(Number(source.hampelWindowSamples ?? DEFAULT_FILTER_PARAMS.hampelWindowSamples), 3, 501),
    hampelSigma: clampNumber(Number(source.hampelSigma ?? DEFAULT_FILTER_PARAMS.hampelSigma), 0.5, 20),
    madThreshold: clampNumber(Number(source.madThreshold ?? DEFAULT_FILTER_PARAMS.madThreshold), 1, 50),
    smoothingWindowSamples: normalizeOddWindow(Number(source.smoothingWindowSamples ?? DEFAULT_FILTER_PARAMS.smoothingWindowSamples), 3, 501),
    exponentialAlpha: clampNumber(Number(source.exponentialAlpha ?? DEFAULT_FILTER_PARAMS.exponentialAlpha), 0.001, 1),
    savgolWindowSamples: normalizeOddWindow(Number(source.savgolWindowSamples ?? DEFAULT_FILTER_PARAMS.savgolWindowSamples), 5, 501),
  };
};

const sanitizeSignalValues = (data: number[]) => {
  const values = new Array<number>(data.length);
  let lastFinite = 0;
  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    if (Number.isFinite(value)) {
      values[i] = value;
      lastFinite = value;
    } else {
      values[i] = lastFinite;
    }
  }
  return values;
};

const medianOfSorted = (values: number[]) => {
  if (values.length === 0) return 0;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
};

const medianOf = (values: number[]) => medianOfSorted(values.slice().sort((a, b) => a - b));

const rollingMedianFilter = (data: number[], windowSamples: number) => {
  const values = sanitizeSignalValues(data);
  const n = values.length;
  if (n < 3) return values;
  const window = Math.min(normalizeOddWindow(windowSamples), n % 2 === 0 ? n - 1 : n);
  const radius = Math.floor(window / 2);
  const output = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - radius);
    const end = Math.min(n, i + radius + 1);
    output[i] = medianOf(values.slice(start, end));
  }

  return output;
};

const interpolateMaskedSamples = (values: number[], mask: boolean[]) => {
  const n = values.length;
  const output = values.slice();
  let i = 0;

  while (i < n) {
    if (!mask[i]) {
      i++;
      continue;
    }

    const runStart = i;
    while (i < n && mask[i]) i++;
    const runEnd = i - 1;
    const left = runStart - 1;
    const right = i;

    if (left >= 0 && right < n && !mask[left] && !mask[right]) {
      const leftValue = values[left];
      const rightValue = values[right];
      const span = right - left;
      for (let j = runStart; j <= runEnd; j++) {
        const ratio = (j - left) / span;
        output[j] = leftValue + (rightValue - leftValue) * ratio;
      }
    } else if (left >= 0 && !mask[left]) {
      for (let j = runStart; j <= runEnd; j++) output[j] = values[left];
    } else if (right < n && !mask[right]) {
      for (let j = runStart; j <= runEnd; j++) output[j] = values[right];
    } else {
      const fallback = medianOf(values);
      for (let j = runStart; j <= runEnd; j++) output[j] = fallback;
    }
  }

  return output;
};

const hampelFilter = (data: number[], windowSamples: number, sigma = 3) => {
  const values = sanitizeSignalValues(data);
  const n = values.length;
  if (n < 3) return values;
  const window = Math.min(normalizeOddWindow(windowSamples), n % 2 === 0 ? n - 1 : n);
  const radius = Math.floor(window / 2);
  const output = values.slice();

  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - radius);
    const end = Math.min(n, i + radius + 1);
    const local = values.slice(start, end).sort((a, b) => a - b);
    const localMedian = medianOfSorted(local);
    const deviations = local.map((value) => Math.abs(value - localMedian)).sort((a, b) => a - b);
    const mad = medianOfSorted(deviations);
    const robustSigma = 1.4826 * mad;
    const tolerance = robustSigma > 1e-15 ? sigma * robustSigma : 0;

    if (tolerance > 0 && Math.abs(values[i] - localMedian) > tolerance) {
      output[i] = localMedian;
    }
  }

  return output;
};

const madDespikeFilter = (data: number[], threshold = 6) => {
  const values = sanitizeSignalValues(data);
  if (values.length < 3) return values;
  const globalMedian = medianOf(values);
  const deviations = values.map((value) => Math.abs(value - globalMedian));
  const mad = medianOf(deviations);
  const robustSigma = 1.4826 * mad;
  if (robustSigma <= 1e-15) return values;
  const mask = values.map((value) => Math.abs(value - globalMedian) > threshold * robustSigma);
  return interpolateMaskedSamples(values, mask);
};

const movingAverageFilter = (data: number[], windowSamples: number) => {
  const values = sanitizeSignalValues(data);
  const n = values.length;
  if (n < 2) return values;
  const window = Math.min(normalizeOddWindow(windowSamples), n % 2 === 0 ? n - 1 : n);
  const radius = Math.floor(window / 2);
  const output = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - radius);
    const end = Math.min(n, i + radius + 1);
    let sum = 0;
    for (let j = start; j < end; j++) sum += values[j];
    output[i] = sum / Math.max(1, end - start);
  }

  return output;
};

const exponentialSmoothingFilter = (data: number[], alpha: number) => {
  const values = sanitizeSignalValues(data);
  const n = values.length;
  if (n < 2) return values;
  const boundedAlpha = clampNumber(alpha, 0.001, 1);
  const output = new Array<number>(n);
  output[0] = values[0];
  for (let i = 1; i < n; i++) {
    output[i] = boundedAlpha * values[i] + (1 - boundedAlpha) * output[i - 1];
  }
  return output;
};

const clampCutoffHz = (cutoffHz: number, fs: number) => {
  const nyquist = fs / 2;
  if (!Number.isFinite(cutoffHz) || !Number.isFinite(fs) || fs <= 0 || nyquist <= 0) return 0;
  return Math.min(Math.max(0, cutoffHz), Math.max(0, nyquist * 0.98));
};

const applyForwardBackward = (values: number[], filter: (input: number[]) => number[], passes = 1) => {
  let output = values.slice();
  for (let pass = 0; pass < Math.max(1, passes); pass++) {
    output = filter(output);
    output = filter(output.slice().reverse()).reverse();
  }
  return output;
};

const lowpassFirstOrderBySample = (data: number[], fs: number, cutoffHz: number, passes = 2) => {
  const values = sanitizeSignalValues(data);
  const cutoff = clampCutoffHz(cutoffHz, fs);
  if (values.length < 3 || cutoff <= 0) return values;
  const dt = 1 / fs;
  const rc = 1 / (2 * Math.PI * cutoff);
  const alpha = dt / (rc + dt);

  return applyForwardBackward(values, (input) => {
    const output = new Array<number>(input.length);
    output[0] = input[0];
    for (let i = 1; i < input.length; i++) {
      output[i] = output[i - 1] + alpha * (input[i] - output[i - 1]);
    }
    return output;
  }, passes);
};

const highpassFirstOrderBySample = (data: number[], fs: number, cutoffHz: number, passes = 2) => {
  const values = sanitizeSignalValues(data);
  const cutoff = clampCutoffHz(cutoffHz, fs);
  if (values.length < 3 || cutoff <= 0) return values;
  const dt = 1 / fs;
  const rc = 1 / (2 * Math.PI * cutoff);
  const alpha = rc / (rc + dt);

  return applyForwardBackward(values, (input) => {
    const output = new Array<number>(input.length).fill(0);
    for (let i = 1; i < input.length; i++) {
      output[i] = alpha * (output[i - 1] + input[i] - input[i - 1]);
    }
    return output;
  }, passes);
};

const bandpassFirstOrderBySample = (
  data: number[],
  fs: number,
  lowCutoffHz: number,
  highCutoffHz: number
) => {
  const nyquist = fs / 2;
  const low = clampNumber(lowCutoffHz, 0, Math.max(0, nyquist * 0.95));
  const high = clampNumber(highCutoffHz, Math.max(low + 1e-6, 0.001), Math.max(0.001, nyquist * 0.98));
  return lowpassFirstOrderBySample(highpassFirstOrderBySample(data, fs, low, 2), fs, high, 2);
};

const applyBiquad = (data: number[], coefficients: { b0: number; b1: number; b2: number; a1: number; a2: number }) => {
  const output = new Array<number>(data.length).fill(0);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let i = 0; i < data.length; i++) {
    const x0 = Number.isFinite(data[i]) ? data[i] : 0;
    const y0 = coefficients.b0 * x0
      + coefficients.b1 * x1
      + coefficients.b2 * x2
      - coefficients.a1 * y1
      - coefficients.a2 * y2;
    output[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return output;
};

const notchFilterBySample = (data: number[], fs: number, notchHz: number, qualityFactor: number) => {
  const values = sanitizeSignalValues(data);
  const cutoff = clampCutoffHz(notchHz, fs);
  if (values.length < 3 || cutoff <= 0 || cutoff >= fs / 2) return values;

  const w0 = (2 * Math.PI * cutoff) / fs;
  const cosW0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * clampNumber(qualityFactor, 1, 1_000));
  const a0 = 1 + alpha;
  const coefficients = {
    b0: 1 / a0,
    b1: (-2 * cosW0) / a0,
    b2: 1 / a0,
    a1: (-2 * cosW0) / a0,
    a2: (1 - alpha) / a0,
  };

  return applyForwardBackward(values, (input) => applyBiquad(input, coefficients), 1);
};

const harmonicNotchFilterBySample = (
  data: number[],
  fs: number,
  notchHz: number,
  qualityFactor: number,
  harmonicCount: number
) => {
  const nyquist = fs / 2;
  let output = sanitizeSignalValues(data);
  const count = Math.round(clampNumber(harmonicCount, 1, 20));
  for (let harmonic = 1; harmonic <= count; harmonic++) {
    const frequency = notchHz * harmonic;
    if (frequency >= nyquist * 0.98) break;
    output = notchFilterBySample(output, fs, frequency, qualityFactor);
  }
  return output;
};

const savitzkyGolaySmooth = (data: number[], windowSamples: number) => {
  const values = sanitizeSignalValues(data);
  const n = values.length;
  if (n < 5) return values;
  const window = Math.min(normalizeOddWindow(windowSamples, 5), n % 2 === 0 ? n - 1 : n);
  const radius = Math.floor(window / 2);

  let s0 = 0;
  let s2 = 0;
  let s4 = 0;
  for (let k = -radius; k <= radius; k++) {
    const k2 = k * k;
    s0 += 1;
    s2 += k2;
    s4 += k2 * k2;
  }

  const denominator = s0 * s4 - s2 * s2;
  if (Math.abs(denominator) < 1e-12) return movingAverageFilter(values, window);
  const coefficients: number[] = [];
  for (let k = -radius; k <= radius; k++) {
    coefficients.push((s4 - s2 * k * k) / denominator);
  }

  const output = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = -radius; j <= radius; j++) {
      const sourceIndex = Math.min(n - 1, Math.max(0, i + j));
      sum += coefficients[j + radius] * values[sourceIndex];
    }
    output[i] = sum;
  }

  return output;
};

const applySignalFilterPreset = (
  data: number[],
  mode: PreprocessMode,
  fs: number,
  params: SignalFilterParams
): number[] => {
  if (mode === 'none') return data.slice();
  if (mode === 'demean' || mode === 'detrend') return preprocessSignal(data, mode);

  const normalizedParams = normalizeFilterParams(params);
  const cleaned = sanitizeSignalValues(data);

  switch (mode) {
    case 'hampel':
      return hampelFilter(cleaned, normalizedParams.hampelWindowSamples, normalizedParams.hampelSigma);
    case 'mad_despike':
      return madDespikeFilter(cleaned, normalizedParams.madThreshold);
    case 'median':
      return rollingMedianFilter(cleaned, normalizedParams.medianWindowSamples);
    case 'impact_guard':
      return madDespikeFilter(
        hampelFilter(cleaned, normalizedParams.hampelWindowSamples, normalizedParams.hampelSigma),
        normalizedParams.madThreshold
      );
    case 'anti_ski_slope': {
      const detrended = preprocessSignal(cleaned, 'detrend');
      const depiked = madDespikeFilter(
        hampelFilter(detrended, normalizedParams.hampelWindowSamples, normalizedParams.hampelSigma),
        normalizedParams.madThreshold
      );
      return highpassFirstOrderBySample(depiked, fs, normalizedParams.highpassCutoffHz, 2);
    }
    case 'lowpass':
      return lowpassFirstOrderBySample(cleaned, fs, normalizedParams.lowpassCutoffHz, 2);
    case 'highpass':
      return highpassFirstOrderBySample(cleaned, fs, normalizedParams.highpassCutoffHz, 2);
    case 'bandpass':
      return bandpassFirstOrderBySample(cleaned, fs, normalizedParams.bandpassLowHz, normalizedParams.bandpassHighHz);
    case 'notch':
      return notchFilterBySample(cleaned, fs, normalizedParams.notchFreqHz, normalizedParams.notchQ);
    case 'harmonic_notch':
      return harmonicNotchFilterBySample(
        cleaned,
        fs,
        normalizedParams.notchFreqHz,
        normalizedParams.notchQ,
        normalizedParams.harmonicCount
      );
    case 'moving_average':
      return movingAverageFilter(cleaned, normalizedParams.smoothingWindowSamples);
    case 'exponential':
      return exponentialSmoothingFilter(cleaned, normalizedParams.exponentialAlpha);
    case 'savgol':
      return savitzkyGolaySmooth(cleaned, normalizedParams.savgolWindowSamples);
    default:
      return cleaned;
  }
};

const normalizePreprocessModes = (modes: Array<PreprocessMode | undefined | null>): PreprocessMode[] => {
  const unique = new Set<PreprocessMode>();
  modes.forEach((mode) => {
    if (!mode || mode === 'none') return;
    unique.add(mode);
  });
  return PREPROCESS_PIPELINE_ORDER.filter((mode) => unique.has(mode));
};

const getPreprocessModesFromSaved = (saved: Pick<SavedAnalysis, 'preprocessMode' | 'preprocessModes'>) => (
  normalizePreprocessModes(
    Array.isArray(saved.preprocessModes) && saved.preprocessModes.length > 0
      ? saved.preprocessModes
      : [saved.preprocessMode]
  )
);

const formatPreprocessPipeline = (modes: PreprocessMode[]) => {
  const normalized = normalizePreprocessModes(modes);
  if (normalized.length === 0) return PREPROCESS_LABELS.none;
  return normalized.map((mode) => PREPROCESS_LABELS[mode]).join(' + ');
};

const applySignalFilterPipeline = (
  data: number[],
  modes: PreprocessMode[],
  fs: number,
  params: SignalFilterParams
) => {
  const normalized = normalizePreprocessModes(modes);
  if (normalized.length === 0) return data.slice();
  return normalized.reduce(
    (current, mode) => applySignalFilterPreset(current, mode, fs, params),
    data.slice()
  );
};

const getWindowCoefficient = (index: number, length: number, windowType: FFTWindowType) => {
  if (length <= 1 || windowType === 'rectangular') return 1;
  const phase = (2 * Math.PI * index) / (length - 1);
  switch (windowType) {
    case 'hann':
      return 0.5 * (1 - Math.cos(phase));
    case 'hamming':
      return 0.54 - 0.46 * Math.cos(phase);
    case 'blackman':
      return 0.42 - 0.5 * Math.cos(phase) + 0.08 * Math.cos(2 * phase);
    case 'flattop':
      return 0.21557895
        - 0.41663158 * Math.cos(phase)
        + 0.277263158 * Math.cos(2 * phase)
        - 0.083578947 * Math.cos(3 * phase)
        + 0.006947368 * Math.cos(4 * phase);
    default:
      return 1;
  }
};

const buildResampledBuffer = (data: number[], nfft: number) => {
  const samples = new Float64Array(nfft);
  const sourceLength = data.length;

  if (sourceLength <= nfft) {
    for (let i = 0; i < nfft; i++) {
      const value = data[Math.min(i, sourceLength - 1)] ?? 0;
      samples[i] = value;
    }
  } else {
    const bucketSize = sourceLength / nfft;
    for (let i = 0; i < nfft; i++) {
      const start = Math.floor(i * bucketSize);
      const end = Math.max(start + 1, Math.floor((i + 1) * bucketSize));
      let sum = 0;
      for (let j = start; j < Math.min(end, sourceLength); j++) {
        sum += data[j];
      }
      const value = sum / Math.max(1, Math.min(end, sourceLength) - start);
      samples[i] = value;
    }
  }

  return { samples };
};

const computeFrequencySpectrum = (
  data: number[],
  fs: number,
  freqRange: [number, number],
  windowType: FFTWindowType,
  maxSamples = MAX_FFT_SAMPLES
): { frequencies: number[]; amplitudes: number[]; effectiveSamples: number; effectiveSamplingRate: number } => {
  const n = data.length;
  if (n < 2 || fs <= 0) {
    return { frequencies: [], amplitudes: [], effectiveSamples: 0, effectiveSamplingRate: 0 };
  }

  const minFreq = Math.max(0, Math.min(freqRange[0], freqRange[1]));
  const requestedMaxFreq = Math.min(fs / 2, Math.max(freqRange[0], freqRange[1]));
  const duration = n / fs;
  const targetSamplingRate = Math.min(fs, Math.max(requestedMaxFreq * 2.5, 64));
  const targetSamples = Math.max(MIN_FFT_SAMPLES, Math.ceil(duration * targetSamplingRate));
  const boundedTargetSamples = Math.min(n, targetSamples, maxSamples);
  let nfft = ceilPowerOfTwo(boundedTargetSamples);

  if (nfft > n) nfft = floorPowerOfTwo(n);
  if (nfft > maxSamples) nfft = floorPowerOfTwo(maxSamples);
  if (nfft < 2) {
    return { frequencies: [], amplitudes: [], effectiveSamples: 0, effectiveSamplingRate: 0 };
  }

  const { samples } = buildResampledBuffer(data, nfft);
  const real = new Float64Array(nfft);
  const imag = new Float64Array(nfft);
  let windowSum = 0;

  for (let i = 0; i < nfft; i++) {
    const window = getWindowCoefficient(i, nfft, windowType);
    real[i] = samples[i] * window;
    windowSum += window;
  }

  fftInPlace(real, imag);

  const effectiveSamplingRate = nfft / duration;
  const freqResolution = effectiveSamplingRate / nfft;
  const maxFreq = Math.min(requestedMaxFreq, effectiveSamplingRate / 2);
  const maxBin = Math.min(nfft >> 1, Math.floor(maxFreq / freqResolution));
  const frequencies: number[] = [];
  const amplitudes: number[] = [];

  for (let k = 0; k <= maxBin; k++) {
    const frequency = k * freqResolution;
    if (frequency < minFreq) continue;
    const scale = k === 0 || k === nfft / 2 ? 1 / windowSum : 2 / windowSum;
    frequencies.push(frequency);
    amplitudes.push(Math.hypot(real[k], imag[k]) * scale);
  }

  return { frequencies, amplitudes, effectiveSamples: nfft, effectiveSamplingRate };
};

const computeEnvelopeFast = (data: number[], fs: number) => {
  const n = data.length;
  if (n === 0) return [];

  const windowSize = Math.max(1, Math.floor(fs * 0.05));
  const absValues = data.map(Math.abs);
  const envelope = new Array<number>(n);
  const deque: number[] = [];
  let head = 0;
  let right = -1;

  for (let i = 0; i < n; i++) {
    const left = Math.max(0, i - windowSize);
    const targetRight = Math.min(n - 1, i + windowSize - 1);

    while (right < targetRight) {
      right++;
      while (deque.length > head && absValues[deque[deque.length - 1]] <= absValues[right]) {
        deque.pop();
      }
      deque.push(right);
    }

    while (deque.length > head && deque[head] < left) {
      head++;
    }

    envelope[i] = absValues[deque[head]] ?? 0;
  }

  return envelope;
};

const formatEngineeringValue = (value: number, decimals = 4) => {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  if (abs >= 10_000 || abs < 0.001) return value.toExponential(3);
  if (abs < 0.01) return value.toFixed(6);
  if (abs < 1) return value.toFixed(decimals + 1);
  return value.toFixed(decimals);
};

const getDefaultHistoryZoomRange = (range: [number, number]): [number, number] => {
  const start = Math.min(range[0], range[1]);
  const end = Math.max(range[0], range[1]);
  const duration = Math.max(0, end - start);
  const width = Math.min(Math.max(duration * 0.007, 0.05), 0.25);
  const center = start + duration / 2;
  const zoomStart = Math.max(start, center - width / 2);
  const zoomEnd = Math.min(end, zoomStart + width);
  return [zoomStart, Math.max(zoomStart, zoomEnd)];
};

const niceSymmetricLimit = (series: number[][]) => {
  let maxAbs = 0;
  series.forEach((values) => {
    for (let i = 0; i < values.length; i++) {
      const value = Math.abs(values[i] ?? 0);
      if (Number.isFinite(value) && value > maxAbs) maxAbs = value;
    }
  });
  if (maxAbs <= 0) return 1;
  const exponent = Math.floor(Math.log10(maxAbs));
  const base = 10 ** exponent;
  return Math.ceil((maxAbs * 1.08) / base) * base;
};

const getPositiveMagnitudeFloor = (values: number[]) => {
  let minPositive = Infinity;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (Number.isFinite(value) && value > 0 && value < minPositive) minPositive = value;
  }
  return Number.isFinite(minPositive) ? minPositive * 0.5 : 1e-12;
};

const getManualSpectralMarkers = (
  frequencies: number[],
  amplitudes: number[],
  requestedFrequencies: number[]
) => {
  if (frequencies.length === 0 || amplitudes.length === 0 || requestedFrequencies.length === 0) return [];

  return requestedFrequencies
    .map((requestedFrequency) => {
      let nearestIndex = -1;
      let nearestDelta = Infinity;
      for (let i = 0; i < frequencies.length; i++) {
        const delta = Math.abs(frequencies[i] - requestedFrequency);
        if (delta < nearestDelta) {
          nearestDelta = delta;
          nearestIndex = i;
        }
      }
      if (nearestIndex < 0) return null;
      const frequency = frequencies[nearestIndex];
      const amplitude = amplitudes[nearestIndex] ?? 0;
      if (!Number.isFinite(frequency) || !Number.isFinite(amplitude)) return null;
      return {
        requestedFrequency,
        frequency,
        amplitude,
        index: nearestIndex,
      };
    })
    .filter(Boolean) as Array<{
      requestedFrequency: number;
      frequency: number;
      amplitude: number;
      index: number;
    }>;
};

const getChannelLabel = (channel: Channel) => {
  switch (channel) {
    case 'acc_x': return 'Aceleración X';
    case 'acc_y': return 'Aceleración Y';
    case 'acc_z': return 'Aceleración Z';
    case 'resultant': return 'Resultante 3D';
    default: return 'Señal';
  }
};

const getViewLabel = (view: ViewMode) => {
  switch (view) {
    case 'time': return 'Historial temporal';
    case 'fft': return 'Espectro FFT';
    case 'psd': return 'Densidad espectral de potencia';
    case 'waterfall': return 'Mapa tiempo-frecuencia';
    case 'envelope': return 'Envolvente de señal';
    case 'integration': return 'Integración dinámica';
    case 'vibrationdata': return 'VibrationData A/V/D';
    default: return 'Gráfica';
  }
};

const getSignalAxisLabels = (
  view: ViewMode,
  channel: Channel,
  unit: string,
  integrationOutput: IntegrationOutputMode,
  displacementUnit: DisplacementUnit
) => {
  const channelLabel = getChannelLabel(channel);
  const displacementLabel = DISPLACEMENT_UNIT_LABELS[displacementUnit];
  switch (view) {
    case 'time':
      return {
        title: `${getViewLabel(view)} — ${channelLabel}`,
        x: 'Tiempo, t (s)',
        y: `${channelLabel} (${unit})`,
      };
    case 'fft':
      return {
        title: `${getViewLabel(view)} — ${channelLabel}`,
        x: 'Frecuencia, f (Hz)',
        y: `Amplitud FFT (${unit})`,
      };
    case 'psd':
      return {
        title: `${getViewLabel(view)} — ${channelLabel}`,
        x: 'Frecuencia, f (Hz)',
        y: `PSD (${unit}²/Hz)`,
      };
    case 'waterfall':
      return {
        title: `${getViewLabel(view)} — ${channelLabel}`,
        x: 'Frecuencia, f (Hz)',
        y: 'Tiempo, t (s)',
      };
    case 'envelope':
      return {
        title: `${getViewLabel(view)} — ${channelLabel}`,
        x: 'Tiempo, t (s)',
        y: `Amplitud / envolvente (${unit})`,
      };
    case 'integration':
      return {
        title: `${getViewLabel(view)} — ${channelLabel}`,
        x: 'Tiempo, t (s)',
        y: integrationOutput === 'velocity'
          ? 'Velocidad, v (m/s)'
          : integrationOutput === 'displacement'
            ? `Desplazamiento, u (${displacementLabel})`
            : `Velocidad, v (m/s) / Desplazamiento, u (${displacementLabel})`,
      };
    case 'vibrationdata':
      return {
        title: `Time Histories — ${channelLabel}`,
        x: 'Time (sec)',
        y: 'Accel (G), Velocity (mm/s), Displacement (mm)',
      };
    default:
      return { title: 'Gráfica de señal', x: 'Eje X', y: 'Eje Y' };
  }
};

const formatRange = (start: number, end: number) => `${start.toFixed(3)}–${end.toFixed(3)} s`;

const formatTimestamp = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('es-PE', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const getErrorMessage = (err: unknown) => err instanceof Error ? err.message : String(err);

const rangesMatch = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  Math.abs(aStart - bStart) < 1e-6 && Math.abs(aEnd - bEnd) < 1e-6;

const SignalProcessingContent: React.FC = () => {
  // ============ STATE ============
  const [signalData, setSignalData] = useState<SignalData | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [samplingRate, setSamplingRate] = useState<number>(200);
  const [unit, setUnit] = useState<string>('g');
  const [sensorLocation, setSensorLocation] = useState<string>('');

  const [activeView, setActiveView] = useState<ViewMode>('time');
  const [activeChannel, setActiveChannel] = useState<Channel>('acc_z');
  const [channelViewMode, setChannelViewMode] = useState<ChannelViewMode>('single');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisResults, setAnalysisResults] = useState<FullAnalysisResult | null>(null);
  const [vibrationBackendResults, setVibrationBackendResults] = useState<Partial<Record<Channel, VibrationBackendChannelState>>>({});
  const [vibrationBackendStatus, setVibrationBackendStatus] = useState('enDAQ listo: ejecute Analyze para calcular FFT/PSD/A-V-D.');
  const [showSpectralSummary, setShowSpectralSummary] = useState(false);

  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const [segmentDraft, setSegmentDraft] = useState({ start: '', end: '', label: '' });
  const [timeRange, setTimeRange] = useState<[number, number]>([0, 30]);
  const [historyZoomRange, setHistoryZoomRange] = useState<[number, number]>([0, 0.15]);
  const [freqRange, setFreqRange] = useState<[number, number]>([0, 50]);
  const [colorPalette, setColorPalette] = useState<keyof typeof COLOR_PALETTES>('default');
  const [preprocessMode, setPreprocessMode] = useState<PreprocessMode>('demean');
  const [preprocessModes, setPreprocessModes] = useState<PreprocessMode[]>(['demean']);
  const [filterParams, setFilterParams] = useState<SignalFilterParams>(DEFAULT_FILTER_PARAMS);
  const [filterParamDraft, setFilterParamDraft] = useState<SignalFilterParams>(DEFAULT_FILTER_PARAMS);
  const [fftWindowType, setFftWindowType] = useState<FFTWindowType>('hann');
  const [integrationOutput, setIntegrationOutput] = useState<IntegrationOutputMode>('both');
  const [displacementUnit, setDisplacementUnit] = useState<DisplacementUnit>('mm');
  const [integrationHighpassHz, setIntegrationHighpassHz] = useState(0.5);
  const [plotCatalogMode, setPlotCatalogMode] = useState<PlotCatalogMode>('time_histories');
  const [plotCatalogStyle, setPlotCatalogStyle] = useState<PlotCatalogStyle>('publication');
  const [plotCatalogTimeLayout, setPlotCatalogTimeLayout] = useState<PlotCatalogTimeLayout>('stacked');
  const [plotCatalogManualPeaks, setPlotCatalogManualPeaks] = useState<number[]>([]);
  const [plotCatalogShowManualPeaks, setPlotCatalogShowManualPeaks] = useState(false);
  const [plotCatalogShowPeakLabels, setPlotCatalogShowPeakLabels] = useState(false);
  const [plotCatalogPeakPickingEnabled, setPlotCatalogPeakPickingEnabled] = useState(false);
  const [manualPeakDraft, setManualPeakDraft] = useState('');
  const [plotDataLabels, setPlotDataLabels] = useState<Record<string, PlotDataLabel[]>>({});
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [lastAnalysisMeta, setLastAnalysisMeta] = useState<SavedAnalysis | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState('Seleccione una ventana y ejecute el análisis.');
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  const [chartConfig, setChartConfig] = useState<ChartConfig>({
    lineColor: COLOR_PALETTES.default.acc_z,
    lineWidth: 1.5,
    backgroundColor: '#0F172A',
    gridColor: '#334155',
    showGrid: true,
    showLegend: true,
    titleFontSize: 16,
    axisFontSize: 12,
  });

  const [exportConfig, setExportConfig] = useState<ExportConfig>({
    format: 'png',
    width: 1920,
    height: 1080,
    dpi: 300,
    scale: 2,
    includeMetadata: true,
    includeTitle: true,
    paperSize: 'A4',
    orientation: 'landscape',
  });

  const [showExportModal, setShowExportModal] = useState(false);

  // Plotly refs
  const timePlotRef = useRef<any>(null);
  const vibrationBackendCacheRef = useRef<Map<string, VibrationDataAnalysisResult>>(new Map());
  const vibrationBackendAbortRef = useRef<AbortController | null>(null);
  const [PlotComponent, setPlotComponent] = useState<any>(null);
  const { theme } = useTheme();
  const plotTheme = useMemo(() => getPlotlyTheme(theme), [theme]);

  useEffect(() => {
    import("react-plotly.js").then((mod) => setPlotComponent(() => mod.default));
  }, []);

  useEffect(() => {
    try {
      const workspaceRaw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (workspaceRaw) {
        const workspace = JSON.parse(workspaceRaw);
        if (Array.isArray(workspace.segments)) setSegments(workspace.segments);
        if (Array.isArray(workspace.timeRange) && workspace.timeRange.length === 2) setTimeRange(workspace.timeRange);
        if (Array.isArray(workspace.historyZoomRange) && workspace.historyZoomRange.length === 2) setHistoryZoomRange(workspace.historyZoomRange);
        if (Array.isArray(workspace.freqRange) && workspace.freqRange.length === 2) setFreqRange(workspace.freqRange);
        if (workspace.activeChannel) setActiveChannel(workspace.activeChannel);
        if (workspace.channelViewMode) setChannelViewMode(workspace.channelViewMode);
        if (workspace.activeView) setActiveView(workspace.activeView);
        if (workspace.colorPalette) setColorPalette(workspace.colorPalette);
        if (workspace.selectedSegment) setSelectedSegment(workspace.selectedSegment);
        const restoredPreprocessModes = normalizePreprocessModes(
          Array.isArray(workspace.preprocessModes)
            ? workspace.preprocessModes
            : [workspace.preprocessMode]
        );
        setPreprocessModes(restoredPreprocessModes);
        if (workspace.preprocessMode) {
          setPreprocessMode(workspace.preprocessMode);
        } else {
          setPreprocessMode(restoredPreprocessModes[restoredPreprocessModes.length - 1] ?? 'none');
        }
        if (workspace.filterParams) {
          const restoredFilterParams = normalizeFilterParams(workspace.filterParams);
          setFilterParams(restoredFilterParams);
          setFilterParamDraft(restoredFilterParams);
        }
        if (workspace.fftWindowType) setFftWindowType(workspace.fftWindowType);
        if (workspace.integrationOutput) setIntegrationOutput(workspace.integrationOutput);
        if (workspace.displacementUnit) setDisplacementUnit(workspace.displacementUnit);
        if (Number.isFinite(workspace.integrationHighpassHz)) setIntegrationHighpassHz(workspace.integrationHighpassHz);
        if (workspace.plotCatalogMode) setPlotCatalogMode(workspace.plotCatalogMode);
        if (workspace.plotCatalogStyle) setPlotCatalogStyle(workspace.plotCatalogStyle);
        if (workspace.plotCatalogTimeLayout) setPlotCatalogTimeLayout(workspace.plotCatalogTimeLayout);
        if (typeof workspace.plotCatalogShowManualPeaks === 'boolean') setPlotCatalogShowManualPeaks(workspace.plotCatalogShowManualPeaks);
        if (typeof workspace.plotCatalogShowPeakLabels === 'boolean') setPlotCatalogShowPeakLabels(workspace.plotCatalogShowPeakLabels);
        if (Array.isArray(workspace.plotCatalogManualPeaks)) {
          setPlotCatalogManualPeaks(
            workspace.plotCatalogManualPeaks
              .map((value: unknown) => Number(value))
              .filter((value: number) => Number.isFinite(value) && value > 0)
              .slice(0, 12)
              .sort((a: number, b: number) => a - b)
          );
        }
      }

      const analysesRaw = localStorage.getItem(ANALYSIS_STORAGE_KEY);
      if (analysesRaw) {
        const analyses = JSON.parse(analysesRaw);
        if (Array.isArray(analyses)) setSavedAnalyses(analyses.slice(0, MAX_SAVED_ANALYSES));
      }
    } catch (err) {
      console.warn('No se pudo restaurar el espacio de análisis local', err);
    } finally {
      setWorkspaceLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!workspaceLoaded) return;
    try {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({
        segments,
        selectedSegment,
        timeRange,
        historyZoomRange,
        freqRange,
        activeChannel,
        channelViewMode,
        activeView,
        colorPalette,
        preprocessMode,
        preprocessModes,
        filterParams,
        fftWindowType,
        integrationOutput,
        displacementUnit,
        integrationHighpassHz,
        plotCatalogMode,
        plotCatalogStyle,
        plotCatalogTimeLayout,
        plotCatalogShowManualPeaks,
        plotCatalogShowPeakLabels,
        plotCatalogManualPeaks,
      }));
    } catch (err) {
      console.warn('No se pudo persistir el espacio de análisis local', err);
    }
  }, [activeChannel, activeView, channelViewMode, colorPalette, displacementUnit, fftWindowType, filterParams, freqRange, historyZoomRange, integrationHighpassHz, integrationOutput, plotCatalogManualPeaks, plotCatalogMode, plotCatalogShowManualPeaks, plotCatalogShowPeakLabels, plotCatalogStyle, plotCatalogTimeLayout, preprocessMode, preprocessModes, segments, selectedSegment, timeRange, workspaceLoaded]);

  useEffect(() => {
    if (!workspaceLoaded) return;
    try {
      localStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(savedAnalyses.slice(0, MAX_SAVED_ANALYSES)));
    } catch (err) {
      console.warn('No se pudo persistir el historial local de cálculos', err);
    }
  }, [savedAnalyses, workspaceLoaded]);

  const selectedSegmentObj = useMemo(
    () => segments.find((segment) => segment.id === selectedSegment) ?? null,
    [segments, selectedSegment]
  );

  const activeAnalysisWindow = useMemo<AnalysisWindowMeta>(() => {
    const start = Number.isFinite(timeRange[0]) ? Math.min(timeRange[0], timeRange[1]) : 0;
    const end = Number.isFinite(timeRange[1]) ? Math.max(timeRange[0], timeRange[1]) : start;
    const { startIdx, endIdx } = signalData
      ? getTimeWindowIndices(signalData.time, [start, end])
      : { startIdx: 0, endIdx: -1 };

    return {
      label: selectedSegmentObj ? selectedSegmentObj.label : 'Ventana manual',
      start,
      end,
      duration: Math.max(0, end - start),
      samples: signalData && endIdx >= startIdx ? endIdx - startIdx + 1 : 0,
      source: selectedSegmentObj ? 'segment' : 'manual',
    };
  }, [selectedSegmentObj, signalData, timeRange]);

  const fullSignalRange = useMemo<[number, number]>(() => {
    if (!signalData || signalData.time.length === 0) return [0, 0];
    return [signalData.time[0], signalData.time[signalData.time.length - 1]];
  }, [signalData]);

  const isFullRecordSelected = useMemo(
    () => Boolean(signalData) && rangesMatch(activeAnalysisWindow.start, activeAnalysisWindow.end, fullSignalRange[0], fullSignalRange[1]),
    [activeAnalysisWindow.end, activeAnalysisWindow.start, fullSignalRange, signalData]
  );

  const filterParamFingerprint = useMemo(
    () => JSON.stringify(normalizeFilterParams(filterParams)),
    [filterParams]
  );

  const filterParamDraftFingerprint = useMemo(
    () => JSON.stringify(normalizeFilterParams(filterParamDraft)),
    [filterParamDraft]
  );

  const hasPendingFilterParams = filterParamDraftFingerprint !== filterParamFingerprint;

  const preprocessPipelineFingerprint = useMemo(
    () => JSON.stringify(normalizePreprocessModes(preprocessModes)),
    [preprocessModes]
  );

  const buildVibrationBackendCacheKey = useCallback((channel: Channel) => [
    'endaq-v1',
    fileName || 'signal',
    signalData?.time.length ?? 0,
    channel,
    samplingRate,
    unit,
    preprocessPipelineFingerprint,
    filterParamFingerprint,
    fftWindowType,
    freqRange[0].toFixed(6),
    freqRange[1].toFixed(6),
    integrationHighpassHz.toFixed(6),
    VIBRATION_BACKEND_BIN_WIDTH_HZ.toFixed(6),
    VIBRATION_BACKEND_OVERLAP.toFixed(6),
    activeAnalysisWindow.start.toFixed(6),
    activeAnalysisWindow.end.toFixed(6),
  ].join('|'), [
    activeAnalysisWindow.end,
    activeAnalysisWindow.start,
    fftWindowType,
    fileName,
    filterParamFingerprint,
    freqRange,
    integrationHighpassHz,
    preprocessPipelineFingerprint,
    samplingRate,
    signalData?.time.length,
    unit,
  ]);

  const getVibrationBackendResult = useCallback((channel: Channel): VibrationDataAnalysisResult | null => {
    const cacheKey = buildVibrationBackendCacheKey(channel);
    const currentState = vibrationBackendResults[channel];
    if (currentState?.cacheKey === cacheKey) return currentState.result;
    return vibrationBackendCacheRef.current.get(cacheKey) ?? null;
  }, [buildVibrationBackendCacheKey, vibrationBackendResults]);

  const activeVibrationBackendResult = useMemo(
    () => getVibrationBackendResult(activeChannel),
    [activeChannel, getVibrationBackendResult]
  );

  useEffect(() => {
    if (selectedSegment && !selectedSegmentObj) {
      setSelectedSegment(null);
    }
  }, [selectedSegment, selectedSegmentObj]);

  useEffect(() => {
    setPlotDataLabels({});
  }, [
    activeAnalysisWindow.start,
    activeAnalysisWindow.end,
    fileName,
    fftWindowType,
    filterParamFingerprint,
    freqRange,
    plotCatalogMode,
    preprocessPipelineFingerprint,
  ]);


  // ============ COMPUTED ============

  const processedChannels = useMemo(() => {
    if (!signalData) return { acc_x: [], acc_y: [], acc_z: [] };
    return {
      acc_x: applySignalFilterPipeline(signalData.acc_x, preprocessModes, samplingRate, filterParams),
      acc_y: applySignalFilterPipeline(signalData.acc_y, preprocessModes, samplingRate, filterParams),
      acc_z: applySignalFilterPipeline(signalData.acc_z, preprocessModes, samplingRate, filterParams),
    };
  }, [filterParams, preprocessModes, samplingRate, signalData]);

  const resultantData = useMemo(() => {
    if (!signalData) return [];
    return processedChannels.acc_x.map((_, i) =>
      Math.sqrt(processedChannels.acc_x[i]**2 + processedChannels.acc_y[i]**2 + processedChannels.acc_z[i]**2)
    );
  }, [processedChannels, signalData]);

  const getChannelData = useCallback((channel: Channel): number[] => {
    if (!signalData) return [];
    switch (channel) {
      case 'acc_x': return processedChannels.acc_x;
      case 'acc_y': return processedChannels.acc_y;
      case 'acc_z': return processedChannels.acc_z;
      case 'resultant': return resultantData;
      default: return processedChannels.acc_z;
    }
  }, [processedChannels, signalData, resultantData]);

  const activeChannelData = useMemo(() => getChannelData(activeChannel), [getChannelData, activeChannel]);

  const filteredData = useMemo(() => {
    if (!signalData) return { time: [], data: [] };
    const { startIdx, endIdx } = getTimeWindowIndices(signalData.time, timeRange);
    return {
      time: signalData.time.slice(startIdx, endIdx + 1),
      data: activeChannelData.slice(startIdx, endIdx + 1),
    };
  }, [signalData, timeRange, activeChannelData]);

  const kinematicsData = useMemo(
    () => buildKinematicsDataFromBackend(activeVibrationBackendResult),
    [activeVibrationBackendResult]
  );

  const vibrationDataSeries = useMemo(
    () => buildVibrationSeriesFromBackend(activeVibrationBackendResult, historyZoomRange),
    [activeVibrationBackendResult, historyZoomRange]
  );

  const vibrationSpectra = useMemo(
    () => buildVibrationSpectraFromBackend(
      activeVibrationBackendResult,
      plotCatalogMode === 'fft_overall' ? 'aggregate_fft' : 'fft'
    ),
    [activeVibrationBackendResult, plotCatalogMode]
  );

  const displacementDisplayFactor = DISPLACEMENT_UNIT_FACTORS[displacementUnit];
  const displacementDisplayLabel = DISPLACEMENT_UNIT_LABELS[displacementUnit];

  const integrationDisplaySeries = useMemo(() => {
    if (integrationOutput === 'velocity') {
      return {
        time: vibrationDataSeries.full.time,
        data: kinematicsData.velocityMps,
        label: 'Velocidad integrada',
        column: 'velocity_m_per_s',
        unit: 'm/s',
      };
    }

    return {
      time: vibrationDataSeries.full.time,
      data: kinematicsData.displacementM.map((value) => value * displacementDisplayFactor),
      label: 'Desplazamiento integrado',
      column: `displacement_${displacementUnit}`,
      unit: displacementDisplayLabel,
    };
  }, [
    displacementDisplayFactor,
    displacementDisplayLabel,
    displacementUnit,
    integrationOutput,
    kinematicsData.displacementM,
    kinematicsData.velocityMps,
    vibrationDataSeries.full.time,
  ]);

  const allChannelsData = useMemo(() => {
    if (!signalData) return { time: [], acc_x: [], acc_y: [], acc_z: [], resultant: [] };
    const { startIdx, endIdx } = getTimeWindowIndices(signalData.time, timeRange);
    return {
      time: signalData.time.slice(startIdx, endIdx + 1),
      acc_x: processedChannels.acc_x.slice(startIdx, endIdx + 1),
      acc_y: processedChannels.acc_y.slice(startIdx, endIdx + 1),
      acc_z: processedChannels.acc_z.slice(startIdx, endIdx + 1),
      resultant: resultantData.slice(startIdx, endIdx + 1),
    };
  }, [processedChannels, signalData, timeRange, resultantData]);

  const currentMetrics = useMemo(
    () => computeStats(activeView === 'integration' ? integrationDisplaySeries.data : filteredData.data),
    [activeView, filteredData.data, integrationDisplaySeries.data]
  );

  const getFilteredData = useCallback(() => {
    return filteredData;
  }, [filteredData]);

  const getAllChannelsData = useCallback(() => {
    return allChannelsData;
  }, [allChannelsData]);

  const getChannelsForBackendAnalysis = useCallback((): Channel[] => {
    if (activeView === 'vibrationdata' || channelViewMode === 'single') return [activeChannel];
    if (channelViewMode === 'all_parallel' || channelViewMode === 'all_overlay') {
      return ['acc_x', 'acc_y', 'acc_z', 'resultant'];
    }
    return ['acc_x', 'acc_y', 'acc_z'];
  }, [activeChannel, activeView, channelViewMode]);

  const requestVibrationBackendAnalysis = useCallback(async (channels: Channel[]) => {
    if (!signalData || allChannelsData.time.length < 2) return;
    const uniqueChannels = Array.from(new Set(channels));
    const cachedUpdates: Partial<Record<Channel, VibrationBackendChannelState>> = {};
    const missingChannels: Channel[] = [];

    uniqueChannels.forEach((channel) => {
      const cacheKey = buildVibrationBackendCacheKey(channel);
      const cached = vibrationBackendCacheRef.current.get(cacheKey);
      if (cached) {
        cachedUpdates[channel] = { cacheKey, result: cached };
      } else {
        missingChannels.push(channel);
      }
    });

    if (Object.keys(cachedUpdates).length > 0) {
      setVibrationBackendResults((prev) => ({ ...prev, ...cachedUpdates }));
    }

    if (missingChannels.length === 0) {
      setVibrationBackendStatus('enDAQ: resultados cargados desde cache de memoria.');
      return;
    }

    vibrationBackendAbortRef.current?.abort();
    const controller = new AbortController();
    vibrationBackendAbortRef.current = controller;
    setVibrationBackendStatus(`enDAQ calculando ${missingChannels.map(getChannelLabel).join(', ')}...`);

    try {
      const responses = await Promise.all(missingChannels.map(async (channel) => {
        const cacheKey = buildVibrationBackendCacheKey(channel);
        const channelData = allChannelsData[channel];
        if (!channelData || channelData.length < 2) {
          throw new Error(`Canal ${getChannelLabel(channel)} sin datos suficientes para enDAQ.`);
        }
        const result = await computeVibrationDataAnalysis({
          acceleration: channelData,
          time: allChannelsData.time,
          sampling_rate: samplingRate,
          unit,
          bin_width: VIBRATION_BACKEND_BIN_WIDTH_HZ,
          window: fftWindowType,
          overlap: VIBRATION_BACKEND_OVERLAP,
          highpass_hz: integrationHighpassHz,
          freq_range: freqRange,
        }, controller.signal);
        vibrationBackendCacheRef.current.set(cacheKey, result);
        return { channel, cacheKey, result };
      }));

      if (controller.signal.aborted) return;
      setVibrationBackendResults((prev) => {
        const next = { ...prev };
        responses.forEach(({ channel, cacheKey, result }) => {
          next[channel] = { cacheKey, result };
        });
        return next;
      });
      const engine = responses[0]?.result.engine;
      setVibrationBackendStatus(
        engine
          ? `enDAQ ${engine.version}: FFT/PSD/A-V-D actualizados.`
          : 'enDAQ: FFT/PSD/A-V-D actualizados.'
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      setVibrationBackendStatus(`enDAQ no completó el cálculo: ${message}`);
      throw err;
    }
  }, [
    allChannelsData,
    buildVibrationBackendCacheKey,
    fftWindowType,
    freqRange,
    integrationHighpassHz,
    samplingRate,
    signalData,
    unit,
  ]);

  useEffect(() => {
    const requiresBackend = activeView === 'fft'
      || activeView === 'psd'
      || activeView === 'integration'
      || activeView === 'vibrationdata';
    if (!requiresBackend || !signalData || hasPendingFilterParams || !analysisResults) return;
    const lastModes = lastAnalysisMeta ? getPreprocessModesFromSaved(lastAnalysisMeta) : [];
    const lastFilterFingerprint = JSON.stringify(normalizeFilterParams(lastAnalysisMeta?.filterParams));
    const lastPipelineFingerprint = JSON.stringify(normalizePreprocessModes(lastModes));
    const analysisMatchesCurrent = Boolean(lastAnalysisMeta)
      && rangesMatch(lastAnalysisMeta!.start, lastAnalysisMeta!.end, activeAnalysisWindow.start, activeAnalysisWindow.end)
      && lastAnalysisMeta!.fftWindowType === fftWindowType
      && lastAnalysisMeta!.samplingRate === samplingRate
      && lastAnalysisMeta!.unit === unit
      && lastFilterFingerprint === filterParamFingerprint
      && lastPipelineFingerprint === preprocessPipelineFingerprint;
    if (!analysisMatchesCurrent) return;
    const channels = getChannelsForBackendAnalysis();
    const missing = channels.filter((channel) => !getVibrationBackendResult(channel));
    if (missing.length === 0) return;
    void requestVibrationBackendAnalysis(missing).catch((err) => {
      console.warn('No se pudo completar el análisis enDAQ bajo demanda', err);
    });
  }, [
    activeView,
    activeAnalysisWindow.end,
    activeAnalysisWindow.start,
    analysisResults,
    fftWindowType,
    filterParamFingerprint,
    getChannelsForBackendAnalysis,
    getVibrationBackendResult,
    hasPendingFilterParams,
    lastAnalysisMeta,
    preprocessPipelineFingerprint,
    requestVibrationBackendAnalysis,
    samplingRate,
    signalData,
    unit,
  ]);

  const addManualPeakFrequency = useCallback((frequency: number) => {
    if (!Number.isFinite(frequency) || frequency <= 0) return;
    const maxFrequency = samplingRate / 2;
    const boundedFrequency = Math.min(Math.max(0, frequency), maxFrequency);
    setPlotCatalogManualPeaks((prev) => {
      if (prev.some((value) => Math.abs(value - boundedFrequency) < 1e-6)) return prev;
      return [...prev, boundedFrequency].sort((a, b) => a - b).slice(0, 12);
    });
    setPlotCatalogShowManualPeaks(true);
    setManualPeakDraft('');
    setActiveView('vibrationdata');
  }, [samplingRate]);

  const removeManualPeakFrequency = useCallback((frequency: number) => {
    setPlotCatalogManualPeaks((prev) => prev.filter((value) => Math.abs(value - frequency) > 1e-6));
  }, []);

  const clearManualPeakFrequencies = useCallback(() => {
    setPlotCatalogManualPeaks([]);
    setPlotCatalogShowManualPeaks(false);
    setPlotCatalogShowPeakLabels(false);
    setPlotCatalogPeakPickingEnabled(false);
  }, []);

  const handleCatalogPlotClick = useCallback((event: any) => {
    if (!plotCatalogPeakPickingEnabled || activeView !== 'vibrationdata' || plotCatalogMode === 'time_histories') return;
    const frequency = Number(event?.points?.[0]?.x);
    if (Number.isFinite(frequency)) {
      addManualPeakFrequency(frequency);
    }
  }, [activeView, addManualPeakFrequency, plotCatalogMode, plotCatalogPeakPickingEnabled]);

  const addPlotDataLabel = useCallback((plotId: string, plotTitle: string, event: any, layout?: any) => {
    const point = event?.points?.[0];
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const xref = point?.xaxis?._id ?? 'x';
    const yref = point?.yaxis?._id ?? 'y';
    const traceName = String(point?.data?.name ?? point?.fullData?.name ?? '').trim();
    const isFrequencyPlot = /fft|psd|frequency|frecuencia/i.test(plotId + ' ' + plotTitle);
    const axisLayoutKey = (axisRef: string, axisPrefix: 'xaxis' | 'yaxis') => {
      if (axisRef === 'x' || axisRef === 'y') return axisPrefix;
      return `${axisPrefix}${axisRef.slice(1)}`;
    };
    const normalizeAxisTitle = (value: any, fallback: string) => {
      const raw = value?.title?.text
        ?? (typeof value?.title === 'string' ? value.title : undefined)
        ?? (typeof value === 'string' ? value : undefined)
        ?? fallback;
      return String(raw)
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .replace(/mm\/sec/gi, 'mm/s')
        .replace(/Accel/gi, 'Aceleración')
        .trim() || fallback;
    };
    const compactAxisTitle = (value: string, axis: 'x' | 'y') => {
      const unit = value.match(/\(([^)]+)\)/)?.[1]?.trim();
      const lower = value.toLowerCase();
      let label = axis === 'x' ? (isFrequencyPlot ? 'Frecuencia' : 'Tiempo') : 'Amplitud';
      if (lower.includes('frecuencia') || lower.includes('frequency')) label = 'Frecuencia';
      else if (lower.includes('tiempo') || lower.includes('time')) label = 'Tiempo';
      else if (lower.includes('velocidad') || lower.includes('velocity')) label = 'Velocidad';
      else if (lower.includes('desplazamiento') || lower.includes('displacement')) label = 'Desplazamiento';
      else if (lower.includes('aceleración') || lower.includes('aceleracion') || lower.includes('accel')) label = 'Aceleración';
      else if (lower.includes('fase') || lower.includes('phase')) label = 'Fase';
      else if (lower.includes('psd')) label = 'PSD';
      else if (lower.includes('grms')) label = 'RMS';
      return unit ? `${label} (${unit})` : label;
    };

    const layoutXAxis = layout?.[axisLayoutKey(xref, 'xaxis')] ?? layout?.xaxis;
    const layoutYAxis = layout?.[axisLayoutKey(yref, 'yaxis')] ?? layout?.yaxis;
    const xAxisTitle = compactAxisTitle(
      normalizeAxisTitle(point?.xaxis, normalizeAxisTitle(layoutXAxis, isFrequencyPlot ? 'Frecuencia (Hz)' : 'Tiempo (s)')),
      'x'
    );
    const yAxisTitle = compactAxisTitle(
      normalizeAxisTitle(point?.yaxis, normalizeAxisTitle(layoutYAxis, traceName || plotTitle || 'Amplitud')),
      'y'
    );
    const xLabel = isFrequencyPlot ? `${x.toFixed(2)} Hz` : `${x.toFixed(3)} s`;
    const yLabel = formatEngineeringValue(y, 4);

    setPlotDataLabels((prev) => {
      const current = prev[plotId] ?? [];
      const labelNumber = current.length + 1;
      const ax = 42;
      const ay = -46 - (current.length % 3) * 10;
      const nextLabel: PlotDataLabel = {
        id: `label_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        x,
        y,
        ax,
        ay,
        xref,
        yref,
        traceName,
        text: `<b>P${labelNumber}</b><br>${xAxisTitle}: ${xLabel}<br>${yAxisTitle}: ${yLabel}`,
      };
      return {
        ...prev,
        [plotId]: [...current, nextLabel].slice(-24),
      };
    });
  }, []);

  const removePlotDataLabel = useCallback((plotId: string, labelId: string) => {
    setPlotDataLabels((prev) => ({
      ...prev,
      [plotId]: (prev[plotId] ?? []).filter((label) => label.id !== labelId),
    }));
  }, []);

  const removePlotDataLabelFromAnnotation = useCallback((plotId: string, event: any) => {
    const labelId = event?.annotation?.name ?? event?.annotation?.labelId;
    if (labelId) removePlotDataLabel(plotId, String(labelId));
  }, [removePlotDataLabel]);

  const syncPlotDataLabelRelayout = useCallback((plotId: string, plot: any, event: any) => {
    const labels = plotDataLabels[plotId] ?? [];
    if (!labels.length || !event) return;

    const annotations = Array.isArray(plot?.layout?.annotations) ? plot.layout.annotations : [];
    const firstLabelIndex = Math.max(0, annotations.length - labels.length);
    const updatesByLabelId = new Map<string, Partial<PlotDataLabel>>();

    Object.entries(event).forEach(([key, value]) => {
      const match = key.match(/^annotations\[(\d+)\]\.(x|y|ax|ay)$/);
      if (!match) return;
      const annotationIndex = Number(match[1]);
      const labelIndex = annotationIndex - firstLabelIndex;
      if (labelIndex < 0 || labelIndex >= labels.length) return;
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return;
      const label = labels[labelIndex];
      updatesByLabelId.set(label.id, {
        ...(updatesByLabelId.get(label.id) ?? {}),
        [match[2]]: numericValue,
      });
    });

    if (!updatesByLabelId.size) return;

    setPlotDataLabels((prev) => ({
      ...prev,
      [plotId]: (prev[plotId] ?? []).map((label) => ({
        ...label,
        ...(updatesByLabelId.get(label.id) ?? {}),
      })),
    }));
  }, [plotDataLabels]);

  const getActiveExportSeries = useCallback(() => {
    if (activeView === 'vibrationdata') {
      if (plotCatalogMode === 'fft_phase') {
        return {
          xLabel: 'frequency_hz',
          time: vibrationSpectra.acceleration.frequencies,
          columns: [
            { name: 'acceleration_fft_G', data: vibrationSpectra.acceleration.amplitudes },
            { name: 'acceleration_phase_deg', data: vibrationSpectra.acceleration.phasesDeg },
            { name: 'velocity_fft_mm_per_s', data: vibrationSpectra.velocity.amplitudes },
            { name: 'velocity_phase_deg', data: vibrationSpectra.velocity.phasesDeg },
            { name: 'displacement_fft_mm', data: vibrationSpectra.displacement.amplitudes },
            { name: 'displacement_phase_deg', data: vibrationSpectra.displacement.phasesDeg },
          ],
        };
      }
      if (plotCatalogMode === 'fft_overall') {
        return {
          xLabel: 'frequency_hz',
          time: vibrationSpectra.acceleration.frequencies,
          columns: [
            { name: 'acceleration_fft_G', data: vibrationSpectra.acceleration.amplitudes },
            { name: 'velocity_fft_mm_per_s', data: vibrationSpectra.velocity.amplitudes },
            { name: 'displacement_fft_mm', data: vibrationSpectra.displacement.amplitudes },
          ],
        };
      }
      return {
        xLabel: 'time_s',
        time: vibrationDataSeries.full.time,
        columns: [
          { name: 'acceleration_G', data: vibrationDataSeries.full.accelerationG },
          { name: 'velocity_mm_per_s', data: vibrationDataSeries.full.velocityMmS },
          { name: 'displacement_mm', data: vibrationDataSeries.full.displacementMm },
        ],
      };
    }

    if (activeView === 'integration') {
      if (integrationOutput === 'both') {
        return {
          time: vibrationDataSeries.full.time,
          columns: [
            { name: 'velocity_m_per_s', data: kinematicsData.velocityMps },
            {
              name: `displacement_${displacementUnit}`,
              data: kinematicsData.displacementM.map((value) => value * displacementDisplayFactor),
            },
          ],
        };
      }

      return {
        time: integrationDisplaySeries.time,
        columns: [{ name: integrationDisplaySeries.column, data: integrationDisplaySeries.data }],
      };
    }

    return {
      xLabel: 'time_s',
      time: filteredData.time,
      columns: [{ name: `${activeChannel}_amplitude_${unit || 'unit'}`, data: filteredData.data }],
    };
  }, [
    activeChannel,
    activeView,
    displacementDisplayFactor,
    displacementUnit,
    filteredData.data,
    filteredData.time,
    integrationDisplaySeries.column,
    integrationDisplaySeries.data,
    integrationDisplaySeries.time,
    integrationOutput,
    kinematicsData.displacementM,
    kinematicsData.velocityMps,
    plotCatalogMode,
    unit,
    vibrationDataSeries,
    vibrationSpectra,
  ]);

  // ============ FFT/PSD COMPUTATION ============
  
  const computeLocalFFT = useCallback((data: number[], fs: number) => {
    return computeFrequencySpectrum(data, fs, freqRange, fftWindowType);
  }, [fftWindowType, freqRange]);

  const setManualTimeWindow = useCallback((range: [number, number]) => {
    setSelectedSegment(null);
    setTimeRange((prev) => [
      Number.isFinite(range[0]) ? range[0] : prev[0],
      Number.isFinite(range[1]) ? range[1] : prev[1],
    ]);
    setAnalysisResults(null);
    setLastAnalysisMeta(null);
    setVibrationBackendResults({});
    setVibrationBackendStatus('enDAQ pendiente: ventana manual actualizada.');
    setAnalysisStatus('Ventana manual preparada para análisis.');
  }, []);

  const useSegmentWindow = useCallback((segment: Segment) => {
    setSelectedSegment(segment.id);
    setTimeRange([segment.start, segment.end]);
    setAnalysisResults(null);
    setLastAnalysisMeta(null);
    setVibrationBackendResults({});
    setVibrationBackendStatus('enDAQ pendiente: ventana de análisis actualizada.');
    setAnalysisStatus(`Ventana "${segment.label}" preparada para análisis.`);
  }, []);

  const selectFullRecordWindow = useCallback(() => {
    if (!signalData || signalData.time.length === 0) return;
    const fullRange: [number, number] = [signalData.time[0], signalData.time[signalData.time.length - 1]];
    setSelectedSegment(null);
    setTimeRange(fullRange);
    setHistoryZoomRange(getDefaultHistoryZoomRange(fullRange));
    setAnalysisResults(null);
    setLastAnalysisMeta(null);
    setVibrationBackendResults({});
    setVibrationBackendStatus('enDAQ pendiente: registro completo seleccionado.');
    setAnalysisStatus(`Registro completo seleccionado para análisis: ${formatRange(fullRange[0], fullRange[1])}.`);
  }, [signalData]);

  const selectRawProcessing = useCallback(() => {
    setPreprocessMode('none');
    setPreprocessModes([]);
    setFftWindowType('rectangular');
    setAnalysisResults(null);
    setLastAnalysisMeta(null);
    setVibrationBackendResults({});
    setVibrationBackendStatus('enDAQ pendiente: modo sin tratamiento activado.');
    setAnalysisStatus('Modo sin tratamiento activado: señal cruda + ventana FFT rectangular.');
  }, []);

  const selectStandardProcessing = useCallback(() => {
    setPreprocessMode('demean');
    setPreprocessModes(['demean']);
    setFftWindowType('hann');
    setAnalysisResults(null);
    setLastAnalysisMeta(null);
    setVibrationBackendResults({});
    setVibrationBackendStatus('enDAQ pendiente: modo estándar activado.');
    setAnalysisStatus('Modo estándar activado: remover media + ventana Hann/Hanning.');
  }, []);

  const selectImpactGuardProcessing = useCallback(() => {
    const nextModes = normalizePreprocessModes([...preprocessModes, 'impact_guard']);
    setPreprocessMode('impact_guard');
    setPreprocessModes(nextModes);
    setFftWindowType('hann');
    setAnalysisResults(null);
    setLastAnalysisMeta(null);
    setVibrationBackendResults({});
    setVibrationBackendStatus('enDAQ pendiente: pipeline actualizado.');
    setAnalysisStatus(`Anti-golpes agregado al pipeline: ${formatPreprocessPipeline(nextModes)}.`);
  }, [preprocessModes]);

  const selectAntiSkiSlopeProcessing = useCallback(() => {
    const nextModes = normalizePreprocessModes([...preprocessModes, 'anti_ski_slope']);
    setPreprocessMode('anti_ski_slope');
    setPreprocessModes(nextModes);
    setFftWindowType('hann');
    setAnalysisResults(null);
    setLastAnalysisMeta(null);
    setVibrationBackendResults({});
    setVibrationBackendStatus('enDAQ pendiente: pipeline actualizado.');
    setAnalysisStatus(`Anti ski-slope agregado al pipeline: ${formatPreprocessPipeline(nextModes)}.`);
  }, [preprocessModes]);

  const addPreprocessMode = useCallback((mode: PreprocessMode) => {
    setPreprocessMode(mode);
    if (mode === 'none') {
      setPreprocessModes([]);
      setFftWindowType('rectangular');
      setAnalysisResults(null);
      setLastAnalysisMeta(null);
      setVibrationBackendResults({});
      setVibrationBackendStatus('enDAQ pendiente: pipeline limpiado.');
      setAnalysisStatus('Pipeline limpiado: se usará la señal cruda.');
      return;
    }

    const nextModes = normalizePreprocessModes([...preprocessModes, mode]);
    setPreprocessModes(nextModes);
    setAnalysisResults(null);
    setLastAnalysisMeta(null);
    setVibrationBackendResults({});
    setVibrationBackendStatus('enDAQ pendiente: pipeline actualizado.');
    setAnalysisStatus(`Tratamiento agregado/seleccionado: ${formatPreprocessPipeline(nextModes)}.`);
  }, [preprocessModes]);

  const removePreprocessMode = useCallback((mode: PreprocessMode) => {
    const nextModes = normalizePreprocessModes(preprocessModes.filter((item) => item !== mode));
    setPreprocessModes(nextModes);
    setPreprocessMode(nextModes[nextModes.length - 1] ?? 'none');
    setAnalysisResults(null);
    setLastAnalysisMeta(null);
    setVibrationBackendResults({});
    setVibrationBackendStatus('enDAQ pendiente: pipeline actualizado.');
    setAnalysisStatus(
      nextModes.length
        ? `Tratamiento removido. Pipeline activo: ${formatPreprocessPipeline(nextModes)}.`
        : 'Pipeline vacío: se usará la señal cruda.'
    );
  }, [preprocessModes]);

  const updateFilterParam = useCallback((key: keyof SignalFilterParams, value: number) => {
    setFilterParamDraft((prev) => normalizeFilterParams({ ...prev, [key]: value }));
  }, []);

  const applyFilterParamDraft = useCallback(() => {
    const nextParams = normalizeFilterParams(filterParamDraft);
    setFilterParams(nextParams);
    setFilterParamDraft(nextParams);
    setAnalysisResults(null);
    setLastAnalysisMeta(null);
    setAnalysisStatus('Parámetros de filtros aplicados al pipeline.');
    setVibrationBackendResults({});
    setVibrationBackendStatus('enDAQ pendiente: ejecute Analyze para recalcular FFT/PSD/A-V-D.');
  }, [filterParamDraft]);

  const resetFilterParamDraft = useCallback(() => {
    setFilterParamDraft(DEFAULT_FILTER_PARAMS);
    setAnalysisStatus('Parámetros restaurados en edición. Pulse Aplicar para recalcular la señal.');
  }, []);

  const buildAnalysisCacheKey = useCallback((meta: AnalysisWindowMeta) => [
    fileName || 'signal',
    signalData?.time.length ?? 0,
    samplingRate,
    unit,
    preprocessPipelineFingerprint,
    filterParamFingerprint,
    fftWindowType,
    meta.start.toFixed(6),
    meta.end.toFixed(6),
  ].join('|'), [fftWindowType, fileName, filterParamFingerprint, preprocessPipelineFingerprint, samplingRate, signalData?.time.length, unit]);

  // ============ PLOT LAYOUT ============
  
  const getPlotLayout = useCallback((title: string, xaxisTitle: string, yaxisTitle: string) => ({
    title: {
      text: exportConfig.includeTitle ? title : '',
      font: { color: plotTheme.text, size: chartConfig.titleFontSize, family: 'Inter, Arial, sans-serif' },
      x: 0.02,
      xanchor: 'left' as const,
    },
    paper_bgcolor: plotTheme.paperBackground,
    plot_bgcolor: plotTheme.plotBackground,
    font: { color: plotTheme.mutedText, family: 'Inter, Arial, sans-serif', size: chartConfig.axisFontSize },
    xaxis: {
      title: { text: xaxisTitle, font: { color: plotTheme.text, size: chartConfig.axisFontSize + 1 } },
      gridcolor: chartConfig.showGrid ? plotTheme.grid : 'transparent',
      zerolinecolor: plotTheme.zeroLine,
      linecolor: plotTheme.axisLine,
      tickfont: { color: plotTheme.subtleText, size: chartConfig.axisFontSize },
      color: plotTheme.mutedText,
      linewidth: 1,
      showspikes: false,
    },
    yaxis: {
      title: { text: yaxisTitle, font: { color: plotTheme.text, size: chartConfig.axisFontSize + 1 } },
      gridcolor: chartConfig.showGrid ? plotTheme.grid : 'transparent',
      zerolinecolor: plotTheme.zeroLine,
      linecolor: plotTheme.axisLine,
      tickfont: { color: plotTheme.subtleText, size: chartConfig.axisFontSize },
      color: plotTheme.mutedText,
      linewidth: 1,
      showspikes: false,
    },
    showlegend: chartConfig.showLegend,
    legend: {
      bgcolor: plotTheme.legendBackground,
      bordercolor: plotTheme.legendBorder,
      borderwidth: 1,
      font: { color: plotTheme.text, size: 11 },
    },
    hoverlabel: {
      bgcolor: plotTheme.hoverBackground,
      bordercolor: plotTheme.hoverBorder,
      font: { color: plotTheme.text },
    },
    margin: { l: 70, r: 50, t: 80, b: 70 },
    autosize: true,
    uirevision: `${activeView}-${activeChannel}`,
  }), [activeChannel, activeView, chartConfig, exportConfig.includeTitle, plotTheme]);

  // ============ FILE HANDLING ============
  
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const csvText = e.target?.result as string;
      const parsed = parseCSVData(csvText);
      if (parsed && parsed.time.length > 0) {
        setSignalData(parsed);
        setTimeRange([parsed.time[0], parsed.time[parsed.time.length - 1]]);
        setHistoryZoomRange(getDefaultHistoryZoomRange([parsed.time[0], parsed.time[parsed.time.length - 1]]));
        setSelectedSegment(null);
        setLastAnalysisMeta(null);
        setVibrationBackendResults({});
        vibrationBackendCacheRef.current.clear();
        setAnalysisStatus(`Archivo cargado. ${parsed.timeMetadata.label}. La ventana activa cubre todo el registro.`);
        setVibrationBackendStatus('enDAQ listo: ejecute Analyze para calcular FFT/PSD/A-V-D.');
        const fs = calculateSamplingRate(parsed.time);
        if (fs > 0) setSamplingRate(Math.round(fs));
        setError(null);
      } else {
        setError('Error al parsear CSV. Formato: tiempo, acelx, acely, acelz');
      }
    };
    reader.readAsText(file);
  }, []);

  const handleGenerateSampleData = useCallback(() => {
    const fs = samplingRate;
    const duration = 30;
    const n_samples = fs * duration;
    const time = Array.from({ length: n_samples }, (_, i) => i / fs);
    const acc_x = new Array(n_samples).fill(0);
    const acc_y = new Array(n_samples).fill(0);
    const acc_z = new Array(n_samples).fill(0);

    for (let pass = 0; pass < Math.floor(duration / 4); pass++) {
      const passTime = 4 * pass + (Math.random() - 0.5) * 0.4;
      const passIdx = Math.floor(passTime * fs);
      if (passIdx >= n_samples) continue;
      const impulseLen = Math.min(Math.floor(1.5 * fs), n_samples - passIdx);
      for (let i = 0; i < impulseLen; i++) {
        const t = i / fs;
        const envelope = Math.exp(-2 * t);
        const freq = 2.5;
        acc_z[passIdx + i] += 0.4 * envelope * Math.sin(2 * Math.PI * freq * t);
        acc_x[passIdx + i] += 0.08 * envelope * Math.sin(2 * Math.PI * freq * 0.8 * t);
        acc_y[passIdx + i] += 0.04 * envelope * Math.sin(2 * Math.PI * freq * 0.6 * t);
      }
    }

    for (let i = 0; i < n_samples; i++) {
      acc_z[i] += 0.15 * Math.sin(2 * Math.PI * 5 * time[i]);
      acc_x[i] += 0.08 * Math.sin(2 * Math.PI * 4 * time[i]);
      acc_y[i] += 0.05 * Math.sin(2 * Math.PI * 3.5 * time[i]);
      acc_x[i] += (Math.random() - 0.5) * 0.02;
      acc_y[i] += (Math.random() - 0.5) * 0.02;
      acc_z[i] += (Math.random() - 0.5) * 0.02;
    }

    setSignalData({ time, acc_x, acc_y, acc_z, timeMetadata: { source: 'seconds', label: 'Tiempo sintético en segundos' } });
    setTimeRange([0, duration]);
    setHistoryZoomRange(getDefaultHistoryZoomRange([0, duration]));
    setSelectedSegment(null);
    setLastAnalysisMeta(null);
    setVibrationBackendResults({});
    vibrationBackendCacheRef.current.clear();
    setAnalysisStatus('Señal de demostración cargada. La ventana activa cubre todo el registro.');
    setVibrationBackendStatus('enDAQ listo: ejecute Analyze para calcular FFT/PSD/A-V-D.');
    setFileName('datos_muestra_puente.csv');
    setError(null);
  }, [samplingRate]);

  // ============ SEGMENT HANDLING ============
  
  const addSegment = useCallback((start: number, end: number, label: string) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      setError('La ventana debe tener un inicio y fin válidos; el fin debe ser mayor que el inicio.');
      return;
    }
    const id = `seg_${Date.now()}`;
    const color = COLOR_PALETTES[colorPalette][activeChannel as keyof typeof COLOR_PALETTES.default];
    const nextSegment = { id, start, end, label: label.trim() || `Ventana ${segments.length + 1}`, color };
    setSegments(prev => [...prev, nextSegment].sort((a, b) => a.start - b.start));
    useSegmentWindow(nextSegment);
    setError(null);
    setAnalysisResults(null);
    setLastAnalysisMeta(null);
    setSegmentDraft({ start: '', end: '', label: '' });
  }, [activeChannel, colorPalette, segments.length, useSegmentWindow]);

  const handleSaveSegment = useCallback(() => {
    const start = parseFloat(segmentDraft.start);
    const end = parseFloat(segmentDraft.end);
    const label = segmentDraft.label || `Ventana ${segments.length + 1}`;
    addSegment(start, end, label);
  }, [addSegment, segmentDraft, segments.length]);

  const saveActiveWindowAsSegment = useCallback(() => {
    const label = segmentDraft.label.trim() || (activeAnalysisWindow.source === 'segment'
      ? activeAnalysisWindow.label
      : `Recorte ${segments.length + 1}`);
    addSegment(activeAnalysisWindow.start, activeAnalysisWindow.end, label);
  }, [activeAnalysisWindow, addSegment, segmentDraft.label, segments.length]);

  const renameDraftFromCurrentWindow = useCallback(() => {
    setSegmentDraft({
      start: activeAnalysisWindow.start.toFixed(3),
      end: activeAnalysisWindow.end.toFixed(3),
      label: activeAnalysisWindow.source === 'segment'
        ? activeAnalysisWindow.label
        : `Ventana ${segments.length + 1}`,
    });
  }, [activeAnalysisWindow, segments.length]);

  const loadSavedAnalysis = useCallback((saved: SavedAnalysis) => {
    setTimeRange([saved.start, saved.end]);
    const matchingSegment = segments.find(segment => rangesMatch(segment.start, segment.end, saved.start, saved.end));
    setSelectedSegment(matchingSegment?.id ?? null);
    setAnalysisResults(saved.result);
    setLastAnalysisMeta(saved);
    const savedModes = getPreprocessModesFromSaved(saved);
    setPreprocessModes(savedModes);
    setPreprocessMode(savedModes[savedModes.length - 1] ?? saved.preprocessMode ?? 'none');
    if (saved.filterParams) {
      const savedFilterParams = normalizeFilterParams(saved.filterParams);
      setFilterParams(savedFilterParams);
      setFilterParamDraft(savedFilterParams);
    }
    if (saved.fftWindowType) setFftWindowType(saved.fftWindowType);
    setAnalysisStatus(`Cálculo cargado desde historial: ${saved.label}`);
    setError(null);
  }, [segments]);

  const removeSavedAnalysis = useCallback((id: string) => {
    setSavedAnalyses(prev => prev.filter(item => item.id !== id));
    if (lastAnalysisMeta?.id === id) {
      setLastAnalysisMeta(null);
      setAnalysisResults(null);
      setAnalysisStatus('Cálculo eliminado. Ejecute un nuevo análisis.');
    }
  }, [lastAnalysisMeta]);

  const clearSavedAnalyses = useCallback(() => {
    setSavedAnalyses([]);
    setLastAnalysisMeta(null);
    setAnalysisStatus('Historial local de cálculos limpiado.');
  }, []);

  const removeSegment = useCallback((id: string) => {
    setSegments(prev => prev.filter(s => s.id !== id));
    if (selectedSegment === id) {
      setSelectedSegment(null);
      setAnalysisStatus('Ventana eliminada. La selección volvió al rango manual actual.');
    }
  }, [selectedSegment]);

  const runAnalysis = useCallback(async () => {
    if (!signalData) return;

    setIsLoading(true);
    const meta = activeAnalysisWindow;
    const cacheKey = buildAnalysisCacheKey(meta);

    try {
      const allData = getAllChannelsData();
      if (allData.time.length < 2) {
        throw new Error('Selecciona una ventana con al menos 2 muestras para analizar.');
      }
      const backendChannels = getChannelsForBackendAnalysis();

      const cached = savedAnalyses.find(item => item.cacheKey === cacheKey);
      if (cached) {
        await requestVibrationBackendAnalysis(backendChannels);
        setAnalysisResults(cached.result);
        setLastAnalysisMeta(cached);
        setAnalysisStatus(`Resultado cargado desde caché del navegador: ${cached.label}`);
        setError(null);
        return;
      }

      setAnalysisStatus(`Analizando ${meta.label}: ${formatRange(meta.start, meta.end)} (${meta.samples} muestras).`);
      await requestVibrationBackendAnalysis(backendChannels);

      let results: FullAnalysisResult | null = null;
      let summaryError: string | null = null;
      try {
        results = await fullBridgeAnalysis(
          allData.time,
          allData.acc_x,
          allData.acc_y,
          allData.acc_z,
          samplingRate,
          unit,
          fileName,
          sensorLocation,
          {
            windowType: fftWindowType,
            detrend: false,
          }
        );
      } catch (err) {
        summaryError = getErrorMessage(err);
      }

      if (!results) {
        setAnalysisResults(null);
        setLastAnalysisMeta(null);
        setAnalysisStatus(
          `enDAQ actualizado para las gráficas. Resumen completo no disponible: ${summaryError ?? 'sin respuesta del backend.'}`
        );
        setError(null);
        return;
      }

      const saved: SavedAnalysis = {
        id: `analysis_${Date.now()}`,
        cacheKey,
        label: meta.label,
        start: meta.start,
        end: meta.end,
        duration: meta.duration,
        samples: allData.time.length,
        createdAt: new Date().toISOString(),
        fileName: fileName || 'Señal sin nombre',
        samplingRate,
        unit,
        preprocessMode: preprocessModes[0] ?? 'none',
        preprocessModes: normalizePreprocessModes(preprocessModes),
        filterParams: normalizeFilterParams(filterParams),
        fftWindowType,
        result: results,
      };

      setAnalysisResults(results);
      setLastAnalysisMeta(saved);
      setSavedAnalyses(prev => [saved, ...prev.filter(item => item.cacheKey !== cacheKey)].slice(0, MAX_SAVED_ANALYSES));
      setAnalysisStatus(`Análisis completado; resultados enDAQ actualizados: ${saved.label}`);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
      setAnalysisStatus('El análisis no se completó. Revise el rango y los datos.');
    } finally {
      setIsLoading(false);
    }
  }, [
    activeAnalysisWindow,
    buildAnalysisCacheKey,
    fileName,
    getAllChannelsData,
    getChannelsForBackendAnalysis,
    samplingRate,
    savedAnalyses,
    sensorLocation,
    signalData,
    requestVibrationBackendAnalysis,
    preprocessModes,
    filterParams,
    fftWindowType,
    unit,
  ]);

  // ============ EXPORT FUNCTIONS ============
  
  const downloadFile = (content: string | Blob, filename: string, mimeType: string) => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportChart = useCallback(async (chartRef: React.RefObject<any>, chartName: string) => {
    if (!chartRef.current || !PlotComponent) {
      alert('Gráfico no disponible para exportar');
      return;
    }
    
    const plotlyLib = (window as any).Plotly;
    if (!plotlyLib) {
      alert('Plotly no está disponible');
      return;
    }

    const element = chartRef.current.el;
    if (!element) {
      alert('Elemento del gráfico no encontrado');
      return;
    }

    const timestamp = Date.now();
    const safeFilename = fileName.replace(/\.[^/.]+$/, '') || 'signal';
    const baseFilename = `${safeFilename}_${chartName}_${timestamp}`;

    try {
      switch (exportConfig.format) {
        case 'png':
          await plotlyLib.downloadImage(element, {
            format: 'png',
            width: exportConfig.width,
            height: exportConfig.height,
            scale: exportConfig.scale,
            filename: baseFilename,
          });
          break;

        case 'svg':
          await plotlyLib.downloadImage(element, {
            format: 'svg',
            filename: baseFilename,
          });
          break;

        case 'eps':
          // EPS via SVG conversion
          const svgData = await plotlyLib.toSVG(element);
          const epsContent = svgToEps(svgData);
          downloadFile(epsContent, `${baseFilename}.eps`, 'application/postscript');
          break;

        case 'webp':
          await plotlyLib.downloadImage(element, {
            format: 'webp',
            width: exportConfig.width,
            height: exportConfig.height,
            scale: exportConfig.scale,
            filename: baseFilename,
          });
          break;

        case 'pdf':
          await generatePDF(element, baseFilename, plotlyLib);
          break;

        default:
          alert(`Formato ${exportConfig.format} no soportado para gráficos`);
      }
    } catch (err) {
      console.error('Export error:', err);
      alert(`Error al exportar: ${err}`);
    }
  }, [PlotComponent, exportConfig, fileName]);

  const svgToEps = (svg: string): string => {
    // Simple SVG to EPS conversion
    return `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 ${exportConfig.width} ${exportConfig.height}
${svg.replace(/<svg[^>]*>|<\/svg>|<[^>]+>/g, '').replace(/fill:/g, 'rgb ')}
%%EOF`;
  };

  const generatePDF = async (element: HTMLElement, baseFilename: string, plotlyLib: any) => {
    // Generate PDF with Plotly image embedded
    const imgData = await plotlyLib.toImage(element, {
      format: 'png',
      width: exportConfig.width,
      height: exportConfig.height,
      scale: exportConfig.scale,
    });

    const paper = PAPER_SIZES[exportConfig.paperSize === 'custom' ? 'A4' : exportConfig.paperSize];
    const widthMm = exportConfig.orientation === 'landscape' ? paper.height : paper.width;
    const heightMm = exportConfig.orientation === 'landscape' ? paper.width : paper.height;
    const widthPt = widthMm * 2.83465;
    const heightPt = heightMm * 2.83465;

    const metadata = exportConfig.includeMetadata ? `
    <div style="font-size:10pt;color:#666;font-family:Arial;margin-bottom:10px;">
      <strong>Archivo:</strong> ${fileName || 'N/A'} | 
      <strong>Fecha:</strong> ${new Date().toLocaleString()} |
      <strong>Sampling Rate:</strong> ${samplingRate} Hz |
      <strong>Unit:</strong> ${unit}
    </div>` : '';

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Signal Processing Report</title>
      <style>
        @page { size: ${widthMm}mm ${heightMm}mm; margin: 15mm; }
        body { font-family: Arial, sans-serif; color: #333; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #3B82F6; padding-bottom: 10px; }
        .header h1 { color: #3B82F6; margin: 0; font-size: 18pt; }
        .header h2 { color: #666; margin: 5px 0 0; font-size: 12pt; font-weight: normal; }
        .chart-container { text-align: center; margin: 20px 0; }
        .chart-container img { max-width: 100%; height: auto; }
        .metadata { font-size: 9pt; color: #666; }
        .footer { font-size: 8pt; color: #999; text-align: center; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🔬 Reporte de Procesamiento de Señales</h1>
        <h2>Compatible con VibrationData / enDAQ backend</h2>
      </div>
      ${metadata}
      <div class="chart-container">
        <img src="${imgData}" alt="Signal Chart" />
      </div>
      <div class="footer">
        <p>Generado automáticamente | FEM UNSAAC | ${new Date().toISOString()}</p>
      </div>
    </body>
    </html>`;

    // Create PDF using window.print
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  const downloadCatalogPlotById = useCallback(async (divId: string, filename: string) => {
    const plotlyLib = (window as any).Plotly;
    const element = document.getElementById(divId);
    if (!plotlyLib || !element) {
      alert('Gráfica no disponible para descargar');
      return;
    }

    try {
      if (exportConfig.format === 'pdf') {
        await generatePDF(element, filename, plotlyLib);
        return;
      }
      if (exportConfig.format === 'eps') {
        const svgData = await plotlyLib.toSVG(element);
        downloadFile(svgToEps(svgData), `${filename}.eps`, 'application/postscript');
        return;
      }
      await plotlyLib.downloadImage(element, {
        format: ['png', 'svg', 'webp'].includes(exportConfig.format) ? exportConfig.format : 'png',
        width: exportConfig.width,
        height: exportConfig.height,
        scale: exportConfig.scale,
        filename,
      });
    } catch (err) {
      console.error('Catalog export error:', err);
      alert(`Error al descargar gráfica: ${err}`);
    }
  }, [exportConfig, generatePDF, svgToEps]);

  const exportDataCSV = useCallback(() => {
    if (!signalData) return;
    const exportSeries = getActiveExportSeries();
    
    let csv = `${exportSeries.xLabel ?? 'time_s'},${exportSeries.columns.map((column) => column.name).join(',')}\n`;
    exportSeries.time.forEach((t, i) => {
      const values = exportSeries.columns.map((column) => {
        const value = column.data[i] ?? 0;
        return Number.isFinite(value) ? value.toFixed(10) : '0';
      });
      csv += `${t.toFixed(6)},${values.join(',')}\n`;
    });
    
    const timestamp = Date.now();
    downloadFile(csv, `signal_data_${timestamp}.csv`, 'text/csv');
  }, [signalData, getActiveExportSeries]);

  const exportDataJSON = useCallback(() => {
    if (!signalData) return;
    const allData = getAllChannelsData();
    
    const data = {
      metadata: {
        file_name: fileName,
        sampling_rate_hz: samplingRate,
        unit,
        time_range_s: timeRange,
        time_base: signalData.timeMetadata,
        preprocessing: formatPreprocessPipeline(preprocessModes),
        preprocessing_modes: normalizePreprocessModes(preprocessModes),
        preprocessing_descriptions: normalizePreprocessModes(preprocessModes).map((mode) => ({
          mode,
          label: PREPROCESS_LABELS[mode],
          description: PREPROCESS_DESCRIPTIONS[mode],
        })),
        filter_params: normalizeFilterParams(filterParams),
        fft_window: FFT_WINDOW_LABELS[fftWindowType],
        integration_output: INTEGRATION_OUTPUT_LABELS[integrationOutput],
        integration_highpass_hz: integrationHighpassHz,
        displacement_display_unit: displacementDisplayLabel,
        plot_catalog_template: PLOT_CATALOG_LABELS[plotCatalogMode],
        plot_catalog_style: PLOT_CATALOG_STYLE_LABELS[plotCatalogStyle],
        plot_catalog_time_layout: PLOT_CATALOG_TIME_LAYOUT_LABELS[plotCatalogTimeLayout],
        plot_catalog_manual_peaks_hz: plotCatalogManualPeaks,
        vibration_backend: activeVibrationBackendResult ? {
          method: activeVibrationBackendResult.method,
          engine: activeVibrationBackendResult.engine,
          settings: activeVibrationBackendResult.settings,
        } : null,
        export_date: new Date().toISOString(),
        sensor_location: sensorLocation,
      },
      analysis_results: analysisResults ? {
        fundamental_frequency_hz: analysisResults.natural_frequencies?.fundamental_freq_hz,
        observations: analysisResults.observations,
      } : null,
      channels: {
        time: allData.time,
        acc_x: allData.acc_x,
        acc_y: allData.acc_y,
        acc_z: allData.acc_z,
        resultant: allData.resultant,
      },
      segments: segments.map(s => ({
        label: s.label,
        start_s: s.start,
        end_s: s.end,
      })),
      derived_kinematics: {
        channel: activeChannel,
        method: activeVibrationBackendResult?.time_histories.method.integration ?? 'endaq backend pending',
        acceleration_scale_to_m_s2: kinematicsData.accelerationScale,
        highpass_hz: integrationHighpassHz,
        time: vibrationDataSeries.full.time,
        acceleration_m_s2: kinematicsData.accelerationMps2,
        velocity_m_s: kinematicsData.velocityMps,
        displacement_m: kinematicsData.displacementM,
        displacement_display_unit: displacementDisplayLabel,
        displacement_display: kinematicsData.displacementM.map((value) => value * displacementDisplayFactor),
        velocity_stats: kinematicsData.velocityStats,
        displacement_stats_m: kinematicsData.displacementStats,
        drift_warning: kinematicsData.driftWarning,
        drift_ratio: kinematicsData.driftRatio,
      },
    };
    
    const timestamp = Date.now();
    downloadFile(JSON.stringify(data, null, 2), `signal_data_${timestamp}.json`, 'application/json');
  }, [
    activeChannel,
    activeVibrationBackendResult,
    analysisResults,
    displacementDisplayFactor,
    displacementDisplayLabel,
    fftWindowType,
    filterParams,
    fileName,
    getAllChannelsData,
    integrationHighpassHz,
    integrationOutput,
    kinematicsData,
    plotCatalogMode,
    plotCatalogStyle,
    plotCatalogTimeLayout,
    preprocessModes,
    segments,
    sensorLocation,
    signalData,
    timeRange,
    unit,
    vibrationDataSeries.full.time,
  ]);

  // ============ CHART DATA BUILDERS ============
  
  const renderTimeChart = useCallback(() => {
    const allData = getAllChannelsData();
    const palette = COLOR_PALETTES[colorPalette];
    const colors = [palette.acc_x, palette.acc_y, palette.acc_z, palette.resultant];
    const channels = ['acc_x', 'acc_y', 'acc_z', 'resultant'];
    const showAll = activeChannel === 'acc_z';

    const traces = showAll
      ? channels.map((ch, idx) => {
          const series = allData[ch as keyof typeof allData] as number[];
          const decimated = downsampleMinMax(allData.time, series);
          return {
          x: decimated.x,
          y: decimated.y,
          type: 'scattergl' as const,
          mode: 'lines' as const,
          name: ch === 'resultant' ? 'Resultante 3D' : ch.toUpperCase(),
          line: { color: colors[idx], width: chartConfig.lineWidth },
          hovertemplate: `<b>${ch === 'resultant' ? 'Resultante 3D' : ch.toUpperCase()}</b><br>Tiempo: %{x:.3f} s<br>Amplitud: %{y:.5g} ${unit}<extra></extra>`,
        };
        })
      : (() => {
        const decimated = downsampleMinMax(allData.time, allData[activeChannel]);
        return [{
          x: decimated.x,
          y: decimated.y,
          type: 'scattergl' as const,
          mode: 'lines' as const,
          name: activeChannel === 'resultant' ? 'Resultante 3D' : activeChannel.toUpperCase(),
          line: { color: chartConfig.lineColor, width: chartConfig.lineWidth },
          hovertemplate: `<b>${getChannelLabel(activeChannel)}</b><br>Tiempo: %{x:.3f} s<br>Amplitud: %{y:.5g} ${unit}<extra></extra>`,
        }];
      })();

    const activeWindowStats = computeStats(allData[activeChannel]);
    const yVal = (activeWindowStats.max || activeWindowStats.maxAbs || 1) * 0.95;
    segments.forEach(seg => {
      traces.push({
        x: [seg.start, seg.end],
        y: [yVal, yVal],
        type: 'scattergl' as const,
        mode: 'lines' as const,
        name: seg.label,
        line: { color: seg.color, width: 2, dash: 'dot' as const },
        showlegend: false,
        hovertemplate: `<b>${seg.label}</b><br>Inicio: ${seg.start.toFixed(3)} s<br>Fin: ${seg.end.toFixed(3)} s<extra></extra>`,
      } as any);
    });

    return traces;
  }, [activeChannel, chartConfig.lineColor, chartConfig.lineWidth, colorPalette, getAllChannelsData, segments, unit]);

  const renderFFTChart = useCallback(() => {
    const spectrum = activeVibrationBackendResult?.fft.acceleration;
    if (!spectrum) return [];
    
    return [{
      x: spectrum.frequencies,
      y: spectrum.amplitudes,
      type: 'scattergl' as const,
      mode: 'lines' as const,
      name: 'FFT enDAQ',
      line: { color: chartConfig.lineColor, width: chartConfig.lineWidth },
      hovertemplate: `<b>FFT — ${getChannelLabel(activeChannel)}</b><br>Frecuencia: %{x:.3f} Hz<br>Amplitud: %{y:.5g} ${unit}<extra></extra>`,
    }];
  }, [activeChannel, activeVibrationBackendResult, chartConfig.lineColor, chartConfig.lineWidth, unit]);

  const renderPSDChart = useCallback(() => {
    const spectrum = activeVibrationBackendResult?.psd.acceleration;
    if (!spectrum) return [];
    
    return [{
      x: spectrum.frequencies,
      y: spectrum.psd,
      type: 'scattergl' as const,
      mode: 'lines' as const,
      name: 'PSD Welch enDAQ',
      line: { color: chartConfig.lineColor, width: chartConfig.lineWidth },
      hovertemplate: `<b>PSD — ${getChannelLabel(activeChannel)}</b><br>Frecuencia: %{x:.3f} Hz<br>PSD: %{y:.5g} ${spectrum.unit}<extra></extra>`,
    }];
  }, [activeChannel, activeVibrationBackendResult, chartConfig.lineColor, chartConfig.lineWidth]);

  const renderWaterfallChart = useCallback(() => {
    const filtered = getFilteredData();
    const segmentSize = Math.min(1024, Math.max(128, floorPowerOfTwo(Math.floor(filtered.data.length / 24) || 128)));
    const nSegments = Math.floor(filtered.data.length / segmentSize);
    
    const z: number[][] = [];
    const times: number[] = [];
    let freqAxis: number[] = [];
    
    for (let s = 0; s < Math.min(nSegments, 32); s++) {
      const start = s * segmentSize;
      const segment = filtered.data.slice(start, start + segmentSize);
      const { frequencies, amplitudes } = computeLocalFFT(segment, samplingRate);
      if (freqAxis.length === 0) freqAxis = frequencies.slice(0, 80);
      z.push(amplitudes.slice(0, 80));
      times.push(filtered.time[start]);
    }

    return [{
      x: freqAxis,
      y: times,
      z: z,
      type: 'surface' as const,
      colorscale: 'Viridis',
      showscale: true,
      contours: {
        z: { show: true, usecolormap: true, highlightcolor: plotTheme.text, project: { z: true } },
      },
      colorbar: {
        title: { text: `Amplitud FFT (${unit})`, font: { color: plotTheme.text } },
        tickfont: { color: plotTheme.subtleText },
        bgcolor: plotTheme.paperBackground,
      },
      hovertemplate: `<b>Waterfall — ${getChannelLabel(activeChannel)}</b><br>Frecuencia: %{x:.3f} Hz<br>Tiempo: %{y:.3f} s<br>Amplitud: %{z:.5g} ${unit}<extra></extra>`,
    }];
  }, [activeChannel, computeLocalFFT, getFilteredData, plotTheme, samplingRate, unit]);

  const renderEnvelopeChart = useCallback(() => {
    const filtered = getFilteredData();
    const envelope = computeEnvelopeFast(filtered.data, samplingRate);
    const signalTrace = downsampleMinMax(filtered.time, filtered.data, MAX_TIME_PLOT_POINTS);
    const envelopeTrace = downsampleMinMax(filtered.time, envelope, MAX_TIME_PLOT_POINTS);

    return [
      {
        x: signalTrace.x,
        y: signalTrace.y,
        type: 'scattergl' as const,
        mode: 'lines' as const,
        name: 'Señal',
        line: { color: '#94A3B8', width: 0.5 },
        opacity: 0.5,
        hovertemplate: `<b>Señal — ${getChannelLabel(activeChannel)}</b><br>Tiempo: %{x:.3f} s<br>Amplitud: %{y:.5g} ${unit}<extra></extra>`,
      },
      {
        x: envelopeTrace.x,
        y: envelopeTrace.y,
        type: 'scattergl' as const,
        mode: 'lines' as const,
        name: 'Envolvente',
        line: { color: chartConfig.lineColor, width: chartConfig.lineWidth },
        hovertemplate: `<b>Envolvente — ${getChannelLabel(activeChannel)}</b><br>Tiempo: %{x:.3f} s<br>Amplitud: %{y:.5g} ${unit}<extra></extra>`,
      },
    ];
  }, [activeChannel, chartConfig.lineColor, chartConfig.lineWidth, getFilteredData, samplingRate, unit]);

  const renderIntegrationChart = useCallback(() => {
    const integrationTime = vibrationDataSeries.full.time;
    const velocityTrace = downsampleMinMax(integrationTime, kinematicsData.velocityMps, MAX_TIME_PLOT_POINTS);
    const displacementValues = kinematicsData.displacementM.map((value) => value * displacementDisplayFactor);
    const displacementTrace = downsampleMinMax(integrationTime, displacementValues, MAX_TIME_PLOT_POINTS);

    const velocityPlot = {
      x: velocityTrace.x,
      y: velocityTrace.y,
      type: 'scattergl' as const,
      mode: 'lines' as const,
      name: 'Velocidad v(t)',
      line: { color: '#06B6D4', width: chartConfig.lineWidth },
      hovertemplate: `<b>Velocidad integrada — ${getChannelLabel(activeChannel)}</b><br>Tiempo: %{x:.3f} s<br>v: %{y:.6g} m/s<extra></extra>`,
    };

    const displacementPlot = {
      x: displacementTrace.x,
      y: displacementTrace.y,
      type: 'scattergl' as const,
      mode: 'lines' as const,
      name: `Desplazamiento u(t) [${displacementDisplayLabel}]`,
      line: { color: chartConfig.lineColor, width: chartConfig.lineWidth },
      hovertemplate: `<b>Desplazamiento integrado — ${getChannelLabel(activeChannel)}</b><br>Tiempo: %{x:.3f} s<br>u: %{y:.6g} ${displacementDisplayLabel}<extra></extra>`,
    };

    if (integrationOutput === 'velocity') return [velocityPlot];
    if (integrationOutput === 'displacement') return [displacementPlot];
    return [
      velocityPlot,
      {
        ...displacementPlot,
        yaxis: 'y2' as const,
      },
    ];
  }, [
    activeChannel,
    chartConfig.lineColor,
    chartConfig.lineWidth,
    displacementDisplayFactor,
    displacementDisplayLabel,
    integrationOutput,
    kinematicsData.displacementM,
    kinematicsData.velocityMps,
    vibrationDataSeries.full.time,
  ]);

  const renderVibrationDataChart = useCallback(() => {
    const lineColor = '#0072BD';
    const buildTrace = (
      x: number[],
      y: number[],
      name: string,
      unitLabel: string,
      axisIndex: number
    ) => {
      const decimated = downsampleMinMax(x, y, MAX_TIME_PLOT_POINTS / 2);
      return {
        x: decimated.x,
        y: decimated.y,
        type: 'scattergl' as const,
        mode: 'lines' as const,
        name,
        xaxis: axisIndex === 1 ? 'x' : `x${axisIndex}`,
        yaxis: axisIndex === 1 ? 'y' : `y${axisIndex}`,
        line: { color: lineColor, width: Math.max(0.8, chartConfig.lineWidth * 0.75) },
        showlegend: false,
        hovertemplate: `<b>${name}</b><br>Time: %{x:.5g} sec<br>${unitLabel}: %{y:.6g}<extra></extra>`,
      };
    };

    if (plotCatalogTimeLayout === 'stacked') {
      return [
        buildTrace(vibrationDataSeries.full.time, vibrationDataSeries.full.accelerationG, 'Acceleration Time History', 'Accel (G)', 1),
        buildTrace(vibrationDataSeries.full.time, vibrationDataSeries.full.velocityMmS, 'Velocity Time History', 'Velocity (mm/s)', 2),
        buildTrace(vibrationDataSeries.full.time, vibrationDataSeries.full.displacementMm, 'Displacement Time History', 'Displacement (mm)', 3),
      ];
    }

    return [
      buildTrace(vibrationDataSeries.full.time, vibrationDataSeries.full.accelerationG, 'Acceleration Time History', 'Accel (G)', 1),
      buildTrace(vibrationDataSeries.zoom.time, vibrationDataSeries.zoom.accelerationG, 'Acceleration Time History — Zoom', 'Accel (G)', 2),
      buildTrace(vibrationDataSeries.full.time, vibrationDataSeries.full.velocityMmS, 'Velocity Time History', 'Velocity (mm/s)', 3),
      buildTrace(vibrationDataSeries.zoom.time, vibrationDataSeries.zoom.velocityMmS, 'Velocity Time History — Zoom', 'Velocity (mm/s)', 4),
      buildTrace(vibrationDataSeries.full.time, vibrationDataSeries.full.displacementMm, 'Displacement Time History', 'Displacement (mm)', 5),
      buildTrace(vibrationDataSeries.zoom.time, vibrationDataSeries.zoom.displacementMm, 'Displacement Time History — Zoom', 'Displacement (mm)', 6),
    ];
  }, [chartConfig.lineWidth, plotCatalogTimeLayout, vibrationDataSeries]);

  const renderCatalogFFTPhaseChart = useCallback(() => {
    const lineColor = '#0072BD';
    const markerColor = '#6B4E00';
    const buildPair = (
      spectrum: typeof vibrationSpectra.acceleration,
      title: string,
      unitLabel: string,
      phaseAxisIndex: number,
      magnitudeAxisIndex: number
    ) => {
      const peaks = plotCatalogShowManualPeaks
        ? getManualSpectralMarkers(
            spectrum.frequencies,
            spectrum.amplitudes,
            plotCatalogManualPeaks
          )
        : [];
      const phaseTrace = {
        x: spectrum.frequencies,
        y: spectrum.phasesDeg,
        type: 'scattergl' as const,
        mode: 'lines' as const,
        name: `${title} Phase`,
        xaxis: phaseAxisIndex === 1 ? 'x' : `x${phaseAxisIndex}`,
        yaxis: phaseAxisIndex === 1 ? 'y' : `y${phaseAxisIndex}`,
        line: { color: lineColor, width: 1 },
        showlegend: false,
        hovertemplate: `<b>${title} Phase</b><br>Frequency: %{x:.4g} Hz<br>Phase: %{y:.3g} deg<extra></extra>`,
      };
      const magnitudeTrace = {
        x: spectrum.frequencies,
        y: spectrum.amplitudes,
        type: 'scattergl' as const,
        mode: 'lines' as const,
        name: `${title} Magnitude`,
        xaxis: magnitudeAxisIndex === 1 ? 'x' : `x${magnitudeAxisIndex}`,
        yaxis: magnitudeAxisIndex === 1 ? 'y' : `y${magnitudeAxisIndex}`,
        line: { color: lineColor, width: 1 },
        showlegend: false,
        hovertemplate: `<b>${title} Magnitude</b><br>Frequency: %{x:.4g} Hz<br>${unitLabel}: %{y:.6g}<extra></extra>`,
      };
      const traces: any[] = [phaseTrace, magnitudeTrace];
      if (peaks.length > 0) {
        traces.push({
          x: peaks.map((peak) => peak.frequency),
          y: peaks.map((peak) => peak.amplitude),
          customdata: peaks.map((peak, index) => [index + 1, peak.frequency, peak.amplitude]),
          type: 'scatter' as const,
          mode: plotCatalogShowPeakLabels ? 'markers+text' as const : 'markers' as const,
          text: plotCatalogShowPeakLabels ? peaks.map((peak, index) => `P${index + 1}<br>${peak.frequency.toFixed(2)} Hz`) : undefined,
          textposition: 'top center' as const,
          textfont: { color: markerColor, size: 10, family: 'Inter, Arial, sans-serif' },
          xaxis: magnitudeAxisIndex === 1 ? 'x' : `x${magnitudeAxisIndex}`,
          yaxis: magnitudeAxisIndex === 1 ? 'y' : `y${magnitudeAxisIndex}`,
          marker: { color: markerColor, size: 6, line: { color: '#ffffff', width: 1 } },
          showlegend: false,
          cliponaxis: false,
          hovertemplate: `Pico %{customdata[0]}<br>Frequency: %{x:.4g} Hz<br>${unitLabel}: %{y:.6g}<extra></extra>`,
        });
      }
      return traces;
    };

    return [
      ...buildPair(vibrationSpectra.acceleration, 'Acceleration FFT', 'Accel (G)', 1, 2),
      ...buildPair(vibrationSpectra.velocity, 'Velocity FFT', 'Velocity (mm/s)', 3, 4),
      ...buildPair(vibrationSpectra.displacement, 'Displacement FFT', 'Displacement (mm)', 5, 6),
    ];
  }, [plotCatalogManualPeaks, plotCatalogShowManualPeaks, plotCatalogShowPeakLabels, vibrationSpectra]);

  const renderCatalogFFTOverallChart = useCallback(() => {
    const lineColor = '#0072BD';
    const markerColor = '#6B4E00';
    const buildOverall = (
      spectrum: typeof vibrationSpectra.acceleration,
      title: string,
      unitLabel: string,
      axisIndex: number
    ) => {
      const floor = getPositiveMagnitudeFloor(spectrum.amplitudes);
      const amplitudes = spectrum.amplitudes.map((value) => value > 0 ? value : floor);
      const traces: any[] = [{
        x: spectrum.frequencies,
        y: amplitudes,
        type: 'scattergl' as const,
        mode: 'lines' as const,
        name: title,
        xaxis: axisIndex === 1 ? 'x' : `x${axisIndex}`,
        yaxis: axisIndex === 1 ? 'y' : `y${axisIndex}`,
        line: { color: lineColor, width: 1 },
        showlegend: false,
        hovertemplate: `<b>${title}</b><br>Frequency: %{x:.4g} Hz<br>${unitLabel}: %{y:.6g}<extra></extra>`,
      }];

      const peaks = plotCatalogShowManualPeaks
        ? getManualSpectralMarkers(
            spectrum.frequencies,
            spectrum.amplitudes,
            plotCatalogManualPeaks
          )
        : [];
      if (peaks.length > 0) {
        traces.push({
          x: peaks.map((peak) => peak.frequency),
          y: peaks.map((peak) => Math.max(peak.amplitude, floor)),
          customdata: peaks.map((peak, index) => [index + 1, peak.frequency, peak.amplitude]),
          type: 'scatter' as const,
          mode: plotCatalogShowPeakLabels ? 'markers+text' as const : 'markers' as const,
          text: plotCatalogShowPeakLabels ? peaks.map((peak, index) => `P${index + 1}<br>${peak.frequency.toFixed(2)} Hz`) : undefined,
          textposition: 'top center' as const,
          textfont: { color: markerColor, size: 10, family: 'Inter, Arial, sans-serif' },
          xaxis: axisIndex === 1 ? 'x' : `x${axisIndex}`,
          yaxis: axisIndex === 1 ? 'y' : `y${axisIndex}`,
          marker: { color: markerColor, size: 6, line: { color: '#ffffff', width: 1 } },
          showlegend: false,
          cliponaxis: false,
          hovertemplate: `Pico %{customdata[0]}<br>Frequency: %{x:.4g} Hz<br>${unitLabel}: %{customdata[2]:.6g}<extra></extra>`,
        });
      }
      return traces;
    };

    return [
      ...buildOverall(vibrationSpectra.acceleration, 'Acceleration FFT Magnitude Overall', 'Accel (G)', 1),
      ...buildOverall(vibrationSpectra.velocity, 'Velocity FFT Magnitude Overall', 'Velocity (mm/s)', 2),
      ...buildOverall(vibrationSpectra.displacement, 'Displacement FFT Magnitude Overall', 'Displacement (mm)', 3),
    ];
  }, [plotCatalogManualPeaks, plotCatalogShowManualPeaks, plotCatalogShowPeakLabels, vibrationSpectra]);

  const plotData = useMemo(() => {
    if (!signalData) return [];
    if (activeView === 'time') return renderTimeChart();
    if (activeView === 'fft') return renderFFTChart();
    if (activeView === 'psd') return renderPSDChart();
    if (activeView === 'waterfall') return renderWaterfallChart();
    if (activeView === 'integration') return renderIntegrationChart();
    if (activeView === 'vibrationdata') {
      if (plotCatalogMode === 'fft_phase') return renderCatalogFFTPhaseChart();
      if (plotCatalogMode === 'fft_overall') return renderCatalogFFTOverallChart();
      return renderVibrationDataChart();
    }
    return renderEnvelopeChart();
  }, [activeView, plotCatalogMode, renderCatalogFFTOverallChart, renderCatalogFFTPhaseChart, renderEnvelopeChart, renderFFTChart, renderIntegrationChart, renderPSDChart, renderTimeChart, renderVibrationDataChart, renderWaterfallChart, signalData]);

  const axisLabels = useMemo(
    () => getSignalAxisLabels(activeView, activeChannel, unit, integrationOutput, displacementUnit),
    [activeChannel, activeView, displacementUnit, integrationOutput, unit]
  );

  const plotLayout = useMemo(
    () => {
      const baseLayout = getPlotLayout(
      axisLabels.title,
      axisLabels.x,
      axisLabels.y
      );

      if (activeView === 'vibrationdata') {
        const catalogTheme = plotCatalogStyle === 'publication'
          ? {
            paperBackground: '#ffffff',
            plotBackground: '#ffffff',
            text: '#111827',
            mutedText: '#374151',
            subtleText: '#4B5563',
            grid: 'rgba(0,0,0,0.12)',
            zeroLine: 'rgba(0,0,0,0.30)',
            axisLine: 'rgba(0,0,0,0.45)',
            hoverBackground: '#ffffff',
            hoverBorder: 'rgba(0,0,0,0.25)',
          }
          : plotTheme;
        const axisBase = {
          showgrid: chartConfig.showGrid,
          gridcolor: chartConfig.showGrid ? catalogTheme.grid : 'transparent',
          zerolinecolor: catalogTheme.zeroLine,
          linecolor: catalogTheme.axisLine,
          showline: true,
          mirror: true,
          ticks: 'outside' as const,
          tickfont: { color: catalogTheme.subtleText, size: chartConfig.axisFontSize },
          color: catalogTheme.mutedText,
          linewidth: 1,
        };

        if (plotCatalogMode === 'fft_phase') {
          const leftDomain = [0, 0.47];
          const rightDomain = [0.53, 1];
          const upperPhase = [0.86, 1.0];
          const upperMag = [0.57, 0.82];
          const lowerPhase = [0.34, 0.48];
          const lowerMag = [0.05, 0.30];
          const makeXAxis = (domain: number[], yRef: string, showTitle: boolean) => ({
            ...axisBase,
            domain,
            anchor: yRef,
            title: { text: showTitle ? 'Frequency (Hz)' : '', font: { color: catalogTheme.text, size: chartConfig.axisFontSize } },
          });
          const makeYAxis = (domain: number[], xRef: string, label: string, range?: number[]) => ({
            ...axisBase,
            domain,
            anchor: xRef,
            range,
            title: { text: label, font: { color: catalogTheme.text, size: chartConfig.axisFontSize } },
          });
          const magLimit = (values: number[]) => Math.max(...values.filter(Number.isFinite), 0) * 1.12 || 1;
          const annotations: any[] = [
            { text: 'Acceleration FFT Magnitude & Phase', x: 0.235, y: 1.05, xref: 'paper', yref: 'paper', showarrow: false, font: { color: catalogTheme.text, size: 12 } },
            { text: 'Velocity FFT Magnitude & Phase', x: 0.765, y: 1.05, xref: 'paper', yref: 'paper', showarrow: false, font: { color: catalogTheme.text, size: 12 } },
            { text: 'Displacement FFT Magnitude & Phase', x: 0.235, y: 0.53, xref: 'paper', yref: 'paper', showarrow: false, font: { color: catalogTheme.text, size: 12 } },
          ];
          return {
            ...baseLayout,
            title: { ...baseLayout.title, text: exportConfig.includeTitle ? `Catálogo FFT Magnitud + Fase — ${getChannelLabel(activeChannel)}` : '' },
            showlegend: false,
            margin: { l: 78, r: 32, t: 82, b: 58 },
            paper_bgcolor: catalogTheme.paperBackground,
            plot_bgcolor: catalogTheme.plotBackground,
            font: { color: catalogTheme.mutedText, family: 'Inter, Arial, sans-serif', size: chartConfig.axisFontSize },
            xaxis: makeXAxis(leftDomain, 'y', false),
            yaxis: makeYAxis(upperPhase, 'x', 'Phase (deg)', [-180, 180]),
            xaxis2: makeXAxis(leftDomain, 'y2', true),
            yaxis2: makeYAxis(upperMag, 'x2', 'Accel (G)', [0, magLimit(vibrationSpectra.acceleration.amplitudes)]),
            xaxis3: makeXAxis(rightDomain, 'y3', false),
            yaxis3: makeYAxis(upperPhase, 'x3', 'Phase (deg)', [-180, 180]),
            xaxis4: makeXAxis(rightDomain, 'y4', true),
            yaxis4: makeYAxis(upperMag, 'x4', 'Velocity (mm/s)', [0, magLimit(vibrationSpectra.velocity.amplitudes)]),
            xaxis5: makeXAxis(leftDomain, 'y5', false),
            yaxis5: makeYAxis(lowerPhase, 'x5', 'Phase (deg)', [-180, 180]),
            xaxis6: makeXAxis(leftDomain, 'y6', true),
            yaxis6: makeYAxis(lowerMag, 'x6', 'Displacement (mm)', [0, magLimit(vibrationSpectra.displacement.amplitudes)]),
            annotations,
            hoverlabel: { bgcolor: catalogTheme.hoverBackground, bordercolor: catalogTheme.hoverBorder, font: { color: catalogTheme.text } },
          };
        }

        if (plotCatalogMode === 'fft_overall') {
          const leftDomain = [0, 0.47];
          const rightDomain = [0.53, 1];
          const topDomain = [0.55, 1.0];
          const bottomDomain = [0.06, 0.48];
          const makeXAxis = (domain: number[], yRef: string) => ({
            ...axisBase,
            type: 'log' as const,
            domain,
            anchor: yRef,
            title: { text: 'Frequency (Hz)', font: { color: catalogTheme.text, size: chartConfig.axisFontSize } },
          });
          const makeYAxis = (domain: number[], xRef: string, label: string) => ({
            ...axisBase,
            type: 'log' as const,
            domain,
            anchor: xRef,
            title: { text: label, font: { color: catalogTheme.text, size: chartConfig.axisFontSize } },
          });
          const rms = {
            acc: computeStats(vibrationDataSeries.full.accelerationG).rms,
            vel: computeStats(vibrationDataSeries.full.velocityMmS).rms,
            disp: computeStats(vibrationDataSeries.full.displacementMm).rms,
          };
          const annotations: any[] = [
            { text: `Acceleration FFT Magnitude&nbsp;&nbsp; Overall&nbsp;&nbsp; ${formatEngineeringValue(rms.acc, 3)} GRMS`, x: 0.235, y: 1.05, xref: 'paper', yref: 'paper', showarrow: false, font: { color: catalogTheme.text, size: 12 } },
            { text: `Velocity FFT Magnitude&nbsp;&nbsp; Overall&nbsp;&nbsp; ${formatEngineeringValue(rms.vel, 3)} mm/sec RMS`, x: 0.765, y: 1.05, xref: 'paper', yref: 'paper', showarrow: false, font: { color: catalogTheme.text, size: 12 } },
            { text: `Displacement FFT Magnitude&nbsp;&nbsp; Overall&nbsp;&nbsp; ${formatEngineeringValue(rms.disp, 5)} mm RMS`, x: 0.235, y: 0.52, xref: 'paper', yref: 'paper', showarrow: false, font: { color: catalogTheme.text, size: 12 } },
          ];
          return {
            ...baseLayout,
            title: { ...baseLayout.title, text: exportConfig.includeTitle ? `Catálogo FFT Overall RMS — ${getChannelLabel(activeChannel)}` : '' },
            showlegend: false,
            margin: { l: 78, r: 32, t: 82, b: 58 },
            paper_bgcolor: catalogTheme.paperBackground,
            plot_bgcolor: catalogTheme.plotBackground,
            font: { color: catalogTheme.mutedText, family: 'Inter, Arial, sans-serif', size: chartConfig.axisFontSize },
            xaxis: makeXAxis(leftDomain, 'y'),
            yaxis: makeYAxis(topDomain, 'x', 'Accel (G)'),
            xaxis2: makeXAxis(rightDomain, 'y2'),
            yaxis2: makeYAxis(topDomain, 'x2', 'Velocity (mm/sec)'),
            xaxis3: makeXAxis(leftDomain, 'y3'),
            yaxis3: makeYAxis(bottomDomain, 'x3', 'Displacement (mm)'),
            annotations,
            hoverlabel: { bgcolor: catalogTheme.hoverBackground, bordercolor: catalogTheme.hoverBorder, font: { color: catalogTheme.text } },
          };
        }

        const accelLimit = niceSymmetricLimit([
          vibrationDataSeries.full.accelerationG,
          vibrationDataSeries.zoom.accelerationG,
        ]);
        const velocityLimit = niceSymmetricLimit([
          vibrationDataSeries.full.velocityMmS,
          vibrationDataSeries.zoom.velocityMmS,
        ]);
        const displacementLimit = niceSymmetricLimit([
          vibrationDataSeries.full.displacementMm,
          vibrationDataSeries.zoom.displacementMm,
        ]);
        const fullRange = filteredData.time.length
          ? [filteredData.time[0], filteredData.time[filteredData.time.length - 1]]
          : timeRange;
        if (plotCatalogTimeLayout === 'stacked') {
          const fullDomain = [0, 1];
          const row1Domain = [0.70, 1];
          const row2Domain = [0.35, 0.65];
          const row3Domain = [0, 0.30];
          const makeXAxis = (domain: number[], yRef: string, showTitle = true) => ({
            ...axisBase,
            domain,
            anchor: yRef,
            range: fullRange,
            title: { text: showTitle ? 'Time (sec)' : '', font: { color: catalogTheme.text, size: chartConfig.axisFontSize } },
          });
          const makeYAxis = (domain: number[], xRef: string, label: string, limit: number) => ({
            ...axisBase,
            domain,
            anchor: xRef,
            range: [-limit, limit],
            title: { text: label, font: { color: catalogTheme.text, size: chartConfig.axisFontSize } },
          });

          return {
            ...baseLayout,
            title: {
              ...baseLayout.title,
              text: exportConfig.includeTitle ? `VibrationData Time Histories — ${getChannelLabel(activeChannel)}` : '',
            },
            showlegend: false,
            margin: { l: 84, r: 34, t: 76, b: 58 },
            paper_bgcolor: catalogTheme.paperBackground,
            plot_bgcolor: catalogTheme.plotBackground,
            font: { color: catalogTheme.mutedText, family: 'Inter, Arial, sans-serif', size: chartConfig.axisFontSize },
            xaxis: makeXAxis(fullDomain, 'y', false),
            yaxis: makeYAxis(row1Domain, 'x', 'Accel (G)', accelLimit),
            xaxis2: makeXAxis(fullDomain, 'y2', false),
            yaxis2: makeYAxis(row2Domain, 'x2', 'Velocity (mm/s)', velocityLimit),
            xaxis3: makeXAxis(fullDomain, 'y3', true),
            yaxis3: makeYAxis(row3Domain, 'x3', 'Displacement (mm)', displacementLimit),
            annotations: [
              { text: 'Acceleration Time History', x: 0.5, y: 1.04, xref: 'paper', yref: 'paper', showarrow: false, font: { color: catalogTheme.text, size: 13 } },
              { text: 'Velocity Time History', x: 0.5, y: 0.67, xref: 'paper', yref: 'paper', showarrow: false, font: { color: catalogTheme.text, size: 13 } },
              { text: 'Displacement Time History', x: 0.5, y: 0.32, xref: 'paper', yref: 'paper', showarrow: false, font: { color: catalogTheme.text, size: 13 } },
            ],
            hoverlabel: { bgcolor: catalogTheme.hoverBackground, bordercolor: catalogTheme.hoverBorder, font: { color: catalogTheme.text } },
          };
        }
        const zoomRange: [number, number] = [
          Math.min(historyZoomRange[0], historyZoomRange[1]),
          Math.max(historyZoomRange[0], historyZoomRange[1]),
        ];
        const leftDomain = [0, 0.47];
        const rightDomain = [0.53, 1];
        const row1Domain = [0.70, 1];
        const row2Domain = [0.35, 0.65];
        const row3Domain = [0, 0.30];
        const makeXAxis = (domain: number[], yRef: string, range: number[], showTitle = false) => ({
          ...axisBase,
          domain,
          anchor: yRef,
          range,
          title: { text: showTitle ? 'Time (sec)' : '', font: { color: catalogTheme.text, size: chartConfig.axisFontSize } },
        });
        const makeYAxis = (domain: number[], xRef: string, label: string, limit: number) => ({
          ...axisBase,
          domain,
          anchor: xRef,
          range: [-limit, limit],
          title: { text: label, font: { color: catalogTheme.text, size: chartConfig.axisFontSize } },
        });

        return {
          ...baseLayout,
          title: {
            ...baseLayout.title,
            text: exportConfig.includeTitle ? `VibrationData Time Histories — ${getChannelLabel(activeChannel)}` : '',
          },
          showlegend: false,
          margin: { l: 78, r: 32, t: 78, b: 58 },
          paper_bgcolor: catalogTheme.paperBackground,
          plot_bgcolor: catalogTheme.plotBackground,
          xaxis: makeXAxis(leftDomain, 'y', fullRange),
          yaxis: makeYAxis(row1Domain, 'x', 'Accel (G)', accelLimit),
          xaxis2: makeXAxis(rightDomain, 'y2', zoomRange),
          yaxis2: makeYAxis(row1Domain, 'x2', 'Accel (G)', accelLimit),
          xaxis3: makeXAxis(leftDomain, 'y3', fullRange),
          yaxis3: makeYAxis(row2Domain, 'x3', 'Velocity (mm/s)', velocityLimit),
          xaxis4: makeXAxis(rightDomain, 'y4', zoomRange),
          yaxis4: makeYAxis(row2Domain, 'x4', 'Velocity (mm/s)', velocityLimit),
          xaxis5: makeXAxis(leftDomain, 'y5', fullRange, true),
          yaxis5: makeYAxis(row3Domain, 'x5', 'Displacement (mm)', displacementLimit),
          xaxis6: makeXAxis(rightDomain, 'y6', zoomRange, true),
          yaxis6: makeYAxis(row3Domain, 'x6', 'Displacement (mm)', displacementLimit),
          annotations: [
            { text: 'Acceleration Time History', x: 0.235, y: 1.04, xref: 'paper', yref: 'paper', showarrow: false, font: { color: catalogTheme.text, size: 13 } },
            { text: 'Acceleration Time History', x: 0.765, y: 1.04, xref: 'paper', yref: 'paper', showarrow: false, font: { color: catalogTheme.text, size: 13 } },
            { text: 'Velocity Time History', x: 0.235, y: 0.67, xref: 'paper', yref: 'paper', showarrow: false, font: { color: catalogTheme.text, size: 13 } },
            { text: 'Velocity Time History', x: 0.765, y: 0.67, xref: 'paper', yref: 'paper', showarrow: false, font: { color: catalogTheme.text, size: 13 } },
            { text: 'Displacement Time History', x: 0.235, y: 0.32, xref: 'paper', yref: 'paper', showarrow: false, font: { color: catalogTheme.text, size: 13 } },
            { text: 'Displacement Time History', x: 0.765, y: 0.32, xref: 'paper', yref: 'paper', showarrow: false, font: { color: catalogTheme.text, size: 13 } },
          ],
          hoverlabel: { bgcolor: catalogTheme.hoverBackground, bordercolor: catalogTheme.hoverBorder, font: { color: catalogTheme.text } },
        };
      }

      if (activeView === 'integration' && integrationOutput === 'both') {
        return {
          ...baseLayout,
          margin: { ...baseLayout.margin, r: 86 },
          yaxis: {
            ...baseLayout.yaxis,
            title: { text: 'Velocidad, v (m/s)', font: { color: plotTheme.text, size: chartConfig.axisFontSize + 1 } },
          },
          yaxis2: {
            title: { text: `Desplazamiento, u (${displacementDisplayLabel})`, font: { color: plotTheme.text, size: chartConfig.axisFontSize + 1 } },
            overlaying: 'y' as const,
            side: 'right' as const,
            gridcolor: 'transparent',
            zerolinecolor: plotTheme.zeroLine,
            linecolor: plotTheme.axisLine,
            tickfont: { color: plotTheme.subtleText, size: chartConfig.axisFontSize },
            color: plotTheme.mutedText,
            linewidth: 1,
          },
        };
      }

      if (activeView !== 'waterfall') return baseLayout;

      return {
        ...baseLayout,
        margin: { l: 0, r: 0, t: 68, b: 0 },
        scene: {
          bgcolor: plotTheme.plotBackground,
          camera: { eye: { x: 1.55, y: -1.75, z: 1.25 } },
          xaxis: {
            title: { text: 'Frecuencia, f (Hz)', font: { color: plotTheme.text } },
            gridcolor: plotTheme.grid,
            zerolinecolor: plotTheme.zeroLine,
            linecolor: plotTheme.axisLine,
            tickfont: { color: plotTheme.subtleText },
          },
          yaxis: {
            title: { text: 'Tiempo, t (s)', font: { color: plotTheme.text } },
            gridcolor: plotTheme.grid,
            zerolinecolor: plotTheme.zeroLine,
            linecolor: plotTheme.axisLine,
            tickfont: { color: plotTheme.subtleText },
          },
          zaxis: {
            title: { text: `Amplitud FFT (${unit})`, font: { color: plotTheme.text } },
            gridcolor: plotTheme.grid,
            zerolinecolor: plotTheme.zeroLine,
            linecolor: plotTheme.axisLine,
            tickfont: { color: plotTheme.subtleText },
          },
        },
      };
    },
    [activeChannel, activeView, axisLabels, chartConfig.axisFontSize, chartConfig.showGrid, displacementDisplayLabel, exportConfig.includeTitle, filteredData.time, getPlotLayout, historyZoomRange, integrationOutput, plotCatalogMode, plotCatalogStyle, plotCatalogTimeLayout, plotTheme, timeRange, unit, vibrationDataSeries, vibrationSpectra]
  );

  const withPlotDataLabels = useCallback((plot: any) => {
    const labels = plotDataLabels[plot.id] ?? [];
    if (labels.length === 0) return plot;

    const existingAnnotations = Array.isArray(plot.layout?.annotations) ? plot.layout.annotations : [];
    const labelAnnotations = labels.map((label, index) => ({
      name: label.id,
      labelId: label.id,
      x: label.x,
      y: label.y,
      xref: label.xref,
      yref: label.yref,
      text: label.text,
      showarrow: true,
      captureevents: true,
      arrowhead: 3,
      arrowsize: 1,
      arrowwidth: 1.1,
      arrowcolor: '#2563EB',
      ax: label.ax ?? 42,
      ay: label.ay ?? (-46 - (index % 3) * 10),
      align: 'left',
      opacity: 0.97,
      bgcolor: plotCatalogStyle === 'publication' ? 'rgba(248,250,252,0.98)' : plotTheme.hoverBackground,
      bordercolor: '#2563EB',
      borderwidth: 1,
      borderpad: 5,
      font: {
        color: plotTheme.text,
        size: 11,
        family: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
      },
    }));

    return {
      ...plot,
      layout: {
        ...plot.layout,
        annotations: [...existingAnnotations, ...labelAnnotations],
      },
    };
  }, [plotCatalogStyle, plotDataLabels, plotTheme]);

  const singleActivePlotId = `single_${activeView}_${activeChannel}`;
  const singleActivePlotLayout = useMemo(
    () => withPlotDataLabels({ id: singleActivePlotId, layout: plotLayout }).layout,
    [plotLayout, singleActivePlotId, withPlotDataLabels]
  );
  const annotationEditConfig = useMemo(() => ({
    editable: true,
    edits: {
      annotationPosition: true,
      annotationTail: true,
      annotationText: false,
      axisTitleText: false,
      colorbarPosition: false,
      colorbarTitleText: false,
      legendPosition: false,
      legendText: false,
      shapePosition: false,
      titleText: false,
    },
  }), []);

  const catalogPlotDefinitions = useMemo(() => {
    if (!signalData || activeView !== 'vibrationdata') return [];

    const catalogTheme = plotCatalogStyle === 'publication'
      ? {
        paperBackground: '#ffffff',
        plotBackground: '#ffffff',
        text: '#111827',
        mutedText: '#374151',
        subtleText: '#4B5563',
        grid: 'rgba(0,0,0,0.12)',
        zeroLine: 'rgba(0,0,0,0.30)',
        axisLine: 'rgba(0,0,0,0.45)',
        hoverBackground: '#ffffff',
        hoverBorder: 'rgba(0,0,0,0.25)',
      }
      : plotTheme;
    const lineColor = '#0072BD';
    const markerColor = '#6B4E00';
    const axisBase = {
      showgrid: chartConfig.showGrid,
      gridcolor: chartConfig.showGrid ? catalogTheme.grid : 'transparent',
      zerolinecolor: catalogTheme.zeroLine,
      linecolor: catalogTheme.axisLine,
      showline: true,
      mirror: true,
      ticks: 'outside' as const,
      tickfont: { color: catalogTheme.subtleText, size: chartConfig.axisFontSize },
      color: catalogTheme.mutedText,
      linewidth: 1,
    };
    const fullRange = filteredData.time.length
      ? [filteredData.time[0], filteredData.time[filteredData.time.length - 1]]
      : timeRange;
    const zoomRange: [number, number] = [
      Math.min(historyZoomRange[0], historyZoomRange[1]),
      Math.max(historyZoomRange[0], historyZoomRange[1]),
    ];
    const safeBase = (fileName || 'signal').replace(/\.[^/.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();

    const baseLayout = (title: string, xTitle: string, yTitle: string, extra: any = {}) => ({
      title: {
        text: exportConfig.includeTitle ? title : '',
        font: { color: catalogTheme.text, size: Math.max(12, chartConfig.titleFontSize - 2), family: 'Inter, Arial, sans-serif' },
        x: 0.02,
        xanchor: 'left' as const,
      },
      paper_bgcolor: catalogTheme.paperBackground,
      plot_bgcolor: catalogTheme.plotBackground,
      font: { color: catalogTheme.mutedText, family: 'Inter, Arial, sans-serif', size: chartConfig.axisFontSize },
      xaxis: {
        ...axisBase,
        title: { text: xTitle, font: { color: catalogTheme.text, size: chartConfig.axisFontSize } },
      },
      yaxis: {
        ...axisBase,
        title: { text: yTitle, font: { color: catalogTheme.text, size: chartConfig.axisFontSize } },
      },
      showlegend: false,
      hoverlabel: { bgcolor: catalogTheme.hoverBackground, bordercolor: catalogTheme.hoverBorder, font: { color: catalogTheme.text } },
      margin: { l: 74, r: 28, t: 58, b: 58 },
      autosize: true,
      ...extra,
    });

    const makeLineTrace = (x: number[], y: number[], title: string, unitLabel: string, useDownsample = true) => {
      const series = useDownsample ? downsampleMinMax(x, y, MAX_TIME_PLOT_POINTS / 2) : { x, y };
      return {
        x: series.x,
        y: series.y,
        type: 'scattergl' as const,
        mode: 'lines' as const,
        name: title,
        line: { color: lineColor, width: Math.max(0.85, chartConfig.lineWidth * 0.75) },
        hovertemplate: `<b>${title}</b><br>${unitLabel.includes('Hz') ? 'Frequency' : 'Time'}: %{x:.5g}${unitLabel.includes('Hz') ? ' Hz' : ' sec'}<br>${unitLabel}: %{y:.6g}<extra></extra>`,
      };
    };

    const makeTimePlot = (
      id: string,
      title: string,
      unitLabel: string,
      time: number[],
      values: number[],
      limit: number,
      range: number[]
    ) => ({
      id,
      title,
      divId: `signal_catalog_${id}`,
      filename: `${safeBase}_${id}`,
      height: 330,
      data: [makeLineTrace(time, values, title, unitLabel)],
      layout: baseLayout(title, 'Time (sec)', unitLabel, {
        xaxis: {
          ...axisBase,
          range,
          title: { text: 'Time (sec)', font: { color: catalogTheme.text, size: chartConfig.axisFontSize } },
        },
        yaxis: {
          ...axisBase,
          range: [-limit, limit],
          title: { text: unitLabel, font: { color: catalogTheme.text, size: chartConfig.axisFontSize } },
        },
      }),
    });

    const plots: Array<{ id: string; title: string; divId: string; filename: string; height: number; data: any[]; layout: any }> = [];

    if (plotCatalogMode === 'time_histories') {
      const accelLimit = niceSymmetricLimit([vibrationDataSeries.full.accelerationG, vibrationDataSeries.zoom.accelerationG]);
      const velocityLimit = niceSymmetricLimit([vibrationDataSeries.full.velocityMmS, vibrationDataSeries.zoom.velocityMmS]);
      const displacementLimit = niceSymmetricLimit([vibrationDataSeries.full.displacementMm, vibrationDataSeries.zoom.displacementMm]);
      plots.push(
        makeTimePlot('acceleration_time_history', 'Acceleration Time History', 'Accel (G)', vibrationDataSeries.full.time, vibrationDataSeries.full.accelerationG, accelLimit, fullRange),
        makeTimePlot('velocity_time_history', 'Velocity Time History', 'Velocity (mm/s)', vibrationDataSeries.full.time, vibrationDataSeries.full.velocityMmS, velocityLimit, fullRange),
        makeTimePlot('displacement_time_history', 'Displacement Time History', 'Displacement (mm)', vibrationDataSeries.full.time, vibrationDataSeries.full.displacementMm, displacementLimit, fullRange)
      );

      if (plotCatalogTimeLayout === 'full_zoom') {
        plots.push(
          makeTimePlot('acceleration_time_history_zoom', 'Acceleration Time History — Zoom', 'Accel (G)', vibrationDataSeries.zoom.time, vibrationDataSeries.zoom.accelerationG, accelLimit, zoomRange),
          makeTimePlot('velocity_time_history_zoom', 'Velocity Time History — Zoom', 'Velocity (mm/s)', vibrationDataSeries.zoom.time, vibrationDataSeries.zoom.velocityMmS, velocityLimit, zoomRange),
          makeTimePlot('displacement_time_history_zoom', 'Displacement Time History — Zoom', 'Displacement (mm)', vibrationDataSeries.zoom.time, vibrationDataSeries.zoom.displacementMm, displacementLimit, zoomRange)
        );
      }
      return plots.map(withPlotDataLabels);
    }

    const makeFftPhasePlot = (
      id: string,
      title: string,
      spectrum: typeof vibrationSpectra.acceleration,
      unitLabel: string
    ) => {
      const magLimit = Math.max(...spectrum.amplitudes.filter(Number.isFinite), 0) * 1.12 || 1;
      const data: any[] = [
        {
          x: spectrum.frequencies,
          y: spectrum.phasesDeg,
          type: 'scattergl' as const,
          mode: 'lines' as const,
          name: `${title} Phase`,
          line: { color: lineColor, width: 1 },
          hovertemplate: `<b>${title} Phase</b><br>Frequency: %{x:.4g} Hz<br>Phase: %{y:.3g} deg<extra></extra>`,
        },
        {
          x: spectrum.frequencies,
          y: spectrum.amplitudes,
          type: 'scattergl' as const,
          mode: 'lines' as const,
          name: `${title} Magnitude`,
          xaxis: 'x2',
          yaxis: 'y2',
          line: { color: lineColor, width: 1 },
          hovertemplate: `<b>${title} Magnitude</b><br>Frequency: %{x:.4g} Hz<br>${unitLabel}: %{y:.6g}<extra></extra>`,
        },
      ];
      return {
        id,
        title: `${title} Magnitude & Phase`,
        divId: `signal_catalog_${id}`,
        filename: `${safeBase}_${id}`,
        height: 430,
        data,
        layout: baseLayout(`${title} Magnitude & Phase`, 'Frequency (Hz)', 'Phase (deg)', {
          margin: { l: 76, r: 30, t: 58, b: 58 },
          xaxis: {
            ...axisBase,
            domain: [0, 1],
            anchor: 'y',
            title: { text: '', font: { color: catalogTheme.text, size: chartConfig.axisFontSize } },
          },
          yaxis: {
            ...axisBase,
            domain: [0.62, 1],
            anchor: 'x',
            range: [-180, 180],
            title: { text: 'Phase (deg)', font: { color: catalogTheme.text, size: chartConfig.axisFontSize } },
          },
          xaxis2: {
            ...axisBase,
            domain: [0, 1],
            anchor: 'y2',
            title: { text: 'Frequency (Hz)', font: { color: catalogTheme.text, size: chartConfig.axisFontSize } },
          },
          yaxis2: {
            ...axisBase,
            domain: [0, 0.48],
            anchor: 'x2',
            range: [0, magLimit],
            title: { text: unitLabel, font: { color: catalogTheme.text, size: chartConfig.axisFontSize } },
          },
        }),
      };
    };

    if (plotCatalogMode === 'fft_phase') {
      return [
        makeFftPhasePlot('acceleration_fft_phase', 'Acceleration FFT', vibrationSpectra.acceleration, 'Accel (G)'),
        makeFftPhasePlot('velocity_fft_phase', 'Velocity FFT', vibrationSpectra.velocity, 'Velocity (mm/s)'),
        makeFftPhasePlot('displacement_fft_phase', 'Displacement FFT', vibrationSpectra.displacement, 'Displacement (mm)'),
      ].map(withPlotDataLabels);
    }

    const makeOverallPlot = (
      id: string,
      title: string,
      spectrum: typeof vibrationSpectra.acceleration,
      unitLabel: string,
      rmsLabel: string
    ) => {
      const floor = getPositiveMagnitudeFloor(spectrum.amplitudes);
      const x: number[] = [];
      const y: number[] = [];
      for (let i = 0; i < spectrum.frequencies.length; i++) {
        const frequency = spectrum.frequencies[i];
        const amplitude = spectrum.amplitudes[i];
        if (Number.isFinite(frequency) && frequency > 0 && Number.isFinite(amplitude)) {
          x.push(frequency);
          y.push(Math.max(amplitude, floor));
        }
      }
      const data: any[] = [
        {
          x,
          y,
          type: 'scattergl' as const,
          mode: 'lines' as const,
          name: title,
          line: { color: lineColor, width: 1 },
          hovertemplate: `<b>${title}</b><br>Frequency: %{x:.4g} Hz<br>${unitLabel}: %{y:.6g}<extra></extra>`,
        },
      ];
      return {
        id,
        title,
        divId: `signal_catalog_${id}`,
        filename: `${safeBase}_${id}`,
        height: 390,
        data,
        layout: baseLayout(`${title} — Overall ${rmsLabel}`, 'Frequency (Hz)', unitLabel, {
          xaxis: {
            ...axisBase,
            type: 'log' as const,
            title: { text: 'Frequency (Hz)', font: { color: catalogTheme.text, size: chartConfig.axisFontSize } },
          },
          yaxis: {
            ...axisBase,
            type: 'log' as const,
            title: { text: unitLabel, font: { color: catalogTheme.text, size: chartConfig.axisFontSize } },
          },
        }),
      };
    };

    const rms = {
      acc: computeStats(vibrationDataSeries.full.accelerationG).rms,
      vel: computeStats(vibrationDataSeries.full.velocityMmS).rms,
      disp: computeStats(vibrationDataSeries.full.displacementMm).rms,
    };

    return [
      makeOverallPlot('acceleration_fft_overall', 'Acceleration FFT Magnitude', vibrationSpectra.acceleration, 'Accel (G)', `${formatEngineeringValue(rms.acc, 3)} GRMS`),
      makeOverallPlot('velocity_fft_overall', 'Velocity FFT Magnitude', vibrationSpectra.velocity, 'Velocity (mm/sec)', `${formatEngineeringValue(rms.vel, 3)} mm/sec RMS`),
      makeOverallPlot('displacement_fft_overall', 'Displacement FFT Magnitude', vibrationSpectra.displacement, 'Displacement (mm)', `${formatEngineeringValue(rms.disp, 5)} mm RMS`),
    ].map(withPlotDataLabels);
  }, [
    activeView,
    chartConfig.axisFontSize,
    chartConfig.lineWidth,
    chartConfig.showGrid,
    chartConfig.titleFontSize,
    exportConfig.includeTitle,
    fileName,
    filteredData.time,
    historyZoomRange,
    plotCatalogMode,
    plotCatalogStyle,
    plotCatalogTimeLayout,
    plotTheme,
    signalData,
    timeRange,
    vibrationDataSeries,
    vibrationSpectra,
    withPlotDataLabels,
  ]);

  const parallelChannelPlotDefinitions = useMemo(() => {
    if (!signalData || activeView === 'vibrationdata' || channelViewMode === 'single') return [];

    const channels: Channel[] = channelViewMode === 'all_parallel' || channelViewMode === 'all_overlay'
      ? ['acc_x', 'acc_y', 'acc_z', 'resultant']
      : ['acc_x', 'acc_y', 'acc_z'];
    const overlayMode = channelViewMode === 'xyz_overlay' || channelViewMode === 'all_overlay';
    const palette = COLOR_PALETTES[colorPalette];
    const safeBase = (fileName || 'signal').replace(/\.[^/.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();

    const makeBaseLayout = (channel: Channel, title: string, xTitle: string, yTitle: string, extra: any = {}) => ({
      ...getPlotLayout(`${title} — ${getChannelLabel(channel)}`, xTitle, yTitle),
      title: {
        text: exportConfig.includeTitle ? `${title} — ${getChannelLabel(channel)}` : '',
        font: { color: plotTheme.text, size: Math.max(12, chartConfig.titleFontSize - 2), family: 'Inter, Arial, sans-serif' },
        x: 0.02,
        xanchor: 'left' as const,
      },
      margin: { l: 74, r: activeView === 'integration' && integrationOutput === 'both' ? 84 : 30, t: 58, b: 58 },
      ...extra,
    });

    const makeTimeLine = (channel: Channel, time: number[], values: number[], name: string, color: string, unitLabel: string) => {
      const decimated = downsampleMinMax(time, values, MAX_TIME_PLOT_POINTS / 2);
      return {
        x: decimated.x,
        y: decimated.y,
        type: 'scattergl' as const,
        mode: 'lines' as const,
        name,
        line: { color, width: chartConfig.lineWidth },
        hovertemplate: `<b>${name} — ${getChannelLabel(channel)}</b><br>Tiempo: %{x:.3f} s<br>${unitLabel}: %{y:.6g}<extra></extra>`,
      };
    };

    const buildWaterfall = (channel: Channel, time: number[], data: number[]) => {
      const segmentSize = Math.min(1024, Math.max(128, floorPowerOfTwo(Math.floor(data.length / 24) || 128)));
      const nSegments = Math.floor(data.length / segmentSize);
      const z: number[][] = [];
      const times: number[] = [];
      let freqAxis: number[] = [];

      for (let s = 0; s < Math.min(nSegments, 24); s++) {
        const start = s * segmentSize;
        const segment = data.slice(start, start + segmentSize);
        const { frequencies, amplitudes } = computeLocalFFT(segment, samplingRate);
        if (freqAxis.length === 0) freqAxis = frequencies.slice(0, 60);
        z.push(amplitudes.slice(0, 60));
        times.push(time[start]);
      }

      return [{
        x: freqAxis,
        y: times,
        z,
        type: 'surface' as const,
        colorscale: 'Viridis',
        showscale: true,
        contours: {
          z: { show: true, usecolormap: true, highlightcolor: plotTheme.text, project: { z: true } },
        },
        colorbar: {
          title: { text: `Amplitud FFT (${unit})`, font: { color: plotTheme.text } },
          tickfont: { color: plotTheme.subtleText },
          bgcolor: plotTheme.paperBackground,
        },
        hovertemplate: `<b>Waterfall — ${getChannelLabel(channel)}</b><br>Frecuencia: %{x:.3f} Hz<br>Tiempo: %{y:.3f} s<br>Amplitud: %{z:.5g} ${unit}<extra></extra>`,
      }];
    };

    if (overlayMode && activeView !== 'waterfall') {
      const time = allChannelsData.time;
      const titleByView: Record<string, string> = {
        time: 'Time History superpuesto',
        fft: 'FFT superpuesto',
        psd: 'PSD Welch superpuesto',
        envelope: 'Envolventes superpuestas',
        integration: 'Integración superpuesta',
      };
      const title = titleByView[activeView] ?? 'Señales superpuestas';
      const traces: any[] = [];
      let layout: any = makeBaseLayout('acc_x', title, 'Tiempo (s)', `Amplitud (${unit})`, { showlegend: true });

      if (activeView === 'time') {
        channels.forEach((channel) => {
          traces.push(makeTimeLine(channel, time, allChannelsData[channel], getChannelLabel(channel), palette[channel], `Amplitud (${unit})`));
        });
        layout = makeBaseLayout('acc_x', title, 'Tiempo (s)', `Amplitud (${unit})`, { showlegend: true });
      } else if (activeView === 'fft') {
        channels.forEach((channel) => {
          const spectrum = getVibrationBackendResult(channel)?.fft.acceleration;
          if (!spectrum) return;
          traces.push({
            x: spectrum.frequencies,
            y: spectrum.amplitudes,
            type: 'scattergl' as const,
            mode: 'lines' as const,
            name: getChannelLabel(channel),
            line: { color: palette[channel], width: chartConfig.lineWidth },
            hovertemplate: `<b>FFT — ${getChannelLabel(channel)}</b><br>Frecuencia: %{x:.3f} Hz<br>Amplitud: %{y:.6g} ${unit}<extra></extra>`,
          });
        });
        layout = makeBaseLayout('acc_x', title, 'Frecuencia (Hz)', `Amplitud (${unit})`, { showlegend: true });
      } else if (activeView === 'psd') {
        channels.forEach((channel) => {
          const spectrum = getVibrationBackendResult(channel)?.psd.acceleration;
          if (!spectrum) return;
          traces.push({
            x: spectrum.frequencies,
            y: spectrum.psd,
            type: 'scattergl' as const,
            mode: 'lines' as const,
            name: getChannelLabel(channel),
            line: { color: palette[channel], width: chartConfig.lineWidth },
            hovertemplate: `<b>PSD — ${getChannelLabel(channel)}</b><br>Frecuencia: %{x:.3f} Hz<br>PSD: %{y:.6g} ${spectrum.unit}<extra></extra>`,
          });
        });
        layout = makeBaseLayout('acc_x', title, 'Frecuencia (Hz)', `PSD (${unit}²/Hz)`, { showlegend: true });
      } else if (activeView === 'envelope') {
        channels.forEach((channel) => {
          const envelope = computeEnvelopeFast(allChannelsData[channel], samplingRate);
          traces.push(makeTimeLine(channel, time, envelope, `Envolvente ${getChannelLabel(channel)}`, palette[channel], `Amplitud (${unit})`));
        });
        layout = makeBaseLayout('acc_x', title, 'Tiempo (s)', `Amplitud (${unit})`, { showlegend: true });
      } else if (activeView === 'integration') {
        channels.forEach((channel) => {
          const backendResult = getVibrationBackendResult(channel);
          if (!backendResult) return;
          const kinematics = buildKinematicsDataFromBackend(backendResult);
          const backendTime = backendResult.time_histories.time;
          if (integrationOutput === 'velocity' || integrationOutput === 'both') {
            const velocityTrace = downsampleMinMax(backendTime, kinematics.velocityMps, MAX_TIME_PLOT_POINTS / 2);
            traces.push({
              x: velocityTrace.x,
              y: velocityTrace.y,
              type: 'scattergl' as const,
              mode: 'lines' as const,
              name: `V ${getChannelLabel(channel)}`,
              line: { color: palette[channel], width: chartConfig.lineWidth },
              hovertemplate: `<b>Velocidad — ${getChannelLabel(channel)}</b><br>Tiempo: %{x:.3f} s<br>v: %{y:.6g} m/s<extra></extra>`,
            });
          }
          if (integrationOutput === 'displacement' || integrationOutput === 'both') {
            const displacementValues = kinematics.displacementM.map((value) => value * displacementDisplayFactor);
            const displacementTrace = downsampleMinMax(backendTime, displacementValues, MAX_TIME_PLOT_POINTS / 2);
            traces.push({
              x: displacementTrace.x,
              y: displacementTrace.y,
              type: 'scattergl' as const,
              mode: 'lines' as const,
              name: `U ${getChannelLabel(channel)}`,
              line: { color: palette[channel], width: Math.max(0.75, chartConfig.lineWidth * 0.9), dash: integrationOutput === 'both' ? 'dot' as const : 'solid' as const },
              hovertemplate: `<b>Desplazamiento — ${getChannelLabel(channel)}</b><br>Tiempo: %{x:.3f} s<br>u: %{y:.6g} ${displacementDisplayLabel}<extra></extra>`,
            });
          }
        });
        layout = makeBaseLayout(
          'acc_x',
          title,
          'Tiempo (s)',
          integrationOutput === 'displacement' ? `Desplazamiento (${displacementDisplayLabel})` : integrationOutput === 'velocity' ? 'Velocidad (m/s)' : `V (m/s) / U (${displacementDisplayLabel})`,
          { showlegend: true }
        );
      }

      const suffix = channelViewMode === 'all_overlay' ? 'xyzr_overlay' : 'xyz_overlay';
      return [{
        id: `overlay_${activeView}_${suffix}`,
        divId: `signal_overlay_${activeView}_${suffix}`,
        title,
        filename: `${safeBase}_${activeView}_${suffix}`,
        height: activeView === 'integration' ? 390 : 340,
        data: traces,
        layout,
      }].map(withPlotDataLabels);
    }

    return channels.map((channel) => {
      const time = allChannelsData.time;
      const data = allChannelsData[channel];
      const color = palette[channel];
      const suffix = channel.replace('_', '');
      let title = 'Time History';
      let height = 300;
      let traces: any[] = [];
      let layout: any = makeBaseLayout(channel, title, 'Tiempo (s)', `Amplitud (${unit})`);

      if (activeView === 'time') {
        title = 'Time History';
        traces = [makeTimeLine(channel, time, data, channel.toUpperCase(), color, `Amplitud (${unit})`)];
        layout = makeBaseLayout(channel, title, 'Tiempo (s)', `Amplitud (${unit})`);
      } else if (activeView === 'fft') {
        title = 'FFT';
        const spectrum = getVibrationBackendResult(channel)?.fft.acceleration;
        traces = [{
          x: spectrum?.frequencies ?? [],
          y: spectrum?.amplitudes ?? [],
          type: 'scattergl' as const,
          mode: 'lines' as const,
          name: `FFT enDAQ ${getChannelLabel(channel)}`,
          line: { color, width: chartConfig.lineWidth },
          hovertemplate: `<b>FFT — ${getChannelLabel(channel)}</b><br>Frecuencia: %{x:.3f} Hz<br>Amplitud: %{y:.6g} ${unit}<extra></extra>`,
        }];
        layout = makeBaseLayout(channel, title, 'Frecuencia (Hz)', `Amplitud (${unit})`);
      } else if (activeView === 'psd') {
        title = 'PSD Welch';
        const spectrum = getVibrationBackendResult(channel)?.psd.acceleration;
        traces = [{
          x: spectrum?.frequencies ?? [],
          y: spectrum?.psd ?? [],
          type: 'scattergl' as const,
          mode: 'lines' as const,
          name: `PSD enDAQ ${getChannelLabel(channel)}`,
          line: { color, width: chartConfig.lineWidth },
          hovertemplate: `<b>PSD — ${getChannelLabel(channel)}</b><br>Frecuencia: %{x:.3f} Hz<br>PSD: %{y:.6g} ${spectrum?.unit ?? `${unit}²/Hz`}<extra></extra>`,
        }];
        layout = makeBaseLayout(channel, title, 'Frecuencia (Hz)', `PSD (${unit}²/Hz)`);
      } else if (activeView === 'envelope') {
        title = 'Envelope';
        const envelope = computeEnvelopeFast(data, samplingRate);
        traces = [
          { ...makeTimeLine(channel, time, data, 'Señal', '#94A3B8', `Amplitud (${unit})`), opacity: 0.45, line: { color: '#94A3B8', width: 0.55 } },
          makeTimeLine(channel, time, envelope, 'Envolvente', color, `Amplitud (${unit})`),
        ];
        layout = makeBaseLayout(channel, title, 'Tiempo (s)', `Amplitud (${unit})`, { showlegend: true });
      } else if (activeView === 'integration') {
        title = 'Integración';
        const backendResult = getVibrationBackendResult(channel);
        const kinematics = buildKinematicsDataFromBackend(backendResult);
        const backendTime = backendResult?.time_histories.time ?? [];
        const velocityTrace = downsampleMinMax(backendTime, kinematics.velocityMps, MAX_TIME_PLOT_POINTS / 2);
        const displacementValues = kinematics.displacementM.map((value) => value * displacementDisplayFactor);
        const displacementTrace = downsampleMinMax(backendTime, displacementValues, MAX_TIME_PLOT_POINTS / 2);
        const velocityPlot = {
          x: velocityTrace.x,
          y: velocityTrace.y,
          type: 'scattergl' as const,
          mode: 'lines' as const,
          name: 'Velocidad v(t)',
          line: { color: '#06B6D4', width: chartConfig.lineWidth },
          hovertemplate: `<b>Velocidad — ${getChannelLabel(channel)}</b><br>Tiempo: %{x:.3f} s<br>v: %{y:.6g} m/s<extra></extra>`,
        };
        const displacementPlot = {
          x: displacementTrace.x,
          y: displacementTrace.y,
          type: 'scattergl' as const,
          mode: 'lines' as const,
          name: `Desplazamiento u(t)`,
          line: { color, width: chartConfig.lineWidth },
          hovertemplate: `<b>Desplazamiento — ${getChannelLabel(channel)}</b><br>Tiempo: %{x:.3f} s<br>u: %{y:.6g} ${displacementDisplayLabel}<extra></extra>`,
        };
        if (integrationOutput === 'velocity') traces = [velocityPlot];
        else if (integrationOutput === 'displacement') traces = [displacementPlot];
        else traces = [velocityPlot, { ...displacementPlot, yaxis: 'y2' as const }];
        layout = makeBaseLayout(channel, title, 'Tiempo (s)', integrationOutput === 'displacement' ? `Desplazamiento (${displacementDisplayLabel})` : 'Velocidad (m/s)', integrationOutput === 'both' ? {
          showlegend: true,
          yaxis2: {
            title: { text: `Desplazamiento (${displacementDisplayLabel})`, font: { color: plotTheme.text, size: chartConfig.axisFontSize + 1 } },
            overlaying: 'y' as const,
            side: 'right' as const,
            gridcolor: 'transparent',
            zerolinecolor: plotTheme.zeroLine,
            linecolor: plotTheme.axisLine,
            tickfont: { color: plotTheme.subtleText, size: chartConfig.axisFontSize },
            color: plotTheme.mutedText,
          },
        } : {});
      } else if (activeView === 'waterfall') {
        title = 'Waterfall';
        height = 380;
        traces = buildWaterfall(channel, time, data);
        layout = {
          ...makeBaseLayout(channel, title, 'Frecuencia (Hz)', 'Tiempo (s)', { margin: { l: 0, r: 0, t: 58, b: 0 } }),
          scene: {
            bgcolor: plotTheme.plotBackground,
            camera: { eye: { x: 1.55, y: -1.75, z: 1.25 } },
            xaxis: { title: { text: 'Frecuencia, f (Hz)', font: { color: plotTheme.text } }, gridcolor: plotTheme.grid, zerolinecolor: plotTheme.zeroLine, linecolor: plotTheme.axisLine, tickfont: { color: plotTheme.subtleText } },
            yaxis: { title: { text: 'Tiempo, t (s)', font: { color: plotTheme.text } }, gridcolor: plotTheme.grid, zerolinecolor: plotTheme.zeroLine, linecolor: plotTheme.axisLine, tickfont: { color: plotTheme.subtleText } },
            zaxis: { title: { text: `Amplitud FFT (${unit})`, font: { color: plotTheme.text } }, gridcolor: plotTheme.grid, zerolinecolor: plotTheme.zeroLine, linecolor: plotTheme.axisLine, tickfont: { color: plotTheme.subtleText } },
          },
        };
      }

      return {
        id: `parallel_${activeView}_${suffix}`,
        divId: `signal_parallel_${activeView}_${suffix}`,
        title: `${title} — ${getChannelLabel(channel)}`,
        filename: `${safeBase}_${activeView}_${suffix}`,
        height,
        data: traces,
        layout,
      };
    }).map(withPlotDataLabels);
  }, [
    activeView,
    allChannelsData,
    channelViewMode,
    chartConfig.axisFontSize,
    chartConfig.lineWidth,
    chartConfig.titleFontSize,
    colorPalette,
    computeLocalFFT,
    displacementDisplayFactor,
    displacementDisplayLabel,
    exportConfig.includeTitle,
    fileName,
    getPlotLayout,
    getVibrationBackendResult,
    integrationHighpassHz,
    integrationOutput,
    plotTheme,
    samplingRate,
    signalData,
    unit,
    withPlotDataLabels,
  ]);

  // ============ RENDER ============

  const viewOptions = [
    { id: 'time' as const, label: 'Time History', icon: Clock },
    { id: 'fft' as const, label: 'FFT', icon: BarChart3 },
    { id: 'psd' as const, label: 'PSD Welch', icon: Activity },
    { id: 'waterfall' as const, label: 'Waterfall', icon: Waves },
    { id: 'envelope' as const, label: 'Envelope', icon: SlidersHorizontal },
    { id: 'integration' as const, label: 'Integración', icon: Gauge },
    { id: 'vibrationdata' as const, label: 'A/V/D Plots', icon: Table2 },
  ];

  const channelOptions = [
    { id: 'acc_x' as const, label: 'ACC X' },
    { id: 'acc_y' as const, label: 'ACC Y' },
    { id: 'acc_z' as const, label: 'ACC Z' },
    { id: 'resultant' as const, label: 'Resultante 3D' },
  ];

  const activeViewLabel = viewOptions.find(view => view.id === activeView)?.label ?? 'Tiempo';
  const activeChannelLabel = channelOptions.find(channel => channel.id === activeChannel)?.label ?? activeChannel.toUpperCase();
  const spectralSummaryRows = buildSpectralSummaryRows(activeVibrationBackendResult, activeChannelLabel);
  const activePreprocessModes = normalizePreprocessModes(preprocessModes);
  const activePreprocessLabel = formatPreprocessPipeline(activePreprocessModes);
  const showSpectralControls = activeView === 'fft'
    || activeView === 'psd'
    || activeView === 'waterfall'
    || (activeView === 'vibrationdata' && plotCatalogMode !== 'time_histories');
  const showIntegrationControls = activeView === 'integration' || activeView === 'vibrationdata';
  const showCatalogControls = activeView === 'vibrationdata';
  const showCatalogTimeControls = activeView === 'vibrationdata' && plotCatalogMode === 'time_histories';
  const showPeakControls = activeView === 'vibrationdata' && plotCatalogMode !== 'time_histories';
  const showRobustFilterControls = [
    'impact_guard',
    'hampel',
    'mad_despike',
    'median',
    'anti_ski_slope',
  ].includes(preprocessMode);
  const showFrequencyFilterControls = [
    'anti_ski_slope',
    'lowpass',
    'highpass',
    'bandpass',
    'notch',
    'harmonic_notch',
  ].includes(preprocessMode);
  const showSmoothingFilterControls = [
    'moving_average',
    'exponential',
    'savgol',
  ].includes(preprocessMode);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-[#0a0a0a] transition-colors duration-300">
        <Navbar />
        <main className="flex-1 overflow-hidden relative">
          <div className="h-full w-full overflow-hidden flex flex-col-reverse lg:flex-row font-sans relative bg-white dark:bg-bg-dark">
            <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-20 z-0" />

            <aside className="relative z-40 w-full lg:w-[390px] xl:w-[440px] h-[52vh] lg:h-full flex flex-col bg-white/80 dark:bg-[#0B0F1A]/90 backdrop-blur-xl border-t lg:border-t-0 lg:border-r border-border-light dark:border-border-dark shrink-0 overflow-hidden overflow-x-hidden">
              <div className="shrink-0 p-3 lg:p-6 border-b border-border-light dark:border-border-dark">
                <div className="flex items-center justify-between gap-3 mb-4 lg:mb-5">
                  <div className="min-w-0">
                    <p className="hidden lg:block text-[9px] text-accent-primary font-bold uppercase tracking-[0.2em] mb-1 font-mono">
                      VibrationData-compatible · enDAQ backend
                    </p>
                    <h1 className="text-sm lg:text-2xl font-display font-black text-gray-900 dark:text-white uppercase tracking-tighter leading-none truncate">
                      Signal <span className="text-accent-primary">Processing</span>
                    </h1>
                    <p className="mt-1 text-[9px] lg:text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider truncate">
                      {fileName || 'Sin archivo'} · {signalData?.time.length || 0} muestras
                    </p>
                  </div>
                  <button
                    onClick={runAnalysis}
                    disabled={!signalData || isLoading}
                    className="shrink-0 flex items-center justify-center gap-1 bg-accent-primary hover:bg-accent-primary/90 disabled:opacity-50 text-white px-2.5 py-1.5 lg:px-5 lg:py-3 rounded-lg lg:rounded-xl font-display font-bold text-[9px] lg:text-xs uppercase tracking-wider shadow-lg transition-all active:scale-95 cursor-pointer"
                  >
                    {isLoading ? <Loader2 className="animate-spin" size={13} /> : <Play size={13} />}
                    <span className="hidden sm:inline">Analyze</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" id="file-upload" />
                  <label htmlFor="file-upload" className="flex items-center justify-center gap-2 rounded-xl bg-accent-primary hover:bg-accent-primary/90 px-3 py-2.5 text-[10px] lg:text-xs font-display font-black uppercase tracking-wider text-white shadow-lg transition-all active:scale-95 cursor-pointer">
                    <Upload size={14} />
                    CSV
                  </label>
                  <button onClick={handleGenerateSampleData} className="flex items-center justify-center gap-2 rounded-xl bg-accent-secondary hover:bg-accent-secondary/90 px-3 py-2.5 text-[10px] lg:text-xs font-display font-black uppercase tracking-wider text-white shadow-lg transition-all active:scale-95 cursor-pointer">
                    <Table2 size={14} />
                    Demo
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="premium-card-inner p-2 lg:p-3">
                    <label className="text-[7px] lg:text-[9px] font-bold text-gray-500 uppercase tracking-wider font-mono">fs (Hz)</label>
                    <input type="number" value={samplingRate} onChange={(e) => setSamplingRate(parseFloat(e.target.value))} className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-accent-primary focus:outline-none" />
                  </div>
                  <div className="premium-card-inner p-2 lg:p-3">
                    <label className="text-[7px] lg:text-[9px] font-bold text-gray-500 uppercase tracking-wider font-mono">Unidad</label>
                    <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-accent-primary focus:outline-none" />
                  </div>
                </div>

                {error && (
                  <div className="mt-3 p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-mono font-bold leading-relaxed">
                    {error}
                  </div>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar px-3 lg:px-6 py-3 lg:py-4 pb-6 space-y-3 lg:space-y-4">
                <div className="premium-card p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <Scissors size={14} className="mt-0.5 text-accent-primary shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[8px] font-mono font-black uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                          Recorte de señal
                        </div>
                        <div className="mt-0.5 text-sm font-display font-black text-gray-900 dark:text-white truncate">
                          {isFullRecordSelected ? 'Registro completo' : activeAnalysisWindow.label}
                        </div>
                        <div className="mt-0.5 text-[9px] font-mono font-bold text-gray-500 dark:text-gray-400">
                          {formatRange(activeAnalysisWindow.start, activeAnalysisWindow.end)} · {activeAnalysisWindow.duration.toFixed(3)} s · {activeAnalysisWindow.samples} muestras
                        </div>
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[8px] font-mono font-black uppercase shrink-0 ${
                      isFullRecordSelected
                        ? 'bg-accent-primary/15 text-accent-primary'
                        : activeAnalysisWindow.source === 'segment'
                          ? 'bg-accent-secondary/15 text-accent-secondary'
                          : 'bg-unsaac-gold/15 text-unsaac-gold'
                    }`}>
                      {isFullRecordSelected ? 'Todo' : activeAnalysisWindow.source === 'segment' ? 'Guardado' : 'Manual'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={selectFullRecordWindow}
                      disabled={!signalData}
                      className={`rounded-xl border px-2 py-2 text-[9px] font-display font-black uppercase tracking-wider transition-all ${
                        isFullRecordSelected
                          ? 'bg-accent-primary text-white border-accent-primary shadow-sm'
                          : 'bg-white/80 dark:bg-bg-dark border-border-light dark:border-border-dark text-gray-600 dark:text-gray-300 hover:border-accent-primary/40'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      Todo el registro
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSegment(null);
                        setAnalysisResults(null);
                        setLastAnalysisMeta(null);
                        setAnalysisStatus('Recorte manual activo. Ajuste inicio/fin y presione Analyze.');
                      }}
                      disabled={!signalData}
                      className={`rounded-xl border px-2 py-2 text-[9px] font-display font-black uppercase tracking-wider transition-all ${
                        !isFullRecordSelected && activeAnalysisWindow.source === 'manual'
                          ? 'bg-unsaac-gold/15 border-unsaac-gold/30 text-unsaac-gold'
                          : 'bg-white/80 dark:bg-bg-dark border-border-light dark:border-border-dark text-gray-600 dark:text-gray-300 hover:border-unsaac-gold/40'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      Recorte manual
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="premium-card-inner p-2 block">
                      <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Inicio (s)</span>
                      <input
                        type="number"
                        step="0.001"
                        value={timeRange[0]}
                        onChange={(e) => setManualTimeWindow([parseFloat(e.target.value), timeRange[1]])}
                        className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
                      />
                    </label>
                    <label className="premium-card-inner p-2 block">
                      <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Fin (s)</span>
                      <input
                        type="number"
                        step="0.001"
                        value={timeRange[1]}
                        onChange={(e) => setManualTimeWindow([timeRange[0], parseFloat(e.target.value)])}
                        className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
                      />
                    </label>
                  </div>

	                  <div className="grid grid-cols-2 gap-2">
	                    <label className="premium-card-inner p-2 block">
		                      <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Agregar tratamiento</span>
	                      <select
	                        value={preprocessMode}
	                        onChange={(e) => addPreprocessMode(e.target.value as PreprocessMode)}
	                        className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
	                      >
                        {(Object.keys(PREPROCESS_LABELS) as PreprocessMode[]).map((mode) => (
                          <option key={mode} value={mode}>{PREPROCESS_LABELS[mode]}</option>
                        ))}
                      </select>
                    </label>
                    <label className="premium-card-inner p-2 block">
                      <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Ventana FFT</span>
                      <select
                        value={fftWindowType}
                        onChange={(e) => {
                          setFftWindowType(e.target.value as FFTWindowType);
                          setAnalysisResults(null);
                          setLastAnalysisMeta(null);
                          setVibrationBackendResults({});
                          setAnalysisStatus('Ventana FFT actualizada. Presione Analyze para recalcular.');
                          setVibrationBackendStatus('enDAQ pendiente: ventana FFT actualizada.');
                        }}
                        className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
                      >
                        {(Object.keys(FFT_WINDOW_LABELS) as FFTWindowType[]).map((windowName) => (
                          <option key={windowName} value={windowName}>{FFT_WINDOW_LABELS[windowName]}</option>
                        ))}
                      </select>
	                    </label>
	                  </div>

	                  <div className="rounded-xl border border-border-light dark:border-border-dark bg-gray-50/70 dark:bg-bg-dark/60 px-3 py-2 text-[9px] font-mono font-bold text-gray-500 dark:text-gray-400 leading-relaxed">
	                    <span className="text-accent-primary">Editando {PREPROCESS_LABELS[preprocessMode]}:</span>{' '}
	                    {PREPROCESS_DESCRIPTIONS[preprocessMode]}
	                  </div>

		                  <div className="rounded-xl border border-accent-primary/10 bg-accent-primary/5 px-3 py-2 space-y-2">
		                    <div className="flex items-center justify-between gap-2">
		                      <div className="min-w-0">
		                        <span className="text-[8px] font-mono font-black uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Pipeline activo</span>
		                        <p className="mt-0.5 text-[8px] font-mono font-bold text-gray-400 leading-relaxed">
		                          Selecciona un paso para editar sus parámetros.
		                        </p>
		                      </div>
		                      <span className="shrink-0 rounded-full bg-white/70 dark:bg-bg-dark border border-accent-primary/15 px-2 py-0.5 text-[8px] font-mono font-black text-accent-primary">
		                        {activePreprocessModes.length} pasos
		                      </span>
		                    </div>
		                    {activePreprocessModes.length === 0 ? (
		                      <p className="rounded-xl border border-dashed border-border-light dark:border-border-dark bg-white/60 dark:bg-black/10 p-2 text-[9px] font-mono font-bold text-gray-400">
		                        Sin tratamientos: se usará la señal cruda.
		                      </p>
		                    ) : (
		                      <div className="space-y-1.5">
		                        {activePreprocessModes.map((mode, index) => {
		                          const isEditingMode = preprocessMode === mode;
		                          return (
		                            <div
		                              key={mode}
		                              role="button"
		                              tabIndex={0}
		                              onClick={() => {
		                                setPreprocessMode(mode);
		                                setAnalysisStatus(`Configurando: ${PREPROCESS_LABELS[mode]}.`);
		                              }}
		                              onKeyDown={(event) => {
		                                if (event.key === 'Enter' || event.key === ' ') {
		                                  event.preventDefault();
		                                  setPreprocessMode(mode);
		                                  setAnalysisStatus(`Configurando: ${PREPROCESS_LABELS[mode]}.`);
		                                }
		                              }}
		                              className={`group flex items-center gap-2 rounded-xl border px-2 py-2 cursor-pointer transition-all ${
		                                isEditingMode
		                                  ? 'bg-accent-primary/10 border-accent-primary/35 shadow-sm'
		                                  : 'bg-white/75 dark:bg-bg-dark border-border-light dark:border-border-dark hover:border-accent-primary/25'
		                              }`}
		                            >
		                              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-mono font-black ${
		                                isEditingMode ? 'bg-accent-primary text-white' : 'bg-gray-100 dark:bg-black/20 text-gray-500'
		                              }`}>
		                                {index + 1}
		                              </span>
		                              <div className="min-w-0 flex-1">
		                                <div className="flex items-center gap-1.5 min-w-0">
		                                  <span className="truncate text-[9px] font-mono font-black text-gray-800 dark:text-gray-100">
		                                    {PREPROCESS_LABELS[mode]}
		                                  </span>
		                                  {isEditingMode && (
		                                    <span className="shrink-0 rounded-full bg-accent-primary/15 px-1.5 py-0.5 text-[7px] font-mono font-black uppercase tracking-wider text-accent-primary">
		                                      Configurando
		                                    </span>
		                                  )}
		                                </div>
		                                <p className="mt-0.5 truncate text-[8px] font-mono font-bold text-gray-400">
		                                  {isEditingMode ? 'Los controles de abajo editan este paso.' : 'Click para configurar este paso.'}
		                                </p>
		                              </div>
		                              <button
		                                type="button"
		                                onClick={(event) => {
		                                  event.stopPropagation();
		                                  removePreprocessMode(mode);
		                                }}
		                                className="shrink-0 rounded-full border border-transparent px-2 py-1 text-[10px] font-black text-gray-300 opacity-60 transition-colors group-hover:opacity-100 hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-500"
		                                title="Quitar este paso"
		                              >
		                                ×
		                              </button>
		                            </div>
		                          );
		                        })}
		                      </div>
		                    )}
		                    <p className="text-[8px] font-mono font-bold text-gray-400 leading-relaxed">
		                      Orden automático: base → anti-golpes → anti ski-slope/frecuencia → suavizado.
		                    </p>
		                  </div>

	                  <div className="grid grid-cols-2 gap-2">
	                    <button
	                      type="button"
	                      onClick={selectRawProcessing}
	                      className={`rounded-lg border px-2 py-1.5 text-[8px] font-display font-black uppercase tracking-wider transition-colors ${
	                        activePreprocessModes.length === 0 && fftWindowType === 'rectangular'
	                          ? 'bg-accent-secondary/15 border-accent-secondary/30 text-accent-secondary'
	                          : 'bg-white/80 dark:bg-bg-dark border-border-light dark:border-border-dark text-gray-500 hover:text-accent-secondary'
	                      }`}
                    >
                      Sin tratamiento
                    </button>
                    <button
	                      type="button"
	                      onClick={selectStandardProcessing}
	                      className={`rounded-lg border px-2 py-1.5 text-[8px] font-display font-black uppercase tracking-wider transition-colors ${
	                        activePreprocessModes.length === 1 && activePreprocessModes.includes('demean') && fftWindowType === 'hann'
	                          ? 'bg-accent-primary/15 border-accent-primary/30 text-accent-primary'
	                          : 'bg-white/80 dark:bg-bg-dark border-border-light dark:border-border-dark text-gray-500 hover:text-accent-primary'
	                      }`}
	                    >
	                      Estándar
	                    </button>
	                    <button
	                      type="button"
	                      onClick={selectImpactGuardProcessing}
	                      className={`rounded-lg border px-2 py-1.5 text-[8px] font-display font-black uppercase tracking-wider transition-colors ${
	                        activePreprocessModes.includes('impact_guard')
	                          ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-300'
	                          : 'bg-white/80 dark:bg-bg-dark border-border-light dark:border-border-dark text-gray-500 hover:text-amber-500'
	                      }`}
	                    >
	                      Anti-golpes
	                    </button>
	                    <button
	                      type="button"
	                      onClick={selectAntiSkiSlopeProcessing}
	                      className={`rounded-lg border px-2 py-1.5 text-[8px] font-display font-black uppercase tracking-wider transition-colors ${
	                        activePreprocessModes.includes('anti_ski_slope')
	                          ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-600 dark:text-cyan-300'
	                          : 'bg-white/80 dark:bg-bg-dark border-border-light dark:border-border-dark text-gray-500 hover:text-cyan-500'
	                      }`}
	                    >
	                      Anti ski-slope
	                    </button>
	                  </div>

	                  {(showRobustFilterControls || showFrequencyFilterControls || showSmoothingFilterControls) && (
	                    <div className="rounded-2xl border border-accent-primary/10 bg-white/65 dark:bg-black/10 p-2 space-y-2">
	                      <div className="flex items-center justify-between gap-2">
	                        <div className="min-w-0">
	                          <div className="text-[8px] font-mono font-black uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Parámetros del filtro</div>
	                          {hasPendingFilterParams && (
	                            <div className="mt-0.5 text-[8px] font-mono font-black uppercase tracking-wider text-amber-500">Cambios sin aplicar</div>
	                          )}
	                        </div>
	                        <div className="flex items-center gap-2 shrink-0">
	                          <button
	                            type="button"
	                            onClick={resetFilterParamDraft}
	                            className="text-[8px] font-mono font-black uppercase tracking-wider text-gray-400 hover:text-accent-secondary"
	                          >
	                            Reset
	                          </button>
	                          <button
	                            type="button"
	                            onClick={applyFilterParamDraft}
	                            disabled={!hasPendingFilterParams}
	                            className={`rounded-lg border px-2 py-1 text-[8px] font-mono font-black uppercase tracking-wider transition-colors ${
	                              hasPendingFilterParams
	                                ? 'bg-accent-primary/10 border-accent-primary/25 text-accent-primary hover:bg-accent-primary/15'
	                                : 'bg-gray-50 dark:bg-bg-dark border-border-light dark:border-border-dark text-gray-300 cursor-not-allowed'
	                            }`}
	                          >
	                            Aplicar
	                          </button>
	                        </div>
	                      </div>

	                      {showFrequencyFilterControls && (
	                        <div className="grid grid-cols-2 gap-2">
	                          {(preprocessMode === 'lowpass') && (
	                            <label className="premium-card-inner p-2 block">
	                              <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Pasa bajo Hz</span>
	                              <input
	                                type="number"
	                                min="0.001"
	                                step="0.1"
	                                value={filterParamDraft.lowpassCutoffHz}
	                                onChange={(e) => updateFilterParam('lowpassCutoffHz', parseFloat(e.target.value))}
	                                className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
	                              />
	                            </label>
	                          )}
	                          {(preprocessMode === 'highpass' || preprocessMode === 'anti_ski_slope') && (
	                            <label className="premium-card-inner p-2 block">
	                              <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Pasa alto Hz</span>
	                              <input
	                                type="number"
	                                min="0"
	                                step="0.05"
	                                value={filterParamDraft.highpassCutoffHz}
	                                onChange={(e) => updateFilterParam('highpassCutoffHz', parseFloat(e.target.value))}
	                                className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
	                              />
	                            </label>
	                          )}
	                          {preprocessMode === 'bandpass' && (
	                            <>
	                              <label className="premium-card-inner p-2 block">
	                                <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Banda min Hz</span>
	                                <input
	                                  type="number"
	                                  min="0"
	                                  step="0.05"
	                                  value={filterParamDraft.bandpassLowHz}
	                                  onChange={(e) => updateFilterParam('bandpassLowHz', parseFloat(e.target.value))}
	                                  className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
	                                />
	                              </label>
	                              <label className="premium-card-inner p-2 block">
	                                <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Banda max Hz</span>
	                                <input
	                                  type="number"
	                                  min="0.001"
	                                  step="0.1"
	                                  value={filterParamDraft.bandpassHighHz}
	                                  onChange={(e) => updateFilterParam('bandpassHighHz', parseFloat(e.target.value))}
	                                  className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
	                                />
	                              </label>
	                            </>
	                          )}
	                          {(preprocessMode === 'notch' || preprocessMode === 'harmonic_notch') && (
	                            <>
	                              <label className="premium-card-inner p-2 block">
	                                <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Notch Hz</span>
	                                <input
	                                  type="number"
	                                  min="0.001"
	                                  step="0.1"
	                                  value={filterParamDraft.notchFreqHz}
	                                  onChange={(e) => updateFilterParam('notchFreqHz', parseFloat(e.target.value))}
	                                  className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
	                                />
	                              </label>
	                              <label className="premium-card-inner p-2 block">
	                                <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Q</span>
	                                <input
	                                  type="number"
	                                  min="1"
	                                  step="1"
	                                  value={filterParamDraft.notchQ}
	                                  onChange={(e) => updateFilterParam('notchQ', parseFloat(e.target.value))}
	                                  className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
	                                />
	                              </label>
	                            </>
	                          )}
	                          {preprocessMode === 'harmonic_notch' && (
	                            <label className="premium-card-inner p-2 block col-span-2">
	                              <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Armónicos</span>
	                              <input
	                                type="number"
	                                min="1"
	                                max="20"
	                                step="1"
	                                value={filterParamDraft.harmonicCount}
	                                onChange={(e) => updateFilterParam('harmonicCount', parseFloat(e.target.value))}
	                                className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
	                              />
	                            </label>
	                          )}
	                        </div>
	                      )}

	                      {showRobustFilterControls && (
	                        <div className="grid grid-cols-3 gap-2">
	                          {(preprocessMode === 'median') && (
	                            <label className="premium-card-inner p-2 block">
	                              <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Mediana N</span>
	                              <input
	                                type="number"
	                                min="3"
	                                step="2"
	                                value={filterParamDraft.medianWindowSamples}
	                                onChange={(e) => updateFilterParam('medianWindowSamples', parseFloat(e.target.value))}
	                                className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
	                              />
	                            </label>
	                          )}
	                          {(preprocessMode === 'hampel' || preprocessMode === 'impact_guard' || preprocessMode === 'anti_ski_slope') && (
	                            <>
	                              <label className="premium-card-inner p-2 block">
	                                <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Hampel N</span>
	                                <input
	                                  type="number"
	                                  min="3"
	                                  step="2"
	                                  value={filterParamDraft.hampelWindowSamples}
	                                  onChange={(e) => updateFilterParam('hampelWindowSamples', parseFloat(e.target.value))}
	                                  className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
	                                />
	                              </label>
	                              <label className="premium-card-inner p-2 block">
	                                <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Sigma</span>
	                                <input
	                                  type="number"
	                                  min="0.5"
	                                  step="0.5"
	                                  value={filterParamDraft.hampelSigma}
	                                  onChange={(e) => updateFilterParam('hampelSigma', parseFloat(e.target.value))}
	                                  className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
	                                />
	                              </label>
	                            </>
	                          )}
	                          {(preprocessMode === 'mad_despike' || preprocessMode === 'impact_guard' || preprocessMode === 'anti_ski_slope') && (
	                            <label className="premium-card-inner p-2 block">
	                              <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">MAD</span>
	                              <input
	                                type="number"
	                                min="1"
	                                step="0.5"
	                                value={filterParamDraft.madThreshold}
	                                onChange={(e) => updateFilterParam('madThreshold', parseFloat(e.target.value))}
	                                className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
	                              />
	                            </label>
	                          )}
	                        </div>
	                      )}

	                      {showSmoothingFilterControls && (
	                        <div className="grid grid-cols-2 gap-2">
	                          {(preprocessMode === 'moving_average') && (
	                            <label className="premium-card-inner p-2 block">
	                              <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Media N</span>
	                              <input
	                                type="number"
	                                min="3"
	                                step="2"
	                                value={filterParamDraft.smoothingWindowSamples}
	                                onChange={(e) => updateFilterParam('smoothingWindowSamples', parseFloat(e.target.value))}
	                                className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
	                              />
	                            </label>
	                          )}
	                          {(preprocessMode === 'savgol') && (
	                            <label className="premium-card-inner p-2 block">
	                              <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Sav-Gol N</span>
	                              <input
	                                type="number"
	                                min="5"
	                                step="2"
	                                value={filterParamDraft.savgolWindowSamples}
	                                onChange={(e) => updateFilterParam('savgolWindowSamples', parseFloat(e.target.value))}
	                                className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
	                              />
	                            </label>
	                          )}
	                          {(preprocessMode === 'exponential') && (
	                            <label className="premium-card-inner p-2 block">
	                              <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Alpha</span>
	                              <input
	                                type="number"
	                                min="0.001"
	                                max="1"
	                                step="0.05"
	                                value={filterParamDraft.exponentialAlpha}
	                                onChange={(e) => updateFilterParam('exponentialAlpha', parseFloat(e.target.value))}
	                                className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
	                              />
	                            </label>
	                          )}
	                        </div>
	                      )}
	                    </div>
	                  )}

	                  <div className="rounded-xl border border-accent-primary/10 bg-white/65 dark:bg-black/10 px-3 py-2 text-[9px] font-mono font-bold text-accent-primary leading-relaxed">
	                    {analysisStatus}
	                  </div>
	                  <div className="rounded-xl border border-cyan-500/10 bg-cyan-500/5 px-3 py-2 text-[9px] font-mono font-bold text-cyan-600 dark:text-cyan-300 leading-relaxed">
	                    {vibrationBackendStatus}
	                  </div>
                </div>

                <section className="premium-card p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Activity size={14} className="text-accent-primary shrink-0" />
                      <div className="min-w-0">
                        <h2 className="text-[10px] font-display font-black text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em]">Vista y canales</h2>
                        <p className="text-[9px] font-mono font-bold text-gray-400 dark:text-gray-500 truncate">
                          {activeViewLabel} · {channelViewMode === 'single' ? activeChannelLabel : CHANNEL_VIEW_LABELS[channelViewMode]}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-accent-primary/10 border border-accent-primary/20 px-2 py-1 text-[8px] font-mono font-black uppercase tracking-wider text-accent-primary">
                      Visual
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="premium-card-inner p-2 block">
                      <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Gráfica</span>
                      <select
                        value={activeView}
                        onChange={(e) => setActiveView(e.target.value as ViewMode)}
                        className="mt-1 w-full px-2 py-1.5 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
                      >
                        {viewOptions.map((view) => (
                          <option key={view.id} value={view.id}>{view.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="premium-card-inner p-2 block">
                      <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Canales</span>
                      <select
                        value={channelViewMode}
                        onChange={(e) => {
                          const nextMode = e.target.value as ChannelViewMode;
                          setChannelViewMode(nextMode);
                          if (nextMode !== 'single' && activeView === 'vibrationdata') setActiveView('time');
                        }}
                        className="mt-1 w-full px-2 py-1.5 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
                      >
                        {(Object.keys(CHANNEL_VIEW_LABELS) as ChannelViewMode[]).map((mode) => (
                          <option key={mode} value={mode}>{CHANNEL_VIEW_LABELS[mode]}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {channelViewMode === 'single' ? (
                    <div className="grid grid-cols-4 gap-1">
                      {channelOptions.map((channel) => (
                        <button
                          key={channel.id}
                          type="button"
                          onClick={() => setActiveChannel(channel.id)}
                          className={`rounded-xl border px-1.5 py-2 text-[8px] font-mono font-black uppercase tracking-tight transition-all flex items-center justify-center gap-1 ${
                            activeChannel === channel.id
                              ? 'bg-accent-primary/10 border-accent-primary/30 text-accent-primary'
                              : 'bg-gray-50/80 dark:bg-bg-dark border-border-light dark:border-border-dark text-gray-500 dark:text-gray-400 hover:border-accent-primary/30'
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLOR_PALETTES[colorPalette][channel.id] }} />
                          <span className="truncate">{channel.label.replace('ACC ', '')}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-accent-primary/15 bg-accent-primary/5 p-2 text-[9px] font-mono font-bold text-gray-500 dark:text-gray-400 leading-relaxed">
                      {channelViewMode === 'xyz_overlay' || channelViewMode === 'all_overlay'
                        ? 'Se muestra una sola gráfica comparativa con las señales sobrepuestas.'
                        : 'Se muestran gráficas independientes por eje. Cada figura tiene descarga propia.'}
                    </div>
                  )}
                </section>

                <section className="premium-card p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <SlidersHorizontal size={14} className="text-accent-secondary shrink-0" />
                      <div className="min-w-0">
                        <h2 className="text-[10px] font-display font-black text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em]">Opciones de esta gráfica</h2>
                        <p className="text-[9px] font-mono font-bold text-gray-400 dark:text-gray-500 truncate">
                          Solo se muestran controles que afectan la vista activa.
                        </p>
                      </div>
                    </div>
                    <span className="text-[8px] font-mono font-black uppercase tracking-wider text-gray-400">
                      {activeViewLabel}
                    </span>
                  </div>

                  <div className="rounded-2xl border border-border-light dark:border-border-dark bg-gray-50/70 dark:bg-bg-dark/60 p-2">
                    <div className="text-[8px] font-mono font-black uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Tiempo</div>
                    <div className="mt-1 text-[9px] font-mono font-bold text-gray-500 dark:text-gray-400 leading-relaxed">
                      {signalData?.timeMetadata?.label ?? 'Se aceptan segundos, ISO 8601, epoch s o epoch ms.'}
                    </div>
                  </div>

                  {showSpectralControls && (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="premium-card-inner p-2 block">
                        <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Min Hz</span>
                        <input
                          type="number"
                          value={freqRange[0]}
                          onChange={(e) => {
                            setFreqRange(prev => [parseFloat(e.target.value), prev[1]]);
                            setAnalysisResults(null);
                            setLastAnalysisMeta(null);
                            setVibrationBackendResults({});
                            setVibrationBackendStatus('enDAQ pendiente: rango de frecuencia actualizado.');
                          }}
                          className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
                        />
                      </label>
                      <label className="premium-card-inner p-2 block">
                        <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Max Hz</span>
                        <input
                          type="number"
                          value={freqRange[1]}
                          onChange={(e) => {
                            setFreqRange(prev => [prev[0], parseFloat(e.target.value)]);
                            setAnalysisResults(null);
                            setLastAnalysisMeta(null);
                            setVibrationBackendResults({});
                            setVibrationBackendStatus('enDAQ pendiente: rango de frecuencia actualizado.');
                          }}
                          className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
                        />
                      </label>
                    </div>
                  )}

                  {showIntegrationControls && (
                    <div className="rounded-2xl border border-border-light dark:border-border-dark bg-gray-50/70 dark:bg-bg-dark/60 p-2 space-y-2">
                      <div className="text-[8px] font-mono font-black uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Integración A→V→D</div>
                      <div className="grid grid-cols-3 gap-2">
                        <label className="premium-card-inner p-2 block col-span-3 sm:col-span-1">
                          <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Salida</span>
                          <select
                            value={integrationOutput}
                            onChange={(e) => {
                              setIntegrationOutput(e.target.value as IntegrationOutputMode);
                              setActiveView('integration');
                              setAnalysisStatus('Vista de integración actualizada; enDAQ se usará al analizar.');
                            }}
                            className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
                          >
                            {(Object.keys(INTEGRATION_OUTPUT_LABELS) as IntegrationOutputMode[]).map((mode) => (
                              <option key={mode} value={mode}>{INTEGRATION_OUTPUT_LABELS[mode]}</option>
                            ))}
                          </select>
                        </label>
                        <label className="premium-card-inner p-2 block">
                          <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Unidad u</span>
                          <select
                            value={displacementUnit}
                            onChange={(e) => setDisplacementUnit(e.target.value as DisplacementUnit)}
                            className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
                          >
                            {(Object.keys(DISPLACEMENT_UNIT_LABELS) as DisplacementUnit[]).map((dispUnit) => (
                              <option key={dispUnit} value={dispUnit}>{DISPLACEMENT_UNIT_LABELS[dispUnit]}</option>
                            ))}
                          </select>
                        </label>
                        <label className="premium-card-inner p-2 block">
                          <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Drift Hz</span>
                          <input
                            type="number"
                            min="0"
                            step="0.05"
                            value={integrationHighpassHz}
                            onChange={(e) => {
                              const next = parseFloat(e.target.value);
                              setIntegrationHighpassHz(Number.isFinite(next) ? Math.max(0, next) : 0);
                              setAnalysisResults(null);
                              setLastAnalysisMeta(null);
                              setVibrationBackendResults({});
                              setVibrationBackendStatus('enDAQ pendiente: drift/high-pass actualizado.');
                            }}
                            className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
                          />
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-2">
                          <div className="text-[8px] font-mono font-black uppercase tracking-wider text-cyan-600 dark:text-cyan-300">V pico</div>
                          <div className="mt-1 text-sm font-display font-black text-cyan-600 dark:text-cyan-300">
                            {formatEngineeringValue(kinematicsData.velocityStats.maxAbs)} m/s
                          </div>
                        </div>
                        <div className="rounded-xl border border-accent-primary/20 bg-accent-primary/10 p-2">
                          <div className="text-[8px] font-mono font-black uppercase tracking-wider text-accent-primary">U pico</div>
                          <div className="mt-1 text-sm font-display font-black text-accent-primary">
                            {formatEngineeringValue(kinematicsData.displacementStats.maxAbs * displacementDisplayFactor)} {displacementDisplayLabel}
                          </div>
                        </div>
                      </div>
                      {kinematicsData.driftWarning && (
                        <p className="text-[9px] font-mono font-bold text-amber-500 leading-relaxed">
                          Se detectó deriva apreciable; revise el corte de drift.
                        </p>
                      )}
                    </div>
                  )}

                  {showCatalogControls && (
                    <div className="rounded-2xl border border-border-light dark:border-border-dark bg-gray-50/70 dark:bg-bg-dark/60 p-2 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[8px] font-mono font-black uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Catálogo A/V/D</div>
                        <span className="rounded-full bg-accent-primary/10 border border-accent-primary/20 px-2 py-0.5 text-[8px] font-mono font-black uppercase tracking-wider text-accent-primary">Activo</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="premium-card-inner p-2 block">
                          <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Plantilla</span>
                          <select
                            value={plotCatalogMode}
                            onChange={(e) => {
                              const nextMode = e.target.value as PlotCatalogMode;
                              setPlotCatalogMode(nextMode);
                              if (nextMode === 'time_histories') setPlotCatalogPeakPickingEnabled(false);
                            }}
                            className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
                          >
                            {(Object.keys(PLOT_CATALOG_LABELS) as PlotCatalogMode[]).map((mode) => (
                              <option key={mode} value={mode}>{PLOT_CATALOG_LABELS[mode]}</option>
                            ))}
                          </select>
                        </label>
                        <label className="premium-card-inner p-2 block">
                          <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Estilo</span>
                          <select
                            value={plotCatalogStyle}
                            onChange={(e) => setPlotCatalogStyle(e.target.value as PlotCatalogStyle)}
                            className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
                          >
                            {(Object.keys(PLOT_CATALOG_STYLE_LABELS) as PlotCatalogStyle[]).map((mode) => (
                              <option key={mode} value={mode}>{PLOT_CATALOG_STYLE_LABELS[mode]}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {showCatalogTimeControls && (
                        <>
                          <label className="premium-card-inner p-2 block">
                            <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Diseño tiempo</span>
                            <select
                              value={plotCatalogTimeLayout}
                              onChange={(e) => setPlotCatalogTimeLayout(e.target.value as PlotCatalogTimeLayout)}
                              className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
                            >
                              {(Object.keys(PLOT_CATALOG_TIME_LAYOUT_LABELS) as PlotCatalogTimeLayout[]).map((mode) => (
                                <option key={mode} value={mode}>{PLOT_CATALOG_TIME_LAYOUT_LABELS[mode]}</option>
                              ))}
                            </select>
                          </label>
                          {plotCatalogTimeLayout === 'full_zoom' && (
                            <div className="grid grid-cols-3 gap-2">
                              <label className="premium-card-inner p-2 block">
                                <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Zoom inicio</span>
                                <input
                                  type="number"
                                  step="0.001"
                                  value={historyZoomRange[0]}
                                  onChange={(e) => {
                                    const next = parseFloat(e.target.value);
                                    setHistoryZoomRange(prev => [Number.isFinite(next) ? next : prev[0], prev[1]]);
                                  }}
                                  className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
                                />
                              </label>
                              <label className="premium-card-inner p-2 block">
                                <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Zoom fin</span>
                                <input
                                  type="number"
                                  step="0.001"
                                  value={historyZoomRange[1]}
                                  onChange={(e) => {
                                    const next = parseFloat(e.target.value);
                                    setHistoryZoomRange(prev => [prev[0], Number.isFinite(next) ? next : prev[1]]);
                                  }}
                                  className="mt-1 w-full px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-lg border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => setHistoryZoomRange(getDefaultHistoryZoomRange(timeRange))}
                                className="premium-card-inner p-2 text-[8px] font-display font-black uppercase tracking-wider text-accent-primary border-accent-primary/20 hover:bg-accent-primary/10 transition-colors"
                              >
                                Auto
                              </button>
                            </div>
                          )}
                        </>
                      )}
                      {showPeakControls && (
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-2 text-[9px] font-mono font-bold text-amber-700 dark:text-amber-200 leading-relaxed">
                          Etiquetas tipo MATLAB: haz click directamente sobre cualquier curva de cada gráfica para crear una etiqueta. Cada gráfica guarda sus propias etiquetas y se eliminan desde su propia tarjeta.
                        </div>
                      )}
                    </div>
                  )}

                  {!showSpectralControls && !showIntegrationControls && !showCatalogControls && (
                    <p className="text-[9px] font-mono font-bold text-gray-400 dark:text-gray-500 leading-relaxed">
                      Esta vista usa el recorte y tratamiento definidos arriba. No hay opciones adicionales necesarias.
                    </p>
                  )}
                </section>

                <section className="premium-card p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Scissors size={14} className="text-accent-danger shrink-0" />
                      <div className="min-w-0">
                        <h2 className="text-[10px] font-display font-black text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em]">Cortes guardados</h2>
                        <p className="text-[9px] font-mono font-bold text-gray-400 dark:text-gray-500 truncate">
                          Reutiliza recortes frecuentes sin duplicar el panel principal.
                        </p>
                      </div>
                    </div>
                    {segments.length > 0 && (
                      <button
                        onClick={() => {
                          setSegments([]);
                          setSelectedSegment(null);
                          setAnalysisStatus('Cortes guardados eliminados. Use el recorte manual o todo el registro.');
                        }}
                        className="text-[9px] font-mono font-black uppercase tracking-wider text-red-500 hover:text-red-400 shrink-0"
                      >
                        Borrar
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Nombre opcional del corte"
                      value={segmentDraft.label}
                      onChange={(e) => setSegmentDraft(prev => ({ ...prev, label: e.target.value }))}
                      className="min-w-0 px-2 py-2 text-xs font-mono font-bold bg-white dark:bg-bg-dark rounded-xl border border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={saveActiveWindowAsSegment}
                      disabled={!signalData || isFullRecordSelected || activeAnalysisWindow.source === 'segment'}
                      className="rounded-xl bg-accent-secondary/10 border border-accent-secondary/20 px-3 py-2 text-[9px] font-display font-black uppercase tracking-wider text-accent-secondary disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Guardar actual
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                    {segments.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border-light dark:border-border-dark bg-gray-50/70 dark:bg-bg-dark/60 p-3 text-[9px] font-mono font-bold text-gray-400 leading-relaxed">
                        No hay cortes guardados. Ajusta inicio/fin arriba y guarda el corte actual.
                      </div>
                    ) : segments.map(segment => (
                      <div
                        key={segment.id}
                        className={`p-3 rounded-2xl border cursor-pointer transition-all ${selectedSegment === segment.id ? 'bg-accent-primary/10 border-accent-primary/40 shadow-sm' : 'bg-gray-50 dark:bg-bg-dark border-border-light dark:border-border-dark hover:border-accent-primary/30'}`}
                        onClick={() => useSegmentWindow(segment)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2 min-w-0">
                            <span className="mt-1 w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: segment.color }} />
                            <div className="min-w-0">
                              <div className="text-[10px] font-mono font-black text-gray-800 dark:text-gray-100 truncate">{segment.label}</div>
                              <div className="text-[9px] font-mono font-bold text-gray-400 mt-0.5">
                                {formatRange(segment.start, segment.end)} · {(segment.end - segment.start).toFixed(3)} s
                              </div>
                            </div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); removeSegment(segment.id); }} className="text-red-500 hover:text-red-400 text-xs font-black">✕</button>
                        </div>
                        <div className="mt-2 text-[8px] font-mono font-black uppercase tracking-[0.18em] text-accent-primary">
                          {selectedSegment === segment.id ? 'Activo' : 'Usar corte'}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="premium-card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Database size={14} className="text-accent-secondary" />
                      <h2 className="text-[10px] font-display font-black text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em]">Historial de cálculos</h2>
                    </div>
                    {savedAnalyses.length > 0 && (
                      <button onClick={clearSavedAnalyses} className="text-[9px] font-mono font-black uppercase tracking-wider text-red-500 hover:text-red-400">Limpiar</button>
                    )}
                  </div>
                  <p className="text-[9px] font-mono font-bold text-gray-400 dark:text-gray-500 leading-relaxed">
                    Los resultados de Analyze se guardan en este navegador para reutilizar el mismo corte sin recalcular.
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                    {savedAnalyses.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border-light dark:border-border-dark bg-gray-50/70 dark:bg-bg-dark/60 p-3 text-[9px] font-mono font-bold text-gray-400 leading-relaxed">
                        Sin cálculos guardados todavía.
                      </div>
                    ) : savedAnalyses.map(saved => (
                      <div key={saved.id} className={`rounded-2xl border p-3 ${lastAnalysisMeta?.id === saved.id ? 'border-accent-secondary/40 bg-accent-secondary/10' : 'border-border-light dark:border-border-dark bg-gray-50 dark:bg-bg-dark'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[10px] font-mono font-black text-gray-800 dark:text-gray-100 truncate">{saved.label}</div>
                            <div className="text-[9px] font-mono font-bold text-gray-400 mt-0.5">
                              {formatRange(saved.start, saved.end)} · {saved.samples} muestras
	                            </div>
	                            <div className="text-[8px] font-mono font-bold text-gray-400 mt-0.5">
	                              {formatPreprocessPipeline(getPreprocessModesFromSaved(saved))} · {FFT_WINDOW_LABELS[saved.fftWindowType] ?? 'Ventana anterior'}
	                            </div>
                            <div className="text-[8px] font-mono font-bold text-gray-400 mt-0.5">{formatTimestamp(saved.createdAt)}</div>
                          </div>
                          <button onClick={() => removeSavedAnalysis(saved.id)} className="text-red-500 hover:text-red-400 text-xs font-black">✕</button>
                        </div>
                        <button onClick={() => loadSavedAnalysis(saved)} className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl bg-accent-secondary/10 border border-accent-secondary/20 px-2 py-1.5 text-[9px] font-display font-black uppercase tracking-wider text-accent-secondary hover:bg-accent-secondary/15">
                          <History size={11} /> Cargar resultado
                        </button>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="premium-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Palette size={14} className="text-unsaac-gold" />
                    <h2 className="text-[10px] font-display font-black text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em]">Presentación</h2>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(COLOR_PALETTES) as Array<keyof typeof COLOR_PALETTES>).map(palette => (
                      <button key={palette} onClick={() => setColorPalette(palette)} className={`rounded-lg px-2 py-1.5 text-[9px] font-display font-black uppercase tracking-wider transition-all ${colorPalette === palette ? 'bg-accent-primary text-white shadow-sm' : 'bg-gray-100 dark:bg-bg-dark border border-border-light dark:border-border-dark text-gray-500 hover:text-accent-primary'}`}>{palette}</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="premium-card-inner p-2">
                      <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Grosor {chartConfig.lineWidth}px</span>
                      <input type="range" min="0.5" max="5" step="0.5" value={chartConfig.lineWidth} onChange={(e) => setChartConfig(prev => ({ ...prev, lineWidth: parseFloat(e.target.value) }))} className="w-full h-1 mt-2 accent-accent-primary" />
                    </label>
                    <label className="premium-card-inner p-2">
                      <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider font-mono">Color</span>
                      <input type="color" value={chartConfig.lineColor} onChange={(e) => setChartConfig(prev => ({ ...prev, lineColor: e.target.value }))} className="w-full h-7 mt-1 rounded cursor-pointer bg-transparent" />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="premium-card-inner p-2 flex items-center justify-between cursor-pointer">
                      <span className="text-[9px] font-mono font-bold text-gray-500 uppercase">Grid</span>
                      <input type="checkbox" checked={chartConfig.showGrid} onChange={(e) => setChartConfig(prev => ({ ...prev, showGrid: e.target.checked }))} className="accent-accent-primary" />
                    </label>
                    <label className="premium-card-inner p-2 flex items-center justify-between cursor-pointer">
                      <span className="text-[9px] font-mono font-bold text-gray-500 uppercase">Leyenda</span>
                      <input type="checkbox" checked={chartConfig.showLegend} onChange={(e) => setChartConfig(prev => ({ ...prev, showLegend: e.target.checked }))} className="accent-accent-primary" />
                    </label>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border-light dark:border-border-dark">
                    <button onClick={exportDataCSV} disabled={!signalData} className="flex items-center justify-center gap-1 rounded-lg bg-accent-secondary/10 border border-accent-secondary/20 px-2 py-2 text-[9px] font-display font-black uppercase tracking-wider text-accent-secondary disabled:opacity-40"><Download size={12} /> CSV</button>
                    <button onClick={exportDataJSON} disabled={!signalData} className="flex items-center justify-center gap-1 rounded-lg bg-purple-500/10 border border-purple-500/20 px-2 py-2 text-[9px] font-display font-black uppercase tracking-wider text-purple-500 disabled:opacity-40"><FileJson size={12} /> JSON</button>
                    <button onClick={() => setShowExportModal(true)} className="flex items-center justify-center gap-1 rounded-lg bg-unsaac-gold/10 border border-unsaac-gold/20 px-2 py-2 text-[9px] font-display font-black uppercase tracking-wider text-unsaac-gold"><Settings2 size={12} /> Plot</button>
                  </div>
                </section>
              </div>
            </aside>

            <section className="relative z-10 flex-1 p-4 lg:p-8 flex flex-col overflow-hidden bg-white dark:bg-bg-dark h-[48vh] lg:h-full">
              <div className="bg-white/80 dark:bg-bg-dark-panel/90 backdrop-blur-md rounded-[2.5rem] border border-border-light dark:border-border-dark overflow-hidden shadow-2xl transition-all hover:border-unsaac-gold/30 group h-full relative flex flex-col">
                <div className="shrink-0 px-5 lg:px-7 py-4 lg:py-5 border-b border-border-light dark:border-border-dark flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Activity size={16} className="text-accent-primary" />
                      <p className="text-[9px] lg:text-[10px] font-mono font-black uppercase tracking-[0.25em] text-accent-primary">Signal Workspace</p>
                    </div>
                    <h2 className="text-base lg:text-2xl font-display font-black text-gray-900 dark:text-white uppercase tracking-tighter truncate">
                      {activeViewLabel} <span className="text-accent-primary">{activeChannelLabel}</span>
                    </h2>
                    <p className="mt-1 text-[9px] font-mono font-bold text-gray-400 uppercase tracking-wider truncate">
                      Analizando: {activeAnalysisWindow.label} · {formatRange(activeAnalysisWindow.start, activeAnalysisWindow.end)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="hidden sm:flex items-center gap-3 text-[9px] lg:text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider">
                      <span>fs: {samplingRate} Hz</span>
                      <span className="text-border-light dark:text-border-dark">|</span>
                      <span>{activeAnalysisWindow.duration.toFixed(2)}s</span>
                      <span className="text-border-light dark:text-border-dark">|</span>
                      <span>{segments.length} ventanas</span>
                    </div>
                    <button
                      type="button"
                      disabled={!activeVibrationBackendResult}
                      onClick={() => setShowSpectralSummary(true)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-accent-primary/20 bg-accent-primary/10 px-3 py-2 text-[9px] font-display font-black uppercase tracking-wider text-accent-primary transition-all hover:bg-accent-primary/15 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                      title={activeVibrationBackendResult ? 'Ver frecuencias más energéticas' : 'Ejecute Analyze para generar el resumen'}
                    >
                      <Table2 size={13} />
                      <span className="hidden md:inline">Resumen espectral</span>
                      <span className="md:hidden">Resumen</span>
                    </button>
                  </div>
                </div>

                <div className="relative flex-1 min-h-0 p-4 lg:p-7">
                  <div className="h-full w-full rounded-[1.75rem] bg-gray-50 dark:bg-[#0B0F1A] border border-border-light dark:border-border-dark overflow-hidden relative">
                    {signalData && PlotComponent ? (
                      activeView === 'vibrationdata' ? (
                        <div className="absolute inset-0 overflow-y-auto custom-scrollbar p-3 lg:p-4">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border-light dark:border-border-dark bg-white/80 dark:bg-bg-dark-panel/80 px-3 py-2">
                            <div className="text-[9px] font-mono font-black uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                              Gráficas independientes · {catalogPlotDefinitions.length} descargas separadas
                            </div>
                            <div className="text-[8px] font-mono font-bold text-gray-400 dark:text-gray-500">
                              Click sobre una curva para crear etiqueta; cada figura gestiona sus propias etiquetas.
                            </div>
                          </div>
                          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
                            {catalogPlotDefinitions.map((plot) => (
                              <div
                                key={plot.id}
                                className="rounded-[1.35rem] border border-border-light dark:border-border-dark bg-white dark:bg-bg-dark-panel overflow-hidden shadow-sm"
                              >
                                <div className="flex items-center justify-between gap-3 border-b border-border-light dark:border-border-dark px-3 py-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-[10px] font-display font-black uppercase tracking-wide text-gray-800 dark:text-gray-100">
                                      {plot.title}
                                    </div>
                                    <div className="mt-0.5 text-[8px] font-mono font-bold uppercase tracking-[0.18em] text-gray-400">
                                      Click en curva = etiqueta · click en etiqueta = eliminar · archivo: {plot.filename}
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    {(plotDataLabels[plot.id]?.length ?? 0) > 0 && (
                                      <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-1 text-[8px] font-mono font-black uppercase tracking-wider text-amber-700 dark:text-amber-200">
                                        {plotDataLabels[plot.id]?.length} etiquetas
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => downloadCatalogPlotById(plot.divId, plot.filename)}
                                      className="rounded-full bg-accent-primary/10 border border-accent-primary/20 px-2 py-1 text-[8px] font-mono font-black uppercase tracking-wider text-accent-primary hover:bg-accent-primary/15 transition-colors"
                                    >
                                      Descargar
                                    </button>
                                  </div>
                                </div>
                                <PlotComponent
                                  divId={plot.divId}
                                  data={plot.data}
                                  layout={plot.layout}
                                  onClick={(event: any) => addPlotDataLabel(plot.id, plot.title, event, plot.layout)}
                                  onClickAnnotation={(event: any) => removePlotDataLabelFromAnnotation(plot.id, event)}
                                  onRelayout={(event: any) => syncPlotDataLabelRelayout(plot.id, plot, event)}
                                  config={{
                                    ...annotationEditConfig,
                                    responsive: true,
                                    displayModeBar: true,
                                    scrollZoom: true,
                                    displaylogo: false,
                                    modeBarButtonsToRemove: ['lasso2d', 'select2d'],
                                    toImageButtonOptions: {
                                      format: ['png', 'svg', 'webp'].includes(exportConfig.format) ? exportConfig.format as any : 'png',
                                      filename: plot.filename,
                                      height: exportConfig.height,
                                      width: exportConfig.width,
                                      scale: exportConfig.scale,
                                    },
                                  }}
                                  style={{ width: '100%', height: `${plot.height}px` }}
                                  useResizeHandler
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : channelViewMode !== 'single' ? (
                        <div className="absolute inset-0 overflow-y-auto custom-scrollbar p-3 lg:p-4">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border-light dark:border-border-dark bg-white/80 dark:bg-bg-dark-panel/80 px-3 py-2">
                            <div className="text-[9px] font-mono font-black uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                              {channelViewMode === 'xyz_overlay' || channelViewMode === 'all_overlay'
                                ? `Canales superpuestos · ${CHANNEL_VIEW_LABELS[channelViewMode]} · 1 gráfica comparativa`
                                : `Canales en paralelo · ${CHANNEL_VIEW_LABELS[channelViewMode]} · ${parallelChannelPlotDefinitions.length} gráficas independientes`}
                            </div>
                            <div className="text-[8px] font-mono font-bold text-gray-400 dark:text-gray-500">
                              {channelViewMode === 'xyz_overlay' || channelViewMode === 'all_overlay'
                                ? 'X, Y, Z se dibujan en el mismo eje para comparar fase, amplitud y duración.'
                                : 'Cada eje tiene descarga propia y no depende del canal activo.'}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
                            {parallelChannelPlotDefinitions.map((plot) => (
                              <div
                                key={plot.id}
                                className="rounded-[1.35rem] border border-border-light dark:border-border-dark bg-white dark:bg-bg-dark-panel overflow-hidden shadow-sm"
                              >
                                <div className="flex items-center justify-between gap-3 border-b border-border-light dark:border-border-dark px-3 py-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-[10px] font-display font-black uppercase tracking-wide text-gray-800 dark:text-gray-100">
                                      {plot.title}
                                    </div>
                                    <div className="mt-0.5 text-[8px] font-mono font-bold uppercase tracking-[0.18em] text-gray-400">
                                      Click en curva = etiqueta · click en etiqueta = eliminar · archivo: {plot.filename}
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    {(plotDataLabels[plot.id]?.length ?? 0) > 0 && (
                                      <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-1 text-[8px] font-mono font-black uppercase tracking-wider text-amber-700 dark:text-amber-200">
                                        {plotDataLabels[plot.id]?.length} etiquetas
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => downloadCatalogPlotById(plot.divId, plot.filename)}
                                      className="rounded-full bg-accent-primary/10 border border-accent-primary/20 px-2 py-1 text-[8px] font-mono font-black uppercase tracking-wider text-accent-primary hover:bg-accent-primary/15 transition-colors"
                                    >
                                      Descargar
                                    </button>
                                  </div>
                                </div>
                                <PlotComponent
                                  divId={plot.divId}
                                  data={plot.data}
                                  layout={plot.layout}
                                  onClick={(event: any) => addPlotDataLabel(plot.id, plot.title, event, plot.layout)}
                                  onClickAnnotation={(event: any) => removePlotDataLabelFromAnnotation(plot.id, event)}
                                  onRelayout={(event: any) => syncPlotDataLabelRelayout(plot.id, plot, event)}
                                  config={{
                                    ...annotationEditConfig,
                                    responsive: true,
                                    displayModeBar: true,
                                    scrollZoom: true,
                                    displaylogo: false,
                                    modeBarButtonsToRemove: ['lasso2d', 'select2d'],
                                    toImageButtonOptions: {
                                      format: ['png', 'svg', 'webp'].includes(exportConfig.format) ? exportConfig.format as any : 'png',
                                      filename: plot.filename,
                                      height: exportConfig.height,
                                      width: exportConfig.width,
                                      scale: exportConfig.scale,
                                    },
                                  }}
                                  style={{ width: '100%', height: `${plot.height}px` }}
                                  useResizeHandler
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <PlotComponent
                          ref={timePlotRef}
                          data={plotData}
                          layout={singleActivePlotLayout}
                          onClick={activeView === 'waterfall' ? undefined : (event: any) => addPlotDataLabel(singleActivePlotId, `${activeViewLabel} ${activeChannelLabel}`, event, singleActivePlotLayout)}
                          onClickAnnotation={(event: any) => removePlotDataLabelFromAnnotation(singleActivePlotId, event)}
                          onRelayout={(event: any) => syncPlotDataLabelRelayout(singleActivePlotId, { layout: singleActivePlotLayout }, event)}
                          config={{
                            ...annotationEditConfig,
                            responsive: true,
                            displayModeBar: true,
                            scrollZoom: true,
                            displaylogo: false,
                            modeBarButtonsToRemove: ['lasso2d', 'select2d'],
                            toImageButtonOptions: {
                              format: ['png', 'svg', 'webp'].includes(exportConfig.format) ? exportConfig.format as any : 'png',
                              filename: `signal_${activeView}`,
                              height: exportConfig.height,
                              width: exportConfig.width,
                              scale: exportConfig.scale,
                            },
                          }}
                          style={{ width: '100%', height: '100%' }}
                          useResizeHandler
                        />
                      )
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-center text-gray-500">
                        <div className="flex flex-col items-center justify-center px-6">
                          <div className="w-20 h-20 rounded-[1.75rem] border border-border-light dark:border-border-dark bg-white/60 dark:bg-white/[0.02] flex items-center justify-center mb-5 shadow-sm">
                            <FolderOpen size={38} className="text-unsaac-gold" />
                          </div>
                          <p className="text-[10px] font-mono font-black uppercase tracking-[0.3em] text-gray-500 dark:text-gray-400">Carga datos para visualizar</p>
                          <p className="mt-2 text-[9px] font-mono font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-600">CSV: tiempo, acelx, acely, acelz</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </section>
          </div>
        </main>

        {showSpectralSummary && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-bg-dark-panel rounded-[2rem] border border-border-light dark:border-border-dark p-5 lg:p-6 max-w-5xl w-full shadow-2xl">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-light dark:border-border-dark pb-4">
                <div>
                  <h3 className="text-lg lg:text-xl font-display font-black text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                    <Table2 size={20} className="text-accent-primary" />
                    Resumen espectral
                  </h3>
                  <p className="mt-1 text-[9px] font-mono font-bold uppercase tracking-[0.18em] text-gray-400">
                    Top frecuencias por energía PSD Welch · amplitud cercana desde Aggregate FFT · {activeChannelLabel}
                  </p>
                </div>
                <div className="text-right text-[9px] font-mono font-black uppercase tracking-[0.18em] text-gray-400">
                  <div>{activeAnalysisWindow.label}</div>
                  <div className="mt-1">{formatRange(activeAnalysisWindow.start, activeAnalysisWindow.end)}</div>
                </div>
              </div>

              <div className="mt-4 max-h-[58vh] overflow-auto custom-scrollbar rounded-2xl border border-border-light dark:border-border-dark">
                {spectralSummaryRows.length > 0 ? (
                  <table className="min-w-full divide-y divide-border-light dark:divide-border-dark text-left">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-bg-dark z-10">
                      <tr className="text-[8px] font-mono font-black uppercase tracking-[0.2em] text-gray-500">
                        <th className="px-3 py-3">#</th>
                        <th className="px-3 py-3">Canal</th>
                        <th className="px-3 py-3">Fuente</th>
                        <th className="px-3 py-3 text-right">Frecuencia Hz</th>
                        <th className="px-3 py-3 text-right">Energía PSD</th>
                        <th className="px-3 py-3 text-right">Amplitud FFT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-light dark:divide-border-dark bg-white dark:bg-bg-dark-panel">
                      {spectralSummaryRows.map((row) => (
                        <tr key={`${row.source}_${row.rank}_${row.frequencyHz}`} className="text-xs font-mono text-gray-700 dark:text-gray-200">
                          <td className="px-3 py-3 font-black text-accent-primary">{row.rank}</td>
                          <td className="px-3 py-3 font-bold">{row.channel}</td>
                          <td className="px-3 py-3">
                            <span className="rounded-full bg-accent-primary/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-accent-primary">
                              {row.source}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-black">{row.frequencyHz.toFixed(3)}</td>
                          <td className="px-3 py-3 text-right">
                            {row.energyValue == null ? '—' : `${formatEngineeringValue(row.energyValue)} ${row.energyUnit}`}
                          </td>
                          <td className="px-3 py-3 text-right font-black text-accent-secondary">
                            {row.amplitudeValue == null ? '—' : `${formatEngineeringValue(row.amplitudeValue)} ${row.amplitudeUnit}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="flex min-h-[180px] flex-col items-center justify-center p-8 text-center">
                    <Table2 size={34} className="text-gray-300 dark:text-gray-600" />
                    <p className="mt-3 text-xs font-display font-black uppercase tracking-wider text-gray-500 dark:text-gray-300">
                      Todavía no hay picos espectrales disponibles
                    </p>
                    <p className="mt-2 text-[10px] font-mono font-bold uppercase tracking-[0.16em] text-gray-400">
                      Ejecute Analyze para calcular PSD/Aggregate FFT con enDAQ.
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[9px] font-mono font-bold uppercase tracking-[0.16em] text-gray-400">
                  {activeVibrationBackendResult
                    ? `Engine: ${activeVibrationBackendResult.engine.name} ${activeVibrationBackendResult.engine.version}`
                    : 'Engine pendiente'}
                </p>
                <button
                  onClick={() => setShowSpectralSummary(false)}
                  className="px-4 py-2 rounded-xl bg-accent-primary hover:bg-accent-primary/90 text-white font-display font-black uppercase text-xs tracking-wider transition-all active:scale-95"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {showExportModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-bg-dark-panel rounded-[2rem] border border-border-light dark:border-border-dark p-6 max-w-md w-full shadow-2xl">
              <h3 className="text-xl font-display font-black text-gray-900 dark:text-white uppercase tracking-tight mb-4 flex items-center gap-2">
                <Download size={20} className="text-accent-primary" />
                Opciones de Exportación
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-mono font-black uppercase tracking-wider text-gray-500 block mb-1">Formato</label>
                  <select value={exportConfig.format} onChange={(e) => setExportConfig(prev => ({ ...prev, format: e.target.value as any }))} className="w-full px-3 py-2 bg-gray-50 dark:bg-bg-dark rounded-xl border border-border-light dark:border-border-dark text-gray-900 dark:text-white text-sm font-mono focus:outline-none">
                    <option value="png">PNG (Imagen raster)</option>
                    <option value="svg">SVG (Vectorial escalable)</option>
                    <option value="eps">EPS (PostScript vectorial)</option>
                    <option value="webp">WebP (Moderno comprimido)</option>
                    <option value="pdf">PDF (Documento con metadatos)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-mono font-black uppercase tracking-wider text-gray-500 block mb-1">Ancho (px)</label>
                    <input type="number" value={exportConfig.width} onChange={(e) => setExportConfig(prev => ({ ...prev, width: parseInt(e.target.value) }))} className="w-full px-3 py-2 bg-gray-50 dark:bg-bg-dark rounded-xl border border-border-light dark:border-border-dark text-gray-900 dark:text-white text-sm font-mono focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[9px] font-mono font-black uppercase tracking-wider text-gray-500 block mb-1">Alto (px)</label>
                    <input type="number" value={exportConfig.height} onChange={(e) => setExportConfig(prev => ({ ...prev, height: parseInt(e.target.value) }))} className="w-full px-3 py-2 bg-gray-50 dark:bg-bg-dark rounded-xl border border-border-light dark:border-border-dark text-gray-900 dark:text-white text-sm font-mono focus:outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-mono font-black uppercase tracking-wider text-gray-500 block mb-1">DPI</label>
                    <input type="number" value={exportConfig.dpi} onChange={(e) => setExportConfig(prev => ({ ...prev, dpi: parseInt(e.target.value) }))} className="w-full px-3 py-2 bg-gray-50 dark:bg-bg-dark rounded-xl border border-border-light dark:border-border-dark text-gray-900 dark:text-white text-sm font-mono focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[9px] font-mono font-black uppercase tracking-wider text-gray-500 block mb-1">Escala</label>
                    <input type="number" value={exportConfig.scale} onChange={(e) => setExportConfig(prev => ({ ...prev, scale: parseFloat(e.target.value) }))} step="0.5" className="w-full px-3 py-2 bg-gray-50 dark:bg-bg-dark rounded-xl border border-border-light dark:border-border-dark text-gray-900 dark:text-white text-sm font-mono focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-mono font-black uppercase tracking-wider text-gray-500 block mb-1">Tamaño de Papel (PDF)</label>
                  <select value={exportConfig.paperSize} onChange={(e) => setExportConfig(prev => ({ ...prev, paperSize: e.target.value as any }))} className="w-full px-3 py-2 bg-gray-50 dark:bg-bg-dark rounded-xl border border-border-light dark:border-border-dark text-gray-900 dark:text-white text-sm font-mono focus:outline-none">
                    <option value="A4">A4 (210 x 297 mm)</option>
                    <option value="Letter">Carta (8.5 x 11 in)</option>
                    <option value="Legal">Legal (8.5 x 14 in)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="premium-card-inner p-3 flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={exportConfig.includeTitle} onChange={(e) => setExportConfig(prev => ({ ...prev, includeTitle: e.target.checked }))} className="accent-accent-primary" />
                    <span className="text-xs font-mono font-bold text-gray-500 uppercase">Título</span>
                  </label>
                  <label className="premium-card-inner p-3 flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={exportConfig.includeMetadata} onChange={(e) => setExportConfig(prev => ({ ...prev, includeMetadata: e.target.checked }))} className="accent-accent-primary" />
                    <span className="text-xs font-mono font-bold text-gray-500 uppercase">Metadatos</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowExportModal(false)} className="flex-1 px-4 py-2 rounded-xl bg-gray-100 dark:bg-bg-dark border border-border-light dark:border-border-dark text-gray-600 dark:text-gray-300 font-display font-black uppercase text-xs tracking-wider hover:text-gray-900 dark:hover:text-white transition-all">Cancelar</button>
                <button onClick={() => {
                  exportChart(timePlotRef, activeView);
                  setShowExportModal(false);
                }} className="flex-1 px-4 py-2 rounded-xl bg-accent-primary hover:bg-accent-primary/90 text-white font-display font-black uppercase text-xs tracking-wider transition-all active:scale-95">Exportar</button>
              </div>
            </div>
          </div>
        )}
    </div>
  );

};

const SignalProcessingPage: React.FC = () => (
  <ThemeProvider>
    <SignalProcessingContent />
  </ThemeProvider>
);

export default SignalProcessingPage;
