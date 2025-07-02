import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Logger } from "telegram/extensions"
import constants from "./config";
import fs from "fs";
import path from "path";

const logger = new Logger()

const sessionFilePath = path.resolve(process.cwd(), 'stringsession');
let initialSession = "";
if (fs.existsSync(sessionFilePath)) {
  initialSession = fs.readFileSync(sessionFilePath, 'utf8').trim();
}

if (initialSession) {
  console.log(`🔑 Loaded existing GramJS session from ${sessionFilePath}`);
} else {
  console.log(`⚠️ No existing session file found, starting with empty session`);
}

const stringSession = new StringSession(initialSession);
const apiId = constants.GRAMJS_API_ID;
const apiHash = constants.GRAMJS_API_HASH;

export const gramjs = new TelegramClient(stringSession, Number(apiId), apiHash, { connectionRetries: 7, baseLogger: logger });
export const gramJsApi = Api;

export { stringSession, sessionFilePath };