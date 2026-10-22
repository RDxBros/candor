"use client";

import { FormEvent, useCallback, useEffect, useId, useState } from "react";
import { getOrCreateAnonymousId } from "../lib/client-storage";
import { FlagIcon } from "./app-icons";
import { analyticsContext, track } from "../lib/analytics";

type CommentItem = {
  id: string;
  anonymous_id?: string;
  display_text: string;
  created_at: string;
  reported_by_user?: boolean;
};

const MAX_COMMENT_LENGTH = 500;
const INITIAL_VISIBLE_COMMENTS = 3;

function commentDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    .format(new Date(value));
}

function readerAlias(value?: string) {
  if (!value) return "Reader";
  let hash = 0;
  for (const character of value) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return `Reader ${String(hash % 1000).padStart(3, "0")}`;
}

export function CommentsSection({ storyId }: { storyId: string }) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportedId, setReportedId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [showAll, setShowAll] = useState(false);
  const commentListId = useId();
  const draftKey = `candor:comment-draft:${storyId}`;
  const visibleComments = showAll ? comments : comments.slice(0, INITIAL_VISIBLE_COMMENTS);

  const loadComments = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const anonymousId = getOrCreateAnonymousId();
    fetch(`/api/comments?storyId=${encodeURIComponent(storyId)}&anonymous_id=${encodeURIComponent(anonymousId ?? "")}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load comments");
        if (active) setComments(payload.comments);
      })
      .catch(() => active && setError("Comments aren’t available right now."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [storyId]);

  useEffect(() => loadComments(), [loadComments]);

  useEffect(() => setShowAll(false), [storyId]);

  useEffect(() => {
    setText(sessionStorage.getItem(draftKey) ?? "");
  }, [draftKey]);

  useEffect(() => {
    if (text) sessionStorage.setItem(draftKey, text);
    else sessionStorage.removeItem(draftKey);
  }, [draftKey, text]);

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const displayText = text.trim();
    if (!displayText || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story_id: storyId,
          anonymous_id: getOrCreateAnonymousId(),
          display_text: displayText,
          analytics: analyticsContext()
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to add comment");
      setComments((current) => [{ ...payload.comment, reported_by_user: false }, ...current]);
      setText("");
      setStatus("Comment posted.");
    } catch {
      track("error_shown", { error_type: "save_failed", screen: "story" });
      setError("Your comment couldn’t be posted. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function reportComment(commentId: string) {
    const target = comments.find((comment) => comment.id === commentId);
    if (reportedId === commentId || target?.reported_by_user) return;
    setReportedId(commentId);
    setError(null);
    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(commentId)}/flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonymous_id: getOrCreateAnonymousId(), analytics: analyticsContext() })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to report comment");
      if (payload.hidden) {
        setComments((current) => current.filter((comment) => comment.id !== commentId));
      } else {
        setComments((current) => current.map((comment) =>
          comment.id === commentId ? { ...comment, reported_by_user: true } : comment
        ));
      }
      setStatus("Reported, thanks.");
      window.setTimeout(() => setReportedId((current) => current === commentId ? null : current), 1200);
    } catch {
      track("error_shown", { error_type: "save_failed", screen: "story" });
      setReportedId(null);
      setError("That report didn’t go through. Please try again.");
    }
  }

  return (
    <section className="comments-section" aria-labelledby="comments-heading">
      <div className="comments-heading-row">
        <h2 id="comments-heading">Comments</h2>
        {!loading ? <span>{comments.length}</span> : null}
      </div>
      <p className="sr-only" aria-live="polite">{status}</p>

      <form className="comment-form" onSubmit={addComment}>
        <label htmlFor="comment-text">Add a comment</label>
        <textarea
          id="comment-text"
          value={text}
          maxLength={MAX_COMMENT_LENGTH}
          rows={3}
          placeholder="Share a thoughtful take…"
          onChange={(event) => setText(event.target.value)}
        />
        <div className="comment-form-actions">
          <span>{text.length}/{MAX_COMMENT_LENGTH}</span>
          <button type="submit" disabled={!text.trim() || submitting}>
            {submitting ? "Posting…" : "Post comment"}
          </button>
        </div>
      </form>

      {error ? <div className="comment-error" role="alert"><p>{error}</p>
        {error.includes("available") ? <button className="text-button" type="button" onClick={loadComments}>Try again</button> : null}
      </div> : null}
      {loading ? <p className="comment-empty" role="status">Loading conversation…</p> : null}
      {!loading && !error && !comments.length ? <p className="comment-empty">No comments yet. Start the conversation.</p> : null}

      {comments.length ? (
        <ol className="comment-list" id={commentListId}>
          {visibleComments.map((comment) => (
            <li className="comment-item" key={comment.id}>
              <div className="comment-meta">
                <span>{readerAlias(comment.anonymous_id)}</span>
                <time dateTime={comment.created_at}>{commentDate(comment.created_at)}</time>
              </div>
              <p>{comment.display_text}</p>
              <button
                type="button"
                className="report-button"
                aria-label="Report this comment"
                disabled={reportedId === comment.id || comment.reported_by_user}
                onClick={() => reportComment(comment.id)}
              >
                <FlagIcon />
                {reportedId === comment.id ? "Reported, thanks" : comment.reported_by_user ? "Reported" : "Report"}
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      {comments.length > INITIAL_VISIBLE_COMMENTS ? (
        <button
          className="comments-view-more"
          type="button"
          aria-controls={commentListId}
          aria-expanded={showAll}
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll ? "Show fewer" : `View more (${comments.length - INITIAL_VISIBLE_COMMENTS})`}
        </button>
      ) : null}
    </section>
  );
}
