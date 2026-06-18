# Manual Verification Checklist

Use this checklist after `npm run dev` or against a deployed URL.

1. Open the home page.
   - Confirm at least three sample jobs are visible.
   - Confirm each card has a title, short description, and competency badges.

2. Start an interview.
   - Click a job card.
   - Confirm the interview room opens for that role.
   - Confirm the AI question is visible and role-grounded.
   - Confirm the decision panel shows rubric signals, topics covered, gaps, and rationale.

3. Voice and fallback input.
   - Click Start microphone in a browser that supports speech recognition.
   - Deny microphone access once and confirm the typed fallback remains usable.
   - Type an answer and submit it.

4. Dynamic follow-ups.
   - Submit answers until the interview reaches question 3 and question 5.
   - Confirm those questions are marked as follow-ups and reference prior answer content.
   - On the hosted Vercel deployment, confirm `/api/interview` responses include `mode: "llm"` when the production `OPENAI_API_KEY` environment variable is configured.

5. Completion.
   - Finish six questions.
   - Confirm the final page shows the full transcript and structured evaluation JSON with strengths, concerns, and overallScore.

6. Optional video mode.
   - Start video mode.
   - Confirm a camera preview appears when permission is granted.
   - Stop video and confirm the preview is removed.

7. Replay and analytics.
   - Open Session history.
   - Filter by role.
   - Select a session and confirm replay transcript, duration, talk ratio, topic coverage, score, and score trend are visible.
