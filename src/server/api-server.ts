import type { Server } from "node:http";

import express, { type Express } from "express";

import { AgentHandler } from "../agent/agent-handler.js";
import { AgentName } from "../agent/types.js";
import { t } from "../i18n/index.js";
import { ApiRoute, MINI_APP_BASE_URL } from "../utils/constants.js";
import { log, logDebug, logError } from "../utils/log.js";
import { responseStore } from "../utils/response-store.js";
import type { TunnelManager } from "../utils/tunnel.js";

const ALLOWED_CORS_ORIGIN = new URL(MINI_APP_BASE_URL).origin;

export class ApiServer {
  private app: Express;
  private server: Server | null = null;
  private port: number;
  private secret: string;
  private handler: AgentHandler | null = null;
  private tunnelManager: TunnelManager | null = null;

  constructor(port: number, secret: string) {
    this.port = port;
    this.secret = secret;
    this.app = this.createApp();
  }

  setHandler(handler: AgentHandler): void {
    this.handler = handler;
  }

  setTunnelManager(tunnelManager: TunnelManager): void {
    this.tunnelManager = tunnelManager;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, "127.0.0.1", () => {
        log(t("hook.serverListening", { port: this.port }));
        resolve();
      });

      this.server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          logError(t("bot.alreadyRunning", { port: this.port }));
          process.exit(1);
        }
        reject(err);
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
    });
  }

  private createApp(): Express {
    const app = express();
    app.use(express.json({ limit: "10mb" }));
    app.get(ApiRoute.ResponseData, (req, res) => {
      logDebug(
        `[API] GET ${ApiRoute.ResponseData} id=${req.params.id} origin=${req.headers.origin ?? "none"}`
      );
      const requestOrigin = req.headers.origin ?? "";
      const tunnelUrl = this.tunnelManager?.getPublicUrl();
      const tunnelOrigin = tunnelUrl ? new URL(tunnelUrl).origin : null;
      const allowedOrigin =
        requestOrigin === ALLOWED_CORS_ORIGIN
          ? ALLOWED_CORS_ORIGIN
          : tunnelOrigin && requestOrigin === tunnelOrigin
            ? tunnelOrigin
            : ALLOWED_CORS_ORIGIN;
      res.header("Access-Control-Allow-Origin", allowedOrigin);
      const data = responseStore.get(req.params.id);
      if (!data) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(data);
    });

    app.post(ApiRoute.HookStop, (req, res) => {
      logDebug(`[API] POST ${ApiRoute.HookStop} ip=${req.ip} agent=${req.query.agent ?? "(none)"}`);
      const receivedSecret = req.headers["x-ccpoke-secret"];
      if (receivedSecret !== this.secret) {
        logDebug(`[API] forbidden: secret mismatch on ${ApiRoute.HookStop}`);
        res.status(403).send("forbidden");
        return;
      }

      const agentName = req.query.agent ? `${req.query.agent}` : AgentName.ClaudeCode;
      logDebug(`[API] ${ApiRoute.HookStop} accepted agent=${agentName}`);

      setImmediate(() => {
        this.handler?.handleStopEvent(agentName, req.body).catch((err: unknown) => {
          logError(t("hook.stopEventFailed"), err);
        });
      });
      res.status(200).send("ok");
    });

    app.post(ApiRoute.HookSessionStart, (req, res) => {
      logDebug(
        `[API] POST ${ApiRoute.HookSessionStart} ip=${req.ip} sessionId=${req.body?.session_id ?? "?"}`
      );
      const receivedSecret = req.headers["x-ccpoke-secret"];
      if (receivedSecret !== this.secret) {
        logDebug(`[API] forbidden: secret mismatch on ${ApiRoute.HookSessionStart}`);
        res.status(403).send("forbidden");
        return;
      }

      logDebug(`[API] ${ApiRoute.HookSessionStart} accepted`);
      setImmediate(() => {
        this.handler?.handleSessionStart(req.body).catch((err: unknown) => {
          logError(t("hook.sessionStartFailed"), err);
        });
      });
      res.status(200).send("ok");
    });

    app.post(ApiRoute.HookNotification, (req, res) => {
      logDebug(
        `[API] POST ${ApiRoute.HookNotification} ip=${req.ip} sessionId=${req.body?.session_id ?? "?"}`
      );
      const receivedSecret = req.headers["x-ccpoke-secret"];
      if (receivedSecret !== this.secret) {
        logDebug(`[API] forbidden: secret mismatch on ${ApiRoute.HookNotification}`);
        res.status(403).send("forbidden");
        return;
      }

      logDebug(`[API] ${ApiRoute.HookNotification} accepted`);
      setImmediate(() => {
        this.handler?.handleNotification(req.body).catch((err: unknown) => {
          logError(t("hook.notificationHookFailed"), err);
        });
      });
      res.status(200).send("ok");
    });

    app.post(ApiRoute.HookAskUserQuestion, (req, res) => {
      logDebug(
        `[API] POST ${ApiRoute.HookAskUserQuestion} ip=${req.ip} sessionId=${req.body?.session_id ?? "?"}`
      );
      const receivedSecret = req.headers["x-ccpoke-secret"];
      if (receivedSecret !== this.secret) {
        logDebug(`[API] forbidden: secret mismatch on ${ApiRoute.HookAskUserQuestion}`);
        res.status(403).send("forbidden");
        return;
      }

      logDebug(`[API] ${ApiRoute.HookAskUserQuestion} accepted`);
      setImmediate(() => {
        this.handler?.handleAskUserQuestion(req.body).catch((err: unknown) => {
          logError(t("askQuestion.hookFailed"), err);
        });
      });
      res.status(200).send("ok");
    });

    app.post(ApiRoute.HookPermissionRequest, (req, res) => {
      logDebug(
        `[API] POST ${ApiRoute.HookPermissionRequest} ip=${req.ip} sessionId=${req.body?.session_id ?? "?"}`
      );
      const receivedSecret = req.headers["x-ccpoke-secret"];
      if (receivedSecret !== this.secret) {
        logDebug(`[API] forbidden: secret mismatch on ${ApiRoute.HookPermissionRequest}`);
        res.status(403).send("forbidden");
        return;
      }

      logDebug(`[API] ${ApiRoute.HookPermissionRequest} accepted`);
      setImmediate(() => {
        this.handler?.handlePermissionRequest(req.body).catch((err: unknown) => {
          logError(t("hook.permissionRequestFailed"), err);
        });
      });
      res.status(200).send("ok");
    });

    app.get(ApiRoute.Health, (_req, res) => {
      logDebug(`[API] GET ${ApiRoute.Health}`);
      res.status(200).send("healthy");
    });

    return app;
  }
}
