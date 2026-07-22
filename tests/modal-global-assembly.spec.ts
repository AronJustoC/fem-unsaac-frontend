import { expect, test } from '@playwright/test';

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

test('global assembly viewer shows full and free K/M with navigable heatmap', async ({ page }) => {
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

  const requests: any[] = [];
  await page.route('**/api/analysis/global-matrices', async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const full = body.matrix_scope === 'full';
    const dimension = full ? 18 : 12;
    const matrixLabels = full ? labels : labels.slice(6);
    const size = Math.min(body.window_size, dimension);
    const maxStart = Math.max(dimension - size, 0);
    const rowStart = Math.min(body.row_start, maxStart);
    const colStart = Math.min(body.col_start, maxStart);
    const factor = body.matrix_kind === 'stiffness' ? (full ? 1e6 : 2e6) : (full ? 0.2 : 0.3);
    const bins = dimension;
    const heatmap = Array.from({ length: bins }, (_, row) =>
      Array.from({ length: bins }, (_, column) => row === column ? factor * (row + 1) : (Math.abs(row - column) === 6 ? factor * 0.2 : 0)),
    );
    const values = Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, column) => {
        const globalRow = rowStart + row;
        const globalColumn = colStart + column;
        return globalRow === globalColumn ? factor * (globalRow + 1) : 0;
      }),
    );

    await route.fulfill({
      json: {
        matrix: {
          kind: body.matrix_kind,
          scope: body.matrix_scope,
          dimension,
          nnz: dimension * 3,
          density: (dimension * 3) / (dimension * dimension),
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
          bins,
          values: heatmap,
          counts: heatmap.map((row) => row.map((value) => value ? 1 : 0)),
        },
        window: {
          row_start: rowStart,
          col_start: colStart,
          size,
          values,
          row_labels: matrixLabels.slice(rowStart, rowStart + size),
          col_labels: matrixLabels.slice(colStart, colStart + size),
          row_global_indices: Array.from({ length: size }, (_, index) => (full ? 0 : 6) + rowStart + index),
          col_global_indices: Array.from({ length: size }, (_, index) => (full ? 0 : 6) + colStart + index),
        },
      },
    });
  });

  await page.goto('/analisis-modal');
  await page.getByRole('button', { name: /solve/i }).click();
  const openButton = page.getByRole('button', { name: /Ensamble global K \/ M/i });
  await expect(openButton).toBeEnabled();
  await openButton.click();

  const dialog = page.getByRole('dialog', { name: 'Ensamble global de matrices' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('18 × 18').first()).toBeVisible();
  await expect(dialog.getByText(/matriz ensamblada antes de eliminar los apoyos/i)).toBeVisible();
  const canvas = dialog.getByLabel('Mapa completo de matriz 18 por 18');
  await expect(canvas).toBeVisible();

  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  await canvas.click({ position: { x: canvasBox!.width - 5, y: canvasBox!.height - 5 } });
  await expect.poll(() => requests.at(-1)?.row_start).toBe(6);
  await expect.poll(() => requests.at(-1)?.col_start).toBe(6);

  await dialog.getByRole('tab', { name: 'M · Masa' }).click();
  await dialog.getByRole('tab', { name: 'Libre modal' }).click();
  await expect(dialog.getByText('12 × 12').first()).toBeVisible();
  await expect(dialog.getByText(/Kff φᵢ = ωᵢ² Mff φᵢ/)).toBeVisible();
  await expect(dialog.getByRole('cell', { name: '0.3', exact: true }).first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
});
