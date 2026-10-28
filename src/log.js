// Small structured logger. One line per event, ISO timestamp first, so the
// output is easy to grep in Docker or systemd logs.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
let threshold = LEVELS[globalThis.process?.env?.LOG_LEVEL] ?? LEVELS.info;

function write(level, msg, fields) {
  if (LEVELS[level] < threshold) return;
  const extra = fields && Object.keys(fields).length ? " " + JSON.stringify(fields) : "";
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${msg}${extra}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (m, f) => write("debug", m, f),
  info: (m, f) => write("info", m, f),
  warn: (m, f) => write("warn", m, f),
  error: (m, f) => write("error", m, f),
  setLevel(level) { threshold = LEVELS[level] ?? threshold; },
};
