// signal_api.ts - API client for SignalCore endpoints
// Backend: /api/signal/*

const CONFIGURED_API_BASE_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:8000';
const LOCAL_SIGNAL_API_BASE_URLS = [
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:10000',
  'http://127.0.0.1:10000',
];

const trimTrailingSlash = (url: string) => url.replace(/\/+$/, '');

const isLocalBrowser = () => {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
};

const isLoopbackUrl = (url: string) => {
  try {
    const { hostname } = new URL(url);
    return ['localhost', '127.0.0.1', '::1'].includes(hostname);
  } catch {
    return false;
  }
};

const getSignalApiBaseCandidates = () => {
  const configured = trimTrailingSlash(CONFIGURED_API_BASE_URL);
  const localCandidates = LOCAL_SIGNAL_API_BASE_URLS.map(trimTrailingSlash);
  const ordered = isLocalBrowser() && !isLoopbackUrl(configured)
    ? [...localCandidates, configured]
    : [configured, ...localCandidates];
  return Array.from(new Set(ordered.filter(Boolean)));
};

async function fetchSignalApi(path: string, options: RequestInit = {}): Promise<Response> {
  const candidates = getSignalApiBaseCandidates();
  let lastError: unknown = null;

  for (const baseUrl of candidates) {
    try {
      return await fetch(`${baseUrl}${path}`, options);
    } catch (err) {
      if (options.signal?.aborted) throw err;
      lastError = err;
    }
  }

  const details = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `No se pudo conectar al backend SignalCore (${path}). ` +
    `URLs probadas: ${candidates.join(', ')}. ${details}`
  );
}

export interface SignalData {
  time_data: number[];
  channels: {
    [key: string]: number[];
  };
  unit?: string;
  sampling_rate?: number;
  channel_names?: string[];
  metadata?: Record<string, any>;
}

export interface ParsedCSVSignalData {
  time: number[];
  acc_x: number[];
  acc_y: number[];
  acc_z: number[];
  timeMetadata: {
    source: 'seconds' | 'iso' | 'epoch_seconds' | 'epoch_milliseconds';
    origin?: string;
    label: string;
  };
}

export interface FFTResult {
  success: boolean;
  frequencies: number[];
  amplitude_spectrum: number[];
  peak_frequencies: number[];
  peak_amplitudes: number[];
  window_type: string;
  nyquist_freq: number;
}

export interface PSDResult {
  success: boolean;
  frequencies: number[];
  psd: number[];
  method: string;
  spectral_peaks: SpectralPeak[];
}

export interface SpectralPeak {
  rank: number;
  frequency_hz: number;
  period_s: number;
  psd_value: number;
  bandwidth_hz: number;
  quality_factor: number;
}

export interface FilterConfig {
  amplitude: number[];
  sampling_rate: number;
  filter_type:
    | 'lowpass'
    | 'highpass'
    | 'bandpass'
    | 'bandstop'
    | 'notch'
    | 'comb'
    | 'harmonic_notch'
    | 'demean'
    | 'detrend'
    | 'median'
    | 'hampel'
    | 'mad_despike'
    | 'impact_guard'
    | 'anti_ski_slope'
    | 'moving_average'
    | 'exponential'
    | 'savgol';
  order?: number;
  cutoff_low?: number;
  cutoff_high?: number;
  notch_freq?: number;
  quality_factor?: number;
  n_harmonics?: number;
  bandwidth?: number;
  window_size?: number;
  sigma?: number;
  mad_threshold?: number;
  alpha?: number;
  polyorder?: number;
}

export interface FilterResult {
  success: boolean;
  filtered_amplitude: number[];
  filter_type: string;
  order: number;
  cutoff: number | [number, number];
  parameters?: Record<string, number | null>;
}

export interface IntegrationResult {
  success: boolean;
  integrated_signal: number[];
  result_type: 'velocity' | 'displacement';
  drift_warning: boolean;
  drift_ratio: number;
}

export interface EnvelopeResult {
  success: boolean;
  envelope_time: number[];
  envelope_amplitude: number[];
  impact_times: number[];
  impact_amplitudes: number[];
  avg_interval_s: number;
  periodicity_score: number;
  probable_source: string;
}

export interface CepstrumResult {
  success: boolean;
  quefrency: number[];
  cepstrum: number[];
  dominant_quefrencies: number[];
  dominant_amplitudes: number[];
  interpreted_peaks: QuefrencyPeak[];
}

export interface QuefrencyPeak {
  quefrency_s: number;
  period_hz: number;
  classification: string;
}

