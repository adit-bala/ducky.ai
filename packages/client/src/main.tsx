import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./reset.css";
import "@radix-ui/themes/styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
