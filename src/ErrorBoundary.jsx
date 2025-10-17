import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state = { error: null }; }
  static getDerivedStateFromError(error){ return { error }; }
  componentDidCatch(error, info){ console.error("💥 ErrorBoundary:", error, info); }
  render(){
    if (this.state.error) {
      return (
        <div style={{padding:24,fontFamily:"system-ui"}}>
          <h2>Se produjo un error en la UI</h2>
          <pre style={{whiteSpace:"pre-wrap"}}>{String(this.state.error?.stack || this.state.error)}</pre>
          <p>Abre la consola (F12 → Console) para ver detalles.</p>
        </div>
      );
    }
    return this.props.children;
  }
}