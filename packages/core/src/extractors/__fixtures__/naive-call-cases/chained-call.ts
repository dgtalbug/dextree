/* eslint-disable @typescript-eslint/no-unused-vars */
// Case 9: chained call — getFoo().bar() produces two rows
function getFoo() {
  return { bar: () => 42 };
}

function run() {
  getFoo().bar();
}
