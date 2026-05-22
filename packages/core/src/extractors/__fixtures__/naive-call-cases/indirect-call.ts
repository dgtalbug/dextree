/* eslint-disable @typescript-eslint/no-unused-vars */
// Case 5: indirect call — const cb = doX; cb()
function doX() {
  return true;
}

function wrapper() {
  const cb = doX;
  cb();
}
