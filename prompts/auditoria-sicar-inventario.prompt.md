Quiero una AUDITORIA TECNICA DE VIABILIDAD, no una implementacion todavia.

Antes de hacer cualquier auditoria:

1. Ejecuta `npm run check:integrator-env`.
2. Si el resultado no dice `Estado final: LISTO PARA AUDITORIA`, detente y dime exactamente que variable falta.
3. No ejecutes INSERT, UPDATE, DELETE ni cambios en produccion.
4. Trabaja en modo solo lectura.
5. Si generas SQL, que sea solo DRY-RUN.
6. No abras reglas publicas de Firebase. Usa acceso de servidor con Firebase Admin.

Objetivo:
Determinar si es viable y seguro convertir un levantamiento de inventario de mi app en Firebase a un AJUSTE DE INVENTARIO dentro de la base MySQL de SICAR.

Contexto de Firebase app inventario:

- Proyecto Firebase: inventario-sanmartin
- La app guarda levantamientos en Firestore
- Estructura principal esperada:
  - `users/{uid}` con campo `branchId`
  - `branches/{branchId}/catalogs/root` con array `skus[]`
  - `branches/{branchId}/levantamientosInventario/{sessionId}`
- Cada documento de levantamiento puede tener:
  - `folio`
  - `fecha`
  - `proveedor`
  - `realizadoPor`
  - `firmaRealizadoPor`
  - `supervisadoPor`
  - `firmaSupervisadoPor`
  - `observaciones`
  - `itemCount`
  - `totalCajas`
  - `totalPesoLb`
  - `items[]`
- Cada item normalmente tiene:
  - `sku`
  - `nombre`
  - `unidad`
  - `pesos[]`
  - `cajas`
  - `totalLb`

Credenciales esperadas:

- Firebase Admin:
  - `GOOGLE_APPLICATION_CREDENTIALS_JSON`
  - o `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`
- MySQL SICAR:
  - `MYSQL_HOST`
  - `MYSQL_PORT`
  - `MYSQL_DATABASE`
  - `MYSQL_USER`
  - `MYSQL_PASSWORD`

Tu mision:

1. Conectate a Firestore con Firebase Admin y valida que puedes leer:
   - `branches`
   - `catalogs/root`
   - `levantamientosInventario`
2. Inspecciona 3 a 5 levantamientos recientes y documenta:
   - `branchId`
   - `folio`
   - `fecha`
   - `skus` usados
   - `totalLb` por item
   - inconsistencias de datos si existen
3. Conectate a MySQL de SICAR en modo lectura.
4. Descubre el esquema real de SICAR:
   - tablas de productos
   - tablas de existencias / inventario
   - tablas de movimientos / kardex
   - tablas de ajustes
   - procedimientos almacenados relacionados
   - triggers que puedan afectar un ajuste
5. Determina si `items[].sku` en Firebase coincide realmente con la clave de producto en SICAR.
6. Determina como mapear `branchId` de Firebase con almacen/sucursal/bodega en SICAR.
7. Determina si un ajuste de inventario en SICAR se puede hacer:
   - directo por tablas
   - solo por procedimiento almacenado
   - solo por interfaz oficial / importador / API
8. Evalua si `totalLb` debe ser la cantidad real a ajustar o si requiere conversion de unidad.
9. Identifica blockers criticos:
   - productos sin match
   - unidades incompatibles
   - riesgo de corromper kardex
   - falta de documento maestro/detalle
   - dependencia de triggers o folios internos
10. Si es viable, diseña un plan de integracion DRY-RUN:
   - lectura de un levantamiento desde Firebase
   - validacion de claves
   - construccion del payload o SQL
   - transaccion segura
   - rollback
   - bitacora de resultados
11. Si no es viable hacer ajuste directo en MySQL, explica exactamente por que y cual seria la alternativa correcta.

Entregables:

A. Resumen ejecutivo
- viable / viable con condiciones / no viable

B. Evidencia tecnica
- tablas relevantes encontradas
- columnas relevantes
- procedimientos encontrados
- ejemplo de mapeo Firebase -> SICAR

C. Riesgos
- funcionales
- contables
- operativos

D. Recomendacion final
- camino sugerido
- nivel de riesgo
- siguiente paso exacto

E. Archivos
- genera `auditoria_sicar_inventario.md`
- si aplica, genera un borrador de script `audit_sicar_adjustment.(js|py)` en modo DRY-RUN
- no ejecutes escrituras reales

Antes de terminar:

- muestrame ejemplos concretos de los registros Firebase leidos
- muestrame las consultas SQL de solo lectura que usaste
- deja claro que datos faltan para pasar de auditoria a implementacion
