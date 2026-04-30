import { defineConfig } from 'vite';

const normalizedBase = (() => {
  const defaultBasePath = process.env.NODE_ENV === 'production' ? '/mhh-campus/' : '/';
  const raw = process.env.VITE_BASE_PATH ?? defaultBasePath;
  if (raw === '/') {
    return raw;
  }
  return raw.startsWith('/') ? `${raw.replace(/\/+$/, '')}/` : `/${raw.replace(/\/+$/, '')}/`;
})();

export default defineConfig({
  base: normalizedBase,
});
