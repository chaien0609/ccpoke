import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function loadCcpokeConfig() {
  try {
    return JSON.parse(readFileSync(join(homedir(), ".ccpoke", "config.json"), "utf-8"));
  } catch {
    return { hook_port: 9377, hook_secret: "" };
  }
}

export default async function ({ $, client, directory, worktree }) {
  const cfg = loadCcpokeConfig();
  const ccpokeHost = process.env.CCPOKE_HOST || "localhost";
  const port = cfg.hook_port;
  const secret = cfg.hook_secret;
  const agentParam = "?agent=opencode";

  let cachedTmuxTarget = null;

  async function detectTmuxTarget() {
    if (cachedTmuxTarget !== null) return cachedTmuxTarget;
    try {
      const result = await $`tmux display-message -p '#{session_name}:#{window_index}.#{pane_index}'`
        .nothrow()
        .quiet();
      cachedTmuxTarget = result.stdout?.toString().trim() || "";
    } catch {
      cachedTmuxTarget = "";
    }
    return cachedTmuxTarget;
  }

  async function fetchSessionContext(sessionID) {
    if (!sessionID || !client) return { summary: "", model: "" };
    try {
      const res = await client.session.messages({
        path: { id: sessionID },
        query: { limit: 2 },
      });
      const messages = res.data ?? [];
      let summary = "";
      let model = "";
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.info?.role !== "assistant") continue;
        model = msg.info.modelID ? msg.info.providerID + "/" + msg.info.modelID : "";
        const texts = (msg.parts ?? []).filter((p) => p.type === "text").map((p) => p.text ?? "");
        summary = texts.join("\\n").slice(0, 500);
        break;
      }
      return { summary, model };
    } catch {
      return { summary: "", model: "" };
    }
  }

  return {
    event: async ({ event }) => {
      if (event.type === "question.asked") {
        const props = event.properties || {};
        const tmuxTarget = await detectTmuxTarget();
        const payload = JSON.stringify({
          session_id: props.sessionID || "",
          tool_input: { questions: props.questions || [] },
          cwd: worktree || directory,
          tmux_target: tmuxTarget,
        });
        try {
          await $`echo ${payload} | curl -s -X POST "http://${ccpokeHost}:${port}/hook/ask-user-question${agentParam}" -H "Content-Type: application/json" -H "X-CCPoke-Secret: ${secret}" --data-binary @- --max-time 5`
            .nothrow()
            .quiet();
        } catch {}
        return;
      }

      if (event.type === "permission.asked") {
        const props = event.properties || {};
        const tmuxTarget = await detectTmuxTarget();
        const payload = JSON.stringify({
          session_id: props.sessionID || "",
          tool_name: props.permission || "unknown",
          tool_input: {
            patterns: props.patterns || [],
            metadata: props.metadata || {},
          },
          cwd: worktree || directory,
          tmux_target: tmuxTarget,
        });
        try {
          await $`echo ${payload} | curl -s -X POST "http://${ccpokeHost}:${port}/hook/permission-request${agentParam}" -H "Content-Type: application/json" -H "X-CCPoke-Secret: ${secret}" --data-binary @- --max-time 5`
            .nothrow()
            .quiet();
        } catch {}
        return;
      }

      if (event.type !== "session.idle" && event.type !== "session.error") return;
      const sessionID = event.properties?.sessionID || "";
      const cwd = worktree || directory;
      const ctx = await fetchSessionContext(sessionID);
      const tmuxTarget = await detectTmuxTarget();
      const payload = JSON.stringify({
        session_id: sessionID,
        prompt_response: ctx.summary,
        cwd,
        model: ctx.model,
        event_type: event.type,
        tmux_target: tmuxTarget,
      });
      try {
        await $`echo ${payload} | curl -s -X POST "http://${ccpokeHost}:${port}/hook/stop${agentParam}" -H "Content-Type: application/json" -H "X-CCPoke-Secret: ${secret}" --data-binary @- --max-time 5`
          .nothrow()
          .quiet();
      } catch {}
    },
  };
}
