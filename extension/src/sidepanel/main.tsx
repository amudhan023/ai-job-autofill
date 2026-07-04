import React from "react";
import { createRoot } from "react-dom/client";
import { Popup } from "@/popup/Popup";
import "@/styles.css";

// The side panel renders the same fill-status UI as the popup (M7): it's a
// docked pane next to the job application rather than a transient popup that
// closes on blur, so state (last fill result, current session) survives as
// you work the page instead of resetting every time focus moves away.
const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <Popup />
    </React.StrictMode>,
  );
}