export interface WaterfallResult {
  success: boolean;
  frequencies: number[];
  times: number[];
  n_slices: number;
  constant_modes: ConstantMode[];
}

export interface ConstantMode {
  average_frequency_hz: number;
  frequency_stability_hz: number;
  avg_amplitude: number;
  presence_ratio: number;
  n_appearances: number;
  is_stable: boolean;
}

export interface FullAnalysisResult {
  success: boolean;
  file_info: {
    file_name: string;
    sampling_rate_hz: number;
    duration_s: number;
    n_samples: number;
    unit: string;
    sensor_location?: string;
  };
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
    info: Record<string, any>;
  };
  time_domain: {
    [channel: string]: {
      rms: number;
      peak: number;
      peak_to_peak: number;
      crest_factor: number;
      n_peaks: number;
    };
  };
  frequency_domain: {
    [channel: string]: {
      peak_frequencies: number[];
      peak_amplitudes: number[];
    };
  };
  spectral: {
    [channel: string]: {
      psd_method: string;
      spectral_peaks: SpectralPeak[];
    };
  };
  statistics: {
    [channel: string]: {
      mean: number;
      std: number;
      rms: number;
      peak: number;
      peak_to_peak: number;
      skewness: number;
      kurtosis: number;
    };
  };
  natural_frequencies?: {
    vertical_modes: number[];
    fundamental_freq_hz: number | null;
  };
  observations: string[];
  recommendations: string[];
}

export interface VibrationDataAnalysisRequest {
  acceleration: number[];
  sampling_rate?: number;
  time?: number[];
  unit?: string;
  bin_width?: number;
  window?: string;
  overlap?: number;
  highpass_hz?: number;
  freq_range?: [number, number];
  zero_low_frequency_bins?: number;
}

export interface VibrationDataEngineInfo {
  name: string;
  version: string;
  core_functions: string[];
}

export interface VibrationDataStats {
  mean: number;
  rms: number;
  peak_abs: number;
  peak_to_peak: number;
}

export interface VibrationDataTimeHistories {
  time: number[];
  acceleration_g: number[];
  acceleration_conditioned_g: number[];
  velocity_mm_s: number[];
  displacement_mm: number[];
  units: {
    acceleration: string;
    velocity: string;
    displacement: string;
  };
  stats: {
    acceleration_g: VibrationDataStats;
    acceleration_conditioned_g: VibrationDataStats;
    velocity_mm_s: VibrationDataStats;
    displacement_mm: VibrationDataStats;
  };
  method: {
    integration: string;
    engine: string;
    endaq_version: string;
    highpass_hz: number;
    acceleration_detrend: string;
    integration_zero: string;
  };
  drift: {
    raw_displacement_final_minus_initial_m: number;
    drift_ratio: number;
    warning: boolean;
  };
}

export interface VibrationDataPeak {
  frequency_hz: number;
  amplitude: number;
}

export interface VibrationDataFftSpectrum {
  frequencies: number[];
  amplitudes: number[];
  phases_deg: number[];
  phase_supported?: boolean;
  peaks: VibrationDataPeak[];
  unit: string;
  engine: string;
  window: string;
  requested_window?: string;
  detrend: string;
  n_samples?: number;
  frequency_resolution_hz?: number;
  overall_rms_time?: number;
  bin_width_hz?: number;
  actual_bin_width_hz?: number;
  n_segments?: number;
  nperseg?: number;
  noverlap?: number;
}

export interface VibrationDataPsdSpectrum {
  frequencies: number[];
  psd: number[];
  peaks: VibrationDataPeak[];
  unit: string;
  input_unit: string;
  method: string;
  engine: string;
  window: string;
  detrend: string;
  bin_width_hz: number;
  actual_bin_width_hz: number;
  nperseg: number;
  noverlap: number;
  rms_from_psd: number;
  zero_low_frequency_bins: number;
}

export interface VibrationDataAnalysisResult {
  success: boolean;
  method: string;
  engine: VibrationDataEngineInfo;
  input: {
    n_samples: number;
    sampling_rate_hz: number;
    duration_s: number;
    unit: string;
    inferred_sampling_rate: boolean;
  };
  settings: {
    bin_width_hz: number;
    window: string;
    overlap: number;
    highpass_hz: number;
    freq_range: number[] | null;
    zero_low_frequency_bins: number;
  };
  time_histories: VibrationDataTimeHistories;
  fft: Record<'acceleration' | 'velocity' | 'displacement', VibrationDataFftSpectrum>;
  aggregate_fft: Record<'acceleration' | 'velocity' | 'displacement', VibrationDataFftSpectrum>;
  psd: Record<'acceleration' | 'velocity' | 'displacement', VibrationDataPsdSpectrum>;
}

