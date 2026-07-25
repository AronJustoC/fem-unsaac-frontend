import { readFileSync } from 'node:fs';
import { expect, test, type Download } from '@playwright/test';

const structure = {
  nodes: [
    { id: 1, coords: [0, 0, 0] },
    { id: 2, coords: [2, 0, 0], mass: 5 },
    { id: 3, coords: [4, 0, 0] },
  ],
  elements: [
    { id: 1, node_ids: [1, 2], material_id: 1, section_id: 1 },
    { id: 2, node_ids: [2, 3], material_id: 1, section_id: 1 },
  ],
  materials: [{ id: 1, name: 'Acero', E: 210e9, nu: 0.3, rho: 7850 }],
  sections: [{ id: 1, name: 'Rectangular', area: 0.003, Iy: 8e-6, Iz: 1.2e-5, J: 2e-6 }],
  restraints: { 1: ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] },
  loads: [],
};

const dofs = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
const labels = [1, 2, 3].flatMap((nodeId) => dofs.map((dof) => `N${nodeId}·${dof}`));

/** PNG size lives in the IHDR chunk: width at byte 16, height at byte 20. */
const pngSize = async (download: Download) => {
  const path = await download.path();
  const header = readFileSync(path!).subarray(0, 24);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
};

test('matrix window and heatmap export high-resolution PNGs and fit without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript((data) => {
    localStorage.setItem('fem_structure_data', JSON.stringify(data));
  }, structure);

  await page.route('**/api/analysis/modal', async (route) => {
    await route.fulfill({
      json: {
        frequencies: [5.2],
        mode_shapes: {
          '1': [[0, 0, 0, 0, 0, 0]],
          '2': [[0, 0.001, 0, 0, 0, 0]],
          '3': [[0, 0.002, 0, 0, 0, 0]],
        },
        mass_participation: [[80, 10, 5]],
      },
    });
  });

  await page.route('**/api/visualization/modal-results**', async (route) => {
    await route.fulfill({
      json: {
        data: [{ type: 'scatter3d', mode: 'lines', x: [0, 2000, 4000], y: [0, 0, 0], z: [0, 0, 0] }],
        layout: { margin: { l: 0, r: 0, t: 0, b: 0 }, scene: {} },
      },
    });
  });

  await page.route('**/api/analysis/global-matrices', async (route) => {
    const body = route.request().postDataJSON();
    const dimension = 18;
    const size = Math.min(body.window_size, dimension);
    const maxStart = Math.max(dimension - size, 0);
    const rowStart = Math.min(body.row_start, maxStart);
    const colStart = Math.min(body.col_start, maxStart);
    const factor = 1e6;
    const heatmap = Array.from({ length: dimension }, (_, row) =>
      Array.from({ length: dimension }, (_, column) => (row === column ? factor * (row + 1) : 0)),
    );
    const values = Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, column) =>
        rowStart + row === colStart + column ? factor * (rowStart + row + 1) : 0,
      ),
    );

    await route.fulfill({
      json: {
        matrix: {
          kind: body.matrix_kind,
          scope: body.matrix_scope,
          dimension,
          nnz: dimension * 3,
          density: 3 / dimension,
          max_abs: factor * dimension,
          min_nonzero_abs: factor * 0.2,
          diagonal_min: factor,
          diagonal_max: factor * dimension,
          symmetry_error: 0,
        },
        metadata: {
          node_count: 3,
          element_count: 2,
          total_dofs: 18,
          free_dofs: 12,
          constrained_dofs: 6,
          mass_type: 'lumped',
          mass_regularized: false,
          regularization_value: 0,
          warnings: [],
        },
        heatmap: {
          bins: dimension,
          values: heatmap,
          counts: heatmap.map((row) => row.map((value) => (value ? 1 : 0))),
        },
        window: {
          row_start: rowStart,
          col_start: colStart,
          size,
          values,
          row_labels: labels.slice(rowStart, rowStart + size),
          col_labels: labels.slice(colStart, colStart + size),
          row_global_indices: Array.from({ length: size }, (_, index) => rowStart + index),
          col_global_indices: Array.from({ length: size }, (_, index) => colStart + index),
        },
      },
    });
  });

  await page.goto('/analisis-modal');
  await page.getByRole('button', { name: /solve/i }).click();
  await page.getByRole('button', { name: /Ensamble global K \/ M/i }).click();

  const dialog = page.getByRole('dialog', { name: 'Ensamble global de matrices' });
  await expect(dialog.getByText('18 × 18').first()).toBeVisible();

  const table = dialog.locator('table');
  await expect(table).toBeVisible();

  // The 12×12 window is scaled down to fit its panel, so it needs no scrolling.
  await expect
    .poll(async () =>
      table.evaluate((element) => {
        const container = element.parentElement!.parentElement!;
        return container.scrollWidth - container.clientWidth;
      }),
    )
    .toBeLessThanOrEqual(1);

  const [tableDownload] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: /PNG/i }).last().click(),
  ]);
  const tablePng = await pngSize(tableDownload);
  // 3× the on-screen table: a 13-column window is well past 2000 px wide.
  expect(tablePng.width).toBeGreaterThan(2000);
  expect(tablePng.height).toBeGreaterThan(700);

  const [heatmapDownload] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: /PNG/i }).first().click(),
  ]);
  expect(await pngSize(heatmapDownload)).toEqual({ width: 1440, height: 1440 });
});
