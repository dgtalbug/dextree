/* eslint-disable @typescript-eslint/no-unused-vars */
// Case 4: method call — x.foo()
class MyService {
  process() {
    return 1;
  }
}

function run() {
  const x = new MyService();
  x.process();
}
