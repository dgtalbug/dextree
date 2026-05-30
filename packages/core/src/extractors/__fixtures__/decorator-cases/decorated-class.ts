export function Component(_config: { selector: string }) {
  return function (_target: unknown): void {};
}
export function Injectable(_target: unknown): void {}

@Injectable
export class UserService {}

@Component({ selector: "app-root" })
export class AppComponent {}
