export const API_BASE = import.meta.env.DEV
  ? "http://localhost:3001"
  : `${window.location.origin}/api`;
