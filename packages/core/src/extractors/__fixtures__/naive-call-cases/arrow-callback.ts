/* eslint-disable @typescript-eslint/no-unused-vars */
// Case 6: arrow callback — [].map(x => other(x))
function other(x: number): number {
  return x * 2;
}

function process(items: number[]) {
  return items.map((x) => other(x));
}
