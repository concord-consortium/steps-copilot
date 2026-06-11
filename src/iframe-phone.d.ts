// iframe-phone ships no types. Minimal declaration covering the ParentEndpoint API the
// harness uses (cf. activity-player's IframeRuntime).
declare module 'iframe-phone' {
  export interface IframePhone {
    post(type: string, data?: unknown): void;
    addListener(type: string, handler: (data: any) => void): void;
    disconnect(): void;
  }
  export class ParentEndpoint implements IframePhone {
    constructor(
      iframe: HTMLIFrameElement | string,
      afterConnected?: () => void,
    );
    post(type: string, data?: unknown): void;
    addListener(type: string, handler: (data: any) => void): void;
    disconnect(): void;
  }
  const iframePhone: { ParentEndpoint: typeof ParentEndpoint };
  export default iframePhone;
}
