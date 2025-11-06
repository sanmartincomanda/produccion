// src/Reportes.jsx
import React, { useEffect, useMemo, useState } from "react";
import { listenEntradas, listenSalidas, readCatalogs } from "./data-api.js"; 

/* ======================== Helpers locales ======================== */

// Helper para convertir array de objetos a CSV string
function arrayToCSV(arr, headers, customKeys = null, separator = ',', textFormatKeys = []) { // <-- Se agregó el parámetro 'textFormatKeys'
    const csvRows = [];
    
    // 1. Agregar encabezados
    const headerRow = headers.join(separator);
    csvRows.push(headerRow);
    
    // 2. Agregar filas de datos
    for (const row of arr) {
        const values = headers.map((header, index) => {
            // Determinar la clave real en el objeto de datos
            const key = customKeys ? customKeys[index] : header;
            
            let value = row[key] || ''; 
            
            // Si la clave no es encontrada, buscar por el nombre del header si no hay customKeys
            if (value === '' && !customKeys) {
                 // Manejo especial para el caso anterior de TotalLB/Counterparty
                if (header === 'TotalLB' && row.hasOwnProperty('TotalLB')) {
                    value = row.TotalLB;
                } else if (header === 'Counterparty' && row.hasOwnProperty('Counterparty')) {
                    value = row.Counterparty;
                }
            }
            
            // Manejo de valores:
            if (typeof value === 'number') {
                // Formato sin separadores de miles para el CSV
                value = String(value); 
            } else if (typeof value === 'string') {
                // Escapar comillas dobles (reemplazar " con "") y envolver la celda en comillas.
                // Si el separador es ';', escapamos los puntos y comas en el contenido por si acaso.
                value = value.replace(/"/g, '""').replace(/;/g, '\\;');
                
                // ✅ LÓGICA PARA FORZAR FORMATO DE TEXTO EN EXCEL
                if (textFormatKeys.includes(header)) {
                    // Si la cabecera está en la lista de formato texto, se antepone el apóstrofo (')
                    value = `'${value}`;
                } else {
                    // Para texto normal, se envuelve en comillas si no tiene apóstrofo
                    value = `"${value}"`;
                }
            }
            return value;
        });
        csvRows.push(values.join(separator));
    }

    return csvRows.join('\n');
}

// Helper para descargar el archivo (acepta extensión)
function downloadFile(data, filename, ext) {
    // Añadir el BOM (\ufeff) asegura que Excel interprete UTF-8 correctamente
    const mimeType = ext === 'csv' ? "text/csv;charset=utf-8;" : "application/vnd.ms-excel;charset=utf-8;";
    const file = new Blob(["\ufeff", data], { type: mimeType }); 
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = `${filename}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


const calculateMovimientoTotalWeight = (movimiento) => {
    // Recorre cada item y luego suma los pesos (cajas) que contiene
    return (movimiento.items || []).reduce((totalWeight, item) => {
        // Asegura que cada peso se convierte a número antes de sumar
        const itemWeight = (item.pesos || []).reduce((pesosTotal, peso) => pesosTotal + Number(peso), 0);
        return totalWeight + itemWeight;
    }, 0);
};

function toMs(v) {
  if (!v) return 0;
  if (typeof v === "object" && typeof v.seconds === "number") {
    return v.seconds * 1000;
  }
  const d = new Date(v);
  return isNaN(d) ? 0 : d.getTime();
}
function toISODate(v) { 
  const ms = toMs(v);
  if (!ms) return "";
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtNum(n) {
  return (Number(n) || 0).toLocaleString(undefined, {maximumFractionDigits: 2});
}
function Panel({ title, children, right }) {
  return (
    <div style={{ border: "1px solid #ccc", borderRadius: 8, marginBottom: 24 }}>
      <header style={{ 
        padding: "10px 15px", 
        backgroundColor: "#f1f5f9", 
        borderBottom: "1px solid #ccc",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
        {right}
      </header>
      <div style={{ padding: 15 }}>
        {children}
      </div>
    </div>
  );
}
/* ======================== Componente Principal ======================== */

export default function Reportes({ branchId }) {
  const [E, setE] = useState([]); // Entradas
  const [S, setS] = useState([]); // Salidas
  const [catalogs, setCatalogs] = useState({ skus: [] });
  const [dateFrom, setDateFrom] = useState(todayISODate());
  const [dateTo, setDateTo] = useState(todayISODate());
  const [loading, setLoading] = useState(true);

  // Mapeo de SKUs a metadata
  const skusMetaMap = useMemo(() => {
    return (catalogs.skus || []).reduce((acc, s) => {
      acc[s.sku] = s;
      return acc;
    }, {});
  }, [catalogs.skus]);
  
  // Función para obtener los objetos Date (para el filtro de Firestore)
  const getDatesForQuery = useMemo(() => {
    let start, end;
    
    if (dateFrom) {
      // Queremos el inicio de ese día (ej. 2024-01-01 00:00:00)
      start = new Date(dateFrom);
    }

    if (dateTo) {
      // Queremos el inicio del día SIGUIENTE para usar el operador '<' (ej. 2024-01-02 00:00:00)
      end = new Date(dateTo);
      end.setDate(end.getDate() + 1);
    }
    
    // Si la conversión falla, devolver null
    return { startDate: start, endDate: end };
  }, [dateFrom, dateTo]);


  /* Suscripciones a Entradas y Salidas */
  useEffect(() => {
    if (!branchId) return;

    setLoading(true);
    setE([]);
    setS([]);
    
    const { startDate, endDate } = getDatesForQuery;

    const unsubE = listenEntradas(branchId, startDate, endDate, (data) => {
        setE(data);
        setLoading(false);
    }, (err) => {
        console.error("Error al suscribirse a entradas:", err);
        setLoading(false);
    });

    const unsubS = listenSalidas(branchId, startDate, endDate, (data) => {
        setS(data);
        setLoading(false);
    }, (err) => {
        console.error("Error al suscribirse a salidas:", err);
        setLoading(false);
    });

    return () => {
      unsubE();
      unsubS();
    };
  }, [branchId, getDatesForQuery]); // Re-ejecutar si cambian las fechas o la sucursal


  /* Carga de Catálogos (para la descripción) */
  useEffect(() => {
    if (!branchId) return;

    async function loadCatalogs() {
      try {
        const { skus } = await readCatalogs(branchId); 
        setCatalogs(prev => ({...prev, skus: skus}));
      } catch (e) {
        console.error("Error al cargar catálogos:", e);
      }
    }
    
    loadCatalogs();
  }, [branchId]);


  /* Lógica de Consolidado (Diferencia por SKU) */
  const diff = useMemo(() => {
    const totals = {}; // { SKU: { entrada: N, salida: N } }

    const processMovs = (movs, type) => {
      movs.forEach(mov => {
        (mov.items || []).forEach(line => { 
          const sku = line.sku.trim().toUpperCase();
          const totalLB = (line.pesos || []).reduce((a, b) => a + Number(b), 0);
          
          if (!totals[sku]) totals[sku] = { entrada: 0, salida: 0 };
          totals[sku][type] += totalLB;
        });
      });
    };

    processMovs(E, 'entrada');
    processMovs(S, 'salida');

    return Object.keys(totals)
      .map(sku => {
        const desc = skusMetaMap[sku]?.nombre || 'N/D';
        const entrada = totals[sku].entrada;
        const salida = totals[sku].salida;
        return {
          sku,
          descripcion: desc,
          entrada,
          salida,
          diferencia: entrada - salida,
        };
      })
      .filter(r => r.diferencia !== 0 || r.entrada > 0 || r.salida > 0)
      .sort((a, b) => a.sku.localeCompare(b.sku));
  }, [E, S, skusMetaMap]);
  
  const netDifference = diff.reduce((sum, r) => sum + r.diferencia, 0);
  const totalEntradaGlobal = diff.reduce((sum, r) => sum + r.entrada, 0);
  const totalSalidaGlobal = diff.reduce((sum, r) => sum + r.salida, 0);

  /* Funciones de Render y Exportación */
  const renderTableES = (movs, type) => (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr>
          <th style={{ textAlign: "left", padding: 6 }}>Fecha</th>
          <th style={{ textAlign: "left", padding: 6 }}>Folio</th>
          <th style={{ textAlign: "left", padding: 6 }}>SKU</th>
          <th style={{ textAlign: "left", padding: 6 }}>Descripción</th>
          <th style={{ textAlign: "right", padding: 6 }}>Total (LB)</th>
          <th style={{ textAlign: "left", padding: 6 }}>{type === 'E' ? 'Proveedor' : 'Destino'}</th>
        </tr>
      </thead>
      <tbody>
        {movs.flatMap(mov => 
          (mov.items || []).map((line, i) => { 
            const totalLB = (line.pesos || []).reduce((a, b) => a + Number(b), 0);
            const desc = skusMetaMap[line.sku]?.nombre || 'N/D';
            const counterparty = type === 'E' ? mov.proveedor : (mov.branchIdDestino ? `Traspaso a ${mov.branchIdDestino}` : mov.destinoId || 'Venta/Consumo');
            
            return (
              <tr key={`${mov.id}-${i}`} style={{ borderTop: "1px solid #f7f7f7" }}>
                <td style={{ padding: 6 }}>{mov.fecha}</td>
                <td style={{ padding: 6 }}>{mov.folio}</td>
                <td style={{ padding: 6 }}>{line.sku}</td>
                <td style={{ padding: 6 }}>{desc}</td>
                <td style={{ textAlign: "right", padding: 6, fontWeight: 500 }}>{fmtNum(totalLB)}</td>
                <td style={{ padding: 6 }}>{counterparty}</td>
              </tr>
            );
          })
        )}
      </tbody>
      <tfoot>
        <tr style={{ fontWeight: 'bold', borderTop: '2px solid #ccc' }}>
          <td colSpan={4} style={{ padding: 6 }}>TOTAL {type === 'E' ? 'ENTRADAS' : 'SALIDAS'}</td>
          <td style={{ textAlign: "right", padding: 6 }}>{fmtNum(movs.reduce((sum, mov) => sum + calculateMovimientoTotalWeight(mov), 0))} LB</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  );
  
  // =========================================================================
  // ✅ IMPLEMENTACIÓN DE EXPORTACIÓN XLS y SICAR Export (Separador ';' y formato texto)
  // =========================================================================

  // 1. Exportar el Consolidado de Diferencias a XLS (Separador Coma)
  const xlsDiferencia = () => {
    const headers = ['sku', 'descripcion', 'entrada', 'salida', 'diferencia'];
    const csvData = arrayToCSV(diff, headers, null, ','); // Usar coma y formato estándar para el reporte normal
    downloadFile(csvData, `Reporte_Consolidado_${dateFrom}_a_${dateTo}`, 'xls'); 
  };
  
  // 2. Exportar el Consolidado para SICAR (XLS con punto y coma y CLAVE como TEXTO)
  const xlsSicarDiferencia = () => { 
      // Mapear el array 'diff' para tener solo sku y diferencia con las claves requeridas
      const dataForSicar = diff.map(item => ({
          CLAVE: item.sku,
          CANTIDAD: item.diferencia
      }));

      const headers = ['CLAVE', 'CANTIDAD'];
      
      // La clave 'CLAVE' será forzada a formato texto.
      const textFields = ['CLAVE']; 
      
      const csvData = arrayToCSV(
        dataForSicar, 
        headers, 
        ['CLAVE', 'CANTIDAD'], 
        ';', // Separador punto y coma
        textFields // Campos a forzar como texto
      ); 
      
      downloadFile(csvData, `SICAR_Consolidado_${dateFrom}_a_${dateTo}`, 'xls'); 
  };
  
  // Helper para exportar detalle de Entradas o Salidas
  const exportMovsDetail = (movs, type) => {
    const headers = ['Fecha', 'Folio', 'SKU', 'Descripcion', 'TotalLB', 'Counterparty'];
    const dataForCSV = [];

    movs.forEach(mov => {
        const counterparty = type === 'E' 
            ? mov.proveedor 
            : (mov.branchIdDestino ? `Traspaso a ${mov.branchIdDestino}` : mov.destinoId || 'Venta/Consumo');

        (mov.items || []).forEach(line => {
            const totalLB = (line.pesos || []).reduce((a, b) => a + Number(b), 0);
            const desc = skusMetaMap[line.sku]?.nombre || 'N/D';

            // Mapeamos a un objeto plano para el CSV
            dataForCSV.push({
                Fecha: mov.fecha,
                Folio: mov.folio,
                SKU: line.sku,
                Descripcion: desc,
                TotalLB: totalLB,
                Counterparty: counterparty,
            });
        });
    });

    // Usar coma como separador por defecto
    const csvData = arrayToCSV(dataForCSV, headers, null, ','); 
    const filename = `Detalle_${type === 'E' ? 'Entradas' : 'Salidas'}_${dateFrom}_a_${dateTo}`;
    downloadFile(csvData, filename, 'xls'); 
  };

  // Exportar Detalle de Entradas
  const xlsEntrada = () => exportMovsDetail(E, 'E');

  // Exportar Detalle de Salidas
  const xlsSalida = () => exportMovsDetail(S, 'S');
  
  // =========================================================================
  
  const printDiff = () => alert("Implementación de impresión pendiente...");
  const printE = () => alert("Implementación de impresión pendiente...");
  const printS = () => alert("Implementación de impresión pendiente...");

  if (!branchId) {
    return <div style={{ color: "#94a3b8" }}>Selecciona una sucursal para ver los reportes.</div>;
  }
  
  if (loading) {
      return <div style={{ padding: 24 }}>Cargando reportes...</div>;
  }
  

  return (
    <div style={{ padding: 16 }}>
      <h2>Reportes de Movimientos</h2>

      {/* Control de Fechas */}
      <div style={{ marginBottom: 24, padding: 15, border: "1px solid #ddd", borderRadius: 8, display: "inline-flex", gap: 16, alignItems: "center" }}>
        <label>
          Desde:
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ padding: 5, marginLeft: 5 }} />
        </label>
        <label>
          Hasta:
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ padding: 5, marginLeft: 5 }} />
        </label>
      </div>
      
      {/* Indicadores Consolidados */}
      <div style={{ display: 'flex', gap: 20, justifyContent: 'space-between', marginBottom: 30 }}>
            {/* Total Entrada */}
            <div style={{ padding: 20, borderRadius: 8, textAlign: 'center', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', minWidth: 200, background: '#dcfce7', border: '2px solid #10b981' }}>
                <p style={{ fontSize: 16, fontWeight: 500, color: '#059669' }}>Total Entradas (LB)</p>
                <p style={{ fontSize: 32, fontWeight: 700, color: '#047857', marginTop: 8 }}>
                    {fmtNum(totalEntradaGlobal)}
                </p>
                <p style={{ fontSize: 12, color: '#059669' }}>
                    ({E.length} documentos)
                </p>
            </div>

            {/* Total Salida */}
            <div style={{ padding: 20, borderRadius: 8, textAlign: 'center', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', minWidth: 200, background: '#fee2e2', border: '2px solid #ef4444' }}>
                <p style={{ fontSize: 16, fontWeight: 500, color: '#dc2626' }}>Total Salidas (LB)</p>
                <p style={{ fontSize: 32, fontWeight: 700, color: '#b91c1c', marginTop: 8 }}>
                    {fmtNum(totalSalidaGlobal)}
                </p>
                <p style={{ fontSize: 12, color: '#dc2626' }}>
                    ({S.length} documentos)
                </p>
            </div>

            {/* Consolidado */}
            <div style={{ padding: 20, borderRadius: 8, textAlign: 'center', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', minWidth: 200, background: '#fef3c7', border: '2px solid #f59e0b' }}>
                <p style={{ fontSize: 16, fontWeight: 500, color: '#d97706' }}>Inventario Neto (LB)</p>
                <p style={{ fontSize: 32, fontWeight: 700, color: '#b45309', marginTop: 8 }}>
                    {fmtNum(netDifference)}
                </p>
                <p style={{ fontSize: 12, color: '#d97706' }}>
                    Entrada - Salida
                </p>
            </div>
      </div>


      {/* ENTRADAS */}
      <Panel
        title={`Detalle de Entradas · ${E.length} documentos`}
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={printE}>Imprimir</button>
            <button type="button" onClick={xlsEntrada}>Exportar XLS</button>
          </div>
        }
      >
        {E.length === 0 ? <div>No hay entradas en el rango.</div> : renderTableES(E, "E")}
      </Panel>

      {/* SALIDAS */}
      <Panel
        title={`Detalle de Salidas · ${S.length} documentos`}
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={printS}>Imprimir</button>
            <button type="button" onClick={xlsSalida}>Exportar XLS</button>
          </div>
        }
      >
        {S.length === 0 ? <div>No hay salidas en el rango.</div> : renderTableES(S, "S")}
      </Panel>

      {/* DIFERENCIA */}
      <Panel
        title={`Consolidado por SKU (Entradas - Salidas) · ${diff.length} SKU`}
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={printDiff}>Imprimir</button>
            {/* Botones de Exportación */}
              <button type="button" onClick={xlsDiferencia}>Exportar XLS</button>
              <button 
                  type="button" 
                  onClick={xlsSicarDiferencia} // Esta función usa ';' como separador y .xls
                  style={{ backgroundColor: '#f59e0b', color: '#fff', border: 'none' }}
              >
                  SICAR Csv 
              </button>
          </div>
        }
      >
        {diff.length === 0 ? (
          <div>No hay movimientos en el rango seleccionado.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>
              <th style={{ textAlign: "left", padding: 6 }}>SKU</th>
              <th style={{ textAlign: "left", padding: 6 }}>Descripción</th>
              <th style={{ textAlign: "right", padding: 6 }}>Entrada (LB)</th>
              <th style={{ textAlign: "right", padding: 6 }}>Salida (LB)</th>
              <th style={{ textAlign: "right", padding: 6 }}>Diferencia (LB)</th>
            </tr></thead>
            <tbody>
              {diff.map((r) => (
                <tr key={r.sku} style={{ borderTop: "1px solid #f7f7f7" }}>
                  <td style={{ padding: 6 }}>{r.sku}</td>
                  <td style={{ padding: 6 }}>{r.descripcion}</td>
                  <td style={{ textAlign: "right", padding: 6 }}>{fmtNum(r.entrada)}</td>
                  <td style={{ textAlign: "right", padding: 6 }}>{fmtNum(r.salida)}</td>
                  <td style={{ textAlign: "right", padding: 6, fontWeight: 600, color: r.diferencia < 0 ? '#ef4444' : (r.diferencia > 0 ? '#10b981' : '#4b5563') }}>
                    {fmtNum(r.diferencia)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 'bold', borderTop: '2px solid #ccc' }}>
                <td colSpan={4} style={{ padding: 6 }}>Diferencia Neta Total</td>
                <td style={{ textAlign: "right", padding: 6, color: netDifference < 0 ? '#ef4444' : (netDifference > 0 ? '#10b981' : '#4b5563') }}>
                  {fmtNum(netDifference)} LB
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </Panel>
    </div>
  );
}