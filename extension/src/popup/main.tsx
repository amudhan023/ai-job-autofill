import React from "react";
import { createRoot } from "react-dom/client";
import { Popup } from "./Popup";
import "@/styles.css";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <Popup />
    </React.StrictMode>,
  );
}
