interface Props {
  show: boolean;
  onDismiss: () => void;
}

export function OnboardingHint({ show, onDismiss }: Props) {
  if (!show) return null;
  return (
    <div className="hint" role="status">
      <span className="hint__pulse" aria-hidden />
      <div className="hint__body">
        <p className="hint__title">Make it yours ✨</p>
        <p className="hint__text">
          <strong>Double-tap a photo</strong> to swap the picture or caption.
          <br />
          <strong>Double-tap the board</strong> to reset everything.
        </p>
      </div>
      <button
        type="button"
        className="hint__close"
        aria-label="Dismiss tip"
        onClick={onDismiss}
      >
        Got it
      </button>
    </div>
  );
}
