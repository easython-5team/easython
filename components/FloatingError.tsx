export default function FloatingError({ message, onClose }: { message: string; onClose?: () => void }) {
  return (
    <p role="alert"
      className="fixed bottom-5 left-1/2 z-50 flex w-max max-w-[min(640px,calc(100%-32px))] -translate-x-1/2 items-center gap-3 rounded-full bg-ink py-3 pr-3 pl-5 text-sm font-semibold text-paper shadow-float [overflow-wrap:anywhere]">
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-stop" />
      {message}
      {onClose && <button type="button" className="btn-text !text-ink-3 hover:!text-paper" onClick={onClose}>닫기</button>}
    </p>
  );
}
