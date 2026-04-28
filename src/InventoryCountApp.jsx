import React, { useEffect, useMemo, useState } from "react";
import {
  readInventorySetup,
  saveInventorySession,
  subscribeInventorySessions,
  summarizeInventorySession,
  syncSicarCatalogFromPedidos,
  uploadInventorySessionToSicar,
} from "./inventory-api.js";
import {
  buildEditableSessionState,
  buildInventoryReportMarkup,
  buildSessionPreview,
  calculateInventorySnapshot,
  createDraftRow,
  createSaleRow,
  createZone,
  formatMetric,
  normalizeText,
  todayValue,
} from "./inventory-session.js";
import { extractBasculaWeight, extractSanMartinWeight, printDocument } from "./utils.js";

const DATE_LABEL = new Intl.DateTimeFormat("es-NI", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const DATE_TIME_LABEL = new Intl.DateTimeFormat("es-NI", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const NAV_ITEMS = [
  {
    key: "levantamiento",
    label: "Levantamiento",
    title: "Levantamiento por zonas",
    subtitle: "Cuenta por zona, resta ventas pendientes y deja un total limpio para SICAR.",
    color: "#38bdf8",
  },
  {
    key: "catalogo",
    label: "Catalogo SICAR",
    title: "Catalogo central",
    subtitle: "Sincroniza el maestro de productos y valida que la sucursal trabaje con la ultima base.",
    color: "#22c55e",
  },
  {
    key: "historial",
    label: "Historial",
    title: "Sesiones guardadas",
    subtitle: "Continua borradores en espera, imprime reportes y sube levantamientos finalizados a SICAR.",
    color: "#f59e0b",
  },
];

const ICONS = {
  app: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
      <path d="M12 2 3 6.5 12 11l9-4.5L12 2Z" />
      <path d="M3 12.5 12 17l9-4.5" />
      <path d="M3 18.5 12 23l9-4.5" />
    </svg>
  ),
  clipboard: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4.5h6v3H9z" />
      <path d="M9 11h6M9 15h6" />
    </svg>
  ),
  database: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
      <path d="M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7" />
    </svg>
  ),
  history: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  logout: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  ),
  sync: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 2v6h-6M3 22v-6h6" />
      <path d="M20 8A8 8 0 0 0 6.3 5.3L3 8M4 16a8 8 0 0 0 13.7 2.7L21 16" />
    </svg>
  ),
  plus: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  trash: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  ),
  search: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  signature: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 17c2.8 0 3.6-4 6.5-4s2.9 3 5.5 3 3.3-2.5 6-2.5" />
      <path d="M3 21h18" />
      <path d="M8 7c0-2 1.5-4 3.5-4 1.9 0 3.5 1.7 3.5 3.7 0 1.2-.6 2.1-1.8 3.3L8 15" />
    </svg>
  ),
  user: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  ),
  calendar: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M8 2v4M16 2v4M3 10h18" />
    </svg>
  ),
  upload: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12M7 8l5-5 5 5" />
      <path d="M5 21h14" />
    </svg>
  ),
  eye: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  spark: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m12 3 1.8 4.8L19 9.5l-4 3.2 1.3 5.1L12 15.2 7.7 17.8 9 12.7 5 9.5l5.2-1.7L12 3Z" />
    </svg>
  ),
  zone: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" />
      <path d="M12 3v18" />
      <path d="m3 7.5 9 4.5 9-4.5" />
    </svg>
  ),
  pause: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 5v14M16 5v14" />
    </svg>
  ),
  play: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m8 5 11 7-11 7V5Z" />
    </svg>
  ),
  check: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="m5 12 4.2 4.2L19 6.5" />
    </svg>
  ),
  sales: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19h16" />
      <path d="M7 15V9M12 15V5M17 15v-3" />
    </svg>
  ),
  warning: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 1.8 18.1A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  ),
  report: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h5M8 9h2" />
    </svg>
  ),
  refresh: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 0 1 15.5-6.4L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.4L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  ),
  chevron: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
};

