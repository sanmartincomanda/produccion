Quiero que dejes mi integrador de SICAR listo para recibir un TRIGGER desde mi app de inventario.

Contexto:
- Mi app web ya tiene un boton `Disparar trigger SICAR`.
- Ese boton llama a una funcion serverless en Netlify.
- La funcion serverless enviara un POST hacia este servidor integrador.
- Tu trabajo es dejar en este servidor un endpoint seguro que reciba ese trigger y ejecute o encole el ajuste de inventario de SICAR.

Objetivo:
- Crear un endpoint HTTP tipo webhook/trigger para ajustes de inventario.
- Validar token Bearer.
- Validar payload.
- Registrar logs.
- Si se puede, encolar el trabajo y responder `202 Accepted`.
- Si no hay cola, ejecutar el integrador directamente pero manteniendo respuesta JSON clara.

Importante:
- NO abras Firebase.
- NO deshabilites autenticacion.
- NO asumas tablas de SICAR sin validarlas.
- Si ya existe un integrador, adapta ese integrador en vez de duplicarlo.
- Si faltan variables o accesos, reportalo claramente.

Payload que recibira este servidor:
```json
{
  "triggerEvent": "inventory.adjustment.requested",
  "sourceApp": "inventario-sanmartin",
  "action": "create_inventory_adjustment",
  "branchId": "CARNES SAN MARTIN GRANADA",
  "sessionId": "abc123",
  "folio": "INV0001",
  "requestedAt": "2026-04-29T18:10:00.000Z",
  "requestedBy": {
    "type": "firebase-user",
    "uid": "uid",
    "email": "usuario@empresa.com",
    "label": "usuario@empresa.com"
  },
  "dryRun": false,
  "adjustment": {
    "integration": "inventario-sanmartin",
    "adjustmentType": "inventory-count",
    "branchId": "CARNES SAN MARTIN GRANADA",
    "sessionId": "abc123",
    "folio": "INV0001",
    "countedDate": "2026-04-29",
    "supplier": "Proveedor",
    "performedBy": "Nombre",
    "performedSignature": "Nombre",
    "supervisedBy": "Supervisor",
    "supervisedSignature": "Supervisor",
    "notes": "Observaciones",
    "totalLines": 10,
    "totalBoxes": 24,
    "totalWeightLb": 301.5,
    "lines": [
      {
        "line": 1,
        "sku": "SKU001",
        "description": "Producto",
        "unit": "LB",
        "quantity": 30.5,
        "boxes": 2,
        "weights": [15.2, 15.3]
      }
    ]
  }
}
```

Headers esperados:
- `Authorization: Bearer <TOKEN_PRIVADO>`
- `Content-Type: application/json`
- `x-trigger-source: inventario-sanmartin`
- `x-trigger-event: inventory.adjustment.requested`

Lo que necesito que hagas:
1. Encuentra el integrador actual de SICAR en este servidor.
2. Si ya existe API/webhook, reutilizala o extiendela.
3. Si no existe, crea un endpoint nuevo por ejemplo:
   - `POST /api/triggers/sicar/inventory-adjustment`
4. Valida:
   - Bearer token contra variable de entorno
   - `triggerEvent`
   - `action`
   - `branchId`
   - `sessionId`
   - `adjustment.lines`
5. Registra log estructurado de entrada y resultado.
6. Ejecuta el integrador de ajuste de inventario o encolalo.
7. Responde:
   - `202` si aceptaste el trigger y generaste `jobId`
   - `200` si lo ejecutaste de inmediato
   - `400/401/422/500` si falla
8. Si el integrador puede tardar, prefiero:
   - crear `jobId`
   - guardar estado
   - devolver:
```json
{
  "ok": true,
  "accepted": true,
  "jobId": "invadj_20260429_0001",
  "message": "Trigger recibido y encolado"
}
```

Variables de entorno esperadas en este servidor:
- `SICAR_TRIGGER_TOKEN`
- variables de MySQL SICAR ya existentes
- cualquier variable propia del integrador

Entregables:
1. Endpoint funcional de trigger
2. Archivo o modulo actualizado del integrador
3. Ejemplo de `curl` para probarlo
4. Variables necesarias
5. Explicacion de como queda conectado con la app

Si necesitas probar rapido, este es el `curl` esperado:
```bash
curl -X POST "https://TU-SERVIDOR/api/triggers/sicar/inventory-adjustment" \
  -H "Authorization: Bearer TU_TOKEN_PRIVADO" \
  -H "Content-Type: application/json" \
  -H "x-trigger-source: inventario-sanmartin" \
  -H "x-trigger-event: inventory.adjustment.requested" \
  -d @trigger-body.json
```

Antes de terminar:
- dime la URL final exacta del trigger
- dime el nombre exacto de la variable token
- dime si responde `202` o `200`
- deja el integrador listo para que yo pegue esa URL en Netlify como `SICAR_TRIGGER_URL`
