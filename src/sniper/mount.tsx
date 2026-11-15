import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SniperPage } from "./SniperPage.tsx";

export function mount(root: HTMLElement): void {
  root.replaceChildren();
  createRoot(root).render(
    <StrictMode>
      <SniperPage />
    </StrictMode>,
  );
}
