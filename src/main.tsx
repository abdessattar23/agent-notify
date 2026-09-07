import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App.tsx";
import InboxDetailPage from "./pages/InboxDetailPage.tsx";
import InboxPage from "./pages/InboxPage.tsx";
import { GoAppPage, GoBoxPage, GoCopyPage, GoLinkPage } from "./pages/GoPages.tsx";
import "./index.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("root element missing");
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/inbox/:id" element={<InboxDetailPage />} />
        <Route path="/go/app" element={<GoAppPage />} />
        <Route path="/go/link" element={<GoLinkPage />} />
        <Route path="/go/copy" element={<GoCopyPage />} />
        <Route path="/go/box" element={<GoBoxPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
