import { defineConfig } from 'vite';

const normalizedBase = (() => {
  const raw = process.env.VITE_BASE_PATH ?? '/';
  if (raw === '/') {
    return raw;
  }
  return raw.startsWith('/') ? `${raw.replace(/\/+$/, '')}/` : `/${raw.replace(/\/+$/, '')}/`;
})();

export default defineConfig({
  base: normalizedBase,
});
