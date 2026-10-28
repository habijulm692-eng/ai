declare module 'next/server' {
  export class NextRequest extends Request {}
  export class NextResponse extends Response {
    static json(body: any, init?: ResponseInit): NextResponse;
  }
}
