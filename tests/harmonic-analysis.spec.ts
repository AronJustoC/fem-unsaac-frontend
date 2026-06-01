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
      }
    });
  });

  await page.goto('http://localhost:4321/analisis-armonico');
  await expect(page.getByRole('heading', { name: /Harmonic Response/i })).toBeVisible();
  await page.getByRole('button', { name: /solve/i }).click();
  await expect(page.getByText('Critical Response')).toBeVisible();
  await expect(page.getByText('Peak @ 5.00 Hz')).toBeVisible();
});