function formatDate(value) {
  if (!value) return "Sin fecha";
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

function normalizeSearch(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function createInitialZones() {
  return [createZone("Zona principal", 0)];
}

function MetricCard({ label, value, helper, accent }) {
  return (
    <div
      className="app-card-soft inventory-metric-card"
      style={{
        borderColor: `${accent}38`,
        background: `linear-gradient(135deg, ${accent}14 0%, rgba(255,255,255,0.98) 100%)`,
      }}
    >
      <div className="inventory-metric-label">{label}</div>
      <div className="inventory-metric-value">{value}</div>
      {helper ? <div className="inventory-metric-helper">{helper}</div> : null}
    </div>
  );
}

function MessageBanner({ message, onClose }) {
  if (!message) return null;

  return (
    <div className={`inventory-banner inventory-banner-${message.type || "info"}`}>
      <div>{message.text}</div>
      <button type="button" className="app-icon-button inventory-banner-close" onClick={onClose}>
        {ICONS.trash}
      </button>
    </div>
  );
}

function StatusPill({ status }) {
  const label = status === "capturado" ? "Finalizado" : "En espera";
  return <span className={`inventory-status-pill inventory-status-pill-${status}`}>{label}</span>;
}

function SkuSearchField({ products, selectedSku, onSelect }) {
  const selectedProduct = useMemo(
    () => products.find((item) => item.sku === selectedSku) || null,
    [products, selectedSku],
  );
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (selectedProduct) {
      setQuery(`${selectedProduct.sku} - ${selectedProduct.nombre}`);
      return;
    }

    setQuery("");
  }, [selectedProduct?.sku]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    const activeProducts = products.filter((item) => item.activo ?? true);

    if (!normalizedQuery) {
      return activeProducts.slice(0, 8);
    }

    return activeProducts
      .filter((item) => {
        const sku = normalizeSearch(item.sku);
        const name = normalizeSearch(item.nombre);
        return sku.includes(normalizedQuery) || name.includes(normalizedQuery);
      })
      .slice(0, 10);
  }, [products, query]);

  const handleSelect = (product) => {
    onSelect(product);
    setQuery(product ? `${product.sku} - ${product.nombre}` : "");
    setOpen(false);
  };

  return (
    <div className="inventory-search">
      <label className="app-label">Producto SICAR</label>
      <div className="inventory-search-input-wrap">
        <span className="inventory-search-icon">{ICONS.search}</span>
        <input
          type="text"
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            setOpen(true);
            if (!value.trim() && selectedSku) {
              onSelect(null);
            }
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && filteredProducts[0]) {
              event.preventDefault();
              handleSelect(filteredProducts[0]);
            }
          }}
          placeholder="Buscar por clave o descripcion"
          className="app-input inventory-search-input"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
        />
      </div>

      {selectedProduct ? (
        <div className="inventory-selected-product">
          <span className="app-chip">{selectedProduct.sku}</span>
          <span className="inventory-selected-name">{selectedProduct.nombre}</span>
        </div>
      ) : (
        <div className="inventory-helper-text">Elige un producto antes de capturar cajas o pesos.</div>
      )}

      {open && filteredProducts.length > 0 ? (
        <div className="inventory-search-results app-scroll-y">
          {filteredProducts.map((product) => (
            <button
              type="button"
              key={product.sku}
              className="inventory-search-result"
              onMouseDown={(event) => {
                event.preventDefault();
                handleSelect(product);
              }}
            >
              <span className="app-chip">{product.sku}</span>
              <span className="inventory-search-result-name">{product.nombre}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BarcodeCapturePanel({ disabled, onAddWeight }) {
  const [smCode, setSmCode] = useState("");
  const [scaleCode, setScaleCode] = useState("");
  const [manualWeight, setManualWeight] = useState("");
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(null), 2600);
    return () => clearTimeout(timer);
  }, [message]);

  const addWeight = (weight, successMessage) => {
    const numericWeight = Number(weight || 0);
    if (!Number.isFinite(numericWeight) || numericWeight <= 0) {
      setMessage({ type: "error", text: "El peso ingresado no es valido." });
      return;
    }

    onAddWeight(numericWeight);
    setMessage({ type: "success", text: successMessage || `Caja agregada: ${formatMetric(numericWeight)} LB` });
    setSmCode("");
    setScaleCode("");
    setManualWeight("");
  };

  const readSanMartinCode = () => {
    const result = extractSanMartinWeight(smCode.replace(/\D/g, ""));
    if (!result.ok) {
      setMessage({ type: "error", text: result.error });
      return;
    }
    addWeight(result.weight, `Codigo SM agregado: ${formatMetric(result.weight)} LB`);
  };

  const readScaleCode = () => {
    const result = extractBasculaWeight(scaleCode.replace(/\D/g, ""));
    if (!result.ok) {
      setMessage({ type: "error", text: result.error });
      return;
    }
    addWeight(result.weight, `Codigo bascula agregado: ${formatMetric(result.weight)} LB`);
  };

  return (
    <div className="inventory-scan-panel app-card-soft">
      <div className="inventory-scan-grid">
        <div>
          <label className="app-label">San Martin (54 / 52)</label>
          <div className="inventory-inline-action">
            <input
              type="text"
              value={smCode}
              onChange={(event) => setSmCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  readSanMartinCode();
                }
              }}
              className="app-input"
              placeholder="Escanear codigo SM"
              disabled={disabled}
            />
            <button
              type="button"
              className="app-button-secondary inventory-inline-button"
              onClick={readSanMartinCode}
              disabled={disabled || !smCode.trim()}
            >
              Agregar
            </button>
          </div>
        </div>

        <div>
          <label className="app-label">Bascula (13)</label>
          <div className="inventory-inline-action">
            <input
              type="text"
              value={scaleCode}
              onChange={(event) => setScaleCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  readScaleCode();
                }
              }}
              className="app-input"
              placeholder="Escanear codigo bascula"
              disabled={disabled}
            />
            <button
              type="button"
              className="app-button-secondary inventory-inline-button"
              onClick={readScaleCode}
              disabled={disabled || !scaleCode.trim()}
            >
              Agregar
            </button>
          </div>
        </div>

        <div>
          <label className="app-label">Peso manual</label>
          <div className="inventory-inline-action">
            <input
              type="number"
              step="0.01"
              value={manualWeight}
              onChange={(event) => setManualWeight(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addWeight(manualWeight, `Peso manual agregado: ${formatMetric(manualWeight)} LB`);
                }
              }}
              className="app-input"
              placeholder="Ej. 12.40"
              disabled={disabled}
            />
            <button
              type="button"
              className="app-button-secondary inventory-inline-button"
              onClick={() => addWeight(manualWeight, `Peso manual agregado: ${formatMetric(manualWeight)} LB`)}
              disabled={disabled || !manualWeight.trim()}
            >
              Agregar
            </button>
          </div>
        </div>
      </div>

      {message ? (
        <div className={`inventory-inline-message inventory-inline-message-${message.type}`}>{message.text}</div>
      ) : null}
    </div>
  );
}

function CountedRowCard({
  row,
  index,
  products,
  disabled,
  onSelectProduct,
  onAddWeight,
  onRemoveWeight,
  onAddRowBelow,
  onRemoveRow,
  onClearWeights,
}) {
  const selectedProduct = useMemo(
    () => products.find((item) => item.sku === row.sku) || null,
    [products, row.sku],
  );
  const totalLb = row.totalLb || 0;
  const boxCount = row.pesos.length || row.cajas || 0;

  return (
    <article className="app-card inventory-row-card">
      <div className="inventory-row-header">
        <div>
          <div className="inventory-row-title">Producto {String(index + 1).padStart(2, "0")}</div>
          <div className="inventory-row-subtitle">
            {selectedProduct ? selectedProduct.nombre : "Selecciona el producto del catalogo antes de capturar."}
          </div>
        </div>

        <div className="inventory-row-header-right">
          <span className="app-chip">{boxCount} cajas</span>
          <span className="app-chip">{formatMetric(totalLb)} LB</span>
          <button type="button" className="app-icon-button" onClick={onRemoveRow} disabled={disabled}>
            {ICONS.trash}
          </button>
        </div>
      </div>

      <div className="inventory-row-grid">
        <SkuSearchField products={products} selectedSku={row.sku} onSelect={onSelectProduct} />

        <div className="inventory-row-summary app-card-soft">
          <div className="inventory-summary-mini">
            <span className="inventory-summary-mini-label">Clave</span>
            <strong>{selectedProduct?.sku || "Pendiente"}</strong>
          </div>
          <div className="inventory-summary-mini">
            <span className="inventory-summary-mini-label">Total</span>
            <strong>{formatMetric(totalLb)} LB</strong>
          </div>
          <div className="inventory-summary-mini">
            <span className="inventory-summary-mini-label">Lecturas</span>
            <strong>{boxCount}</strong>
          </div>
        </div>
      </div>

      <div className="inventory-weights-wrap">
        <div className="inventory-weight-list">
          {row.pesos.length === 0 ? (
            <div className="inventory-empty-card">Aun no hay cajas registradas para este producto.</div>
          ) : (
            row.pesos.map((weight, weightIndex) => (
              <button
                type="button"
                key={`${row.id}-${weightIndex}`}
                className="inventory-weight-chip"
                onClick={() => onRemoveWeight(weightIndex)}
                disabled={disabled}
                title="Quitar lectura"
              >
                {formatMetric(weight)} LB
              </button>
            ))
          )}
        </div>

        <div className="inventory-row-actions">
          <button type="button" className="app-button-ghost" onClick={onAddRowBelow} disabled={disabled}>
            {ICONS.plus}
            Agregar producto debajo
          </button>
          <button
            type="button"
            className="app-button-ghost"
            onClick={onClearWeights}
            disabled={disabled || row.pesos.length === 0}
          >
            Limpiar lecturas
          </button>
        </div>
      </div>

      <BarcodeCapturePanel disabled={disabled || !selectedProduct} onAddWeight={onAddWeight} />
    </article>
  );
}

