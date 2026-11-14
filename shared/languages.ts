// Shared by server and client. Adding a language means adding an entry here
// and a matching block in WORKER_TEXT; AI prompts and schemas read this list.
import type { ConditionKind } from "./types.ts";

export const LANGUAGES = {
  en: { name: "English", native: "English", speech: "en-US" },
  vi: { name: "Vietnamese", native: "Tiếng Việt", speech: "vi-VN" },
} as const;
export type Lang = keyof typeof LANGUAGES;
export const WORKER_LANGS = Object.keys(LANGUAGES) as Lang[];

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && Object.hasOwn(LANGUAGES, value);
}

export const CONDITION_KINDS: Record<ConditionKind, string> = {
  time: "시점",
  place: "장소",
  action: "행동",
  prohibition: "금지",
  exception: "예외",
};

const en = {
  chooseLanguage: "Choose your language",
  namePrompt: "Your name",
  namePlaceholder: "Name or nickname",
  nameHint: "Your manager will see this name with your answer.",
  start: "Continue",
  starting: "Opening…",
  whatChanged: "Work notice",
  fullNotice: "Original notice",
  managerUpdates: "Added by your manager",
  situation: "Situation question",
  shortQuestion: "Short question",
  shortHint: "Answer in a few words. You can also ask a question.",
  nextQuestion: "Next question",
  yourAnswer: "Your answer",
  answerHint: "Say or type what you will do. You can also ask a question.",
  placeholder: "Type your answer or ask a question",
  speak: "Speak",
  listening: "Listening… tap to stop",
  speechReview: "Check the text before submitting.",
  speechUnsupported: "Voice input is not available in this browser. Please type your answer.",
  speechDenied: "Microphone access was blocked. Please type your answer.",
  speechFailed: "Could not hear you clearly. Try again or type your answer.",
  send: "Submit",
  checking: "Checking…",
  retry: "Could not send your answer. Please try again.",
  you: "You",
  viaVoice: "voice",
  states: {
    understood: "Understanding confirmed",
    followup: "One more question",
    guidance: "Please follow this instruction",
    answered: "Answer from the notice",
    manager: "Sent to your manager",
  },
  condition: { met: "Confirmed", missing: "Not mentioned", conflict: "Different from the notice" },
  managerSent: "The notice does not answer this, so your question was sent to your manager.",
  guidanceLead: "Please follow these instructions from the notice:",
  followupFallback: "What will you do about this?",
  waitingManager: "Waiting for your manager's answer.",
  managerAnswered: "Manager's answer",
  doneUnderstood: "Thank you. You have confirmed the changed instruction.",
  questionOf: "Question {n} of {total}",
  allDone: "All done",
  doneGuidance: "Your manager will follow up with you.",
  notFound: "This notice could not be found.",
  kinds: { time: "When", place: "Where", action: "Do", prohibition: "Do not", exception: "Exception" },
  readDone: "Start quiz",
  backToNotice: "View notice",
  steps: { read: "Notice", answer: "Quiz", done: "Done" },
  restore: "Continue where you left off",
  newVersion: "Your manager updated this notice.",
};

export type WorkerText = typeof en;

// Typed against the English block so a missing Vietnamese string fails the build.
export const WORKER_TEXT: Record<Lang, WorkerText> = {
  en,
  vi: {
    chooseLanguage: "Chọn ngôn ngữ của bạn",
    namePrompt: "Tên của bạn",
    namePlaceholder: "Tên hoặc biệt danh",
    nameHint: "Quản lý sẽ thấy tên này cùng với câu trả lời của bạn.",
    start: "Tiếp tục",
    starting: "Đang mở…",
    whatChanged: "Thông báo công việc",
    fullNotice: "Thông báo gốc",
    managerUpdates: "Quản lý bổ sung",
    situation: "Câu hỏi tình huống",
    shortQuestion: "Câu hỏi ngắn",
    shortHint: "Trả lời ngắn gọn bằng vài từ. Bạn cũng có thể đặt câu hỏi.",
    nextQuestion: "Câu hỏi tiếp theo",
    yourAnswer: "Câu trả lời của bạn",
    answerHint: "Hãy nói hoặc viết bạn sẽ làm gì. Bạn cũng có thể đặt câu hỏi.",
    placeholder: "Nhập câu trả lời hoặc đặt câu hỏi",
    speak: "Nói",
    listening: "Đang nghe… chạm để dừng",
    speechReview: "Kiểm tra văn bản trước khi gửi.",
    speechUnsupported: "Trình duyệt này không hỗ trợ nhập bằng giọng nói. Vui lòng nhập câu trả lời.",
    speechDenied: "Micrô đã bị chặn. Vui lòng nhập câu trả lời.",
    speechFailed: "Không nghe rõ. Hãy thử lại hoặc nhập câu trả lời.",
    send: "Gửi",
    checking: "Đang kiểm tra…",
    retry: "Không gửi được câu trả lời. Vui lòng thử lại.",
    you: "Bạn",
    viaVoice: "giọng nói",
    states: {
      understood: "Đã xác nhận hiểu đúng",
      followup: "Thêm một câu hỏi",
      guidance: "Vui lòng làm theo hướng dẫn này",
      answered: "Câu trả lời từ thông báo",
      manager: "Đã gửi cho quản lý",
    },
    condition: { met: "Đã xác nhận", missing: "Chưa nhắc đến", conflict: "Khác với thông báo" },
    managerSent: "Thông báo không có câu trả lời cho điều này, nên câu hỏi của bạn đã được gửi cho quản lý.",
    guidanceLead: "Vui lòng làm theo các hướng dẫn sau trong thông báo:",
    followupFallback: "Bạn sẽ làm gì với việc này?",
    waitingManager: "Đang chờ quản lý trả lời.",
    managerAnswered: "Câu trả lời của quản lý",
    doneUnderstood: "Cảm ơn bạn. Bạn đã xác nhận chỉ thị đã thay đổi.",
    questionOf: "Câu {n}/{total}",
    allDone: "Hoàn thành",
    doneGuidance: "Quản lý sẽ trao đổi lại với bạn.",
    notFound: "Không tìm thấy thông báo này.",
    kinds: { time: "Khi nào", place: "Ở đâu", action: "Làm", prohibition: "Không được", exception: "Ngoại lệ" },
    readDone: "Bắt đầu câu hỏi",
    backToNotice: "Xem thông báo",
    steps: { read: "Thông báo", answer: "Câu hỏi", done: "Xong" },
    restore: "Tiếp tục từ chỗ bạn dừng lại",
    newVersion: "Quản lý đã cập nhật thông báo này.",
  },
};
