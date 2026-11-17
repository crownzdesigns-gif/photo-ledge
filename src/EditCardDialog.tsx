import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  caption: string;
  src: string;
  rotation: number;
  accent: string;
  onClose: () => void;
  onSave: (next: { src: string; caption: string; rotation: number }) => void;
}

// fold any rotation (incl. multi-turn) into a friendly -180..180 for the slider
const normalize = (deg: number) => ((((deg % 360) + 540) % 360) - 180);

export function EditCardDialog({
  caption,
  src,
  rotation,
  accent,
  onClose,
  onSave,
}: Props) {
  const initialRotation = useMemo(() => normalize(rotation), [rotation]);

  const [draftCaption, setDraftCaption] = useState(caption);
  const [draftSrc, setDraftSrc] = useState(src);
  const [draftRotation, setDraftRotation] = useState(initialRotation);
  const [dirtyImage, setDirtyImage] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [closing, setClosing] = useState(false);

  const captionRef = useRef<HTMLInputElement>(null);
  const closeTimer = useRef<number | null>(null);

  const dirty =
    dirtyImage ||
    draftCaption.trim() !== caption.trim() ||
    Math.round(draftRotation) !== Math.round(initialRotation);

  useEffect(() => {
    const t = window.setTimeout(() => captionRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, []);

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, 250);
  };
  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    },
    []
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      setDraftSrc(reader.result as string);
      setDirtyImage(true);
    };
    reader.readAsDataURL(file);
  };

  const save = () => {
    if (!dirty || closing) return;
    const payload = {
      src: dirtyImage ? draftSrc : src,
      caption: draftCaption.trim() === "" ? caption : draftCaption.trim(),
      rotation: draftRotation,
    };
    // §9 step 1: play the close animation, THEN hand off to the card flip
    setClosing(true);
    closeTimer.current = window.setTimeout(() => onSave(payload), 250);
  };

  return (
    <div
      className={`overlay${closing ? " is-closing" : ""}`}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        className={`dialog${closing ? " is-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-title"
      >
        <div className="dialog__head">
          <h2 id="edit-title" className="dialog__title">
            Edit this photo
          </h2>
          <button
            type="button"
            className="dialog__close"
            aria-label="Close"
            onClick={requestClose}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path
                d="M3 3l10 10M13 3L3 13"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <label className="field-label" htmlFor="caption-input">
          Caption
        </label>
        <input
          id="caption-input"
          ref={captionRef}
          className="text-field"
          type="text"
          value={draftCaption}
          maxLength={60}
          placeholder="Give this photo a name…"
          onChange={(e) => setDraftCaption(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />

        <span className="field-label">Photo</span>
        <label
          className={`uploader${dragOver ? " is-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            readFile(e.dataTransfer.files?.[0]);
          }}
        >
          <img className="uploader__preview" src={draftSrc} alt="" aria-hidden />
          <span className="uploader__overlay">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
              <path
                d="M12 16V4m0 0L7 9m5-5l5 5M5 18v1a2 2 0 002 2h10a2 2 0 002-2v-1"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{dirtyImage ? "Change photo" : "Tap to upload a new photo"}</span>
            <small>or drag &amp; drop · PNG, JPG</small>
          </span>
          <input
            type="file"
            accept="image/*"
            className="uploader__input"
            onChange={(e) => readFile(e.target.files?.[0])}
          />
        </label>

        <span className="field-label">Rotation</span>
        <div className="rotate-row">
          <div className="rot-preview" aria-hidden>
            <div
              className="rot-preview__rotor"
              style={{ transform: `rotate(${draftRotation}deg)` }}
            >
              <div className="rot-preview__card" style={{ background: accent }}>
                <img src={draftSrc} alt="" />
              </div>
            </div>
          </div>
          <input
            className="slider"
            type="range"
            min={-180}
            max={180}
            step={1}
            value={Math.round(draftRotation)}
            aria-label="Rotation in degrees"
            onChange={(e) => setDraftRotation(Number(e.target.value))}
          />
          <output className="rot-readout">{Math.round(draftRotation)}°</output>
          <button
            type="button"
            className="rot-zero"
            onClick={() => setDraftRotation(0)}
            disabled={Math.round(draftRotation) === 0}
          >
            Reset
          </button>
        </div>

        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={requestClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            style={{ background: accent }}
            onClick={save}
            disabled={!dirty}
          >
            {dirty ? "Save changes" : "No changes yet"}
          </button>
        </div>
      </div>
    </div>
  );
}
