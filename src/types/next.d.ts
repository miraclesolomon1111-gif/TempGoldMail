declare module 'next/server' {
  export class NextResponse extends Response {
    static json<T = any>(body: T, init?: ResponseInit): NextResponse;
    static redirect(url: string | URL, init?: number | ResponseInit): NextResponse;
    static rewrite(destination: string | URL, init?: ResponseInit): NextResponse;
    static next(init?: ResponseInit): NextResponse;
    cookies: {
      get(name: string): { name: string; value: string } | undefined;
      set(name: string, value: string, options?: any): void;
      delete(name: string): void;
    };
  }

  export class NextRequest extends Request {
    cookies: {
      get(name: string): { name: string; value: string } | undefined;
      getAll(): { name: string; value: string }[];
      set(name: string, value: string): void;
      has(name: string): boolean;
      delete(name: string): void;
    };
    nextUrl: URL;
  }
}
