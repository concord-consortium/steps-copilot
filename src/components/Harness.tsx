import { useRef } from 'react';
import type { ResolvedInteractive } from '../lib/url';
import { useLlmChat } from '../lib/useLlmChat';
import { LLM_LABEL } from '../lib/llm';
import { IframeRuntime } from './IframeRuntime';
import { Chat } from './Sidebar/Chat';

interface Props {
  interactive: ResolvedInteractive;
}

// Main screen: iframe left (75%), tutor sidebar right (25%). The tutor now runs on a direct
// OpenAI/Anthropic conversation (useLlmChat) seeded with the hardcoded problem, and the
// interactive's log messages are forwarded into that conversation.
export function Harness({ interactive }: Props) {
  const chat = useLlmChat({ context: interactive.context });
  // Latest interactiveState, kept for an optional snapshot; unused for now.
  const interactiveStateRef = useRef<unknown>(null);

  return (
    <div className="harness">
      <header className="bar">
        <strong className="chat-title">{interactive.context.name}</strong>
        <span className="tag">{LLM_LABEL}</span>
      </header>

      <div className="harness-main">
        <div className="harness-left">
          <IframeRuntime
            interactiveKey={interactive.key}
            url={interactive.url}
            onLog={(logData) =>
              chat.forwardLog({
                interactiveKey: interactive.key,
                action: logData.action,
                value: logData.value,
                data: logData.data,
                receivedAt: new Date().toISOString(),
              })
            }
            onInteractiveState={(state) => {
              interactiveStateRef.current = state;
            }}
          />
        </div>

        <aside className="sidebar">
          <Chat chat={chat} />
        </aside>
      </div>
    </div>
  );
}
