# Group Holiday Finder

Find the cheapest holiday destination for a group of friends flying from different UK cities.

When 4–12 people from different parts of the UK want to fly somewhere together, the cheapest *destination* for the group as a whole isn't obvious — it depends on flight prices from every person's nearest airport, the ground transport cost to get them there, and how those numbers stack up across the group.

This tool figures that out.

## Live app

👉 **[groupholidaybooking.streamlit.app](https://groupholidaybooking.streamlit.app)**

## What it does

1. You enter your group (names + home postcodes) and a date window
2. For each candidate destination, it works out:
   - Which UK airport each person should fly from (based on ground travel cost + time)
   - The cheapest flight prices for those airports
   - The total cost per person, and for the whole group
3. It ranks destinations cheapest-first, with a fairness flag if one person is being stung more than the others
4. You click through to book — same price you'd pay direct

## How it works under the hood

| Component  | Source |
| ---------- | ------ |
| Flight prices | [Aviasales](https://www.aviasales.com) via [Travelpayouts API](https://travelpayouts.github.io/slate/) |
| Ground transport routing | [Google Maps Directions API](https://developers.google.com/maps/documentation/directions) |
| Ground transport price | Estimated (£0.15/km transit, £0.25/km driving) |
| Booking | Aviasales affiliate links — same price as booking direct, earns the project a small commission |

Flight prices come from Aviasales' cache (refreshed roughly daily). Ground transport routes and times are real Google Maps data; the £ cost is an estimate because there's no free UK API for live train/bus prices.

## Two trip modes

- **Group flies on same dates** (default) — picks one outbound and return date for the whole group, so you're actually on the same trip
- **Individual optima** — each person picks their own cheapest dates (faster, but the group may not coincide)

## Tech stack

- Python 3.11+
- Streamlit (web UI) + Click-style CLI
- Pydantic for config validation
- httpx + tenacity for resilient API calls
- diskcache so repeated runs are free
- Deployed on Streamlit Cloud (free tier)

## Run locally

```bash
git clone https://github.com/charlieapples/groupholidaybooking
cd groupholidaybooking
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt    # Windows
# .venv/bin/pip install -r requirements.txt      # Linux/Mac

cp .env.example .env
# add your TRAVELPAYOUTS_TOKEN and GOOGLE_MAPS_API_KEY

streamlit run app.py                              # web app
python -m group_holiday.main example_config.yaml  # CLI
```

### Get your API keys

- **Travelpayouts** — sign up free at [travelpayouts.com](https://www.travelpayouts.com), join the Aviasales programme, your token appears in your profile
- **Google Maps** — Google Cloud Console → enable Directions API → create an API key ($200/month free credit, plenty for this)

## Roadmap

- [x] CLI + Streamlit web app
- [x] Affiliate booking links
- [x] Shared group dates mode
- [x] Time value of travel option
- [ ] Real train ticket prices (Trainline partner API or scraper)
- [ ] Sharable results URLs
- [ ] Calendar view of cheap weekends
- [ ] Accommodation comparison (Booking.com affiliate)
- [ ] Cost-of-living lookup for spending money estimates
- [ ] Mixed-airline cheapest-pair search
- [ ] Mobile-first UI rebuild

## Contributing

Issues and PRs welcome. The interesting problems are:
- Better ground transport pricing without paying for an enterprise API
- Smarter shared-dates algorithm when route data is sparse
- A mobile-friendly UI (Streamlit's sidebar isn't great on small screens)

## Licence

MIT — see [LICENSE](LICENSE).
