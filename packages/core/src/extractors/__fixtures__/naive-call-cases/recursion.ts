/* eslint-disable @typescript-eslint/no-unused-vars */
// Case 2: recursion — f() calls itself
function f(n: number): number {
  if (n <= 0) return 0;
  return f(n - 1);
}
