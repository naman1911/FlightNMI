// Node only: load a .env file from the working directory into process.env
// without overriding variables that are already set.
import fs from "node:fs";
import path from "node:path";
import { parseDotenv } from "./config.js";

export function loadDotenv(file = path.resolve(process.cwd(), ".env"), env = process.env) {
  if (!fs.existsSync(file)) return false;
  for (const [k, v] of Object.entries(parseDotenv(fs.readFileSync(file, "utf8")))) {
    if (env[k] === undefined) env[k] = v;
  }
  return true;
}
