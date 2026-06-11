// A normalized LARA `log` message. The interactive sends `{ action, value?, data? }`; the
// harness stamps the interactive key + receive time before forwarding it to the tutor.
export interface HarnessLog {
  interactiveKey: string;
  action: string;
  value?: unknown;
  data?: Record<string, unknown>;
  receivedAt: string;
}
