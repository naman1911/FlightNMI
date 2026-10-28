// Aircraft types by ICAO designator, so a message can say how big the
// aircraft is in plain words: its name, a size class, and roughly how many
// seats (or tonnes of cargo) it carries. Figures are typical airline
// configurations and are always written as "about".
//
//   [name, sizeClass, typicalSeats, freighterPayloadTonnes]
//   sizeClass: light | bizjet | turboprop | regional | narrow | wide | jumbo | military | helicopter

export const SIZE_LABEL = {
  light: "light aircraft",
  bizjet: "business jet",
  turboprop: "regional turboprop",
  regional: "regional jet",
  narrow: "narrow-body jet",
  wide: "wide-body jet",
  jumbo: "very large wide-body jet",
  military: "military transport",
  helicopter: "helicopter",
};

export const AIRCRAFT = {
  // Narrow-body jets
  A318: ["Airbus A318", "narrow", 110], A319: ["Airbus A319", "narrow", 140], A19N: ["Airbus A319neo", "narrow", 140],
  A320: ["Airbus A320", "narrow", 180], A20N: ["Airbus A320neo", "narrow", 186],
  A321: ["Airbus A321", "narrow", 220, 27], A21N: ["Airbus A321neo", "narrow", 232],
  B732: ["Boeing 737-200", "narrow", 115, 15], B733: ["Boeing 737-300", "narrow", 140, 19], B734: ["Boeing 737-400", "narrow", 160, 20],
  B735: ["Boeing 737-500", "narrow", 120], B736: ["Boeing 737-600", "narrow", 120], B737: ["Boeing 737-700", "narrow", 140],
  B738: ["Boeing 737-800", "narrow", 189, 23], B739: ["Boeing 737-900", "narrow", 215],
  B37M: ["Boeing 737 MAX 7", "narrow", 150], B38M: ["Boeing 737 MAX 8", "narrow", 189], B39M: ["Boeing 737 MAX 9", "narrow", 220], B3XM: ["Boeing 737 MAX 10", "narrow", 230],
  B752: ["Boeing 757-200", "narrow", 200, 34], B753: ["Boeing 757-300", "narrow", 240],
  MD82: ["McDonnell Douglas MD-82", "narrow", 150], MD83: ["McDonnell Douglas MD-83", "narrow", 150], MD88: ["McDonnell Douglas MD-88", "narrow", 150],
  BCS1: ["Airbus A220-100", "narrow", 120], BCS3: ["Airbus A220-300", "narrow", 145],
  E290: ["Embraer E190-E2", "narrow", 110], E295: ["Embraer E195-E2", "narrow", 132],
  C919: ["COMAC C919", "narrow", 160], SU95: ["Sukhoi Superjet 100", "regional", 98], T204: ["Tupolev Tu-204", "narrow", 200],
  // Regional jets
  E170: ["Embraer E170", "regional", 72], E175: ["Embraer E175", "regional", 80], E190: ["Embraer E190", "regional", 100], E195: ["Embraer E195", "regional", 118],
  E135: ["Embraer ERJ-135", "regional", 37], E145: ["Embraer ERJ-145", "regional", 50],
  CRJ2: ["Bombardier CRJ200", "regional", 50], CRJ7: ["Bombardier CRJ700", "regional", 70], CRJ9: ["Bombardier CRJ900", "regional", 90], CRJX: ["Bombardier CRJ1000", "regional", 100],
  AJ27: ["COMAC ARJ21", "regional", 90], RJ85: ["Avro RJ85", "regional", 95], RJ1H: ["Avro RJ100", "regional", 110], B462: ["BAe 146-200", "regional", 90],
  // Regional turboprops
  AT43: ["ATR 42-300", "turboprop", 48], AT45: ["ATR 42-500", "turboprop", 48], AT46: ["ATR 42-600", "turboprop", 48],
  AT72: ["ATR 72", "turboprop", 70, 8], AT75: ["ATR 72-500", "turboprop", 72, 8], AT76: ["ATR 72-600", "turboprop", 72, 8],
  DH8A: ["De Havilland Dash 8-100", "turboprop", 37], DH8B: ["De Havilland Dash 8-200", "turboprop", 37], DH8C: ["De Havilland Dash 8-300", "turboprop", 50], DH8D: ["De Havilland Dash 8-400", "turboprop", 78],
  SF34: ["Saab 340", "turboprop", 34], SB20: ["Saab 2000", "turboprop", 50], D328: ["Dornier 328", "turboprop", 32], J328: ["Dornier 328JET", "regional", 32],
  DHC6: ["De Havilland Twin Otter", "turboprop", 19], L410: ["Let L-410", "turboprop", 19], BE99: ["Beechcraft 1900", "turboprop", 19], F50: ["Fokker 50", "turboprop", 50],
  // Wide-body jets
  A306: ["Airbus A300-600", "wide", 260, 48], A30B: ["Airbus A300", "wide", 250, 45], A310: ["Airbus A310", "wide", 220, 40],
  A332: ["Airbus A330-200", "wide", 250, 65], A333: ["Airbus A330-300", "wide", 290, 60], A338: ["Airbus A330-800neo", "wide", 260], A339: ["Airbus A330-900neo", "wide", 290],
  A342: ["Airbus A340-200", "wide", 260], A343: ["Airbus A340-300", "wide", 290], A345: ["Airbus A340-500", "wide", 300], A346: ["Airbus A340-600", "wide", 350],
  A359: ["Airbus A350-900", "wide", 325], A35K: ["Airbus A350-1000", "wide", 370],
  B762: ["Boeing 767-200", "wide", 200, 45], B763: ["Boeing 767-300", "wide", 240, 52], B764: ["Boeing 767-400", "wide", 270],
  B772: ["Boeing 777-200", "wide", 310], B77L: ["Boeing 777-200LR / 777F", "wide", 300, 102], B773: ["Boeing 777-300", "wide", 370], B77W: ["Boeing 777-300ER", "wide", 370], B778: ["Boeing 777-8", "wide", 380], B779: ["Boeing 777-9", "wide", 420],
  B788: ["Boeing 787-8 Dreamliner", "wide", 250], B789: ["Boeing 787-9 Dreamliner", "wide", 290], B78X: ["Boeing 787-10 Dreamliner", "wide", 330],
  MD11: ["McDonnell Douglas MD-11", "wide", 290, 90], DC10: ["McDonnell Douglas DC-10", "wide", 270, 65], IL96: ["Ilyushin Il-96", "wide", 260],
  // Very large
  B741: ["Boeing 747-100", "jumbo", 400, 100], B742: ["Boeing 747-200", "jumbo", 400, 110], B743: ["Boeing 747-300", "jumbo", 400, 110],
  B744: ["Boeing 747-400", "jumbo", 400, 113], B748: ["Boeing 747-8", "jumbo", 410, 134], B74S: ["Boeing 747SP", "jumbo", 300],
  A388: ["Airbus A380", "jumbo", 520], A3ST: ["Airbus Beluga", "jumbo", null, 47], A124: ["Antonov An-124", "jumbo", null, 150], A225: ["Antonov An-225", "jumbo", null, 250],
  // Dedicated freighters / military transports
  IL76: ["Ilyushin Il-76", "military", null, 50], AN12: ["Antonov An-12", "military", null, 20], AN26: ["Antonov An-26", "military", null, 5], AN32: ["Antonov An-32", "military", null, 7],
  C17: ["Boeing C-17 Globemaster", "military", null, 77], C130: ["Lockheed C-130 Hercules", "military", null, 19], C30J: ["Lockheed C-130J Super Hercules", "military", null, 19],
  A400: ["Airbus A400M", "military", null, 37], C295: ["Airbus C295", "military", null, 9], C27J: ["Alenia C-27J Spartan", "military", null, 11], K35R: ["Boeing KC-135", "military", null, 37],
  P8: ["Boeing P-8 Poseidon", "military", null, null], E3TF: ["Boeing E-3 Sentry", "military", null, null], DO28: ["Dornier Do 228", "turboprop", 19],
  // Business jets
  C25A: ["Cessna Citation CJ2", "bizjet", 7], C25B: ["Cessna Citation CJ3", "bizjet", 8], C25C: ["Cessna Citation CJ4", "bizjet", 9], C25M: ["Cessna Citation M2", "bizjet", 6],
  C510: ["Cessna Citation Mustang", "bizjet", 4], C525: ["Cessna CitationJet", "bizjet", 6], C550: ["Cessna Citation II", "bizjet", 8], C560: ["Cessna Citation V", "bizjet", 8],
  C56X: ["Cessna Citation XLS", "bizjet", 9], C680: ["Cessna Citation Sovereign", "bizjet", 9], C68A: ["Cessna Citation Latitude", "bizjet", 9], C700: ["Cessna Citation Longitude", "bizjet", 12], C750: ["Cessna Citation X", "bizjet", 9],
  CL30: ["Bombardier Challenger 300", "bizjet", 9], CL35: ["Bombardier Challenger 350", "bizjet", 10], CL60: ["Bombardier Challenger 600 series", "bizjet", 12],
  GLEX: ["Bombardier Global Express", "bizjet", 14], GL5T: ["Bombardier Global 5000", "bizjet", 13], GL7T: ["Bombardier Global 7500", "bizjet", 17], GLF4: ["Gulfstream IV", "bizjet", 14],
  GLF5: ["Gulfstream V / G550", "bizjet", 16], GLF6: ["Gulfstream G650", "bizjet", 18], G280: ["Gulfstream G280", "bizjet", 10], GA5C: ["Gulfstream G500", "bizjet", 16], GA6C: ["Gulfstream G600", "bizjet", 17], GA7C: ["Gulfstream G700", "bizjet", 19],
  F2TH: ["Dassault Falcon 2000", "bizjet", 10], F900: ["Dassault Falcon 900", "bizjet", 12], FA7X: ["Dassault Falcon 7X", "bizjet", 14], FA8X: ["Dassault Falcon 8X", "bizjet", 14], FA50: ["Dassault Falcon 50", "bizjet", 9], FA6X: ["Dassault Falcon 6X", "bizjet", 14],
  E50P: ["Embraer Phenom 100", "bizjet", 5], E55P: ["Embraer Phenom 300", "bizjet", 8], E545: ["Embraer Legacy 450 / Praetor 500", "bizjet", 9], E550: ["Embraer Legacy 500 / Praetor 600", "bizjet", 12],
  E35L: ["Embraer Legacy 600/650", "bizjet", 13], E135BJ: ["Embraer Legacy 600", "bizjet", 13], LJ35: ["Learjet 35", "bizjet", 7], LJ45: ["Learjet 45", "bizjet", 8], LJ60: ["Learjet 60", "bizjet", 8], LJ75: ["Learjet 75", "bizjet", 8],
  H25B: ["Hawker 800", "bizjet", 8], H25C: ["Hawker 1000", "bizjet", 8], HA4T: ["Hawker 4000", "bizjet", 8], BE40: ["Beechjet 400", "bizjet", 7], PRM1: ["Beechcraft Premier I", "bizjet", 6],
  PC24: ["Pilatus PC-24", "bizjet", 8], HDJT: ["HondaJet", "bizjet", 5], ASTR: ["Gulfstream G100 / Astra", "bizjet", 8], WW24: ["IAI Westwind", "bizjet", 8],
  BBJ1: ["Boeing Business Jet (737)", "bizjet", 30], BBJ2: ["Boeing Business Jet 2", "bizjet", 30], A319CJ: ["Airbus ACJ319", "bizjet", 30],
  // Small turboprops and light aircraft
  PC12: ["Pilatus PC-12", "light", 9], BE20: ["Beechcraft King Air 200", "light", 8], BE9L: ["Beechcraft King Air 90", "light", 6], B350: ["Beechcraft King Air 350", "light", 9], BE30: ["Beechcraft King Air 300", "light", 9],
  C208: ["Cessna 208 Caravan", "light", 12], TBM7: ["Daher TBM 700", "light", 6], TBM8: ["Daher TBM 850", "light", 6], TBM9: ["Daher TBM 900 series", "light", 6], PA46: ["Piper Malibu / Meridian", "light", 5], M600: ["Piper M600", "light", 6],
  C172: ["Cessna 172", "light", 4], C152: ["Cessna 152", "light", 2], C182: ["Cessna 182", "light", 4], C210: ["Cessna 210", "light", 6], C310: ["Cessna 310", "light", 6], C421: ["Cessna 421", "light", 7],
  P28A: ["Piper Cherokee", "light", 4], P28R: ["Piper Arrow", "light", 4], PA34: ["Piper Seneca", "light", 6], PA31: ["Piper Navajo", "light", 8], BE58: ["Beechcraft Baron", "light", 6], BE36: ["Beechcraft Bonanza", "light", 6],
  DA40: ["Diamond DA40", "light", 4], DA42: ["Diamond DA42", "light", 4], DA62: ["Diamond DA62", "light", 7], SR20: ["Cirrus SR20", "light", 4], SR22: ["Cirrus SR22", "light", 5], TB20: ["Socata TB20", "light", 4],
  // Helicopters
  EC20: ["Airbus H120", "helicopter", 4], EC30: ["Airbus H130", "helicopter", 6], EC35: ["Airbus H135", "helicopter", 7], EC45: ["Airbus H145", "helicopter", 9], EC55: ["Airbus H155", "helicopter", 12], EC75: ["Airbus H175", "helicopter", 16],
  EC25: ["Airbus H225 Super Puma", "helicopter", 19], AS32: ["Airbus AS332 Super Puma", "helicopter", 19], AS50: ["Airbus AS350 Ecureuil", "helicopter", 5], AS55: ["Airbus AS355", "helicopter", 5], AS65: ["Airbus AS365 Dauphin", "helicopter", 11],
  A109: ["Leonardo AW109", "helicopter", 7], A119: ["Leonardo AW119 Koala", "helicopter", 7], A139: ["Leonardo AW139", "helicopter", 15], A169: ["Leonardo AW169", "helicopter", 10], A189: ["Leonardo AW189", "helicopter", 19], AW09: ["Leonardo AW09", "helicopter", 7],
  B06: ["Bell 206", "helicopter", 4], B06T: ["Bell 206L LongRanger", "helicopter", 6], B105: ["MBB Bo 105", "helicopter", 4], B212: ["Bell 212", "helicopter", 13], B412: ["Bell 412", "helicopter", 13], B427: ["Bell 427", "helicopter", 7], B429: ["Bell 429", "helicopter", 7], B430: ["Bell 430", "helicopter", 8], B505: ["Bell 505", "helicopter", 4],
  S76: ["Sikorsky S-76", "helicopter", 12], S92: ["Sikorsky S-92", "helicopter", 19], R22: ["Robinson R22", "helicopter", 1], R44: ["Robinson R44", "helicopter", 3], R66: ["Robinson R66", "helicopter", 4],
  H60: ["Sikorsky H-60 Black Hawk", "helicopter", 11], H47: ["Boeing CH-47 Chinook", "helicopter", 33], H53: ["Sikorsky H-53", "helicopter", 37], MI8: ["Mil Mi-8", "helicopter", 24], MI17: ["Mil Mi-17", "helicopter", 24], DHRV: ["HAL Dhruv", "helicopter", 12], ALH: ["HAL Dhruv", "helicopter", 12],
};

