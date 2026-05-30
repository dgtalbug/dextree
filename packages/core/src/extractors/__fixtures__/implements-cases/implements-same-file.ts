export interface Animal {
  eat(): void;
}

export interface Named {
  readonly name: string;
}

export class Dog implements Animal {
  eat(): void {}
}

export class GoldenRetriever implements Animal, Named {
  readonly name = "Goldie";
  eat(): void {}
}
