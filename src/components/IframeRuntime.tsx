import { useEffect, useRef } from 'react';
import iframePhone, { type IframePhone } from 'iframe-phone';

interface Props {
  /** Registry key, used as the LARA interactive id. */
  interactiveKey: string;
  /** Runnable interactive URL (from the registry). */
  url: string;
  /** Raw LARA `log` payloads: { action, value?, data? }. */
  onLog: (logData: { action: string; value?: unknown; data?: Record<string, unknown> }) => void;
  /** Latest interactiveState reported by the interactive (kept for snapshots, SPEC §6.1). */
  onInteractiveState?: (state: unknown) => void;
}

// Trimmed from activity-player's iframe-runtime.tsx (SPEC §6.1). Keeps the iframe-phone
// ParentEndpoint wiring, the anonymous/non-portal `initInteractive` handshake, and the
// `log` + `interactiveState` listeners. Everything else (Firebase, attachments, Shutterbug,
// plugins, pubsub, job manager, modals, navigation) is stubbed — no-ops or minimal error
// replies — so interactives that call them don't hang (SPEC §6.3).
export function IframeRuntime({ interactiveKey, url, onLog, onInteractiveState }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const phoneRef = useRef<IframePhone>();

  useEffect(() => {
    const id = interactiveKey;

    const initInteractive = () => {
      const phone = phoneRef.current;
      if (!phone) return;

      const post = (type: string, data?: unknown) => phone.post(type, data);
      const addListener = (type: string, handler: (data: any) => void) =>
        phone.addListener(type, handler);

      // --- Listeners we actually consume -----------------------------------------
      addListener('interactiveState', (newState: unknown) => {
        if (newState !== undefined && newState !== 'nochange' && newState !== 'touch') {
          onInteractiveState?.(newState);
        }
      });
      addListener('log', (logData: any) => {
        if (logData && typeof logData.action === 'string') onLog(logData);
      });

      // --- Stubs: keep interactives from hanging (SPEC §6.3) ----------------------
      // The iframe is sized to fill its pane, so height-from-interactive is ignored.
      addListener('height', () => undefined);
      addListener('supportedFeatures', () => undefined);
      addListener('navigation', () => undefined);
      addListener('hint', () => undefined);
      addListener('decoratedContentEvent', () => undefined);
      addListener('customMessage', () => undefined);
      // PubSub / linked-interactive listeners: no-op (no cross-interactive wiring here).
      addListener('createChannel', () => undefined);
      addListener('publish', () => undefined);
      addListener('subscribe', () => undefined);
      addListener('unsubscribe', () => undefined);
      addListener('addLinkedInteractiveStateListener', () => undefined);
      addListener('removeLinkedInteractiveStateListener', () => undefined);
      addListener('showModal', () => undefined);
      addListener('closeModal', () => undefined);
      // Requests that expect a reply: answer with a minimal error so the interactive
      // gets a response instead of waiting forever.
      addListener('getFirebaseJWT', (request: any) => {
        post('firebaseJWT', {
          requestId: request?.requestId,
          response_type: 'ERROR',
          message: 'Firebase is not available in the STEPS Copilot harness.',
        });
      });
      addListener('getAttachmentUrl', (request: any) => {
        post('attachmentUrl', {
          requestId: request?.requestId,
          response_type: 'ERROR',
          message: 'Attachments are not available in the STEPS Copilot harness.',
        });
      });
      addListener('getInteractiveSnapshot', (request: any) => {
        post('interactiveSnapshot', { requestId: request?.requestId, success: false });
      });

      // --- The initInteractive handshake (anonymous / runtime, no portalData) -----
      const initInteractiveMsg = {
        version: 1,
        mode: 'runtime',
        error: '',
        authoredState: null,
        interactiveState: null,
        globalInteractiveState: null,
        hostFeatures: {
          modal: { version: '1.0.0', lightbox: true, dialog: true, alert: false },
          getFirebaseJwt: { version: '1.0.0' },
          domain: window.location.hostname,
        },
        themeInfo: { colors: { colorA: '', colorB: '' } },
        interactiveStateUrl: '',
        collaboratorUrls: null,
        classInfoUrl: '',
        interactive: { id, name: '' },
        authInfo: { provider: '', loggedIn: false, email: '' },
        linkedInteractives: [],
      };
      phone.post('initInteractive', initInteractiveMsg);
    };

    if (iframeRef.current) {
      phoneRef.current = new iframePhone.ParentEndpoint(iframeRef.current, initInteractive);
    }

    return () => {
      phoneRef.current?.disconnect();
    };
    // Re-running reloads the iframe; only do so when the url/key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactiveKey, url]);

  return (
    <iframe
      key={interactiveKey}
      ref={iframeRef}
      src={url}
      title={interactiveKey}
      className="harness-frame"
      allow="geolocation; microphone; camera; bluetooth; clipboard-read; clipboard-write"
      allowFullScreen
      scrolling="no"
    />
  );
}
