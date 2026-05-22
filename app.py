"""Group Holiday Optimiser — Streamlit web app."""
from __future__ import annotations

import os
from datetime import date, timedelta

import pandas as pd
import streamlit as st

if os.path.exists(".env"):
    from dotenv import load_dotenv
    load_dotenv()

from group_holiday.config import Config, DateWindow, Person
from group_holiday.optimiser import DestinationResult, optimise

# ── Destination name lookup ───────────────────────────────────────────────────
DEST_NAMES: dict[str, str] = {
    "AMS": "Amsterdam", "BCN": "Barcelona", "DUB": "Dublin",
    "LIS": "Lisbon",    "PRG": "Prague",    "FCO": "Rome",
    "CDG": "Paris",     "PMI": "Palma",     "ATH": "Athens",
    "AGP": "Malaga",    "BUD": "Budapest",  "KRK": "Krakow",
    "FAO": "Faro",      "TFS": "Tenerife",  "VIE": "Vienna",
    "NCE": "Nice",      "MLA": "Malta",     "OPO": "Porto",
    "NAP": "Naples",    "LPA": "Gran Canaria", "IBZ": "Ibiza",
    "SKG": "Thessaloniki", "HER": "Heraklion", "RHO": "Rhodes",
    "CFU": "Corfu",     "ZAD": "Zadar",     "SPU": "Split",
    "DBV": "Dubrovnik", "TLL": "Tallinn",   "RIX": "Riga",
    "VNO": "Vilnius",   "WAW": "Warsaw",    "GDN": "Gdansk",
    "BEG": "Belgrade",  "SOF": "Sofia",     "OTP": "Bucharest",
}

POPULAR = {
    "Amsterdam (AMS)": "AMS", "Barcelona (BCN)": "BCN",
    "Dublin (DUB)": "DUB",    "Lisbon (LIS)": "LIS",
    "Prague (PRG)": "PRG",    "Rome (FCO)": "FCO",
    "Paris (CDG)": "CDG",     "Palma (PMI)": "PMI",
    "Athens (ATH)": "ATH",    "Malaga (AGP)": "AGP",
    "Budapest (BUD)": "BUD",  "Krakow (KRK)": "KRK",
    "Faro (FAO)": "FAO",      "Tenerife (TFS)": "TFS",
    "Vienna (VIE)": "VIE",    "Nice (NCE)": "NCE",
    "Porto (OPO)": "OPO",     "Ibiza (IBZ)": "IBZ",
    "Dubrovnik (DBV)": "DBV", "Split (SPU)": "SPU",
}


def _dest_label(code: str, style: str) -> str:
    name = DEST_NAMES.get(code, code)
    if style == "IATA code only":
        return code
    if style == "City name only":
        return name
    return f"{name} ({code})"


# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Group Holiday Finder",
    page_icon="✈️",
    layout="wide",
)

# ── Session state ─────────────────────────────────────────────────────────────
if "people" not in st.session_state:
    st.session_state.people = [
        {"name": "Alice", "home": "SW1A 1AA"},
        {"name": "Bob",   "home": "M1 1AE"},
    ]

# ── Header ────────────────────────────────────────────────────────────────────
st.title("✈️ Group Holiday Finder")
st.caption(
    "Find the cheapest destination for a group flying from different UK cities. "
    "Flights via [Aviasales](https://www.aviasales.com) · Ground transport via Google Maps. "
    "Ground transport costs are estimates — actual train prices vary."
)
st.divider()

# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    # ── People ────────────────────────────────────────────────────────────────
    st.header("Your group")
    to_remove = None
    for i, person in enumerate(st.session_state.people):
        c1, c2, c3 = st.columns([2, 2, 0.5])
        with c1:
            person["name"] = st.text_input(
                "Name", value=person["name"], key=f"name_{i}",
                label_visibility="collapsed", placeholder="Name",
            )
        with c2:
            person["home"] = st.text_input(
                "Home", value=person["home"], key=f"home_{i}",
                label_visibility="collapsed", placeholder="Postcode / city",
            )
        with c3:
            if st.button("✕", key=f"del_{i}"):
                to_remove = i
    if to_remove is not None:
        st.session_state.people.pop(to_remove)
        st.rerun()
    if st.button("+ Add person", use_container_width=True):
        st.session_state.people.append({"name": "", "home": ""})
        st.rerun()

    st.divider()

    # ── Destinations ──────────────────────────────────────────────────────────
    st.header("Destinations")
    chosen_labels = st.multiselect(
        "Popular destinations",
        options=list(POPULAR.keys()),
        default=["Barcelona (BCN)", "Amsterdam (AMS)", "Lisbon (LIS)", "Prague (PRG)"],
    )
    custom_raw = st.text_input(
        "Custom IATA codes (comma-separated)",
        placeholder="e.g. DUB, NCE, VIE",
    )
    custom_codes = [c.strip().upper() for c in custom_raw.split(",") if c.strip()]
    destinations = [POPULAR[l] for l in chosen_labels] + custom_codes

    dest_display = st.radio(
        "Show destinations as",
        ["City name + code", "City name only", "IATA code only"],
        horizontal=True,
    )

    st.divider()

    # ── Dates ─────────────────────────────────────────────────────────────────
    st.header("When?")
    default_out = date.today() + timedelta(days=60)
    default_in  = date.today() + timedelta(days=90)

    c1, c2 = st.columns(2)
    with c1:
        earliest_out = st.date_input("Earliest outbound", value=default_out, min_value=date.today())
    with c2:
        # Ensure latest return is always after earliest outbound
        latest_in = st.date_input(
            "Latest return",
            value=max(default_in, earliest_out + timedelta(days=1)),
            min_value=earliest_out + timedelta(days=1),
        )

    c1, c2 = st.columns(2)
    with c1:
        min_nights = st.number_input("Min nights", min_value=1, max_value=60, value=4)
    with c2:
        max_nights = st.number_input("Max nights", min_value=1, max_value=60, value=7)

    st.divider()

    # ── Options ───────────────────────────────────────────────────────────────
    st.header("Options")

    budget_cap = st.number_input(
        "Budget cap per person (£, 0 = no cap)",
        min_value=0, value=0, step=50,
    )

    no_ground_limit = st.checkbox("No limit on ground travel time", value=True)
    if no_ground_limit:
        max_ground_hours = None
        st.caption("Searching all reachable UK airports.")
    else:
        max_ground_hours_val = st.number_input(
            "Max ground travel to airport (hours)",
            min_value=0.5, max_value=24.0, value=3.0, step=0.5,
        )
        max_ground_hours = float(max_ground_hours_val)

    st.markdown("**Value of travel time**")
    time_value = st.radio(
        "How much is an hour of travel time worth to your group?",
        ["£0 / hr — cheapest money cost only", "£10 / hr", "£15 / hr", "Custom"],
        captions=[
            "Ignore travel time, just find cheapest flights",
            "Mild incentive to avoid long journeys",
            "Strong incentive to save time",
            "Enter your own value",
        ],
    )
    if time_value == "Custom":
        time_value_per_hour = st.number_input("£ per hour", min_value=0.0, value=10.0, step=5.0)
    else:
        time_value_per_hour = float(time_value.split("£")[1].split(" ")[0]) if "£" in time_value else 0.0

    st.divider()
    run = st.button("🔍 Find cheapest holiday", type="primary", use_container_width=True)


# ── Validation ────────────────────────────────────────────────────────────────
def _validate() -> list[str]:
    errors = []
    valid = [p for p in st.session_state.people if p["name"] and p["home"]]
    if not valid:
        errors.append("Add at least one person with a name and home location.")
    if not destinations:
        errors.append("Select at least one destination.")
    if min_nights > max_nights:
        errors.append("Min nights must be ≤ max nights.")
    gap = (latest_in - earliest_out).days
    if gap < min_nights:
        errors.append(f"Date window ({gap} days) is shorter than min nights ({min_nights}).")
    return errors


# ── Display helpers ───────────────────────────────────────────────────────────
def _fmt(v: float) -> str:
    return f"£{v:,.2f}"