// API Functions
export async function importSignalData(data: SignalData): Promise<any> {
  const response = await fetchSignalApi(`/api/signal/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function computeFFT(
  amplitude: number[],
  samplingRate: number,
  windowType: string = 'hanning',
  freqRange?: [number, number]
): Promise<FFTResult> {
  const response = await fetchSignalApi(`/api/signal/fft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amplitude,
      sampling_rate: samplingRate,
      window_type: windowType,
      detrend: true,
      freq_range: freqRange,
      max_peaks: 10,
    }),
  });
  return response.json();
}

export async function computePSD(
  amplitude: number[],
  samplingRate: number,
  nperseg?: number
): Promise<PSDResult> {
  const response = await fetchSignalApi(`/api/signal/psd`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amplitude,
      sampling_rate: samplingRate,
      nperseg: nperseg || 1024,
      noverlap: nperseg ? nperseg / 2 : 512,
      window: 'hann',
    }),
  });
  return response.json();
}

export async function computeVibrationDataAnalysis(
  config: VibrationDataAnalysisRequest,
  signal?: AbortSignal
): Promise<VibrationDataAnalysisResult> {
  const response = await fetchSignalApi(`/api/signal/vibrationdata-analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      acceleration: config.acceleration,
      sampling_rate: config.sampling_rate,
      time: config.time,
      unit: config.unit ?? 'g',
      bin_width: config.bin_width ?? 1.0,
      window: config.window ?? 'hann',
      overlap: config.overlap ?? 0.5,
      highpass_hz: config.highpass_hz ?? 0.5,
      freq_range: config.freq_range,
      zero_low_frequency_bins: config.zero_low_frequency_bins ?? 0,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const detail = typeof payload?.detail === 'string' ? payload.detail : 'No se pudo ejecutar el análisis enDAQ.';
    throw new Error(detail);
  }
  return payload;
}

export async function applyFilter(config: FilterConfig): Promise<FilterResult> {
  const response = await fetchSignalApi(`/api/signal/filter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amplitude: config.amplitude,
      sampling_rate: config.sampling_rate,
      filter_type: config.filter_type,
      order: config.order || 4,
      cutoff_low: config.cutoff_low || 0.5,
      cutoff_high: config.cutoff_high || 20.0,
      notch_freq: config.notch_freq ?? 60.0,
      quality_factor: config.quality_factor ?? 30.0,
      n_harmonics: config.n_harmonics ?? 3,
      bandwidth: config.bandwidth ?? 0.5,
      window_size: config.window_size ?? 11,
      sigma: config.sigma ?? 3.0,
      mad_threshold: config.mad_threshold ?? 6.0,
      alpha: config.alpha ?? 0.2,
      polyorder: config.polyorder ?? 2,
    }),
  });
  return response.json();
}

