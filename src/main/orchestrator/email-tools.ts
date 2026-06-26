// ✉️ 邮件发送工具 —— SMTP 直发，支持附件/抄送/多收件人。
//
// 设计原则：
// - 复用 GeneralSettings 中 SMTP 配置（host/port/secure/user/pass/fromName）
// - 用 nodemailer 发送，每次 execute 新建 transport（不缓存，配置即时生效）
// - 发信前用 requestUserChoice 弹确认卡片（复用现有 ask_user_choice 机制）
// - 配置通过 setEmailConfig 注入 getter（避免 import index.ts 循环依赖）
// - 错误以 [错误]/[send_email] 字符串返回，不抛异常（流回对话）

import * as fs from "fs";
import * as path from "path";
import nodemailer from "nodemailer";
import { toolRegistry } from "./tool-registry";
import { requestUserChoice, type ChoiceOption } from "../user-choice";

const LOG_PREFIX = "[EmailTools]";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ══════════════════════════════════════════════════════════
// 配置注入
// ══════════════════════════════════════════════════════════

let emailEnabledGetter: (() => boolean) | null = null;
let smtpHostGetter: (() => string) | null = null;
let smtpPortGetter: (() => number) | null = null;
let smtpSecureGetter: (() => boolean) | null = null;
let smtpUserGetter: (() => string) | null = null;
let smtpPassGetter: (() => string) | null = null;
let fromNameGetter: (() => string) | null = null;

/** index.ts 启动时注入 SMTP 配置获取器（每次执行实时读 GeneralSettings）。 */
export function setEmailConfig(
  enabledGetter: () => boolean,
  hostGetter: () => string,
  portGetter: () => number,
  secureGetter: () => boolean,
  userGetter: () => string,
  passGetter: () => string,
  fromNameFn: () => string,
): void {
  emailEnabledGetter = enabledGetter;
  smtpHostGetter = hostGetter;
  smtpPortGetter = portGetter;
  smtpSecureGetter = secureGetter;
  smtpUserGetter = userGetter;
  smtpPassGetter = passGetter;
  fromNameGetter = fromNameFn;
}

// ══════════════════════════════════════════════════════════
// 工具入口
// ══════════════════════════════════════════════════════════

async function executeSendEmail(args: Record<string, unknown>): Promise<string> {
  // 占位，Task 4 实现
  return "[send_email] 暂未实现";
}

// ══════════════════════════════════════════════════════════
// 注册
// ══════════════════════════════════════════════════════════

/** 注册邮件工具。index.ts startup 调一次。 */
export function registerEmailTools(): void {
  toolRegistry.register({
    id: "send_email",
    name: "发送邮件",
    description:
      "通过 SMTP 发送邮件给指定收件人，支持附件、抄送。\n\n" +
      "何时用：\n" +
      "- 用户要求发邮件给某人（如「把这份报告发给 xxx@xxx.com」）\n" +
      "- 配合 write_word/excel/pdf 工具，把生成的文件作为附件发送\n" +
      "- 发送正式邮件、周报、通知等\n\n" +
      "不要用于：\n" +
      "- 群发营销邮件（每次只能发少量收件人）\n" +
      "- 不带任何正文内容的空邮件\n" +
      "- 未在设置里配置 SMTP 的情况（会返回配置缺失错误提示）\n\n" +
      "参数：to（收件人数组）、subject（主题）、body（纯文本正文）、" +
      "html（可选 HTML 正文，提供则覆盖 body）、cc（可选抄送）、" +
      "attachments（可选附件绝对路径数组）。",
    enabled: true,
    risk: "network",
    inputSchema: {
      type: "object",
      properties: {
        to:          { type: "array", items: { type: "string" }, description: "收件人邮箱地址数组" },
        cc:          { type: "array", items: { type: "string" }, description: "抄送（可选）" },
        subject:     { type: "string", description: "邮件主题" },
        body:        { type: "string", description: "邮件正文（纯文本）" },
        html:        { type: "string", description: "HTML 正文（可选，提供则覆盖 body）" },
        attachments: { type: "array", items: { type: "string" }, description: "附件绝对路径数组（agent 生成文件或本地文件路径）" },
      },
      required: ["to", "subject", "body"],
    },
    execute: executeSendEmail,
  });

  console.log(LOG_PREFIX, "已注册：send_email（✉️邮件发送）");
}
