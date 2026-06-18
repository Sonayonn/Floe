// React 19 removed the global JSX namespace, so react-three-fiber's intrinsic
// elements (<mesh>, <group>, <meshStandardMaterial>, …) must be declared against
// the jsx-runtime. Required for R3F v9 + React 19 under TypeScript.
import type { ThreeElements } from "@react-three/fiber";

declare module "react/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}
