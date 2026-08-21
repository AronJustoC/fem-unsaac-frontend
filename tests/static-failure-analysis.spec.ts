import { expect, test } from '@playwright/test';

const structure = {
  nodes: [
    { id: 1, coords: [0, 0, 0] },
    { id: 2, coords: [2, 0, 0] },
  ],
  elements: [{ id: 1, node_ids: [1, 2], material_id: 1, section_id: 1 }],
  materials: [{ id: 1, name: 'Acero A36', E: 200e9, nu: 0.3, rho: 7850, yield_strength: 250e6 }],
  sections: [{ id: 1, name: 'Rectangular', area: 0.02, Iy: 1.67e-5, Iz: 6.67e-5, J: 8.34e-5, height: 0.2, width: 0.1 }],
  restraints: { 1: ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] },
  loads: [{ id: 1, node_id: 2, fx: 0, fy: -10_000, fz: 0, mx: 0, my: 0, mz: 0 }],
};

const endI = {
  sigma_von_mises_pa: 30e6,
  sigma_normal_pa: -30e6,
  tau_shear_pa: 416_667,
  sigma_1_pa: 5_775,
  sigma_2_pa: -30_005_775,
  tau_max_pa: 15_005_775,
  utilization: 0.12,
  safety_factor: 8.333,
  status: 'safe',
};

const endJ = {
  ...endI,
  sigma_von_mises_pa: 0.72e6,
  sigma_normal_pa: 0,
  utilization: 0.00288,
  safety_factor: 347.22,
};

const staticResults = {
  displacements: { 1: [0, 0, 0, 0, 0, 0], 2: [0, -0.001, 0, 0, 0, -0.0008] },
  reactions: { 1: [0, 10_000, 0, 0, 0, 20_000] },
  element_forces: { 1: { fx1: 0, fy1: 10_000, fz1: 0, mx1: 0, my1: 0, mz1: 20_000, fx2: 0, fy2: -10_000, fz2: 0, mx2: 0, my2: 0, mz2: 0 } },
  stresses: { 1: [30e6, 0.72e6, -30e6, 0, 416_667, 416_667, 5_775, 416_667, -30_005_775, -416_667, 15_005_775, 416_667] },
  failure_assessment: {
    1: {
      element_id: 1,
      material_id: 1,
      material_name: 'Acero A36',
      yield_strength_pa: 250e6,
      criterion: 'Von Mises / inicio de fluencia',
      governing_end: 'i',
      max_von_mises_pa: 30e6,
      utilization: 0.12,
      safety_factor: 8.333,
      status: 'safe',
      section_dimensions_assumed: false,
      end_i: endI,
      end_j: endJ,
      capacity: { axial_yield_n: 5e6, bending_y_yield_nm: 83_500, bending_z_yield_nm: 166_750, torsion_yield_nm: 120_377 },
      demand: { axial_force_n: 0, bending_y_nm: 0, bending_z_nm: 20_000, torsion_nm: 0 },
    },
  },
  failure_summary: {
    criterion: 'Von Mises / inicio de fluencia',
    is_safe: true,
    critical_element_id: 1,
    critical_end: 'i',
    max_von_mises_pa: 30e6,
    max_utilization: 0.12,
    min_safety_factor: 8.333,
    safe_elements: 1,
    warning_elements: 0,
    yielding_elements: 0,
    not_applicable_elements: 0,
  },
};

