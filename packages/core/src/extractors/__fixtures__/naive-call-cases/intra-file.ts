/* eslint-disable @typescript-eslint/no-unused-vars */
// Case 1: intra-file call — a() calls b()
function a() {
  b();
}

function b() {
  return 42;
}
