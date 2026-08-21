/**
 * Resolve the app's `@/*` path alias for standalone Node scripts.
 *
 * `tsconfig.json` maps `@/*` to `src/*`, which Next understands at build time
 * but plain `node` does not. Rather than make `src/` use relative imports just
 * to suit the scripts, this hook teaches Node the same mapping.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const srcRoot = path.resolve(import.meta.dirname, '..', 'src')

export function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const target = path.join(srcRoot, specifier.slice(2))
    return next(`${pathToFileURL(target).href}.ts`, context)
  }
  return next(specifier, context)
}
