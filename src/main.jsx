import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import App from "./App.jsx";                 // <-- usa el nombre real del archivo (si es App.jsx, cámbialo)
import { AuthProvider } from "./auth-context.jsx"; // <-- IMPORT NOMBRADO (o export default en el context)
import ErrorBoundary from "./ErrorBoundary.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);