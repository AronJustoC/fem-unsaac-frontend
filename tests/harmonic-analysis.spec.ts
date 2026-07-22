import { test, expect } from '@playwright/test';

const mockStructure = {
  nodes: [
    { id: 1, coords: [0, 0, 0] },
    { id: 2, coords: [5, 0, 0] },
  ],
  elements: [{ id: 1, node_ids: [1, 2], material_id: 1, section_id: 1 }],
  materials: [{ id: 1, name: 'Acero A36', E: 210e9, nu: 0.3, rho: 7850 }],
  sections: [{ id: 1, name: 'Perfil IPE 200', area: 0.01, Iz: 1e-4, Iy: 1e-4, J: 2e-4 }],
  restraints: { 1: ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] },
  loads: [{ id: 1, name: 'Carga P', node_id: 2, fx: 0, fy: 1000, fz: 0, mx: 0, my: 0, mz: 0 }],
};

test('harmonic response route renders frequency response', async ({ page }) => {
  await page.addInitScript((data) => {
    window.localStorage.setItem('fem_structure_data', JSON.stringify(data));
  }, mockStructure);

  await page.route('**/api/analysis/harmonic', async route => {
    await route.fulfill({
      json: {
        frequencies_sweep: [1, 5, 10],
        response_amplitudes: { '2': [0.001, 0.015, 0.004] },
        peak_node_id: 2,
        peak_frequency: 5,
        peak_amplitude: 0.015,
        node_displacement_components: {
          '2': {
            ux_real_m: [0, 0, 0], ux_imag_m: [0, 0, 0],
            uy_real_m: [0.001, 0.015, 0.004], uy_imag_m: [0, 0.002, 0],
            uz_real_m: [0, 0, 0], uz_imag_m: [0, 0, 0],
          },
        },
        node_response_series: {
          '2': {
            displacement_m: [0.001, 0.015, 0.004],
            velocity_m_s: [0.006, 0.471, 0.251],
            acceleration_m_s2: [0.039, 14.804, 15.791],
            stress_pa: [120000, 2500000, 900000],
          },
        },
        node_peak_summary: {
          '2': {
            frequency_hz: 5,
            displacement_m: 0.015,
            velocity_m_s: 0.471,
            acceleration_m_s2: 14.804,
            stress_pa: 2500000,
            stress_peak_pa: 2500000,
            stress_peak_frequency_hz: 5,
          },
        },
      }
    });
  });

  await page.goto('http://localhost:4321/analisis-armonico');
  await expect(page.getByRole('heading', { name: /Harmonic Response/i })).toBeVisible();
  await page.getByRole('button', { name: /solve/i }).click();
  await expect(page.getByText('Critical Response')).toBeVisible();
  await expect(page.getByText('Peak @ 5.00 Hz')).toBeVisible();
  await expect(page.getByText(/1\.500e\+1 mm/).first()).toBeVisible();
  await expect(page.getByText(/2.50 MPa/).first()).toBeVisible();
  await expect(page.getByText(/v 4\.710e\+2 mm\/s/i)).toBeVisible();
  await expect(page.getByText(/a 1\.480e\+1 m\/s² \(1\.51 g\)/i)).toBeVisible();
  await expect(page.getByText(/Unidades industriales: desplazamiento mm/i)).toBeVisible();

  const plot = page.locator('.js-plotly-plot').first();
  await expect(page.getByRole('button', { name: /^Movimiento$/ })).toBeVisible();
  await expect(page.getByText(/Frecuencia animada/i)).toBeVisible();

  const animationTrace = await plot.evaluate((el: any) => el.data.find((trace: any) =>
    trace.type === 'scatter3d' &&
    trace.name === 'Deformada animada' &&
    Array.isArray(trace.customdata)
  ));
  expect(animationTrace).toBeTruthy();
  expect(animationTrace.customdata.some((row: any[]) => Array.isArray(row) && row.length >= 9)).toBeTruthy();

  await page.getByRole('button', { name: /^Vel$/ }).click();
  await expect.poll(async () => plot.evaluate((el: any) =>
    el.data.find((trace: any) => trace.type === 'scatter3d' && String(trace.mode).includes('markers'))?.name
  )).toBe('Vel');
  await page.getByRole('button', { name: /^Desp$/ }).click();

  await expect(page.getByText(/^Escala deformada$/)).toBeVisible();
  await expect(page.getByLabel('Escala visual de deformada')).toHaveValue('1');
  await page.getByLabel('Aumentar escala de deformada').click();
  await expect(page.getByLabel('Escala visual de deformada')).toHaveValue('1.25');
  await expect.poll(async () => plot.evaluate((el: any) => el.layout?.title?.text)).toContain('escala visual 1.25×');

  const freqCard = page
    .getByText(/^Frecuencia animada$/)
    .locator('xpath=ancestor::div[contains(@class,"premium-card-inner")][1]');
  const slider = freqCard.locator('input[type="range"]');
  await expect(slider).toHaveValue('1');
  await expect(freqCard.getByText(/5\.000 Hz/)).toBeVisible();
  await slider.fill('2');
  await expect(freqCard.getByText(/10\.000 Hz/)).toBeVisible();
  await expect.poll(async () => plot.evaluate((el: any) => el.layout?.title?.text)).toContain('10.000 Hz');

  await page.getByRole('button', { name: /^Espectro$/ }).click();
  await expect.poll(async () => plot.evaluate((el: any) => el.layout?.title?.text)).toContain('Desplazamiento |u| (mm)');

  await page.getByRole('button', { name: /^Vel$/ }).click();
  await expect.poll(async () => plot.evaluate((el: any) => el.data[0].y)).toEqual([6, 471, 251]);

  await page.getByRole('button', { name: /^σ alt$/ }).click();
  await expect.poll(async () => plot.evaluate((el: any) => el.data[0].y)).toEqual([0.12, 2.5, 0.9]);
});
