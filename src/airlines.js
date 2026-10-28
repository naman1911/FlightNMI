// Operators by ICAO callsign prefix.
//   kind "pax"   - passenger airline (reported as "commercial")
//   kind "cargo" - all-cargo operator (reported as "cargo")
//   kind "mixed" - passenger airline that also runs freighters; the aircraft
//                  type decides (see FREIGHTER_TYPES).
// The list is deliberately conservative: an unknown prefix is reported as
// "other / unidentified operator" rather than guessed.

export const AIRLINES = {
  // India - passenger
  IGO: { iata: "6E", name: "IndiGo", kind: "mixed" },
  AIC: { iata: "AI", name: "Air India", kind: "pax" },
  AXB: { iata: "IX", name: "Air India Express", kind: "pax" },
  AKJ: { iata: "QP", name: "Akasa Air", kind: "pax" },
  SEJ: { iata: "SG", name: "SpiceJet", kind: "mixed" },
  LLR: { iata: "9I", name: "Alliance Air", kind: "pax" },
  SDG: { iata: "S5", name: "Star Air", kind: "pax" },
  FLB: { iata: "S9", name: "FLY91", kind: "pax" },
  IAD: { iata: "2T", name: "IndiaOne Air", kind: "pax" },
  // India - cargo
  BDA: { iata: "BZ", name: "Blue Dart Aviation", kind: "cargo" },
  // Gulf and Middle East
  UAE: { iata: "EK", name: "Emirates", kind: "mixed" },
  ETD: { iata: "EY", name: "Etihad Airways", kind: "mixed" },
  QTR: { iata: "QR", name: "Qatar Airways", kind: "mixed" },
  FDB: { iata: "FZ", name: "flydubai", kind: "pax" },
  ABY: { iata: "G9", name: "Air Arabia", kind: "pax" },
  ABQ: { iata: "3L", name: "Air Arabia Abu Dhabi", kind: "pax" },
  OMA: { iata: "WY", name: "Oman Air", kind: "pax" },
  OMS: { iata: "OV", name: "SalamAir", kind: "pax" },
  GFA: { iata: "GF", name: "Gulf Air", kind: "pax" },
  SVA: { iata: "SV", name: "Saudia", kind: "mixed" },
  KNE: { iata: "XY", name: "flynas", kind: "pax" },
  KAC: { iata: "KU", name: "Kuwait Airways", kind: "pax" },
  JZR: { iata: "J9", name: "Jazeera Airways", kind: "pax" },
  IRA: { iata: "IR", name: "Iran Air", kind: "pax" },
  // Asia
  SIA: { iata: "SQ", name: "Singapore Airlines", kind: "pax" },
  SQC: { iata: "SQ", name: "Singapore Airlines Cargo", kind: "cargo" },
  TGW: { iata: "TR", name: "Scoot", kind: "pax" },
  THA: { iata: "TG", name: "Thai Airways", kind: "pax" },
  MXD: { iata: "OD", name: "Malaysia Airlines", kind: "pax" },
  AXM: { iata: "AK", name: "AirAsia", kind: "pax" },
  ALK: { iata: "UL", name: "SriLankan Airlines", kind: "pax" },
  CPA: { iata: "CX", name: "Cathay Pacific", kind: "mixed" },
  BBC: { iata: "BG", name: "Biman Bangladesh", kind: "pax" },
  RNA: { iata: "RA", name: "Nepal Airlines", kind: "pax" },
  KAL: { iata: "KE", name: "Korean Air", kind: "mixed" },
  JAL: { iata: "JL", name: "Japan Airlines", kind: "pax" },
  ANA: { iata: "NH", name: "All Nippon Airways", kind: "pax" },
  CES: { iata: "MU", name: "China Eastern", kind: "pax" },
  CCA: { iata: "CA", name: "Air China", kind: "pax" },
  VJC: { iata: "VJ", name: "VietJet Air", kind: "pax" },
  HVN: { iata: "VN", name: "Vietnam Airlines", kind: "pax" },
  // Europe, Africa, Americas
  THY: { iata: "TK", name: "Turkish Airlines", kind: "mixed" },
  BAW: { iata: "BA", name: "British Airways", kind: "pax" },
  VIR: { iata: "VS", name: "Virgin Atlantic", kind: "pax" },
  DLH: { iata: "LH", name: "Lufthansa", kind: "pax" },
  SWR: { iata: "LX", name: "Swiss", kind: "pax" },
  AFR: { iata: "AF", name: "Air France", kind: "pax" },
  KLM: { iata: "KL", name: "KLM", kind: "pax" },
  ETH: { iata: "ET", name: "Ethiopian Airlines", kind: "mixed" },
  KQA: { iata: "KQ", name: "Kenya Airways", kind: "pax" },
  UAL: { iata: "UA", name: "United Airlines", kind: "pax" },
  AAL: { iata: "AA", name: "American Airlines", kind: "pax" },
  DAL: { iata: "DL", name: "Delta Air Lines", kind: "pax" },
  ACA: { iata: "AC", name: "Air Canada", kind: "pax" },
  UZB: { iata: "HY", name: "Uzbekistan Airways", kind: "pax" },
  AHY: { iata: "J2", name: "Azerbaijan Airlines", kind: "pax" },
  // Cargo operators
  FDX: { iata: "FX", name: "FedEx Express", kind: "cargo" },
  UPS: { iata: "5X", name: "UPS Airlines", kind: "cargo" },
  GTI: { iata: "5Y", name: "Atlas Air", kind: "cargo" },
  PAC: { iata: "PO", name: "Polar Air Cargo", kind: "cargo" },
  CKS: { iata: "K4", name: "Kalitta Air", kind: "cargo" },
  BOX: { iata: "3S", name: "AeroLogic", kind: "cargo" },
  GEC: { iata: "LH", name: "Lufthansa Cargo", kind: "cargo" },
  CLX: { iata: "CV", name: "Cargolux", kind: "cargo" },
  BCS: { iata: "QY", name: "European Air Transport (DHL)", kind: "cargo" },
  DHK: { iata: "D0", name: "DHL Air UK", kind: "cargo" },
  DAE: { iata: "D5", name: "DHL Aero Expreso", kind: "cargo" },
  MPH: { iata: "MP", name: "Martinair Cargo", kind: "cargo" },
  ABW: { iata: "RU", name: "AirBridgeCargo", kind: "cargo" },
  AZG: { iata: "7L", name: "Silk Way West Airlines", kind: "cargo" },
  CAO: { iata: "CA", name: "Air China Cargo", kind: "cargo" },
  CKK: { iata: "CK", name: "China Cargo Airlines", kind: "cargo" },
  CSS: { iata: "O3", name: "SF Airlines", kind: "cargo" },
  CYZ: { iata: "CF", name: "China Postal Airlines", kind: "cargo" },
  NCA: { iata: "KZ", name: "Nippon Cargo Airlines", kind: "cargo" },
  TAY: { iata: "3V", name: "ASL Airlines Belgium", kind: "cargo" },
  ABR: { iata: "AG", name: "ASL Airlines Ireland", kind: "cargo" },
  SRR: { iata: "SRR", name: "Star Air (Maersk)", kind: "cargo" },
  MSX: { iata: "MSX", name: "EgyptAir Cargo", kind: "cargo" },
  TUA: { iata: "TU", name: "Turkmenistan Airlines", kind: "mixed" },
  CLU: { iata: "CLU", name: "Cargo Logic Air", kind: "cargo" },
  SQP: { iata: "SQP", name: "Sky Prime Aviation", kind: "cargo" },
  ICL: { iata: "5C", name: "CAL Cargo Airlines", kind: "cargo" },
  NPT: { iata: "NPT", name: "West Atlantic", kind: "cargo" },
  MYU: { iata: "MYU", name: "My Freighter", kind: "cargo" },
};

// Aircraft type designators that are freighters or almost always flown as
// freighters today. A "mixed" operator flying one of these is reported as
// cargo. The message always carries the raw type so a reader can check.
export const FREIGHTER_TYPES = new Set(["B744", "B748", "B77L", "B77F", "MD11", "A306", "A30B", "A3ST", "B74S", "B763F", "A332F"]);

// Common helicopter type designators (ADS-B also flags rotorcraft as emitter
// category A7, which is checked first).
export const HELICOPTER_TYPES = new Set([
  "EC20", "EC25", "EC30", "EC35", "EC45", "EC55", "EC75", "AS32", "AS50", "AS55", "AS65", "A109", "A119", "A139", "A169",
  "A189", "AW09", "B06", "B105", "B06T", "B212", "B412", "B427", "B429", "B430", "B505", "S76", "S92", "R22", "R44", "R66",
  "H60", "H47", "H53", "MI8", "MI17", "DHRV", "ALH",
]);