def _show_results(results: list[DestinationResult], time_value_per_hour: float) -> None:
    viable   = [r for r in results if all(p.viable for p in r.person_results)]
    partial  = [r for r in results if not all(p.viable for p in r.person_results)]

    time_note = (
        f" *(ranked by money + £{time_value_per_hour:.0f}/hr travel time value)*"
        if time_value_per_hour > 0 else ""
    )

    st.subheader(f"Destination ranking{time_note}")

    if viable:
        rows = []
        for rank, dr in enumerate(viable, 1):
            label = _dest_label(dr.destination, dest_display)
            row = {
                "Rank": rank,
                "Destination": label,
                "Group total (£)": f"{dr.total_group_money_cost:,.2f}",
                "Avg / person": _fmt(dr.avg_individual_cost),
                "Max / person": _fmt(dr.max_individual_cost),
                "Fairness": f"{dr.fairness_ratio:.2f}x",
            }
            if time_value_per_hour > 0:
                row["Incl. time value"] = _fmt(dr.total_group_cost)
            rows.append(row)
        st.dataframe(pd.DataFrame(rows).set_index("Rank"), use_container_width=True)
    else:
        st.info("No destinations had a complete route for everyone — see below.")

    if partial:
        with st.expander(f"⚠️ {len(partial)} destination(s) with incomplete data"):
            for dr in partial:
                missing = [p.person_name for p in dr.person_results if not p.viable]
                label = _dest_label(dr.destination, dest_display)
                st.write(f"**{label}** — no flight data found for: {', '.join(missing)}")
            st.caption(
                "Missing data usually means the Aviasales price cache doesn't have "
                "a recent fare for that route. Try widening the date window or "
                "checking back tomorrow when the cache refreshes."
            )

    st.divider()
    st.subheader("Per-person breakdown")

    all_results = viable + partial
    tab_labels  = [_dest_label(r.destination, dest_display) for r in all_results]
    tabs = st.tabs(tab_labels)

    for tab, dr in zip(tabs, all_results):
        with tab:
            rows = []
            for p in dr.person_results:
                if p.viable:
                    out_d = p.outbound.departure_date.strftime("%d %b") if p.outbound else "—"
                    in_d  = p.inbound.departure_date.strftime("%d %b")  if p.inbound  else "—"
                    row = {
                        "Person":   p.person_name,
                        "Airport":  p.chosen_airport or "—",
                        "Ground ~": _fmt(p.ground_cost),
                        "Travel":   f"{p.ground_hours:.1f}h",
                        "Outbound": _fmt(p.outbound_cost),
                        "Out date": out_d,
                        "Return":   _fmt(p.inbound_cost),
                        "In date":  in_d,
                        "Total":    _fmt(p.flight_plus_ground_gbp),
                    }
                    if time_value_per_hour > 0:
                        row["+ Time"] = _fmt(p.total_cost_gbp)
                else:
                    row = {
                        "Person": p.person_name, "Airport": "—",
                        "Ground ~": "—", "Travel": "—",
                        "Outbound": "—", "Out date": "—",
                        "Return": "—",   "In date": "—",
                        "Total": p.note,
                    }
                    if time_value_per_hour > 0:
                        row["+ Time"] = "—"
                rows.append(row)

            st.dataframe(pd.DataFrame(rows).set_index("Person"), use_container_width=True)
            st.caption("Ground ~ = estimated cost (actual train prices may vary)")

            if all(p.viable for p in dr.person_results):
                most_exp  = max(dr.person_results, key=lambda p: p.total_cost_gbp)
                least_exp = min(dr.person_results, key=lambda p: p.total_cost_gbp)
                c1, c2, c3 = st.columns(3)
                c1.metric("Group money total", _fmt(dr.total_group_money_cost))
                c2.metric("Best deal", f"{least_exp.person_name} · {_fmt(least_exp.flight_plus_ground_gbp)}")
                c3.metric(
                    "Priciest person",
                    f"{most_exp.person_name} · {_fmt(most_exp.flight_plus_ground_gbp)}",
                    delta=f"+{_fmt(most_exp.flight_plus_ground_gbp - least_exp.flight_plus_ground_gbp)}",
                    delta_color="inverse",
                )

            first_viable = next((p for p in dr.person_results if p.viable and p.outbound), None)
            if first_viable and first_viable.outbound.deep_link:
                st.link_button(
                    f"Search {_dest_label(dr.destination, dest_display)} flights on Aviasales",
                    first_viable.outbound.deep_link,
                    use_container_width=True,
                )


# ── Main ──────────────────────────────────────────────────────────────────────
if run:
    errors = _validate()
    if errors:
        for e in errors:
            st.error(e)
    else:
        valid_people = [p for p in st.session_state.people if p["name"] and p["home"]]
        config = Config(
            people=[Person(name=p["name"], home=p["home"]) for p in valid_people],
            destinations=destinations,
            date_window=DateWindow(
                earliest_outbound=earliest_out,
                latest_inbound=latest_in,
                min_nights=int(min_nights),
                max_nights=int(max_nights),
            ),
            budget_cap_per_person=float(budget_cap) if budget_cap > 0 else None,
            max_ground_hours=max_ground_hours,
            time_value_per_hour=float(time_value_per_hour),
        )
        with st.spinner("Searching… first run takes a minute, then results are cached."):
            results = optimise(config)
        _show_results(results, float(time_value_per_hour))

else:
    st.info("👈 Fill in your group and dates in the sidebar, then click **Find cheapest holiday**.")
    st.markdown("""
    ### How it works
    1. **Enter your group** — names and home postcodes from anywhere in the UK
    2. **Pick destinations** to compare, or we rank them all for you
    3. **Set your dates** — we find the cheapest flights within your window
    4. **Results** show total group cost, per-person breakdown, and a fairness score

    Prices are from Aviasales. Click through to book at the same price you'd pay direct.
    Ground transport costs are **estimates** — actual train/bus prices vary.
    """)
