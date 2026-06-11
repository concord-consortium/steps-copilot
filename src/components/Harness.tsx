import { useRef } from 'react';
import type { Problem } from '../lib/types';
import type { ResolvedInteractive } from '../lib/url';
import { usePerformChat } from '../lib/usePerformChat';
import { IframeRuntime } from './IframeRuntime';
import { StepTimeline } from './StepTimeline';
import { ProblemStatement } from './Sidebar/ProblemStatement';
import { PlanForm } from './Sidebar/PlanForm';
import { Chat } from './Sidebar/Chat';

interface Props {
  courseId: string;
  problem: Problem;
  interactive: ResolvedInteractive;
  onBack: () => void;
}

// Main screen (SPEC §4.3): iframe left (75%), tutor sidebar right (25%). Owns perform
// resolution + the message/log orchestration via usePerformChat, and feeds the interactive's
// log messages into the tutor.
export function Harness({ courseId, problem, interactive, onBack }: Props) {
  const chat = usePerformChat({ courseId, problem, context: interactive.context });
  // Latest interactiveState, kept for an optional snapshot (SPEC §6.1); unused in v1.
  const interactiveStateRef = useRef<unknown>(null);

  return (
    <div className="harness">
      <header className="bar">
        <button className="link" onClick={onBack}>
          ← Back
        </button>
        <strong className="chat-title">{problem.title}</strong>
        <span className="muted harness-sub">{interactive.context.name}</span>
        <StepTimeline currentStatus={chat.status} />
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
          <ProblemStatement statement={problem.statement} />
          <PlanForm performId={chat.performId} />
          <Chat chat={chat} />
        </aside>
      </div>
    </div>
  );
}
