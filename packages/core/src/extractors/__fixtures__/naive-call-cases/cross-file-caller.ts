/* eslint-disable @typescript-eslint/no-unused-vars */
// Case 3: cross-file call — foo is imported, not defined here
import { foo } from "./cross-file-callee.js";

function caller() {
  foo();
}
