import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Lee la versión del package.json en tiempo de ejecución. Funciona tanto
 * corriendo desde `src/` (ts-jest, nest start) como desde `dist/`, porque en
 * ambos casos el package.json está un nivel por encima del archivo.
 * Importarlo desde TypeScript haría que tsc moviera la salida a `dist/src/`.
 */
export function leerVersion(): string {
  try {
    const ruta = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(ruta, 'utf8')) as { version?: string };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Versión del servicio, leída una sola vez al arrancar. */
export const version = leerVersion();
