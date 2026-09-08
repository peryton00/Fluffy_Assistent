/**
 * Fluffy Desktop - Main Frontend Entrypoint
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";

const rootElement = document.getElementById("root");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error("FATAL: Root element (#root) not found in DOM");
}
