# TeamQueue

TeamQueue turns a class assignment brief into a task queue and a role-based assignment draft. It is designed for student team projects, where one person needs to read the brief, split the work, and keep the team moving without losing the big picture.

The app opens with a sample brief so you can demo it right away. If `OPENAI_API_KEY` is set, the backend calls OpenAI for the analysis step; otherwise it falls back to a local C engine (`teamqueue_engine.c`) so the workflow still works offline.

## Architecture

- Frontend: `index.html`, `styles.css`, `app.js`
- Backend: `server.js` on Node.js
- Local analysis engine: `teamqueue_engine.c` compiled to `teamqueue_engine`
- Optional AI path: OpenAI is used when a valid API key is present, and the app falls back to the local engine when it is not

## Run

```bash
cd /Users/seongyuniverse/Development/SKKU_DataStructure/assignment-planner-ai
npm start
```

Open `http://localhost:3000`.

## Environment

Create a file named `.env.local` in this folder, or copy from `.env.example`:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
PORT=3000
```

Keep `.env.local` local only. The GitHub upload should include `.env.example`, not your private API key file.

## UX Flow

1. Paste the assignment brief.
2. Add or edit team members and role tags.
3. Run analysis to generate the task queue and assignment draft.
4. Fill in clarification questions if needed, then reanalyze.
5. Confirm the final assignment and copy the summary for your team chat.

## Optional OpenAI API

Set your key in `.env.local` before starting, or export the variables in the shell if you prefer. If no key is set, the app falls back to a local heuristic analyzer so it still runs offline.

## GitHub-safe checklist

- `.env.local` stays on your machine and is ignored by Git.
- `.env.example` is the committed template you can share safely.
- `teamqueue_engine` and `node_modules/` are ignored so build artifacts do not get uploaded.
- The repository includes a project description, run instructions, architecture notes, and usage flow.
