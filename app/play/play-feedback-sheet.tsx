"use client";

import { useEffect, useState } from "react";
import { Modal } from "../../components/modal";
import { getOrCreateAnonymousId } from "../../lib/client-storage";
import { playFeedbackStorageKey, type PlayFeedbackReason, type PlayFeedbackLean } from "../../lib/play-feedback";
import styles from "./play.module.css";

export function PlayFeedbackSheet({ round, excerptIndex, currentLean, onClose, onSubmitted, onAlreadySubmitted }: {
  round: number; excerptIndex: number; currentLean: PlayFeedbackLean; onClose: () => void;
  onSubmitted: (reason: PlayFeedbackReason) => void; onAlreadySubmitted: () => void;
}) {
  const [reason, setReason] = useState<PlayFeedbackReason | null>(null);
  const [suggestedLean, setSuggestedLean] = useState<PlayFeedbackLean | null>(null);
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "sent">("idle");
  const [error, setError] = useState("");
  const canSubmit = reason && (reason !== "different_lean" || (suggestedLean && suggestedLean !== currentLean));

  useEffect(() => {
    if (status !== "sent") return;
    const timer = window.setTimeout(onClose, 2_000);
    return () => window.clearTimeout(timer);
  }, [status, onClose]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || status !== "idle") return;
    setStatus("saving");
    setError("");
    try {
      const deviceId = getOrCreateAnonymousId();
      if (!deviceId) throw new Error("No device ID");
      const response = await fetch("/api/play-feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          round, excerpt_index: excerptIndex, device_id: deviceId, reason,
          suggested_lean: reason === "different_lean" ? suggestedLean : null, note, website
        })
      });
      if (!response.ok) {
        if (response.status === 409) {
          try { localStorage.setItem(playFeedbackStorageKey(round, excerptIndex), "1"); } catch { /* Storage is optional. */ }
          onAlreadySubmitted();
          setStatus("sent");
          return;
        }
        throw new Error("Save failed");
      }
      try { localStorage.setItem(playFeedbackStorageKey(round, excerptIndex), "1"); } catch { /* Server enforces uniqueness. */ }
      onSubmitted(reason);
      setStatus("sent");
    } catch {
      setStatus("idle");
      setError("Feedback could not be sent. Please try again.");
    }
  }

  return <Modal labelId="play-feedback-heading" className={styles.feedbackSheet} onDismiss={onClose}>
    <div className={styles.feedbackTop}><h2 id="play-feedback-heading">Disagree with this rating?</h2><button type="button" onClick={onClose} aria-label="Close feedback">×</button></div>
    {status === "sent" ? <div className={styles.feedbackThanks} role="status"><p>Thanks for helping us improve ratings.</p><button type="button" className={styles.primaryAction} onClick={onClose}>Done</button></div> :
      <form onSubmit={submit} className={styles.feedbackForm}>
        <fieldset><legend>What seems off?</legend>
          <label><input type="radio" name="reason" checked={reason === "different_lean"} onChange={() => setReason("different_lean")} />I think this outlet leans differently</label>
          {reason === "different_lean" ? <div className={styles.feedbackLeans} role="group" aria-label="Suggested lean">
            {(["left", "center", "right"] as const).map((lean) => <label key={lean}><input type="radio" name="lean" checked={suggestedLean === lean} onChange={() => setSuggestedLean(lean)} />{lean[0].toUpperCase() + lean.slice(1)}</label>)}
          </div> : null}
          <label><input type="radio" name="reason" checked={reason === "unrepresentative_excerpt"} onChange={() => setReason("unrepresentative_excerpt")} />This excerpt doesn't represent how this outlet usually writes</label>
          <label><input type="radio" name="reason" checked={reason === "other"} onChange={() => setReason("other")} />Something else</label>
        </fieldset>
        <label className={styles.feedbackNote}>Optional note<textarea maxLength={280} value={note} onChange={(event) => setNote(event.target.value)} rows={3} /></label>
        <span className={styles.feedbackCounter}>{note.length}/280</span>
        <div className={styles.honeypot} aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label></div>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" className={styles.primaryAction} disabled={!canSubmit || status === "saving"}>{status === "saving" ? "Sending…" : "Submit feedback"}</button>
        <p className={styles.feedbackPrivacy}>Anonymous. We use this to improve ratings.</p>
      </form>}
  </Modal>;
}
