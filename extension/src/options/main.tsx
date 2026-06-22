import React from "react";
import { createRoot } from "react-dom/client";
import { Options } from "./Options";
import "@/styles.css";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <Options />
    </React.StrictMode>,
  );
}
