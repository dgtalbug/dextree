export function helper(x: number): number {
  return x + 1;
}

export function useHelper(): number {
  return helper(41);
}
