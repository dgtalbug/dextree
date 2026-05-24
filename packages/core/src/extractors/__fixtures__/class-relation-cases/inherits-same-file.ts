export class Animal {
  speak(): string {
    return "...";
  }
}

export class Dog extends Animal {
  override speak(): string {
    return "woof";
  }
}

export class GoldenRetriever extends Dog {}
