const requiredFirebaseBundle = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
];

const alternativeFirebaseVar = "GOOGLE_APPLICATION_CREDENTIALS_JSON";

const requiredMySqlVars = [
  "MYSQL_HOST",
  "MYSQL_PORT",
  "MYSQL_DATABASE",
  "MYSQL_USER",
  "MYSQL_PASSWORD",
];

const optionalIntegrationVars = [
  "INTERNAL_API_TOKEN",
  "SICAR_TRIGGER_URL",
  "SICAR_TRIGGER_METHOD",
  "SICAR_TRIGGER_TOKEN",
  "SICAR_API_URL",
  "SICAR_API_METHOD",
  "SICAR_API_TOKEN",
];

function hasValue(name) {
  return typeof process.env[name] === "string" && process.env[name].trim().length > 0;
}

function maskValue(name) {
  if (!hasValue(name)) return "MISSING";
  const value = process.env[name];
  if (value.length <= 8) return "SET";
  return `SET (${value.slice(0, 3)}...${value.slice(-3)})`;
}

function printGroup(title, rows) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
  rows.forEach((row) => {
    console.log(`${row.name}: ${row.status}`);
  });
}

const firebaseSatisfied =
  hasValue(alternativeFirebaseVar) || requiredFirebaseBundle.every((name) => hasValue(name));

const mysqlSatisfied = requiredMySqlVars.every((name) => hasValue(name));

const firebaseRows = [
  { name: alternativeFirebaseVar, status: maskValue(alternativeFirebaseVar) },
  ...requiredFirebaseBundle.map((name) => ({ name, status: maskValue(name) })),
];

const mysqlRows = requiredMySqlVars.map((name) => ({
  name,
  status: maskValue(name),
}));

const optionalRows = optionalIntegrationVars.map((name) => ({
  name,
  status: maskValue(name),
}));

console.log("Verificacion de entorno para auditoria SICAR + Firebase");
console.log("======================================================");

printGroup("Firebase Admin", firebaseRows);
console.log(
  firebaseSatisfied
    ? "\nResultado Firebase: OK"
    : "\nResultado Firebase: FALTA configurar GOOGLE_APPLICATION_CREDENTIALS_JSON o el bloque FIREBASE_ADMIN_* completo.",
);

printGroup("MySQL SICAR", mysqlRows);
console.log(
  mysqlSatisfied
    ? "\nResultado MySQL: OK"
    : "\nResultado MySQL: FALTAN variables MYSQL_* para auditar SICAR.",
);

printGroup("Opcionales para la funcion serverless", optionalRows);

if (!firebaseSatisfied || !mysqlSatisfied) {
  console.log("\nEstado final: INCOMPLETO");
  process.exitCode = 1;
} else {
  console.log("\nEstado final: LISTO PARA AUDITORIA");
}
