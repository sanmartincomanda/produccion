const DEFAULT_UNIT = "LB";
const DEFAULT_ZONE_NAME = "Zona principal";

const NUMBER_LABEL = new Intl.NumberFormat("es-NI", {
  maximumFractionDigits: 2,
});

const DATE_LABEL = new Intl.DateTimeFormat("es-NI", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DATE_TIME_LABEL = new Intl.DateTimeFormat("es-NI", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function createClientId(prefix = "item") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function todayValue() {
  const current = new Date();
  const local = new Date(current.getTime() - current.getTimezoneOffset() * 60000);
  return local.toISOString().split("T")[0];
}

export function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

export function normalizeText(value) {
  return String(value || "").trim();
}

export function roundMetric(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

export function sumWeights(weights = []) {
  return roundMetric((weights || []).reduce((total, weight) => total + Number(weight || 0), 0));
}

function sortItems(items = []) {
  return [...items].sort((left, right) => {
    const byName = String(left.nombre || "").localeCompare(String(right.nombre || ""), "es", {
      sensitivity: "base",
    });

    if (byName !== 0) {
      return byName;
    }

    return String(left.sku || "").localeCompare(String(right.sku || ""), "es", {
      sensitivity: "base",
    });
  });
}

function getProductFromIndex(productIndex, sku) {
  if (!productIndex || !sku) return null;

  if (productIndex instanceof Map) {
    return productIndex.get(normalizeSku(sku)) || null;
  }

  return null;
}

function accumulateItem(map, item) {
  const current = map.get(item.sku) || {
    sku: item.sku,
    nombre: item.nombre,
    unidad: item.unidad || DEFAULT_UNIT,
    cajas: 0,
    totalLb: 0,
  };

  current.nombre = current.nombre || item.nombre;
  current.unidad = current.unidad || item.unidad || DEFAULT_UNIT;
  current.cajas += Number(item.cajas || 0);
  current.totalLb = roundMetric(current.totalLb + Number(item.totalLb || 0));

  map.set(item.sku, current);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  if (!value) return "Pendiente";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_LABEL.format(date);
}

function formatDateTime(value) {
  if (!value) return "Pendiente";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_TIME_LABEL.format(date);
}

export function formatMetric(value) {
  return NUMBER_LABEL.format(Number(value || 0));
}

export function createDraftRow(initial = {}) {
  const explicitWeights = Array.isArray(initial.pesos)
    ? initial.pesos.map((weight) => roundMetric(weight)).filter((weight) => weight > 0)
    : [];
  const explicitTotal = roundMetric(initial.totalLb);
  const pesos = explicitWeights.length ? explicitWeights : explicitTotal > 0 ? [explicitTotal] : [];
  const totalLb = explicitTotal > 0 ? explicitTotal : sumWeights(pesos);

  return {
    id: initial.id || createClientId("row"),
    sku: normalizeSku(initial.sku),
    nombre: normalizeText(initial.nombre),
    unidad: normalizeText(initial.unidad) || DEFAULT_UNIT,
    pesos,
    cajas: Math.max(0, Number(initial.cajas || pesos.length || 0)),
    totalLb,
  };
}

export function createZone(nameOrInitial = DEFAULT_ZONE_NAME, index = 0) {
  const initial = typeof nameOrInitial === "object" ? nameOrInitial || {} : { name: nameOrInitial };
  const rowsSource = Array.isArray(initial.rows)
    ? initial.rows
    : Array.isArray(initial.items)
      ? initial.items
      : [];
  const name = normalizeText(initial.name) || (index === 0 ? DEFAULT_ZONE_NAME : `Zona ${index + 1}`);
  const rows = rowsSource.length ? rowsSource.map((row) => createDraftRow(row)) : [createDraftRow()];

  return {
    id: initial.id || createClientId("zone"),
    name,
    rows,
  };
}

export function hydrateZones(zones = [], fallbackItems = []) {
  const hasZones = Array.isArray(zones) && zones.length > 0;
  const hasFallbackItems = Array.isArray(fallbackItems) && fallbackItems.length > 0;
  const source = hasZones
    ? zones
    : hasFallbackItems
      ? [{ id: createClientId("zone"), name: DEFAULT_ZONE_NAME, rows: fallbackItems }]
      : [createZone(DEFAULT_ZONE_NAME, 0)];

  return source.map((zone, index) => createZone(zone, index));
}

export function createSaleRow(initial = {}) {
  return {
    id: initial.id || createClientId("sale"),
    sku: normalizeSku(initial.sku),
    nombre: normalizeText(initial.nombre),
    unidad: normalizeText(initial.unidad) || DEFAULT_UNIT,
    cajas: initial.cajas === 0 ? "0" : String(initial.cajas ?? ""),
    totalLb: initial.totalLb === 0 ? "0" : String(initial.totalLb ?? ""),
    note: normalizeText(initial.note || initial.observacion),
  };
}

export function hydrateSalesAdjustments(salesAdjustments = []) {
  if (!Array.isArray(salesAdjustments) || salesAdjustments.length === 0) {
    return [];
  }

  return salesAdjustments.map((item) => createSaleRow(item));
}

function normalizeCountedItem(row, productIndex) {
  const sku = normalizeSku(row?.sku);
  if (!sku) return null;

  const product = getProductFromIndex(productIndex, sku);
  const pesos = Array.isArray(row?.pesos)
    ? row.pesos.map((weight) => roundMetric(weight)).filter((weight) => weight > 0)
    : [];
  const totalLb = roundMetric(row?.totalLb || sumWeights(pesos));
  const cajas = Math.max(0, Number(row?.cajas || pesos.length || 0));

  if (totalLb <= 0 && cajas <= 0) {
    return null;
  }

  return {
    id: row.id || createClientId("row"),
    sku,
    nombre: normalizeText(row?.nombre || product?.nombre || sku),
    unidad: normalizeText(row?.unidad || product?.unidad) || DEFAULT_UNIT,
    pesos,
    cajas,
    totalLb,
  };
}

function normalizeSaleItem(row, productIndex) {
  const sku = normalizeSku(row?.sku);
  if (!sku) return null;

  const product = getProductFromIndex(productIndex, sku);
  const totalLb = roundMetric(row?.totalLb);
  const cajas = Math.max(0, Number(row?.cajas || 0));

  if (totalLb <= 0 && cajas <= 0) {
    return null;
  }

  return {
    id: row.id || createClientId("sale"),
    sku,
    nombre: normalizeText(row?.nombre || product?.nombre || sku),
    unidad: normalizeText(row?.unidad || product?.unidad) || DEFAULT_UNIT,
    cajas,
    totalLb,
    note: normalizeText(row?.note || row?.observacion),
  };
}

export function calculateInventorySnapshot(zonesInput = [], salesInput = [], productIndex = new Map()) {
  const zones = hydrateZones(zonesInput);
  const grossMap = new Map();
  const zoneSummaries = zones.map((zone) => {
    const items = zone.rows
      .map((row) => normalizeCountedItem(row, productIndex))
      .filter(Boolean);

    items.forEach((item) => accumulateItem(grossMap, item));

    return {
      id: zone.id,
      name: zone.name,
      rowCount: items.length,
      totalCajas: items.reduce((total, item) => total + Number(item.cajas || 0), 0),
      totalLb: roundMetric(items.reduce((total, item) => total + Number(item.totalLb || 0), 0)),
      items,
    };
  });

  const salesMap = new Map();
  const salesEntries = hydrateSalesAdjustments(salesInput)
    .map((row) => normalizeSaleItem(row, productIndex))
    .filter(Boolean);

  salesEntries.forEach((item) => accumulateItem(salesMap, item));

  const grossItems = sortItems(Array.from(grossMap.values()));
  const salesItems = sortItems(Array.from(salesMap.values()));
  const grossBySku = new Map(grossItems.map((item) => [item.sku, item]));
  const salesBySku = new Map(salesItems.map((item) => [item.sku, item]));
  const allSkus = new Set([...grossBySku.keys(), ...salesBySku.keys()]);

  const warnings = [];
  const netItems = sortItems(
    Array.from(allSkus).map((sku) => {
      const gross = grossBySku.get(sku) || {
        sku,
        nombre: salesBySku.get(sku)?.nombre || sku,
        unidad: salesBySku.get(sku)?.unidad || DEFAULT_UNIT,
        cajas: 0,
        totalLb: 0,
      };
      const sold = salesBySku.get(sku) || {
        sku,
        nombre: gross.nombre,
        unidad: gross.unidad,
        cajas: 0,
        totalLb: 0,
      };

      if (sold.totalLb > gross.totalLb + 0.001 || sold.cajas > gross.cajas) {
        warnings.push({
          sku,
          nombre: gross.nombre,
          grossLb: gross.totalLb,
          soldLb: sold.totalLb,
          grossCajas: gross.cajas,
          soldCajas: sold.cajas,
        });
      }

      return {
        sku,
        nombre: gross.nombre,
        unidad: gross.unidad || DEFAULT_UNIT,
        cajas: Math.max(0, gross.cajas - sold.cajas),
        totalLb: roundMetric(Math.max(0, gross.totalLb - sold.totalLb)),
      };
    }),
  ).filter((item) => item.totalLb > 0 || item.cajas > 0);

  return {
    zones,
    zoneSummaries,
    grossItems,
    salesItems,
    salesEntries,
    netItems,
    warnings,
    totals: {
      zoneCount: zoneSummaries.length,
      countedRows: zoneSummaries.reduce((total, zone) => total + zone.rowCount, 0),
      grossProductCount: grossItems.length,
      grossBoxes: grossItems.reduce((total, item) => total + Number(item.cajas || 0), 0),
      grossWeight: roundMetric(grossItems.reduce((total, item) => total + Number(item.totalLb || 0), 0)),
      salesProductCount: salesItems.length,
      salesBoxes: salesItems.reduce((total, item) => total + Number(item.cajas || 0), 0),
      salesWeight: roundMetric(salesItems.reduce((total, item) => total + Number(item.totalLb || 0), 0)),
      netProductCount: netItems.length,
      netBoxes: netItems.reduce((total, item) => total + Number(item.cajas || 0), 0),
      netWeight: roundMetric(netItems.reduce((total, item) => total + Number(item.totalLb || 0), 0)),
      warningCount: warnings.length,
    },
  };
}

export function buildEditableSessionState(session) {
  const zones = hydrateZones(session?.zones, session?.items);

  return {
    sessionId: session?.id || null,
    status: session?.status || "en_espera",
    folio: normalizeText(session?.folio),
    seq: Number(session?.seq || 0) || null,
    fecha: normalizeText(session?.fecha) || todayValue(),
    proveedor: normalizeText(session?.proveedor),
    realizadoPor: normalizeText(session?.realizadoPor),
    firmaRealizadoPor: normalizeText(session?.firmaRealizadoPor || session?.realizadoPor),
    supervisadoPor: normalizeText(session?.supervisadoPor),
    firmaSupervisadoPor: normalizeText(session?.firmaSupervisadoPor || session?.supervisadoPor),
    observaciones: normalizeText(session?.observaciones),
    zones,
    activeZoneId: zones[0]?.id || null,
    salesAdjustments: hydrateSalesAdjustments(session?.salesAdjustments),
  };
}

export function buildSessionPreview({
  sessionId = null,
  branchId,
  folio = "",
  status = "en_espera",
  fecha = todayValue(),
  proveedor = "",
  realizadoPor = "",
  firmaRealizadoPor = "",
  supervisadoPor = "",
  firmaSupervisadoPor = "",
  observaciones = "",
  zones = [],
  salesAdjustments = [],
  createdByEmail = "",
  productIndex = new Map(),
  timestamp = null,
}) {
  const snapshot = calculateInventorySnapshot(zones, salesAdjustments, productIndex);

  return {
    id: sessionId,
    branchId,
    folio,
    status,
    fecha,
    proveedor: normalizeText(proveedor),
    realizadoPor: normalizeText(realizadoPor),
    firmaRealizadoPor: normalizeText(firmaRealizadoPor || realizadoPor),
    supervisadoPor: normalizeText(supervisadoPor),
    firmaSupervisadoPor: normalizeText(firmaSupervisadoPor || supervisadoPor),
    observaciones: normalizeText(observaciones),
    createdByEmail: normalizeText(createdByEmail),
    timestamp,
    itemCount: snapshot.totals.netProductCount,
    totalCajas: snapshot.totals.netBoxes,
    totalPesoLb: snapshot.totals.netWeight,
    grossItemCount: snapshot.totals.grossProductCount,
    grossTotalCajas: snapshot.totals.grossBoxes,
    grossTotalPesoLb: snapshot.totals.grossWeight,
    salesAdjustmentCount: snapshot.totals.salesProductCount,
    salesTotalCajas: snapshot.totals.salesBoxes,
    salesTotalPesoLb: snapshot.totals.salesWeight,
    zoneCount: snapshot.totals.zoneCount,
    zones: snapshot.zones,
    zoneSummaries: snapshot.zoneSummaries.map((zone) => ({
      id: zone.id,
      name: zone.name,
      rowCount: zone.rowCount,
      totalCajas: zone.totalCajas,
      totalLb: zone.totalLb,
    })),
    salesAdjustments: snapshot.salesEntries,
    grossItems: snapshot.grossItems,
    items: snapshot.netItems,
    warnings: snapshot.warnings,
  };
}

export function buildInventoryReportMarkup(session, options = {}) {
  const preview = buildSessionPreview({
    sessionId: session?.id || null,
    branchId: session?.branchId || "",
    folio: session?.folio || "",
    status: session?.status || "en_espera",
    fecha: session?.fecha || todayValue(),
    proveedor: session?.proveedor || "",
    realizadoPor: session?.realizadoPor || "",
    firmaRealizadoPor: session?.firmaRealizadoPor || "",
    supervisadoPor: session?.supervisadoPor || "",
    firmaSupervisadoPor: session?.firmaSupervisadoPor || "",
    observaciones: session?.observaciones || "",
    zones: session?.zones || [],
    salesAdjustments: session?.salesAdjustments || [],
    createdByEmail: session?.createdByEmail || "",
    timestamp: session?.timestamp || null,
  });

  const summaryCards = [
    { label: "Zonas", value: preview.zoneCount || preview.zones.length || 0 },
    { label: "Conteo bruto", value: `${formatMetric(preview.grossTotalPesoLb)} LB` },
    { label: "Ventas restadas", value: `${formatMetric(preview.salesTotalPesoLb)} LB` },
    { label: "Total a SICAR", value: `${formatMetric(preview.totalPesoLb)} LB` },
  ];

  const zonesMarkup = preview.zones
    .map((zone, index) => {
      const zoneSnapshot = calculateInventorySnapshot([zone], []);
      const items = zoneSnapshot.zoneSummaries[0]?.items || [];

      return `
        <section class="report-section">
          <div class="report-section-head">
            <div>
              <div class="report-kicker">Zona ${index + 1}</div>
              <h2>${escapeHtml(zone.name || `Zona ${index + 1}`)}</h2>
            </div>
            <div class="report-inline-stats">
              <span>${items.length} productos</span>
              <span>${zoneSnapshot.totals.grossBoxes} cajas</span>
              <span>${formatMetric(zoneSnapshot.totals.grossWeight)} LB</span>
            </div>
          </div>
          ${
            items.length
              ? `<table class="report-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Producto</th>
                      <th>Cajas</th>
                      <th>Total LB</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${items
                      .map(
                        (item) => `
                          <tr>
                            <td>${escapeHtml(item.sku)}</td>
                            <td>${escapeHtml(item.nombre)}</td>
                            <td>${formatMetric(item.cajas)}</td>
                            <td>${formatMetric(item.totalLb)}</td>
                          </tr>`,
                      )
                      .join("")}
                  </tbody>
                </table>`
              : `<div class="report-empty">No se registraron productos en esta zona.</div>`
          }
        </section>
      `;
    })
    .join("");

  const salesMarkup =
    preview.salesAdjustments.length > 0
      ? `
        <section class="report-section">
          <div class="report-section-head">
            <div>
              <div class="report-kicker">Ajuste operativo</div>
              <h2>Ventas restadas durante el levantamiento</h2>
            </div>
            <div class="report-inline-stats">
              <span>${preview.salesAdjustmentCount} productos</span>
              <span>${preview.salesTotalCajas} cajas</span>
              <span>${formatMetric(preview.salesTotalPesoLb)} LB</span>
            </div>
          </div>
          <table class="report-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th>Cajas</th>
                <th>Total LB</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              ${preview.salesAdjustments
                .map(
                  (item) => `
                    <tr>
                      <td>${escapeHtml(item.sku)}</td>
                      <td>${escapeHtml(item.nombre)}</td>
                      <td>${formatMetric(item.cajas)}</td>
                      <td>${formatMetric(item.totalLb)}</td>
                      <td>${escapeHtml(item.note || "-")}</td>
                    </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </section>
      `
      : "";

  const totalsMarkup = preview.items.length
    ? `
      <section class="report-section">
        <div class="report-section-head">
          <div>
            <div class="report-kicker">Consolidado final</div>
            <h2>Total listo para subir a SICAR</h2>
          </div>
          <div class="report-inline-stats">
            <span>${preview.itemCount} productos</span>
            <span>${preview.totalCajas} cajas</span>
            <span>${formatMetric(preview.totalPesoLb)} LB</span>
          </div>
        </div>
        <table class="report-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Producto</th>
              <th>Cajas finales</th>
              <th>Total LB final</th>
            </tr>
          </thead>
          <tbody>
            ${preview.items
              .map(
                (item) => `
                  <tr>
                    <td>${escapeHtml(item.sku)}</td>
                    <td>${escapeHtml(item.nombre)}</td>
                    <td>${formatMetric(item.cajas)}</td>
                    <td>${formatMetric(item.totalLb)}</td>
                  </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </section>
    `
    : `<div class="report-empty">Aun no hay total consolidado para subir a SICAR.</div>`;

  const warningsMarkup =
    preview.warnings.length > 0
      ? `
        <section class="report-alert">
          <strong>Advertencia operativa:</strong>
          ${preview.warnings
            .map(
              (warning) =>
                `${escapeHtml(warning.sku)} (${escapeHtml(warning.nombre)}): ventas ${formatMetric(
                  warning.soldLb,
                )} LB sobre conteo ${formatMetric(warning.grossLb)} LB.`,
            )
            .join(" ")}
        </section>
      `
      : "";

  return `
    <div class="report-shell">
      <header class="report-header">
        <div>
          <div class="report-kicker">ERP San Martin · Levantamiento de inventario</div>
          <h1>${escapeHtml(preview.folio || "Levantamiento en espera")}</h1>
          <p class="report-subtitle">
            ${escapeHtml(options.title || "Reporte consolidado por zonas y total final para SICAR")}
          </p>
        </div>
        <div class="report-status ${preview.status === "capturado" ? "report-status-final" : "report-status-draft"}">
          ${preview.status === "capturado" ? "Finalizado" : "En espera"}
        </div>
      </header>

      <section class="report-meta-grid">
        <div class="report-meta-card"><span>Sucursal</span><strong>${escapeHtml(preview.branchId || "-")}</strong></div>
        <div class="report-meta-card"><span>Fecha</span><strong>${escapeHtml(formatDate(preview.fecha))}</strong></div>
        <div class="report-meta-card"><span>Proveedor</span><strong>${escapeHtml(preview.proveedor || "-")}</strong></div>
        <div class="report-meta-card"><span>Guardado</span><strong>${escapeHtml(formatDateTime(preview.timestamp))}</strong></div>
        <div class="report-meta-card"><span>Realizado por</span><strong>${escapeHtml(preview.realizadoPor || "-")}</strong></div>
        <div class="report-meta-card"><span>Supervisado por</span><strong>${escapeHtml(preview.supervisadoPor || "-")}</strong></div>
      </section>

      <section class="report-summary-grid">
        ${summaryCards
          .map(
            (card) => `
              <div class="report-summary-card">
                <span>${escapeHtml(card.label)}</span>
                <strong>${escapeHtml(card.value)}</strong>
              </div>`,
          )
          .join("")}
      </section>

      ${
        preview.observaciones
          ? `<section class="report-note"><strong>Observaciones:</strong> ${escapeHtml(preview.observaciones)}</section>`
          : ""
      }

      ${warningsMarkup}
      ${zonesMarkup}
      ${salesMarkup}
      ${totalsMarkup}

      <section class="report-signatures">
        <div class="report-signature">
          <div class="line"></div>
          <div class="small">Realizado por: ${escapeHtml(preview.firmaRealizadoPor || preview.realizadoPor || "-")}</div>
        </div>
        <div class="report-signature">
          <div class="line"></div>
          <div class="small">Supervisado por: ${escapeHtml(preview.firmaSupervisadoPor || preview.supervisadoPor || "-")}</div>
        </div>
      </section>
    </div>
  `;
}
