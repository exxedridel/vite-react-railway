import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BrowserRouter } from "react-router-dom";
import { AppContextProvider } from "./context/AppContext";
import IsAppLoader from "./components/IsAppLoader";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppContextProvider>
        <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
          <IsAppLoader />
          <App />
          <Toaster />
        </ThemeProvider>
      </AppContextProvider>
    </BrowserRouter>
  </React.StrictMode>
);