export async function integrateSignal(
  acceleration: number[],
  samplingRate: number,
  doubleIntegrate: boolean = false,
  highpassFreq: number = 0.5
): Promise<IntegrationResult> {
  const response = await fetchSignalApi(`/api/signal/integrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      acceleration,
      sampling_rate: samplingRate,
      double_integrate: doubleIntegrate,
      highpass_freq: highpassFreq,
    }),
  });
  return response.json();
}

export async function computeEnvelope(
  amplitude: number[],
  samplingRate: number,
  time?: number[],
  lowFreq: number = 10,
  highFreq: number = 100
): Promise<EnvelopeResult> {
  const response = await fetchSignalApi(`/api/signal/envelope`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amplitude,
      sampling_rate: samplingRate,
      time,
      low_freq: lowFreq,
      high_freq: highFreq,
    }),
  });
  return response.json();
}

export async function computeCepstrum(
  amplitude: number[],
  samplingRate: number,
  minQuefrency: number = 0.01,
  maxQuefrency: number = 10
): Promise<CepstrumResult> {
  const response = await fetchSignalApi(`/api/signal/cepstrum`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amplitude,
      sampling_rate: samplingRate,
      min_quefrency: minQuefrency,
      max_quefrency: maxQuefrency,
    }),
  });
  return response.json();
}

export async function computeWaterfall(
  amplitude: number[],
  samplingRate: number,
  segmentLength: number = 1024,
  overlapRatio: number = 0.75,
  maxFreq?: number
): Promise<WaterfallResult> {
  const response = await fetchSignalApi(`/api/signal/waterfall`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amplitude,
      sampling_rate: samplingRate,
      segment_length: segmentLength,
      overlap_ratio: overlapRatio,
      max_freq: maxFreq,
    }),
  });
  return response.json();
}

export async function fullBridgeAnalysis(
  timeData: number[],
  accX: number[],
  accY: number[],
  accZ: number[],
  samplingRate: number,
  unit: string = 'g',
  fileName?: string,
  sensorLocation?: string,
  options?: {
    windowType?: string;
    detrend?: boolean;
  }
): Promise<FullAnalysisResult> {
  const response = await fetchSignalApi(`/api/signal/analyze/full`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      time_data: timeData,
      acc_x: accX,
      acc_y: accY,
      acc_z: accZ,
      sampling_rate: samplingRate,
      unit,
      file_name: fileName,
      sensor_location: sensorLocation,
      window_type: options?.windowType ?? 'hann',
      detrend: options?.detrend ?? false,
    }),
  });
  return response.json();
}

// Utility functions
const isStrictNumeric = (value: string): boolean =>
  /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(value.trim());

const splitDataLine = (line: string): string[] => {
  if (line.includes('\t')) return line.split('\t');
  if (line.includes(';')) return line.split(';');
  return line.split(',');
};

export function parseCSVData(csvText: string): ParsedCSVSignalData | null {
  try {
    const lines = csvText.trim().split('\n');
    const rawTime: number[] = [];
    const parsedDates: number[] = [];
    const acc_x: number[] = [];
    const acc_y: number[] = [];
    const acc_z: number[] = [];
    
    // Skip header if present
    const firstParts = splitDataLine(lines[0]);
    const firstToken = firstParts[0]?.trim() ?? '';
    const startIdx = /tiempo|time|fecha|date|timestamp/i.test(lines[0]) || (!isStrictNumeric(firstToken) && Number.isNaN(Date.parse(firstToken))) ? 1 : 0;
    
    for (let i = startIdx; i < lines.length; i++) {
      const parts = splitDataLine(lines[i]).map(p => p.trim());
      if (parts.length < 4) continue;

      const timeToken = parts[0];
      const x = Number(parts[1]);
      const y = Number(parts[2]);
      const z = Number(parts[3]);

      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

      if (isStrictNumeric(timeToken)) {
        rawTime.push(Number(timeToken));
        parsedDates.push(Number.NaN);
      } else {
        const dateMs = Date.parse(timeToken);
        if (!Number.isFinite(dateMs)) continue;
        rawTime.push(Number.NaN);
        parsedDates.push(dateMs);
      }

      acc_x.push(x);
      acc_y.push(y);
      acc_z.push(z);
    }

    if (acc_x.length === 0) return null;

    const hasDates = parsedDates.some(Number.isFinite);
    const time: number[] = [];
    let timeMetadata: ParsedCSVSignalData['timeMetadata'];

    if (hasDates) {
      const originMs = parsedDates.find(Number.isFinite) ?? 0;
      parsedDates.forEach((value) => {
        time.push(Number.isFinite(value) ? (value - originMs) / 1000 : 0);
      });
      timeMetadata = {
        source: 'iso',
        origin: new Date(originMs).toISOString(),
        label: `ISO/fecha → segundos desde ${new Date(originMs).toISOString()}`,
      };
    } else {
      const first = rawTime[0] ?? 0;
      if (Math.abs(first) > 1e12) {
        rawTime.forEach((value) => time.push((value - first) / 1000));
        timeMetadata = {
          source: 'epoch_milliseconds',
          origin: new Date(first).toISOString(),
          label: `Epoch ms → segundos desde ${new Date(first).toISOString()}`,
        };
      } else if (Math.abs(first) > 1e9) {
        rawTime.forEach((value) => time.push(value - first));
        timeMetadata = {
          source: 'epoch_seconds',
          origin: new Date(first * 1000).toISOString(),
          label: `Epoch s → segundos desde ${new Date(first * 1000).toISOString()}`,
        };
      } else {
        rawTime.forEach((value) => time.push(value));
        timeMetadata = {
          source: 'seconds',
          label: 'Tiempo en segundos',
        };
      }
    }

    return { time, acc_x, acc_y, acc_z, timeMetadata };
  } catch (error) {
    console.error('Error parsing CSV:', error);
    return null;
  }
}

export function calculateSamplingRate(time: number[]): number {
  if (time.length < 2) return 0;
  const diffs = [];
  for (let i = 1; i < time.length; i++) {
    const dt = time[i] - time[i - 1];
    if (Number.isFinite(dt) && dt > 0) diffs.push(dt);
  }
  if (diffs.length === 0) return 0;
  diffs.sort((a, b) => a - b);
  const dt = diffs[Math.floor(diffs.length / 2)];
  return dt > 0 ? 1 / dt : 0;
}