// Fallback when the type is not in the table: the ADS-B emitter category
// says roughly how heavy the aircraft is.
const EMITTER_SIZE = {
  A1: "light aircraft (under 7 tonnes)",
  A2: "small aircraft (7 to 34 tonnes), business-jet or commuter sized",
  A3: "large aircraft (34 to 136 tonnes), narrow-body airliner sized",
  A4: "large aircraft, Boeing 757 class",
  A5: "heavy aircraft (over 136 tonnes), wide-body sized",
  A6: "high-performance aircraft",
  A7: "helicopter",
};

/**
 * Describe an aircraft's size in plain words.
 * @param {object} o { type, category, isCargo }
 * @returns {{ known:boolean, name:string, sizeClass:string|null, size:string, capacity:string, text:string }}
 */
export function describeAircraft({ type = "", category = "", isCargo = false } = {}) {
  const typ = String(type || "").toUpperCase();
  const row = AIRCRAFT[typ];
  if (!row) {
    const fallback = EMITTER_SIZE[category];
    const name = typ ? `type ${typ} (not in our list)` : "type not broadcast";
    const size = fallback || "size unknown";
    return { known: false, name, sizeClass: null, size, capacity: "", text: `${size}, ${name}` };
  }
  const [name, sizeClass, seats, payload] = row;
  let size = SIZE_LABEL[sizeClass];
  let capacity = "";
  if (isCargo) {
    // A cargo flight never reports seats; say "freighter" and give the payload when we know it.
    if (["wide", "jumbo", "narrow", "regional", "turboprop"].includes(sizeClass)) size = size.replace(/ jet$| turboprop$/, "") + " freighter";
    capacity = payload ? `about ${payload} tonnes of cargo` : "";
  } else if (seats) {
    capacity = sizeClass === "bizjet" || sizeClass === "light" || sizeClass === "helicopter" ? `up to ${seats} passengers` : `about ${seats} seats`;
  } else if (payload) {
    capacity = `about ${payload} tonnes of cargo`;
  }
  const text = `${size}, ${name}${capacity ? `, ${capacity}` : ""}`;
  return { known: true, name, sizeClass, size, capacity, text };
}
