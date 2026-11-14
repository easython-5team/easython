// The "<" mark used on back links, and turned for disclosure toggles.
export default function Chevron({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={"size-[18px] shrink-0 " + (className ?? "")} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}
