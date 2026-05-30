export interface Animal {
  eat(): void;
}

export class Dog {
  eat() {}
}

export class Cat extends Dog {
  meow() {}
}
