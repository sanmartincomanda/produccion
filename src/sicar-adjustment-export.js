import * as XLSX from "xlsx";

const SICAR_TEMPLATE_PATH = "/templates/inventario.xls";
const DEFAULT_SHEET_NAME = "Hoja1";

function roundQuantity(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 10000) / 10000;
}

function buildFileName(session) {
  const base = String(session?.folio || session?.id || "ajuste-sicar")
    .trim()
    .replace(/[^\w.-]+/g, "_");
  return `${base}_ajuste_sicar.xls`;
}

function extractAdjustmentLines(session) {
  const items = Array.isArray(session?.items) ? session.items : [];

  return items
    .map((item) => ({
      clave: String(item?.sku || "").trim(),
      cantidad: roundQuantity(item?.totalLb),
    }))
    .filter((item) => item.clave && Number.isFinite(item.cantidad));
}

async function loadTemplateWorkbook() {
  try {
    const response = await fetch(SICAR_TEMPLATE_PATH, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`No se pudo cargar la plantilla SICAR (${response.status}).`);
    }

    const data = await response.arrayBuffer();
    return XLSX.read(data, { type: "array" });
  } catch (error) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[]]), DEFAULT_SHEET_NAME);
    return workbook;
  }
}

function buildAdjustmentWorksheet(lines) {
  const rows = [["CLAVE", "CANTIDAD"], ...lines.map((line) => [line.clave, line.cantidad])];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  worksheet["A1"] = { t: "s", v: "CLAVE", w: "CLAVE" };
  worksheet["B1"] = { t: "s", v: "CANTIDAD", w: "CANTIDAD" };

  lines.forEach((line, index) => {
    const rowNumber = index + 2;
    worksheet[`A${rowNumber}`] = {
      t: "s",
      v: line.clave,
      z: "@",
      w: line.clave,
    };
    worksheet[`B${rowNumber}`] = {
      t: "n",
      v: line.cantidad,
      z: "0.0000",
      w: line.cantidad.toFixed(4),
    };
  });

  worksheet["!ref"] = `A1:B${Math.max(lines.length + 1, 2)}`;
  worksheet["!cols"] = [{ wch: 18 }, { wch: 14 }];

  return worksheet;
}

export async function downloadSicarAdjustmentExcel(session) {
  const lines = extractAdjustmentLines(session);

  if (!lines.length) {
    throw new Error("Este levantamiento no tiene productos consolidados para generar el ajuste SICAR.");
  }

  const workbook = await loadTemplateWorkbook();
  const sheetName = workbook.SheetNames[0] || DEFAULT_SHEET_NAME;
  workbook.SheetNames = [sheetName];
  workbook.Sheets[sheetName] = buildAdjustmentWorksheet(lines);

  const fileName = buildFileName(session);
  XLSX.writeFile(workbook, fileName, {
    bookType: "xls",
    bookSST: true,
  });

  return {
    fileName,
    lineCount: lines.length,
  };
}
