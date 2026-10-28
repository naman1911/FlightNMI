// Decides what kind of flight an aircraft is and how to name it in a message.
import { AIRLINES, FREIGHTER_TYPES, HELICOPTER_TYPES } from "./airlines.js";

const AIRLINE_CALLSIGN = /^([A-Z]{3})(\d{1,4}[A-Z]{0,2})$/;

/**
 * @returns {{category:"commercial"|"cargo"|"other", label:string, operator:string|null,
 *            operatorCode:string|null, iata:string|null, reason:string}}
 */
export function classifyFlight({ callsign = "", type = "", category = "", military = false, reg = "" } = {}) {
  const cs = String(callsign || "").trim().toUpperCase();
  const typ = String(type || "").toUpperCase();
  const fallbackLabel = cs || reg || "unknown aircraft";

  if (military) return { category: "other", label: fallbackLabel, operator: null, operatorCode: null, iata: null, reason: "military" };
  if (category === "A7" || HELICOPTER_TYPES.has(typ)) {
    return { category: "other", label: fallbackLabel, operator: null, operatorCode: null, iata: null, reason: "helicopter" };
  }

  const m = AIRLINE_CALLSIGN.exec(cs);
  if (!m) return { category: "other", label: fallbackLabel, operator: null, operatorCode: null, iata: null, reason: "private or non-airline callsign" };

  const [, code, num] = m;
  const airline = AIRLINES[code];
  if (!airline) {
    return { category: "other", label: cs, operator: null, operatorCode: code, iata: null, reason: `operator code ${code} not in our list` };
  }
  const label = airline.iata && airline.iata.length <= 2 ? `${airline.iata} ${num}` : cs;
  if (airline.kind === "cargo") return { category: "cargo", label, operator: airline.name, operatorCode: code, iata: airline.iata, reason: "all-cargo operator" };
  if (airline.kind === "mixed" && FREIGHTER_TYPES.has(typ)) {
    return { category: "cargo", label, operator: airline.name, operatorCode: code, iata: airline.iata, reason: `freighter type ${typ}` };
  }
  return { category: "commercial", label, operator: airline.name, operatorCode: code, iata: airline.iata, reason: "passenger airline" };
}

export const CATEGORY_LABEL = { commercial: "Commercial", cargo: "Cargo", other: "Other" };
