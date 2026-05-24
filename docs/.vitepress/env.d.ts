/// <reference types="vite/client" />
/// <reference types="vitepress/client" />

// Side-effect CSS imports (standard Vite pattern; needed for theme/index.ts)
declare module "*.css";
declare module "virtual:group-icons.css";

// .vue SFC modules
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