function SalesAdjustmentRow({ row, index, products, disabled, onSelectProduct, onChange, onRemove }) {
  const selectedProduct = useMemo(
    () => products.find((item) => item.sku === row.sku) || null,
    [products, row.sku],
  );

  return (
    <article className="app-card inventory-sale-row-card">
      <div className="inventory-row-header">
        <div>
          <div className="inventory-row-title">Venta pendiente {String(index + 1).padStart(2, "0")}</div>
          <div className="inventory-row-subtitle">
            {selectedProduct
              ? "Este producto se descontara del total consolidado al finalizar."
              : "Selecciona el producto vendido para restarlo del conteo final."}
          </div>
        </div>
        <button type="button" className="app-icon-button" onClick={onRemove} disabled={disabled}>
          {ICONS.trash}
        </button>
      </div>

      <div className="inventory-sale-grid">
        <SkuSearchField products={products} selectedSku={row.sku} onSelect={onSelectProduct} />

        <div>
          <label className="app-label">Cajas vendidas</label>
          <input
            type="number"
            min="0"
            step="1"
            className="app-input"
            value={row.cajas}
            onChange={(event) => onChange({ cajas: event.target.value })}
            disabled={disabled}
            placeholder="Ej. 2"
          />
        </div>

        <div>
          <label className="app-label">Total vendido en LB</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="app-input"
            value={row.totalLb}
            onChange={(event) => onChange({ totalLb: event.target.value })}
            disabled={disabled}
            placeholder="Ej. 18.5"
          />
        </div>

        <div className="inventory-sale-note-field">
          <label className="app-label">Nota</label>
          <input
            type="text"
            className="app-input"
            value={row.note}
            onChange={(event) => onChange({ note: event.target.value })}
            disabled={disabled}
            placeholder="Ticket, comentario o referencia"
          />
        </div>
      </div>
    </article>
  );
}

