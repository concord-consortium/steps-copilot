// Shapes consumed from the steps-tutor-be backend (lifted from poc) plus harness-only
// types (HarnessLog). Verified against steps-tutor-be (messageSender enum, performs +
// problems modules).

export type MessageSender = 'Student' | 'Tutor';

export interface Message {
  id: string;
  performId: string;
  message: string;
  sender: MessageSender;
  sequenceStep: string | null;
  performStatus: string;
  createdAt: string;
}

export interface Perform {
  id: string;
  status: string;
}

export interface Problem {
  id: string;
  title: string;
  latestPerform: Perform | null;
  settings: unknown[];
  // The stored statement HTML ships inline on the /problems/by-course list response
  // (GET /problems/:id is 403 for students), so the harness reads it from here (SPEC §7.1).
  statement?: string;
}

export interface Course {
  id: string;
  name: string;
}

// GET /courses returns { data: [{ course, ... }], page, total, limit }
export interface CourseListItem {
  course: Course;
}

// POST /performs/:performId/messages response
export interface SendMessageResponse {
  message: string;
  status: string;
  phase?: string;
}

// A normalized LARA `log` message (see SPEC §6.2). The interactive sends
// `{ action, value?, data? }`; the harness stamps the key + receive time.
export interface HarnessLog {
  interactiveKey: string;
  action: string;
  value?: unknown;
  data?: Record<string, unknown>;
  receivedAt: string;
}
