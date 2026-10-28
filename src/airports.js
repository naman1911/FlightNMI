// Airport facts used for detection and for naming origins in messages.
// NMI is the point everything is measured from; BOM (Mumbai CSMIA) is the
// neighbouring airport whose traffic must never be reported as NMI traffic.

export const NMI = {
  icao: "VANM",
  iata: "NMI",
  name: "Navi Mumbai International Airport",
  lat: 18.99194,
  lon: 73.06167,
  elevationFt: 20,
  // Runway 08/26. True heading of runway 08 (approx); 26 is the reciprocal.
  runwayHeading: 80,
  runways: ["08", "26"],
};

export const BOM = {
  icao: "VABB",
  iata: "BOM",
  name: "Chhatrapati Shivaji Maharaj International Airport, Mumbai",
  lat: 19.0887,
  lon: 72.8679,
};

// ICAO -> [IATA, city]. Used so messages can say "from Delhi (DEL)" instead
// of "from VIDP". Unknown codes fall back to whatever the route service names.
export const AIRPORTS = {
  VIDP: ["DEL", "Delhi"], VOBL: ["BLR", "Bengaluru"], VOMM: ["MAA", "Chennai"], VOHS: ["HYD", "Hyderabad"],
  VECC: ["CCU", "Kolkata"], VAAH: ["AMD", "Ahmedabad"], VOGO: ["GOI", "Goa Dabolim"], VOGA: ["GOX", "Goa Mopa"],
  VOCI: ["COK", "Kochi"], VILK: ["LKO", "Lucknow"], VIJP: ["JAI", "Jaipur"], VANP: ["NAG", "Nagpur"],
  VOTV: ["TRV", "Thiruvananthapuram"], VOCB: ["CJB", "Coimbatore"], VEGT: ["GAU", "Guwahati"], VAID: ["IDR", "Indore"],
  VEPT: ["PAT", "Patna"], VEBN: ["VNS", "Varanasi"], VOML: ["IXE", "Mangaluru"], VASU: ["STV", "Surat"],
  VABO: ["BDQ", "Vadodara"], VIAR: ["ATQ", "Amritsar"], VICG: ["IXC", "Chandigarh"], VEBS: ["BBI", "Bhubaneswar"],
  VAPO: ["PNQ", "Pune"], VOTR: ["TRZ", "Tiruchirappalli"], VOMD: ["IXM", "Madurai"], VEBD: ["IXB", "Bagdogra"],
  VERP: ["RPR", "Raipur"], VABP: ["BHO", "Bhopal"], VAUD: ["UDR", "Udaipur"], VOVZ: ["VTZ", "Visakhapatnam"],
  VAKP: ["KLH", "Kolhapur"], VOCL: ["CCJ", "Kozhikode"], VOKN: ["CNN", "Kannur"], VAAU: ["IXU", "Chh. Sambhajinagar"],
  VISR: ["SXR", "Srinagar"], VIJU: ["IXJ", "Jammu"], VEAT: ["IXA", "Agartala"], VEIM: ["IMF", "Imphal"],
  VABB: ["BOM", "Mumbai"], VAJJ: ["JGA", "Jamnagar"], VARK: ["RAJ", "Rajkot"], VABV: ["BHU", "Bhavnagar"],
  VEJH: ["IXW", "Jamshedpur"], VERC: ["IXR", "Ranchi"], VIDN: ["DED", "Dehradun"], VIGR: ["GWL", "Gwalior"],
  VEGY: ["GAY", "Gaya"], VOTP: ["TIR", "Tirupati"], VOBZ: ["VGA", "Vijayawada"], VOHB: ["HBX", "Hubballi"],
  OMDB: ["DXB", "Dubai"], OMDW: ["DWC", "Dubai Al Maktoum"], OMAA: ["AUH", "Abu Dhabi"], OMSJ: ["SHJ", "Sharjah"],
  OTHH: ["DOH", "Doha"], OOMS: ["MCT", "Muscat"], OBBI: ["BAH", "Bahrain"], OKBK: ["KWI", "Kuwait"],
  OEJN: ["JED", "Jeddah"], OERK: ["RUH", "Riyadh"], OEDF: ["DMM", "Dammam"], WSSS: ["SIN", "Singapore"],
  VTBS: ["BKK", "Bangkok"], VRMM: ["MLE", "Malé"], VCBI: ["CMB", "Colombo"], VNKT: ["KTM", "Kathmandu"],
  WMKK: ["KUL", "Kuala Lumpur"], VHHH: ["HKG", "Hong Kong"], HAAB: ["ADD", "Addis Ababa"], HKJK: ["NBO", "Nairobi"],
  LTFM: ["IST", "Istanbul"], EGLL: ["LHR", "London Heathrow"], EDDF: ["FRA", "Frankfurt"], LFPG: ["CDG", "Paris"],
  EHAM: ["AMS", "Amsterdam"], EBLG: ["LGG", "Liège"], ELLX: ["LUX", "Luxembourg"], EDDK: ["CGN", "Cologne"],
  ZSPD: ["PVG", "Shanghai Pudong"], ZGGG: ["CAN", "Guangzhou"], RKSI: ["ICN", "Seoul Incheon"], RJAA: ["NRT", "Tokyo Narita"],
  KJFK: ["JFK", "New York JFK"], KEWR: ["EWR", "Newark"], KORD: ["ORD", "Chicago"], KMEM: ["MEM", "Memphis"],
  KSDF: ["SDF", "Louisville"], KANC: ["ANC", "Anchorage"], UBBB: ["GYD", "Baku"], OIIE: ["IKA", "Tehran"],
  VGHS: ["DAC", "Dhaka"], VYYY: ["RGN", "Yangon"], VVTS: ["SGN", "Ho Chi Minh City"], WIII: ["CGK", "Jakarta"],
};

export function airportLabel(icao, fallback) {
  const e = AIRPORTS[icao];
  if (e) return `${e[1]} (${e[0]})`;
  if (fallback?.location || fallback?.name) return `${fallback.location || fallback.name}${fallback.iata ? ` (${fallback.iata})` : ""}`;
  return icao || "";
}
