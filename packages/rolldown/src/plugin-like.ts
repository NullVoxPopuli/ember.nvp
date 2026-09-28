/**
 * What this package hands back:
 * an object that rolldown and tsdown accept in `plugins`.
 *
 * Structurally this *is* rolldown's `Plugin`.
 * `name` is its only required member, every hook is optional.
 *
 * So the two are assignable in both directions:
 * - a consumer who imports rolldown's own type can still write
 *   `const plugins: Plugin[] = ember()`
 * - tsdown's `plugins` option lists `{ name: string }` among the shapes it takes
 *
 * Declaring it here, rather than re-exporting rolldown's type,
 * keeps `rolldown` out of the published declarations.
 *
 * Otherwise it has to become a runtime `dependency`, purely so consumers can resolve a type.
 * Leave it a devDependency, and the declaration bundler inlines a ~200kB private copy
 * of rolldown's types instead, nominally distinct from the consumer's own.
 *
 * The precise hook signatures still apply inside this package.
 * Each plugin function is typed with rolldown's real `Plugin` (a devDependency).
 * This type only widens what crosses the package boundary.
 */
export interface RolldownPluginLike {
  name: string;
}
