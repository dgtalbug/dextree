/**
 * Ambient module declaration for CSS Modules (*.module.css).
 * Each imported key maps to a locally-scoped class name string at runtime.
 */
declare module "*.module.css" {
  const styles: Record<string, string>;
  export default styles;
}
