function local(): number {
  return 1;
}

export function callsLocal(): number {
  return local();
}