const plotForMode = (mode: 'displacement' | 'utilization') => ({
  data: [{
    type: 'scatter3d', x: [0, 2000], y: [0, -10], z: [0, 0], mode: 'lines',
    name: mode === 'utilization' ? 'Utilización 1' : 'Deformada 1',
    line: {
      color: mode === 'utilization' ? [0.12, 0.12] : [0, 1],
      colorscale: 'Jet', width: 5,
      colorbar: { title: mode === 'utilization' ? 'Utilización σVM / fy' : 'Deformación (mm)' },
    },
    customdata: [[0, 0, 0, 0, 0, 0, 1, 0.12], [2000, 0, 0, 0, -10, 0, 1, 0.12]],
  }, {
    type: 'scatter3d', x: [0, 2000], y: [0, -10], z: [0, 0], mode: 'markers',
    name: mode === 'utilization' ? 'Nodos · Resistencia' : 'Nodos · Deformación',
    marker: { size: 7, color: mode === 'utilization' ? [0.12, 0.00288] : [0, 1], showscale: false },
    text: mode === 'utilization'
      ? ['NODO 1 · RESISTENCIA<br>σVM: 30 MPa<br>Factor de seguridad: 8.333', 'NODO 2 · RESISTENCIA<br>σVM: 0.72 MPa<br>Factor de seguridad: 347.22']
      : ['NODO 1 · DEFORMACIÓN<br>|u|: 0 mm', 'NODO 2 · DEFORMACIÓN<br>|u|: 1 mm<br>Uy: -1 mm'],
    hovertemplate: '%{text}<extra></extra>',
  }],
  layout: { scene: { xaxis: { range: [-100, 2100] }, yaxis: { range: [-100, 100] }, zaxis: { range: [-100, 100] }, aspectmode: 'data' }, margin: { l: 0, r: 0, b: 0, t: 0 } },
});

test('static analysis reports material yielding utilization and moment capacity', async ({ page }) => {
  await page.addInitScript((data) => localStorage.setItem('fem_structure_data', JSON.stringify(data)), structure);
  await page.route('**/api/analysis/static', (route) => route.fulfill({ json: staticResults }));
  await page.route('**/api/visualization/static-results**', (route) => {
    const mode = route.request().url().includes('result_mode=utilization') ? 'utilization' : 'displacement';
    return route.fulfill({ json: plotForMode(mode) });
  });

  await page.goto('/analisis-estatico');
  await page.getByRole('button', { name: /Compute Analysis/i }).click();

  await expect(page.getByText(/Sin fluencia detectada/i)).toBeVisible();
  await expect(page.getByText(/Pasa el cursor sobre un nodo para ver desplazamientos y rotaciones/i)).toBeVisible();
  await expect(page.getByText('12.0 %').first()).toBeVisible();
  await expect(page.getByText(/E1 · i/i).first()).toBeVisible();

  await page.getByRole('button', { name: /Resistencia/i }).click();
  await expect(page.getByText(/Von Mises · inicio de fluencia/i)).toBeVisible();
  await expect(page.getByText(/Acero A36 · fy 250.00 MPa/i)).toBeVisible();
  await expect(page.getByText(/σVM máx./i)).toBeVisible();
  await expect(page.getByText(/30.00 MPa/i).first()).toBeVisible();
  await expect(page.getByText(/Mz,f: 166.75 kN·m/i)).toBeVisible();
  await expect(page.getByText(/No incluye pandeo, fatiga, fractura/i)).toBeVisible();

  const sidebar = page.getByRole('complementary', { name: /Controles y resultados del análisis estático/i });
  await expect.poll(() => sidebar.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await sidebar.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await expect.poll(() => sidebar.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  const utilizationResponse = page.waitForResponse((response) =>
    response.url().includes('/api/visualization/static-results')
      && response.url().includes('result_mode=utilization')
      && response.ok()
  );
  await page.getByRole('button', { name: 'Utilización', exact: true }).click();
  await utilizationResponse;
  await expect(page.getByText(/Mapa de utilización/i)).toBeVisible();
  await expect(page.getByText(/Pasa el cursor sobre un nodo para ver σVM, tensiones, utilización y factor de seguridad/i)).toBeVisible();

  const graph = page.locator('.js-plotly-plot').first();
  await expect.poll(() => graph.evaluate((element: any) =>
    element.data?.some((trace: any) => trace.name === 'Nodos · Resistencia'
      && trace.hovertemplate === '%{text}<extra></extra>')
  )).toBe(true);
});
