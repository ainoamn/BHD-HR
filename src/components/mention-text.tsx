/** Comment text with each "@Name" of the people it was addressed to marked. */
export function MentionText({ text, names }: { text: string; names: string[] }) {
  const tokens = [...new Set(names.filter(Boolean).map((name) => `@${name}`))].sort((a, b) => b.length - a.length);
  if (!tokens.length) return <>{text}</>;
  const pattern = new RegExp(`(${tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return (
    <>
      {text.split(pattern).map((part, index) =>
        tokens.includes(part) ? (
          <span key={index} className="rounded-md bg-teal-100 px-1 font-semibold text-teal-800">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
