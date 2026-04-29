# InventarioSanMartin

Modulo de levantamiento de inventario con React, Vite, Firebase y despliegue en Netlify.

## Desarrollo

```bash
npm install
cp .env.example .env
npm run dev
```

## Firebase

Esta app usa:

- Firebase Auth para login
- Cloud Firestore para sucursales, catalogos y levantamientos
- `firebase-admin` del lado servidor para integraciones seguras

## Regla importante

No abras Firestore con reglas publicas para integrar SICAR.

Para el integrador del servidor:

1. Deja reglas de cliente restringidas.
2. Configura credenciales `FIREBASE_ADMIN_*` en Netlify.
3. Usa la funcion [netlify/functions/sicar-inventory-adjustment.cjs](./netlify/functions/sicar-inventory-adjustment.cjs).

El Admin SDK del servidor omite las reglas de Firestore, asi que no necesitas ponerlas en modo libre.

## Reglas sugeridas

Hay un ejemplo base en [firestore.rules.example](./firestore.rules.example).

## Auditoria de integrador SICAR

Template de variables para servidor:

- [server.env.example](./server.env.example)

Prompt listo para Codex del servidor:

- [prompts/auditoria-sicar-inventario.prompt.md](./prompts/auditoria-sicar-inventario.prompt.md)

Chequeo previo de variables:

```bash
npm run check:integrator-env
```

## Funcion serverless para SICAR

Endpoint:

```txt
POST /.netlify/functions/sicar-inventory-adjustment
```

Headers:

```txt
Authorization: Bearer <INTERNAL_API_TOKEN>
Content-Type: application/json
```

Body minimo:

```json
{
  "branchId": "CARNES SAN MARTIN GRANADA",
  "sessionId": "abc123",
  "dryRun": true
}
```

`dryRun: true` genera el payload y no lo envia a SICAR.

Cuando tengas el endpoint real, configura:

- `SICAR_API_URL`
- `SICAR_API_METHOD`
- `SICAR_API_TOKEN`
