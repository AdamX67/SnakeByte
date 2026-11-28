import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./fonts.css";
import "./index.css";
import App from "./App";
import { installAppFirewall } from "./game/firewall";
import { verifyCodeIntegrity } from "./game/integrity";
import { readTheme } from "./game/storage";

const root = createRoot(document.getElementById("root")!);
document.documentElement.dataset.theme = "dark";

async function boot() {
  installAppFirewall();
  await verifyCodeIntegrity();
  document.documentElement.dataset.theme = readTheme();
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot().catch(() => {
  // The integrity guard already clears storage on failure. A final fallback
  // render keeps the cabinet available even if hashing itself is unavailable.
  document.documentElement.dataset.theme = "dark";
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
