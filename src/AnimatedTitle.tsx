import "./AnimatedTitle.css";

interface Props {
  text: string;
  className?: string;
}

/**
 * Splits a heading into per-letter spans so it can animate in like handwriting
 * appearing on the page, then ripple in a traveling wave on hover.
 *
 * Accessibility: the visible spans are aria-hidden and the real text is exposed
 * once via aria-label, so screen readers read the whole title, not letters.
 */
export function AnimatedTitle({ text, className = "" }: Props) {
  const words = text.split(" ");
  let letter = 0; // running index across the whole title for staggering

  return (
    <h1
      className={`title title--animated ${className}`.trim()}
      aria-label={text}
    >
      <span aria-hidden="true" className="title__ink">
        {words.map((word, wi) => (
          <span className="title-word" key={wi}>
            {[...word].map((ch) => {
              const i = letter++;
              return (
                <span
                  className="title-letter"
                  style={{ ["--i" as string]: i }}
                  key={i}
                >
                  <span className="title-letter__inner">{ch}</span>
                </span>
              );
            })}
            {wi < words.length - 1 ? (
              <span className="title-space">&nbsp;</span>
            ) : null}
          </span>
        ))}
      </span>
    </h1>
  );
}
