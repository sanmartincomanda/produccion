// src/components/AprobacionModal.jsx
import React, { useState, useEffect } from "react";

// Helper para obtener metadatos de SKU
const getSkuMeta = (skus, sku) => (skus || []).find((s) => s.sku === sku);
const fmtNum = (n) => (Number(n) || 0).toLocaleString(undefined, {maximumFractionDigits: 2});


export default function AprobacionModal({ salida, skus, onClose, onApprove }) {
    const isOpen = !!salida; 
    
    // Estado para el campo de entrada
    const [recibidoPor, setRecibidoPor] = useState("");
    const [loading, setLoading] = useState(false);

    // 1. Resetear el campo 'recibidoPor' cada vez que se abre un nuevo traspaso
    useEffect(() => {
        if (isOpen) {
            setRecibidoPor("");
        }
    }, [isOpen]);

    // Función que se ejecuta al presionar "Confirmar Recepción"
    const handleApprove = async () => {
        if (!recibidoPor.trim()) {
            alert("Por favor, ingresa el nombre de la persona que recibe.");
            return;
        }
        setLoading(true);
        try {
            await onApprove(recibidoPor.trim());
        } catch (error) {
            alert(`Error al registrar la entrada: ${error?.message || error}`);
        } finally {
            setLoading(false);
        }
    };
    
    // Si no está abierto, no renderizar nada
    if (!isOpen) return null;
    
    const totalTraspaso = salida.lineas.reduce((sum, l) => l.pesos.reduce((a, b) => a + b, 0) + sum, 0);

    return (
        <div style={{ 
            position: "fixed", top: 0, left: 0, width: "100%", height: "100%", 
            backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1000, 
            display: "flex", justifyContent: "center", alignItems: "center" 
        }}>
            <div style={{ 
                backgroundColor: "#fff", padding: 25, borderRadius: 8, 
                maxWidth: 700, width: "90%", boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
            }}>
                <h3 style={{ borderBottom: "2px solid #ef4444", paddingBottom: 10, color: "#ef4444" }}>
                    Aprobar Salida Pendiente - Folio: {salida.folio}
                </h3>
                
                <p>
                    <strong>Origen:</strong> {salida.branchIdOrigen}
                </p>
                
                {/* Detalles de las líneas */}
                <div style={{ maxHeight: 300, overflowY: 'auto', margin: '15px 0', border: '1px solid #eee' }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9f9f9' }}>
                                <th style={{ textAlign: "left", padding: 8 }}>SKU</th>
                                <th style={{ textAlign: "left", padding: 8 }}>Descripción</th>
                                <th style={{ textAlign: "right", padding: 8 }}>Total Pesos (LB)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {salida.lineas.map((line, i) => {
                                const meta = getSkuMeta(skus, line.sku);
                                const totalLine = line.pesos.reduce((a, b) => a + b, 0);
                                return (
                                    <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: 8 }}>{line.sku}</td>
                                        <td style={{ padding: 8 }}>{meta?.nombre || 'N/D'}</td>
                                        <td style={{ textAlign: "right", padding: 8 }}>{fmtNum(totalLine)} ({line.pesos.length} cajas)</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr style={{ fontWeight: 'bold', backgroundColor: '#f1f5f9' }}>
                                <td colSpan={2} style={{ padding: 8 }}>TOTAL DEL TRASPASO</td>
                                <td style={{ textAlign: "right", padding: 8 }}>{fmtNum(totalTraspaso)} LB</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <label style={{ display: 'block', marginBottom: 10 }}>
                    Confirmación de Recepción:
                </label>
                <input
                    type="text"
                    value={recibidoPor}
                    onChange={(e) => setRecibidoPor(e.target.value)}
                    placeholder="Ingresa tu nombre para confirmar la recepción"
                    style={{ width: "100%", padding: 8, border: "1px solid #ef4444", borderRadius: 4 }}
                    required
                    disabled={loading}
                />
                
                {salida.obs && <p style={{ fontSize: 12, color: '#4b5563', fontStyle: 'italic', marginTop: 10 }}>**Obs. de Salida:** {salida.obs}</p>}


                {/* Botones de Acción */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: 15 }}>
                    <button 
                        type="button" 
                        onClick={onClose} 
                        disabled={loading}
                        style={{ background: "#e5e7eb", color: "#1f2937", padding: "8px 16px", borderRadius: 4, cursor: 'pointer' }}
                    >
                        Cancelar
                    </button>
                    <button 
                        type="button" 
                        onClick={handleApprove} 
                        disabled={loading || !recibidoPor.trim()}
                        style={{ background: "#10b981", color: "#fff", padding: "8px 16px", borderRadius: 4, cursor: 'pointer' }}
                    >
                        {loading ? "Registrando Entrada..." : "Confirmar Recepción y Aprobar"}
                    </button>
                </div>
            </div>
        </div>
    );
}