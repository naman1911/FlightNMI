# FlightNMI

Watches every aircraft arriving at **Navi Mumbai International Airport (NMI / VANM)** and tells up to **three people** about it by **email** or **WhatsApp**. Commercial, cargo, private, military: if it lines up with NMI's runway, it is reported.

There are no charts or maps. The service does one thing: send a short, factual text when a flight is about to land, when it has landed, and (if it happens) when it goes around. A plain status page shows what it is doing and lets you manage the three recipients.

```
NMI arrival: 6E 6123 from Delhi (DEL) is about 18 min out
IndiGo. Commercial flight.
Size: narrow-body jet, Airbus A321neo, about 232 seats (A21N, VT-IUX).
Expected to land around 14:48 IST on runway 26.
Now 95 km from the airport at 12,000 ft.
Identified from its filed route to Navi Mumbai.

NMI landed: 6E 6123 from Delhi (DEL) at 14:51 IST
IndiGo. Commercial flight.
Size: narrow-body jet, Airbus A321neo, about 232 seats (A21N, VT-IUX).
Runway 26. Seen on the ground at the airport.
```

## How it works

1. Every 20 seconds the service asks community ADS-B aggregators ([adsb.lol](https://adsb.lol), with [airplanes.live](https://airplanes.live) as backup) for every aircraft within 100 nautical miles of NMI, and looks up each airline flight's filed route.
2. A tracker decides which aircraft are coming to NMI rather than to Mumbai CSMIA 22 km away: a filed route ending at VANM, or a descent that is lined up with NMI's runway 08/26 and pointed at the field.
3. It emits three kinds of event, each at most once per flight, even across restarts:
   - **approaching**: the flight is within `NOTICE_MINUTES` (default 20) of landing;
   - **landed**: it is seen on the ground at NMI, or its signal was lost on short final (receivers usually lose aircraft below about 1,000 ft), in which case the time is estimated and the message says so;
   - **go-around**: it was on final and climbed away again.
4. Each flight is classified as **commercial**, **cargo** or **other** from its operator code and aircraft type. Unknown operators are reported as "other / operator not in our list" rather than guessed.
5. Every alert says **how big the aircraft is**: its name, a size class (light aircraft, business jet, regional turboprop, regional jet, narrow-body, wide-body, very large wide-body, helicopter) and roughly how many seats it has, or for cargo flights roughly how many tonnes it carries. Figures are typical configurations, always written as "about". If the type is not in the table, the size comes from the ADS-B weight category (for example "heavy aircraft, over 136 tonnes, wide-body sized").
6. Recipients get the same plain text on every channel they have. Deliveries are retried three times and logged; the status page shows what was sent and whether it got through.
7. If no data source has answered for 10 minutes, recipients are told; they are told again when it recovers.

Everything about detection is in `src/tracker.js`, which has no network or timers, and is covered by tests for the normal approach, lost signal on final, Mumbai arrivals on runways 27 and 32, overflights, departures, go-arounds, and repeated flights.

## Quick start with Gmail (free)

On a Linux machine that stays on (a free Oracle Cloud VM, a Raspberry Pi, an old laptop):

```bash
git clone https://github.com/naman1911/FlightNMI.git && cd FlightNMI && bash scripts/setup.sh
```

The script installs Docker if needed, asks for the Gmail address that will send the alerts and its [app password](https://myaccount.google.com/apppasswords) (turn on 2-Step Verification first), generates the admin token, writes `.env`, starts the service and confirms Gmail login worked. It then prints the status page address, the admin address and the token. Open the admin page, add up to three people with their email addresses, and press **Send a test message** for each.

Gmail allows about 500 messages a day. Each flight is two alerts per person, so three people cover roughly 80 arrivals a day. The status page shows how many emails went out today and warns when the limit is near; if it is, untick "Approaching" for some recipients to halve the volume.

## Running it

You need Node.js 22 or newer, or Docker. The service must run somewhere that stays on (a small VPS, a Raspberry Pi at home, or a hosted container service such as Fly.io, Railway or Render). It cannot run as a static website because browsers are not allowed to read the flight data directly, and because something has to be awake to send the messages.

### 1. Configure

```bash
cp .env.example .env
```

Edit `.env`:

- `ADMIN_TOKEN`: the password for the `/admin` page. Make it long and random (`openssl rand -hex 24`).
- **Email**: fill in `SMTP_*` and `EMAIL_FROM`. For Gmail, create an [app password](https://support.google.com/accounts/answer/185833) and use `smtp.gmail.com`, port `587`, `SMTP_SECURE=false`. Any SMTP provider works.
- **WhatsApp**, pick one:
  - **Twilio** (quickest): create a Twilio account, open *Messaging → Try it out → Send a WhatsApp message*, and have each recipient send the join code to the sandbox number. Fill in `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`. The sandbox needs recipients to re-join every 72 hours; a Twilio WhatsApp sender approved for your business does not.
  - **Meta WhatsApp Cloud API** (official, free tier): create a Meta business app with WhatsApp, fill in `WHATSAPP_PHONE_NUMBER_ID` and a permanent `WHATSAPP_ACCESS_TOKEN`. Meta only delivers plain text inside 24 hours of the recipient writing to your number, so for a hands-off setup create and get approval for a utility **template** whose body is just `{{1}}`, and set `WHATSAPP_TEMPLATE_NAME`. The whole alert text is sent as that parameter.
- Optionally `RECIPIENTS_JSON` to pre-load the recipients; otherwise add them on the admin page.

Check the configuration before starting:

```bash
npm install
npm run check-config
```

### 2. Start

With Node:

```bash
npm start
```

With Docker:

```bash
docker compose up -d
```

Open `http://your-host:8080/`. The status page shows whether flight data is flowing, which flights are inbound now, and the alert log. Open `/admin`, sign in with `ADMIN_TOKEN`, add up to three recipients, and press **Send a test message** for each to confirm delivery.

Recipients and the log are stored in `DATA_DIR` (`./data`, or the `/data` volume in Docker). Keep that directory across restarts so nobody gets the same alert twice.

### Per-recipient settings

Each person can choose which alerts they want (approaching, landed, go-around), which kinds of flight (commercial, cargo, other), and whether to be told about data outages. A recipient can be paused without being deleted.

### Health check

`GET /health` returns `200` while data is flowing and `503` otherwise, for uptime monitors. `GET /api/status` returns the same information as the status page as JSON, with addresses masked.

## Verifying it without live data

```bash
npm test          # unit tests for detection, classification, messages, storage, delivery and the web pages
npm run simulate  # replays a synthetic Delhi-to-NMI arrival and prints the exact messages recipients would get
```

## Limits to be aware of

- Positions come from volunteer receivers. Coverage around Raigad is good at altitude but patchy near the ground, so landings are often "presumed" from the last position on final rather than seen on the runway. The message says which.
- A flight whose transponder is not received at all cannot be reported. Military aircraft often do not broadcast.
- Route information is a community database; when it is missing, the service relies on approach geometry alone, which only sees a flight once it is within about 30 km and pointed at the field.
- This is not an official source of airport information. For gate, delay and schedule information use the airline or airport.

## Layout

```
src/server.js        start-up, polling loop, event handling, outage alerts
src/sources.js       adsb.lol / airplanes.live client and route lookup
src/tracker.js       arrival detection state machine (pure, tested)
src/classify.js      commercial / cargo / other and flight labels
src/airlines.js      operator table (edit to add an airline or cargo carrier)
src/aircraft.js      aircraft type table: name, size class, seats or cargo payload
src/airports.js      NMI, BOM and airport names
src/notify/          message text, email (SMTP), WhatsApp (Twilio or Meta), dispatcher
src/web/             status page, admin page, health endpoint
src/store.js         recipients, alert log and sent-event memory (JSON file, atomic writes)
scripts/             setup.sh (one-command Gmail setup), simulate.js, check-config.js
test/                node:test suites; `npm test`
```

## Licence

MIT.