function SalesAdjustmentsModal({ open, rows, products, disabled, onClose, onAddRow, onUpdateRow, onRemoveRow }) {
  const totals = useMemo(
    () =>
      rows.reduce(
        (summary, row) => ({
          boxes: summary.boxes + Number(row.cajas || 0),
          weight: summary.weight + Number(row.totalLb || 0),
        }),
        { boxes: 0, weight: 0 },
      ),
    [rows],
  );

  if (!open) return null;

  return (
    <div className="inventory-modal-backdrop" onClick={onClose}>
      <div className="inventory-modal app-panel" onClick={(event) => event.stopPropagation()}>
        <div className="inventory-modal-header">
          <div>
            <div className="app-chip">{ICONS.sales} Restar ventas</div>
            <h2 className="app-title inventory-section-title inventory-modal-title">Ventas ocurridas durante el levantamiento</h2>
            <p className="inventory-header-subtitle inventory-modal-copy">
              Guarda aqui los productos vendidos mientras se esta contando. El sistema los descuenta al consolidar el total para SICAR.
            </p>
          </div>
          <button type="button" className="app-icon-button" onClick={onClose}>
            {ICONS.trash}
          </button>
        </div>

        <div className="inventory-modal-summary">
          <div className="app-card-soft inventory-summary-card">
            <div className="inventory-summary-card-label">Productos en venta</div>
            <div className="inventory-summary-card-value">{rows.filter((row) => row.sku).length}</div>
          </div>
          <div className="app-card-soft inventory-summary-card">
            <div className="inventory-summary-card-label">Cajas a restar</div>
            <div className="inventory-summary-card-value">{totals.boxes}</div>
          </div>
          <div className="app-card-soft inventory-summary-card">
            <div className="inventory-summary-card-label">Total a restar</div>
            <div className="inventory-summary-card-value">{formatMetric(totals.weight)} LB</div>
          </div>
        </div>

        <div className="inventory-modal-body app-scroll-y">
          {rows.length === 0 ? (
            <div className="inventory-empty-card">No hay ventas registradas todavia. Agrega una linea para empezar.</div>
          ) : (
            <div className="inventory-sales-list">
              {rows.map((row, index) => (
                <SalesAdjustmentRow
                  key={row.id}
                  row={row}
                  index={index}
                  products={products}
                  disabled={disabled}
                  onSelectProduct={(product) =>
                    onUpdateRow(row.id, {
                      sku: product?.sku || "",
                      nombre: product?.nombre || "",
                      unidad: product?.unidad || "LB",
                    })
                  }
                  onChange={(changes) => onUpdateRow(row.id, changes)}
                  onRemove={() => onRemoveRow(row.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="inventory-modal-footer">
          <button type="button" className="app-button-secondary" onClick={onAddRow} disabled={disabled}>
            {ICONS.plus}
            Agregar venta
          </button>
          <button type="button" className="app-button-primary" onClick={onClose}>
            {ICONS.check}
            Guardar y cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryCard({ session, onContinue, onPrint, onUpload, uploading }) {
  const [open, setOpen] = useState(false);
  const summary = summarizeInventorySession(session);
  const zoneSummaries = Array.isArray(session.zoneSummaries) ? session.zoneSummaries : [];
  const canUpload = session.status === "capturado";

  return (
    <article className="app-card inventory-history-card">
      <div className="inventory-history-top">
        <div>
          <div className="inventory-history-folio">{session.folio || "Borrador en espera"}</div>
          <div className="inventory-history-date">
            {formatDate(session.fecha)} / Actualizado {formatDateTime(session.updatedAt || session.timestamp)}
          </div>
        </div>

        <div className="inventory-history-chips">
          <StatusPill status={session.status} />
          <span className="app-chip">{summary.zoneCount} zonas</span>
          <span className="app-chip">{formatMetric(summary.totalPesoLb)} LB netos</span>
        </div>
      </div>

      <div className="inventory-history-meta">
        <div>
          <strong>Proveedor:</strong> {session.proveedor || "Sin proveedor"}
        </div>
        <div>
          <strong>Realizado por:</strong> {session.realizadoPor || "Pendiente"}
        </div>
        <div>
          <strong>Supervisado por:</strong> {session.supervisadoPor || "Pendiente"}
        </div>
      </div>

      <div className="inventory-history-summary-grid">
        <div className="app-card-soft inventory-history-summary-card">
          <span>Conteo bruto</span>
          <strong>{formatMetric(summary.grossPesoLb)} LB</strong>
        </div>
        <div className="app-card-soft inventory-history-summary-card">
          <span>Ventas restadas</span>
          <strong>{formatMetric(summary.salesPesoLb)} LB</strong>
        </div>
        <div className="app-card-soft inventory-history-summary-card">
          <span>Total SICAR</span>
          <strong>{formatMetric(summary.totalPesoLb)} LB</strong>
        </div>
      </div>

      {session.observaciones ? <div className="inventory-history-note">{session.observaciones}</div> : null}

      {summary.warnings.length > 0 ? (
        <div className="inventory-inline-message inventory-inline-message-error inventory-history-warning">
          {ICONS.warning}
          Hay productos con ventas mayores al conteo bruto. Revisa el reporte antes de consolidar.
        </div>
      ) : null}

      <div className="inventory-history-actions">
        <div className="inventory-action-stack">
          {session.status === "en_espera" ? (
            <button type="button" className="app-button-secondary" onClick={() => onContinue(session)}>
              {ICONS.play}
              Continuar levantamiento
            </button>
          ) : null}
          <button type="button" className="app-button-ghost" onClick={() => onPrint(session)}>
            {ICONS.report}
            Reporte / PDF
          </button>
          {canUpload ? (
            <button type="button" className="app-button-primary" onClick={() => onUpload(session)} disabled={uploading}>
              {ICONS.upload}
              {uploading ? "Subiendo..." : "Subir a SICAR"}
            </button>
          ) : null}
        </div>

        <button type="button" className="app-button-ghost inventory-small-button" onClick={() => setOpen((value) => !value)}>
          {ICONS.eye}
          {open ? "Ocultar detalle" : "Ver detalle"}
        </button>
      </div>

      {open ? (
        <div className="inventory-history-detail">
          <div className="inventory-zone-mini-list">
            {zoneSummaries.length === 0 ? (
              <div className="inventory-empty-card">No hay zonas registradas en esta sesion.</div>
            ) : (
              zoneSummaries.map((zone) => (
                <div key={zone.id} className="app-card-soft inventory-zone-mini-card">
                  <strong>{zone.name}</strong>
                  <span>{zone.rowCount} productos</span>
                  <span>{zone.totalCajas} cajas</span>
                  <span>{formatMetric(zone.totalLb)} LB</span>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </article>
  );
}

export default function InventoryCountApp({ user, branchId, onLogout }) {
  const [view, setView] = useState("levantamiento");
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [catalog, setCatalog] = useState([]);
  const [providers, setProviders] = useState([]);
  const [catalogMeta, setCatalogMeta] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [message, setMessage] = useState(null);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [historyFilter, setHistoryFilter] = useState("todos");
  const [salesModalOpen, setSalesModalOpen] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [uploadingSessionId, setUploadingSessionId] = useState("");

  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [currentSessionSeq, setCurrentSessionSeq] = useState(null);
  const [currentSessionStatus, setCurrentSessionStatus] = useState("nuevo");
  const [currentFolio, setCurrentFolio] = useState("");
  const [fecha, setFecha] = useState(todayValue());
  const [proveedor, setProveedor] = useState("");
  const [realizadoPor, setRealizadoPor] = useState("");
  const [firmaRealizadoPor, setFirmaRealizadoPor] = useState("");
  const [supervisadoPor, setSupervisadoPor] = useState("");
  const [firmaSupervisadoPor, setFirmaSupervisadoPor] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [zones, setZones] = useState(createInitialZones);
  const [activeZoneId, setActiveZoneId] = useState(null);
  const [salesAdjustments, setSalesAdjustments] = useState([]);

  const busy = savingDraft || finalizing;
  const activeNav = NAV_ITEMS.find((item) => item.key === view) || NAV_ITEMS[0];

  useEffect(() => {
    let alive = true;
    setLoadingSetup(true);

    readInventorySetup(branchId, { includeRemoteFallback: true })
      .then((setup) => {
        if (!alive) return;
        setCatalog(setup.skus || []);
        setProviders(setup.proveedores || []);
        setCatalogMeta(setup.catalogMeta || null);
      })
      .catch((error) => {
        if (!alive) return;
        setMessage({
          type: "error",
          text: error?.message || "No se pudo cargar la base inicial del levantamiento.",
        });
      })
      .finally(() => {
        if (!alive) return;
        setLoadingSetup(false);
      });

    const unsubscribe = subscribeInventorySessions(
      branchId,
      (items) => {
        if (!alive) return;
        setSessions(items);
      },
      (error) => {
        if (!alive) return;
        setMessage({
          type: "error",
          text: error?.message || "No fue posible leer el historial de levantamientos.",
        });
      },
    );

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [branchId]);

  useEffect(() => {
    if (activeZoneId) {
      const exists = zones.some((zone) => zone.id === activeZoneId);
      if (exists) return;
    }

    if (zones[0]?.id) {
      setActiveZoneId(zones[0].id);
    }
  }, [activeZoneId, zones]);

  const catalogIndex = useMemo(() => new Map(catalog.map((item) => [item.sku, item])), [catalog]);

  const inventorySnapshot = useMemo(
    () => calculateInventorySnapshot(zones, salesAdjustments, catalogIndex),
    [zones, salesAdjustments, catalogIndex],
  );

  const zoneSummariesById = useMemo(
    () => new Map(inventorySnapshot.zoneSummaries.map((zone) => [zone.id, zone])),
    [inventorySnapshot.zoneSummaries],
  );

  const filteredCatalog = useMemo(() => {
    const normalizedQuery = normalizeSearch(catalogQuery);
    if (!normalizedQuery) {
      return catalog.slice(0, 180);
    }

    return catalog
      .filter((product) => {
        const sku = normalizeSearch(product.sku);
        const name = normalizeSearch(product.nombre);
        return sku.includes(normalizedQuery) || name.includes(normalizedQuery);
      })
      .slice(0, 250);
  }, [catalog, catalogQuery]);

  const filteredSessions = useMemo(() => {
    if (historyFilter === "espera") {
      return sessions.filter((session) => session.status === "en_espera");
    }

    if (historyFilter === "finalizados") {
      return sessions.filter((session) => session.status === "capturado");
    }

    return sessions;
  }, [historyFilter, sessions]);

  const currentPreview = useMemo(
    () =>
      buildSessionPreview({
        sessionId: currentSessionId,
        branchId,
        folio: currentFolio,
        status: currentSessionStatus === "capturado" ? "capturado" : "en_espera",
        fecha,
        proveedor,
        realizadoPor,
        firmaRealizadoPor,
        supervisadoPor,
        firmaSupervisadoPor,
        observaciones,
        zones,
        salesAdjustments,
        createdByEmail: user?.email || "",
        productIndex: catalogIndex,
        timestamp: new Date().toISOString(),
      }),
    [
      branchId,
      catalogIndex,
      currentFolio,
      currentSessionId,
      currentSessionStatus,
      fecha,
      firmaRealizadoPor,
      firmaSupervisadoPor,
      observaciones,
      proveedor,
      realizadoPor,
      salesAdjustments,
      supervisadoPor,
      user?.email,
      zones,
    ],
  );

  const activeZone = useMemo(
    () => zones.find((zone) => zone.id === activeZoneId) || zones[0] || null,
    [activeZoneId, zones],
  );

  const hasDraftWork = useMemo(() => {
    return (
      inventorySnapshot.totals.grossProductCount > 0 ||
      inventorySnapshot.totals.salesProductCount > 0 ||
      Boolean(normalizeText(proveedor)) ||
      Boolean(normalizeText(realizadoPor)) ||
      Boolean(normalizeText(supervisadoPor)) ||
      Boolean(normalizeText(observaciones)) ||
      currentSessionId !== null
    );
  }, [
    currentSessionId,
    inventorySnapshot.totals.grossProductCount,
    inventorySnapshot.totals.salesProductCount,
    observaciones,
    proveedor,
    realizadoPor,
    supervisadoPor,
  ]);

  const resetEditor = () => {
    const initialZones = createInitialZones();
    setCurrentSessionId(null);
    setCurrentSessionSeq(null);
    setCurrentSessionStatus("nuevo");
    setCurrentFolio("");
    setFecha(todayValue());
    setProveedor("");
    setRealizadoPor("");
    setFirmaRealizadoPor("");
    setSupervisadoPor("");
    setFirmaSupervisadoPor("");
    setObservaciones("");
    setZones(initialZones);
    setActiveZoneId(initialZones[0]?.id || null);
    setSalesAdjustments([]);
  };

  const handleStartNewSession = () => {
    if (hasDraftWork && !window.confirm("Hay cambios en el levantamiento actual. Quieres limpiarlo y empezar uno nuevo?")) {
      return;
    }

    resetEditor();
    setView("levantamiento");
    setMessage({
      type: "info",
      text: "Se preparo un levantamiento nuevo para capturar inventario por zonas.",
    });
  };

  const loadSessionIntoEditor = (session) => {
    const nextState = buildEditableSessionState(session);
    setCurrentSessionId(nextState.sessionId);
    setCurrentSessionSeq(nextState.seq);
    setCurrentSessionStatus(nextState.status);
    setCurrentFolio(nextState.folio);
    setFecha(nextState.fecha);
    setProveedor(nextState.proveedor);
    setRealizadoPor(nextState.realizadoPor);
    setFirmaRealizadoPor(nextState.firmaRealizadoPor);
    setSupervisadoPor(nextState.supervisadoPor);
    setFirmaSupervisadoPor(nextState.firmaSupervisadoPor);
    setObservaciones(nextState.observaciones);
    setZones(nextState.zones);
    setActiveZoneId(nextState.activeZoneId || nextState.zones[0]?.id || null);
    setSalesAdjustments(nextState.salesAdjustments);
    setView("levantamiento");
  };

  const handleContinueSession = (session) => {
    if (
      hasDraftWork &&
      currentSessionId !== session.id &&
      !window.confirm("El levantamiento actual tiene cambios. Quieres abrir el borrador seleccionado?")
    ) {
      return;
    }

    loadSessionIntoEditor(session);
    setMessage({
      type: "info",
      text: `Se cargo ${session.folio || "el borrador"} para continuar el levantamiento.`,
    });
  };

  const updateZone = (zoneId, updater) => {
    setZones((currentZones) =>
      currentZones.map((zone) => {
        if (zone.id !== zoneId) return zone;
        return typeof updater === "function" ? updater(zone) : { ...zone, ...updater };
      }),
    );
  };

  const updateZoneRow = (zoneId, rowId, updater) => {
    updateZone(zoneId, (zone) => ({
      ...zone,
      rows: zone.rows.map((row) => {
        if (row.id !== rowId) return row;
        const nextRow = typeof updater === "function" ? updater(row) : { ...row, ...updater };
        const pesos = Array.isArray(nextRow.pesos) ? nextRow.pesos.filter((weight) => Number(weight) > 0) : [];
        return createDraftRow({
          ...nextRow,
          pesos,
          cajas: pesos.length || nextRow.cajas || 0,
          totalLb: pesos.reduce((total, weight) => total + Number(weight || 0), 0),
        });
      }),
    }));
  };

  const handleAddZone = () => {
    const zone = createZone(`Zona ${zones.length + 1}`, zones.length);
    setZones((currentZones) => [...currentZones, zone]);
    setActiveZoneId(zone.id);
  };

  const handleRemoveZone = (zoneId) => {
    if (zones.length === 1) {
      setZones(createInitialZones());
      return;
    }

    setZones((currentZones) => currentZones.filter((zone) => zone.id !== zoneId));
  };

  const handleAddSaleRow = () => {
    setSalesAdjustments((currentRows) => [...currentRows, createSaleRow()]);
  };

  const handleUpdateSaleRow = (rowId, changes) => {
    setSalesAdjustments((currentRows) =>
      currentRows.map((row) => (row.id === rowId ? { ...row, ...changes } : row)),
    );
  };

  const handleRemoveSaleRow = (rowId) => {
    setSalesAdjustments((currentRows) => currentRows.filter((row) => row.id !== rowId));
  };

  const handleSyncCatalog = async () => {
    setSyncingCatalog(true);

    try {
      const result = await syncSicarCatalogFromPedidos(branchId);
      setCatalog(result.skus || []);
      setCatalogMeta((current) => ({
        ...(current || {}),
        source: "pedidos-internos",
        sicarSyncAt: result.syncedAt,
        remoteFallback: false,
      }));
      setMessage({
        type: "success",
        text: `Catalogo SICAR actualizado. ${result.count} productos listos para el levantamiento.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error?.message || "No se pudo sincronizar el catalogo SICAR.",
      });
    } finally {
      setSyncingCatalog(false);
    }
  };

  const buildPayload = (status) => ({
    id: currentSessionId,
    seq: currentSessionSeq,
    folio: currentFolio,
    status,
    fecha,
    proveedor,
    realizadoPor,
    firmaRealizadoPor: firmaRealizadoPor || realizadoPor,
    supervisadoPor,
    firmaSupervisadoPor: firmaSupervisadoPor || supervisadoPor,
    observaciones,
    zones,
    salesAdjustments,
    catalog,
    createdByEmail: user?.email || "",
  });

  const handleSaveDraft = async () => {
    setSavingDraft(true);

    try {
      const result = await saveInventorySession(branchId, buildPayload("en_espera"));
      setCurrentSessionId(result.id);
      setCurrentSessionSeq(result.seq || null);
      setCurrentSessionStatus("en_espera");
      setCurrentFolio(result.folio || "");
      setMessage({
        type: "success",
        text: `Levantamiento ${result.folio || "en espera"} guardado para continuar despues.`,
      });
      setView("historial");
    } catch (error) {
      setMessage({
        type: "error",
        text: error?.message || "No se pudo guardar el levantamiento en espera.",
      });
    } finally {
      setSavingDraft(false);
    }
  };

  const getFinalizeError = () => {
    if (!normalizeText(proveedor)) return "Selecciona un proveedor antes de finalizar el levantamiento.";
    if (!normalizeText(realizadoPor)) return "Escribe quien realizo el levantamiento.";
    if (!normalizeText(supervisadoPor)) return "Escribe quien superviso el levantamiento.";
    if (inventorySnapshot.totals.netProductCount === 0) return "Debes capturar al menos un producto antes de finalizar.";
    if (inventorySnapshot.totals.warningCount > 0) {
      return "Hay productos donde las ventas superan el conteo bruto. Corrige eso antes de finalizar.";
    }
    return "";
  };

  const handleFinalize = async () => {
    const validationError = getFinalizeError();
    if (validationError) {
      setMessage({ type: "error", text: validationError });
      return;
    }

    setFinalizing(true);

    try {
      const result = await saveInventorySession(branchId, buildPayload("capturado"));
      resetEditor();
      setView("historial");
      setMessage({
        type: "success",
        text: `Levantamiento ${result.folio} finalizado y guardado en historial.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error?.message || "No se pudo finalizar el levantamiento.",
      });
    } finally {
      setFinalizing(false);
    }
  };

  const handlePrintReport = (session) => {
    const reportSession = session || currentPreview;
    const title = reportSession.folio || "levantamiento-en-espera";
    printDocument(`Reporte ${title}`, buildInventoryReportMarkup(reportSession));
  };

  const handleUploadToSicar = async (session) => {
    if (!session?.id) {
      setMessage({
        type: "error",
        text: "Ese levantamiento todavia no tiene un identificador guardado para subir a SICAR.",
      });
      return;
    }

    setUploadingSessionId(session.id);

    try {
      const idToken = await user.getIdToken();
      const result = await uploadInventorySessionToSicar({
        branchId,
        sessionId: session.id,
        idToken,
      });

      setMessage({
        type: result.mode === "uploaded" ? "success" : "info",
        text:
          result.mode === "uploaded"
            ? `Levantamiento ${session.folio} enviado a SICAR correctamente.`
            : result.message || "La preparacion para SICAR quedo registrada.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error?.message || "No fue posible subir el levantamiento a SICAR.",
      });
    } finally {
      setUploadingSessionId("");
    }
  };

  const userName = user?.email || "Sesion activa";

  if (loadingSetup) {
    return (
      <div className="app-shell">
        <section className="app-panel inventory-loading">
          <div className="app-chip">{ICONS.sync} Preparando modulo</div>
          <h1 className="app-title">Cargando el levantamiento por zonas</h1>
          <p className="app-muted">
            Estamos leyendo la sucursal, el catalogo SICAR y el historial reciente para abrir la nueva experiencia de inventario.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header
        className="app-panel inventory-header"
        style={{
          background:
            "linear-gradient(135deg, rgba(54,124,189,0.98) 0%, rgba(73,138,197,0.96) 46%, rgba(232,241,249,0.96) 100%)",
        }}
      >
        <div className="inventory-header-glow" style={{ background: `linear-gradient(135deg, ${activeNav.color}20, transparent 54%)` }} />

        <div className="inventory-header-top">
          <div className="inventory-branding">
            <div className="inventory-brand-icon">{ICONS.app}</div>
            <div>
              <div className="app-chip inventory-header-chip">{ICONS.spark} ERP San Martin / Inventario</div>
              <h1 className="app-title inventory-header-title">{activeNav.title}</h1>
              <p className="inventory-header-subtitle">{activeNav.subtitle}</p>
            </div>
          </div>

          <div className="inventory-session-boxes">
            <div className="inventory-session-card">
              <div className="inventory-session-label">Sucursal</div>
              <div className="inventory-session-value">{branchId}</div>
            </div>
            <div className="inventory-session-card">
              <div className="inventory-session-label">Sesion</div>
              <div className="inventory-session-value">{userName}</div>
            </div>
            <div className="inventory-session-card">
              <div className="inventory-session-label">Estado</div>
              <div className="inventory-session-value">
                {currentSessionStatus === "capturado"
                  ? currentFolio || "Finalizado"
                  : currentSessionId
                    ? "Borrador en espera"
                    : "Nuevo levantamiento"}
              </div>
            </div>
            <button type="button" className="app-button-ghost inventory-logout" onClick={onLogout}>
              {ICONS.logout}
              Salir
            </button>
          </div>
        </div>

        <div className="inventory-metrics">
          <MetricCard label="Zonas activas" value={inventorySnapshot.totals.zoneCount} helper="Divide el levantamiento por areas" accent="#38bdf8" />
          <MetricCard label="Conteo bruto" value={`${formatMetric(inventorySnapshot.totals.grossWeight)} LB`} helper={`${inventorySnapshot.totals.grossBoxes} cajas contadas`} accent="#818cf8" />
          <MetricCard label="Ventas a restar" value={`${formatMetric(inventorySnapshot.totals.salesWeight)} LB`} helper={`${inventorySnapshot.totals.salesBoxes} cajas en ajuste`} accent="#f59e0b" />
          <MetricCard label="Total SICAR" value={`${formatMetric(inventorySnapshot.totals.netWeight)} LB`} helper={formatDate(fecha)} accent="#22c55e" />
        </div>
      </header>

      <main className="inventory-main">
        <MessageBanner message={message} onClose={() => setMessage(null)} />

        <section className="app-panel inventory-nav-panel">
          <div className="inventory-nav-row">
            {NAV_ITEMS.map((item) => (
              <button
                type="button"
                key={item.key}
                className="app-chip inventory-nav-chip"
                onClick={() => setView(item.key)}
                style={{
                  borderColor: view === item.key ? `${item.color}42` : "rgba(148,163,184,0.18)",
                  background: view === item.key ? `${item.color}16` : "rgba(247,251,255,0.98)",
                  color: view === item.key ? "#12324e" : "#55718d",
                }}
              >
                <span style={{ color: item.color }}>
                  {item.key === "levantamiento"
                    ? ICONS.clipboard
                    : item.key === "catalogo"
                      ? ICONS.database
                      : ICONS.history}
                </span>
                {item.label}
              </button>
            ))}
          </div>
        </section>

        {view === "levantamiento" ? (
          <div className="inventory-view-stack">
            <section className="app-panel inventory-section">
              <div className="inventory-section-head">
                <div>
                  <div className="app-chip">Datos base</div>
                  <h2 className="app-title inventory-section-title">Encabezado del levantamiento</h2>
                </div>
                <div className="inventory-section-meta">Solo levantamiento de inventario, organizado para capturar y retomar despues.</div>
              </div>

              <div className="inventory-grid inventory-grid-three">
                <div>
                  <label className="app-label">Proveedor</label>
                  <input
                    type="text"
                    list="provider-list"
                    value={proveedor}
                    onChange={(event) => setProveedor(event.target.value)}
                    className="app-input"
                    placeholder="Selecciona o escribe proveedor"
                  />
                  <datalist id="provider-list">
                    {providers.map((provider) => (
                      <option key={provider.id} value={provider.nombre} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="app-label">Fecha</label>
                  <div className="inventory-icon-input">
                    <span>{ICONS.calendar}</span>
                    <input type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} className="app-input" />
                  </div>
                </div>

                <div className="inventory-status-card app-card-soft">
                  <div className="inventory-status-top">
                    <span className="app-chip">Catalogo SICAR</span>
                    <button
                      type="button"
                      className="app-button-secondary inventory-small-button"
                      onClick={handleSyncCatalog}
                      disabled={syncingCatalog}
                    >
                      {ICONS.sync}
                      {syncingCatalog ? "Sincronizando..." : "Actualizar SICAR"}
                    </button>
                  </div>
                  <div className="inventory-status-text">
                    {catalogMeta?.sicarSyncAt
                      ? `Ultima sync: ${formatDateTime(catalogMeta.sicarSyncAt)}`
                      : "Sin sincronizacion registrada en esta base."}
                  </div>
                </div>
              </div>

              <div className="inventory-grid inventory-grid-two">
                <div className="app-card-soft inventory-sign-card">
                  <h3 className="inventory-sign-title">Realizado por</h3>
                  <input
                    type="text"
                    value={realizadoPor}
                    onChange={(event) => {
                      setRealizadoPor(event.target.value);
                      if (!firmaRealizadoPor.trim()) {
                        setFirmaRealizadoPor(event.target.value);
                      }
                    }}
                    className="app-input"
                    placeholder="Nombre del responsable"
                  />
                  <div className="inventory-sign-line">
                    <span className="inventory-sign-icon">{ICONS.signature}</span>
                    <input
                      type="text"
                      value={firmaRealizadoPor}
                      onChange={(event) => setFirmaRealizadoPor(event.target.value)}
                      className="app-input"
                      placeholder="Firma escrita por nombre"
                    />
                  </div>
                </div>

                <div className="app-card-soft inventory-sign-card">
                  <h3 className="inventory-sign-title">Supervisado por</h3>
                  <input
                    type="text"
                    value={supervisadoPor}
                    onChange={(event) => {
                      setSupervisadoPor(event.target.value);
                      if (!firmaSupervisadoPor.trim()) {
                        setFirmaSupervisadoPor(event.target.value);
                      }
                    }}
                    className="app-input"
                    placeholder="Nombre del supervisor"
                  />
                  <div className="inventory-sign-line">
                    <span className="inventory-sign-icon">{ICONS.signature}</span>
                    <input
                      type="text"
                      value={firmaSupervisadoPor}
                      onChange={(event) => setFirmaSupervisadoPor(event.target.value)}
                      className="app-input"
                      placeholder="Firma escrita por nombre"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="app-label">Observaciones</label>
                <textarea
                  value={observaciones}
                  onChange={(event) => setObservaciones(event.target.value)}
                  className="app-textarea"
                  placeholder="Notas generales, incidencias, turno, comentarios por area o aclaraciones del conteo."
                />
              </div>

              <div className="inventory-toolbar">
                <button type="button" className="app-button-ghost" onClick={handleStartNewSession}>
                  {ICONS.refresh}
                  Nuevo levantamiento
                </button>
                <button type="button" className="app-button-secondary" onClick={() => setSalesModalOpen(true)}>
                  {ICONS.sales}
                  Restar ventas
                </button>
                <button type="button" className="app-button-secondary" onClick={() => handlePrintReport()}>
                  {ICONS.report}
                  Vista previa / PDF
                </button>
                <button type="button" className="app-button-secondary" onClick={handleSaveDraft} disabled={busy}>
                  {ICONS.pause}
                  {savingDraft ? "Guardando..." : "Guardar en espera"}
                </button>
                <button type="button" className="app-button-primary" onClick={handleFinalize} disabled={busy}>
                  {ICONS.check}
                  {finalizing ? "Finalizando..." : "Finalizar levantamiento"}
                </button>
              </div>
            </section>

            <section className="app-panel inventory-section">
              <div className="inventory-section-head">
                <div>
                  <div className="app-chip">Flujo operativo</div>
                  <h2 className="app-title inventory-section-title">Conteo por zonas</h2>
                </div>
                <button type="button" className="app-button-primary inventory-add-line" onClick={handleAddZone} disabled={busy}>
                  {ICONS.plus}
                  Agregar zona
                </button>
              </div>

              <div className="inventory-workspace">
                <aside className="inventory-zone-rail">
                  <div className="inventory-zone-rail-header">
                    <div>
                      <div className="app-chip">{ICONS.zone} Zonas</div>
                      <p className="inventory-helper-text">Divide el recorrido del levantamiento y luego consolida todo al final.</p>
                    </div>
                  </div>

                  <div className="inventory-zone-list">
                    {zones.map((zone, index) => {
                      const summary = zoneSummariesById.get(zone.id);
                      const isActive = activeZone?.id === zone.id;
                      return (
                        <button
                          type="button"
                          key={zone.id}
                          className={`app-card-soft inventory-zone-card ${isActive ? "inventory-zone-card-active" : ""}`}
                          onClick={() => setActiveZoneId(zone.id)}
                        >
                          <div className="inventory-zone-card-head">
                            <strong>{zone.name || `Zona ${index + 1}`}</strong>
                            <span className="app-chip">{summary?.rowCount || 0}</span>
                          </div>
                          <div className="inventory-zone-card-meta">
                            <span>{summary?.totalCajas || 0} cajas</span>
                            <span>{formatMetric(summary?.totalLb || 0)} LB</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </aside>

                <div className="inventory-zone-stage">
                  {activeZone ? (
                    <>
                      <div className="inventory-zone-stage-header">
                        <div className="inventory-zone-stage-title">
                          <div className="app-chip">{ICONS.zone} Zona activa</div>
                          <h3 className="app-title inventory-zone-stage-heading">{activeZone.name}</h3>
                        </div>
                        <div className="inventory-zone-stage-actions">
                          <button
                            type="button"
                            className="app-icon-button"
                            onClick={() => handleRemoveZone(activeZone.id)}
                            disabled={busy}
                            title="Eliminar zona"
                          >
                            {ICONS.trash}
                          </button>
                        </div>
                      </div>

                      <div className="inventory-zone-stage-grid">
                        <div>
                          <label className="app-label">Nombre de la zona</label>
                          <input
                            type="text"
                            className="app-input"
                            value={activeZone.name}
                            onChange={(event) => updateZone(activeZone.id, { name: event.target.value })}
                            disabled={busy}
                            placeholder="Ej. Cuarto frio, gondola, anden, bodega..."
                          />
                        </div>

                        <div className="app-card-soft inventory-zone-stage-summary">
                          <div className="inventory-summary-mini">
                            <span className="inventory-summary-mini-label">Productos</span>
                            <strong>{zoneSummariesById.get(activeZone.id)?.rowCount || 0}</strong>
                          </div>
                          <div className="inventory-summary-mini">
                            <span className="inventory-summary-mini-label">Cajas</span>
                            <strong>{zoneSummariesById.get(activeZone.id)?.totalCajas || 0}</strong>
                          </div>
                          <div className="inventory-summary-mini">
                            <span className="inventory-summary-mini-label">Total LB</span>
                            <strong>{formatMetric(zoneSummariesById.get(activeZone.id)?.totalLb || 0)} LB</strong>
                          </div>
                        </div>
                      </div>

                      {catalog.length === 0 ? (
                        <div className="inventory-empty-card">
                          No hay catalogo disponible todavia. Sincroniza el catalogo SICAR para comenzar a capturar.
                        </div>
                      ) : (
                        <div className="inventory-row-list">
                          {activeZone.rows.map((row, index) => (
                            <CountedRowCard
                              key={row.id}
                              row={row}
                              index={index}
                              products={catalog}
                              disabled={busy}
                              onSelectProduct={(product) =>
                                updateZoneRow(activeZone.id, row.id, {
                                  sku: product?.sku || "",
                                  nombre: product?.nombre || "",
                                  unidad: product?.unidad || "LB",
                                  pesos: product?.sku && product.sku === row.sku ? row.pesos : [],
                                  cajas: product?.sku && product.sku === row.sku ? row.cajas : 0,
                                  totalLb: product?.sku && product.sku === row.sku ? row.totalLb : 0,
                                })
                              }
                              onAddWeight={(weight) =>
                                updateZoneRow(activeZone.id, row.id, (currentRow) => {
                                  const pesos = [...currentRow.pesos, Number(weight)];
                                  return {
                                    ...currentRow,
                                    pesos,
                                    cajas: pesos.length,
                                    totalLb: pesos.reduce((total, item) => total + Number(item || 0), 0),
                                  };
                                })
                              }
                              onRemoveWeight={(weightIndex) =>
                                updateZoneRow(activeZone.id, row.id, (currentRow) => {
                                  const pesos = currentRow.pesos.filter((_, indexValue) => indexValue !== weightIndex);
                                  return {
                                    ...currentRow,
                                    pesos,
                                    cajas: pesos.length,
                                    totalLb: pesos.reduce((total, item) => total + Number(item || 0), 0),
                                  };
                                })
                              }
                              onAddRowBelow={() =>
                                updateZone(activeZone.id, (zone) => {
                                  const nextRows = [...zone.rows];
                                  const rowIndex = nextRows.findIndex((item) => item.id === row.id);
                                  nextRows.splice(rowIndex + 1, 0, createDraftRow());
                                  return { ...zone, rows: nextRows };
                                })
                              }
                              onRemoveRow={() =>
                                updateZone(activeZone.id, (zone) => {
                                  if (zone.rows.length === 1) {
                                    return { ...zone, rows: [createDraftRow()] };
                                  }
                                  return { ...zone, rows: zone.rows.filter((item) => item.id !== row.id) };
                                })
                              }
                              onClearWeights={() =>
                                updateZoneRow(activeZone.id, row.id, {
                                  pesos: [],
                                  cajas: 0,
                                  totalLb: 0,
                                })
                              }
                            />
                          ))}
                        </div>
                      )}

                      <div className="inventory-zone-footer">
                        <button
                          type="button"
                          className="app-button-secondary inventory-add-line"
                          onClick={() => updateZone(activeZone.id, (zone) => ({ ...zone, rows: [...zone.rows, createDraftRow()] }))}
                          disabled={busy}
                        >
                          {ICONS.plus}
                          Agregar producto a esta zona
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="inventory-empty-card">Agrega una zona para comenzar a capturar el inventario.</div>
                  )}
                </div>
              </div>
            </section>

            <section className="app-panel inventory-section">
              <div className="inventory-section-head">
                <div>
                  <div className="app-chip">Consolidado final</div>
                  <h2 className="app-title inventory-section-title">Total listo para SICAR</h2>
                </div>
              </div>

              {inventorySnapshot.warnings.length > 0 ? (
                <div className="inventory-inline-message inventory-inline-message-error inventory-warning-banner">
                  {ICONS.warning}
                  Hay productos donde las ventas superan el conteo bruto. Ajusta esas lineas antes de finalizar.
                </div>
              ) : null}

              <div className="inventory-summary-grid inventory-summary-grid-four">
                <div className="app-card-soft inventory-summary-card">
                  <div className="inventory-summary-card-label">Zonas</div>
                  <div className="inventory-summary-card-value">{inventorySnapshot.totals.zoneCount}</div>
                </div>
                <div className="app-card-soft inventory-summary-card">
                  <div className="inventory-summary-card-label">Conteo bruto</div>
                  <div className="inventory-summary-card-value">{formatMetric(inventorySnapshot.totals.grossWeight)} LB</div>
                </div>
                <div className="app-card-soft inventory-summary-card">
                  <div className="inventory-summary-card-label">Ventas a restar</div>
                  <div className="inventory-summary-card-value">{formatMetric(inventorySnapshot.totals.salesWeight)} LB</div>
                </div>
                <div className="app-card-soft inventory-summary-card">
                  <div className="inventory-summary-card-label">Total SICAR</div>
                  <div className="inventory-summary-card-value">{formatMetric(inventorySnapshot.totals.netWeight)} LB</div>
                </div>
              </div>

              <div className="inventory-consolidated-grid">
                <div className="app-card-soft inventory-consolidated-card">
                  <div className="inventory-consolidated-head">
                    <strong>Totalizado por zona</strong>
                    <span className="app-chip">{inventorySnapshot.zoneSummaries.length} zonas</span>
                  </div>
                  <div className="inventory-zone-mini-list">
                    {inventorySnapshot.zoneSummaries.map((zone) => (
                      <div key={zone.id} className="inventory-zone-mini-card app-card-soft">
                        <strong>{zone.name}</strong>
                        <span>{zone.rowCount} productos</span>
                        <span>{zone.totalCajas} cajas</span>
                        <span>{formatMetric(zone.totalLb)} LB</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="app-card-soft inventory-consolidated-card">
                  <div className="inventory-consolidated-head">
                    <strong>Productos a subir a SICAR</strong>
                    <span className="app-chip">{currentPreview.itemCount} productos</span>
                  </div>
                  <div className="inventory-consolidated-list app-scroll-y">
                    {currentPreview.items.length === 0 ? (
                      <div className="inventory-empty-card">Aun no hay productos consolidados para subir.</div>
                    ) : (
                      currentPreview.items.map((item) => (
                        <div key={item.sku} className="inventory-catalog-item app-card-soft">
                          <span className="app-chip">{item.sku}</span>
                          <strong>{item.nombre}</strong>
                          <span>{item.cajas} cajas</span>
                          <span>{formatMetric(item.totalLb)} LB</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {view === "catalogo" ? (
          <div className="inventory-view-stack">
            <section className="app-panel inventory-section">
              <div className="inventory-section-head">
                <div>
                  <div className="app-chip">Fuente de verdad</div>
                  <h2 className="app-title inventory-section-title">Catalogo SICAR conectado</h2>
                </div>
                <button type="button" className="app-button-primary" onClick={handleSyncCatalog} disabled={syncingCatalog}>
                  {ICONS.sync}
                  {syncingCatalog ? "Sincronizando..." : "Sincronizar ahora"}
                </button>
              </div>

              <div className="inventory-summary-grid">
                <div className="app-card-soft inventory-summary-card">
                  <div className="inventory-summary-card-label">Productos</div>
                  <div className="inventory-summary-card-value">{catalog.length}</div>
                </div>
                <div className="app-card-soft inventory-summary-card">
                  <div className="inventory-summary-card-label">Ultima sync</div>
                  <div className="inventory-summary-card-value inventory-summary-card-small">
                    {catalogMeta?.sicarSyncAt ? formatDateTime(catalogMeta.sicarSyncAt) : "Pendiente"}
                  </div>
                </div>
                <div className="app-card-soft inventory-summary-card">
                  <div className="inventory-summary-card-label">Origen</div>
                  <div className="inventory-summary-card-value inventory-summary-card-small">
                    {catalogMeta?.source || "Sin fuente"}
                  </div>
                </div>
              </div>

              <div className="inventory-grid inventory-grid-two">
                <div>
                  <label className="app-label">Buscar en catalogo</label>
                  <div className="inventory-icon-input">
                    <span>{ICONS.search}</span>
                    <input
                      type="text"
                      value={catalogQuery}
                      onChange={(event) => setCatalogQuery(event.target.value)}
                      className="app-input"
                      placeholder="Filtrar por clave o descripcion"
                    />
                  </div>
                </div>

                <div className="inventory-status-card app-card-soft">
                  <div className="inventory-status-text">
                    Esta vista toma el catalogo maestro desde SICAR y lo deja listo para usarlo en el levantamiento por zonas.
                  </div>
                </div>
              </div>

              <div className="inventory-catalog-list app-scroll-y">
                {filteredCatalog.length === 0 ? (
                  <div className="inventory-empty-card">No hay productos que coincidan con la busqueda.</div>
                ) : (
                  filteredCatalog.map((product) => (
                    <div key={product.sku} className="inventory-catalog-item app-card-soft">
                      <span className="app-chip">{product.sku}</span>
                      <strong>{product.nombre}</strong>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        ) : null}

        {view === "historial" ? (
          <div className="inventory-view-stack">
            <section className="app-panel inventory-section">
              <div className="inventory-section-head">
                <div>
                  <div className="app-chip">Seguimiento</div>
                  <h2 className="app-title inventory-section-title">Sesiones guardadas</h2>
                </div>
                <div className="inventory-section-meta">{sessions.length} levantamientos visibles</div>
              </div>

              <div className="inventory-toolbar inventory-toolbar-tight">
                <button
                  type="button"
                  className={`app-chip inventory-filter-chip ${historyFilter === "todos" ? "inventory-filter-chip-active" : ""}`}
                  onClick={() => setHistoryFilter("todos")}
                >
                  Todos
                </button>
                <button
                  type="button"
                  className={`app-chip inventory-filter-chip ${historyFilter === "espera" ? "inventory-filter-chip-active" : ""}`}
                  onClick={() => setHistoryFilter("espera")}
                >
                  En espera
                </button>
                <button
                  type="button"
                  className={`app-chip inventory-filter-chip ${historyFilter === "finalizados" ? "inventory-filter-chip-active" : ""}`}
                  onClick={() => setHistoryFilter("finalizados")}
                >
                  Finalizados
                </button>
              </div>

              {filteredSessions.length === 0 ? (
                <div className="inventory-empty-card">
                  No hay levantamientos para este filtro. Crea uno nuevo o cambia la vista de historial.
                </div>
              ) : (
                <div className="inventory-history-list">
                  {filteredSessions.map((session) => (
                    <HistoryCard
                      key={session.id}
                      session={session}
                      onContinue={handleContinueSession}
                      onPrint={handlePrintReport}
                      onUpload={handleUploadToSicar}
                      uploading={uploadingSessionId === session.id}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </main>

      <SalesAdjustmentsModal
        open={salesModalOpen}
        rows={salesAdjustments}
        products={catalog}
        disabled={busy}
        onClose={() => setSalesModalOpen(false)}
        onAddRow={handleAddSaleRow}
        onUpdateRow={handleUpdateSaleRow}
        onRemoveRow={handleRemoveSaleRow}
      />
    </div>
  );
}
