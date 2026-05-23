export class Animal {
  speak(): string {
    return "...";
  }
}

export class Dog extends Animal {
  speak(): string {
    return "woof";
  }
}

export class GoldenRetriever extends Dog {}
