import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./reset.css";

createRoot(document.getElementById("root") as HTMLElement).render(<App />);