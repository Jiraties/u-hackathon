import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Toaster } from "react-hot-toast";
import "./style.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <Toaster position="top-right" gutter={10} toastOptions={{
      className: "fairpass-toast",
      duration: 4500,
      ariaProps: { role: "status", "aria-live": "polite" },
      success: { iconTheme: { primary: "#0075c9", secondary: "#fff" } },
      error: { duration: 6500 },
    }}/>

  </React.StrictMode>,
);
