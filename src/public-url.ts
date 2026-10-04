/** A file in `public/`, prefixed with Vite's base so GitHub Pages can find it. */
export function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL;
  const rel = path.replace(/^\//, "");
  return new URL(rel, new URL(base, location.origin)).href;
}
