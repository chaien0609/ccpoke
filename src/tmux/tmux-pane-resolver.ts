import type { ChatPaneResolver } from "../agent/chat-pane-resolver.js";
import { logger } from "../utils/log.js";
import type { PaneRegistry } from "./pane-registry.js";
import type { PaneStateManager } from "./pane-state-manager.js";

const MAX_AGENT_CACHE = 100;

export class TmuxPaneResolver implements ChatPaneResolver {
  private agentToPaneId = new Map<string, string>();

  constructor(
    private paneRegistry: PaneRegistry,
    private paneStateManager: PaneStateManager
  ) {}

  resolvePaneId(
    agentSessionId: string,
    projectName: string,
    cwd?: string,
    paneId?: string
  ): string | undefined {
    logger.debug(
      `[Resolver] input: agentSessionId=${agentSessionId} project=${projectName} cwd=${cwd ?? "NONE"} paneId=${paneId ?? "NONE"}`
    );

    if (paneId) {
      const metadata = this.paneRegistry.getByPaneId(paneId);
      if (metadata) {
        if (agentSessionId) this.cacheAgent(agentSessionId, paneId);
        logger.debug(`[Resolver] matched by paneId: ${paneId}`);
        return paneId;
      }
    }

    if (agentSessionId) {
      const cached = this.agentToPaneId.get(agentSessionId);
      if (cached && this.paneRegistry.getByPaneId(cached)) {
        logger.debug(`[Resolver] matched by cache: ${agentSessionId} → ${cached}`);
        return cached;
      }
      this.agentToPaneId.delete(agentSessionId);
    }

    const resolved = this.findByProject(projectName, cwd);
    if (resolved && agentSessionId) this.cacheAgent(agentSessionId, resolved);
    logger.debug(`[Resolver] matched by project: ${projectName} → ${resolved ?? "NONE"}`);
    return resolved;
  }

  resolveOrRegister(
    agentSessionId: string,
    projectName: string,
    cwd: string | undefined,
    paneId: string
  ): string {
    const existing = this.paneRegistry.getByPaneId(paneId);
    if (existing) {
      if (agentSessionId) this.cacheAgent(agentSessionId, paneId);
      return paneId;
    }
    this.paneRegistry.register(paneId, projectName, cwd ?? "");
    if (agentSessionId) this.cacheAgent(agentSessionId, paneId);
    return paneId;
  }

  onStopHook(paneId: string, model?: string): void {
    this.paneStateManager.onStopHook(paneId, model);
  }

  private cacheAgent(agentSessionId: string, paneId: string): void {
    this.agentToPaneId.set(agentSessionId, paneId);
    if (this.agentToPaneId.size > MAX_AGENT_CACHE) {
      const oldest = this.agentToPaneId.keys().next().value;
      if (oldest) this.agentToPaneId.delete(oldest);
    }
  }

  private findByProject(projectName: string, cwd?: string): string | undefined {
    const matches = this.paneRegistry.getByProject(projectName);
    if (matches.length === 0) return undefined;

    const match =
      (cwd && matches.length > 1 ? matches.find((p) => p.cwd === cwd) : undefined) ?? matches[0]!;
    logger.info(`pane linked by project: ${match.paneId} (${projectName})`);
    return match.paneId;
  }
}
