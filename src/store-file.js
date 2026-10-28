// Node persistence for BaseStore: one small JSON file written atomically
// (write a temp file, then rename), with bursts of writes coalesced.
import fs from "node:fs";
import path from "node:path";
import { BaseStore } from "./store.js";

export class Store extends BaseStore {
  constructor(dataDir) {
    super();
    this.dir = dataDir;
    this.file = path.join(dataDir, "state.json");
    this._saveTimer = null;
  }

  load() {
    fs.mkdirSync(this.dir, { recursive: true });
    this.adopt(fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, "utf8")) : {});
    return this;
  }

  save() {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    fs.renameSync(tmp, this.file);
  }

  /** Coalesce bursts of writes into one disk write. */
  saveSoon() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      try { this.save(); } catch (e) { this.lastSaveError = e; }
    }, 250);
    if (typeof this._saveTimer.unref === "function") this._saveTimer.unref();
  }

  async flush() {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    this.save();
  }

  _changed() { this.saveSoon(); }
  _changedNow() { this.save(); }
}
