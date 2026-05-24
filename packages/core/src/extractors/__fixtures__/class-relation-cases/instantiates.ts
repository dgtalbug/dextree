import { Dog } from "./inherits-same-file.js";

export function createDog(): Dog {
  return new Dog();
}

class Trainer {
  private companion = new Dog();
  adopt(): Dog {
    return new Dog();
  }
}

export const trainer = new Trainer();
