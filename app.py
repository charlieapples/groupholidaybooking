"""Group Holiday Optimiser — Streamlit web app."""
from __future__ import annotations

import os
from datetime import date, timedelta

import pandas as pd
import streamlit as st

# Load .env when running locally; on Streamlit Cloud secrets are env vars already.
if os.path.exists(".env"):
    from dotenv import load_dotenv
    load_dotenv()

from group_holiday.config import Config, DateWindow, Person
from group_holiday.optimiser import DestinationResult, optimise

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Group Holiday Finder",
    page_icon="✈️",
    layout="wide",
)

# ── Session state defaults ────────────────────────────────────────────────────
if "people" not in st.session_state:
    st.session_state.people = [
        {"name": "Alice", "home": "SW1A 1AA"},
        {"name": "Bob",   "home": "M1 1AE"},
    ]

# ── Header ────────────────────────────────────────────────────────────────────
st.title("✈️ Group Holiday Finder")
st.caption(
    "Find the cheapest destination for a group of friends flying from different UK cities. "
    "Flight prices via [Aviasales](https://www.aviasales.com) · "
    "Ground transport via Google Maps."
)
st.divider()

# ── Sidebar — inputs ──────────────────────────────────────────────────────────
with st.sidebar:
    st.header("Your group")

    # Dynamic people list
    to_remove = None
    for i, person in enumerate(st.session_state.people):
        col_name, col_home, col_del = st.columns([2, 2, 0.5])
        with col_name:
            person["name"] = st.text_input(
                "Name", value=person["name"], key=f"name_{i}", label_visibility="collapsed",
                placeholder="Name",
            )
        with col_home:
            person["home"] = st.text_input(
                "Postcode or city", value=person["home"], key=f"home_{i}",
                label_visibility="collapsed", placeholder="Postcode / city",
            )
        with col_del:
            if st.button("✕", key=f"del_{i}", help="Remove person"):
                to_remove = i

    if to_remove is not None:
        st.session_state.people.pop(to_remove)
        st.rerun()

    if st.button("+ Add person", use_container_width=True):
        st.session_state.people.append({"name": "", "home": ""})
        st.rerun()

    st.divider()

    # Destinations
    st.header("Destinations to compare")
    POPULAR = {
        "Amsterdam (AMS)": "AMS",
        "Barcelona (BCN)": "BCN",
        "Dublin (DUB)": "DUB",
        "Lisbon (LIS)": "LIS",
        "Prague (PRG)": "PRG",
        "Rome (FCO)": "FCO",
        "Paris (CDG)": "CDG",
        "Palma (PMI)": "PMI",
        "Athens (ATH)": "ATH",
        "Malaga (AGP)": "AGP",
        "Budapest (BUD)": "BUD",
        "Krakow (KRK)": "KRK",
        "Faro (FAO)": "FAO",
        "Tenerife (TFS)": "TFS",
    }
    chosen_labels = st.multiselect(
        "Pick from popular destinations",
        options=list(POPULAR.keys()),
        default=["Barcelona (BCN)", "Amsterdam (AMS)", "Lisbon (LIS)", "Prague (PRG)"],
    )
    custom_raw = st.text_input(
        "Or add custom IATA codes (comma-separated)",
        placeholder="e.g. DUB, NCE, VIE",
    )
    custom_codes = [c.strip().upper() for c in custom_raw.split(",") if c.strip()]
    destinations = [POPULAR[l] for l in chosen_labels] + custom_codes

    st.divider()

    # Dates
    st.header("When?")
    col_out, col_in = st.columns(2)
    with col_out:
        earliest_out = st.date_input(
            "Earliest outbound", value=date.today() + timedelta(days=60),
            min_value=date.today(),
        )
    with col_in:
        latest_in = st.date_input(
            "Latest return", value=date.today() + timedelta(days=90),
            min_value=date.today(),
        )

    col_min, col_max = st.columns(2)
    with col_min:
        min_nights = st.number_input("Min nights", min_value=1, max_value=30, value=4)
    with col_max:
        max_nights = st.number_input("Max nights", min_value=1, max_value=30, value=7)

    budget_cap = st.number_input(
        "Budget cap per person (£, optional — 0 = no cap)",
        min_value=0, value=0, step=50,
    )

    max_ground_hours = st.slider(
        "Max ground travel to airport (hours)", min_value=1.0, max_value=5.0,
        value=3.0, step=0.5,
    )

    st.divider()
    run = st.button("🔍 Find cheapest holiday", type="primary", use_container_width=True)

# ── Validation ────────────────────────────────────────────────────────────────
def _validate() -> list[str]:
    errors = []
    valid_people = [p for p in st.session_state.people if p["name"] and p["home"]]
    if len(valid_people) < 1:
        errors.append("Add at least one person with a name and home location.")
    if not destinations:
        errors.append("Select at least one destination.")
    if latest_in <= earliest_out:
        errors.append("Latest return date must be after earliest outbound date.")
    if min_nights > max_nights:
        errors.append("Min nights must be ≤ max nights.")
    gap = (latest_in - earliest_out).days
    if gap < min_nights:
        errors.append(f"Date window ({gap} days) is shorter than min nights ({min_nights}).")
    return errors

# ── Results ───────────────────────────────────────────────────────────────────
def _cost(v: float) -> str:
    return f"£{v:,.2f}"


def _show_results(results: list[DestinationResult]) -> None:
    viable = [r for r in results if all(p.viable for p in r.person_results)]
    partial = [r for r in results if r not in viable]

    if not viable and not partial:
        st.warning("No results found. Try widening the date window or increasing the ground travel limit.")
        return

    # ── Summary ranking table ─────────────────────────────────────────────────
    st.subheader("🏆 Destination ranking")

    if viable:
        rows = []
        for rank, dr in enumerate(viable, 1):
            rows.append({
                "Rank": rank,
                "Destination": dr.destination,
                "Group total": _cost(dr.total_group_cost),
                "Avg / person": _cost(dr.avg_individual_cost),
                "Max / person": _cost(dr.max_individual_cost),
                "Fairness": f"{dr.fairness_ratio:.2f}×",
            })
        st.dataframe(pd.DataFrame(rows).set_index("Rank"), use_container_width=True)
    else:
        st.info("No destinations had a complete viable route for everyone.")

    if partial:
        with st.expander(f"⚠️ {len(partial)} destination(s) with incomplete data"):
            for dr in partial:
                missing = [p.person_name for p in dr.person_results if not p.viable]
                st.write(f"**{dr.destination}** — no route found for: {', '.join(missing)}")

    st.divider()

    # ── Per-destination detail ────────────────────────────────────────────────
    st.subheader("📋 Per-person breakdown")
    all_results = viable + partial
    tabs = st.tabs([r.destination for r in all_results])

    for tab, dr in zip(tabs, all_results):
        with tab:
            rows = []
            for p in dr.person_results:
                if p.viable:
                    out_date = p.outbound.departure_date.strftime("%d %b") if p.outbound else "—"
                    in_date  = p.inbound.departure_date.strftime("%d %b")  if p.inbound  else "—"
                    rows.append({
                        "Person":    p.person_name,
                        "Airport":   p.chosen_airport or "—",
                        "Ground":    _cost(p.ground_cost),
                        "Outbound":  _cost(p.outbound_cost),
                        "Out date":  out_date,
                        "Return":    _cost(p.inbound_cost),
                        "In date":   in_date,
                        "Total":     _cost(p.total_cost_gbp),
                    })
                else:
                    rows.append({
                        "Person": p.person_name, "Airport": "—",
                        "Ground": "—", "Outbound": "—", "Out date": "—",
                        "Return": "—", "In date": "—",
                        "Total": f"No route — {p.note}",
                    })

            st.dataframe(pd.DataFrame(rows).set_index("Person"), use_container_width=True)

            # Fairness callout
            if all(p.viable for p in dr.person_results):
                most_exp = max(dr.person_results, key=lambda p: p.total_cost_gbp)
                least_exp = min(dr.person_results, key=lambda p: p.total_cost_gbp)
                col1, col2, col3 = st.columns(3)
                col1.metric("Group total", _cost(dr.total_group_cost))
                col2.metric("Cheapest person", f"{least_exp.person_name} — {_cost(least_exp.total_cost_gbp)}")
                col3.metric(
                    "Most expensive person",
                    f"{most_exp.person_name} — {_cost(most_exp.total_cost_gbp)}",
                    delta=f"+{_cost(most_exp.total_cost_gbp - least_exp.total_cost_gbp)} vs cheapest",
                    delta_color="inverse",
                )

            # Booking link for first viable person
            first_viable = next((p for p in dr.person_results if p.viable and p.outbound), None)
            if first_viable and first_viable.outbound.deep_link:
                st.link_button(
                    f"🔗 Search {dr.destination} flights on Aviasales",
                    first_viable.outbound.deep_link,
                    use_container_width=True,
                )


# ── Main logic ────────────────────────────────────────────────────────────────
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
            max_ground_hours=float(max_ground_hours),
        )

        with st.spinner("Searching flights and ground routes… (first run takes a minute, then it's cached)"):
            results = optimise(config)

        _show_results(results)

elif not run:
    # Landing state
    st.info(
        "👈 Fill in your group and travel dates in the sidebar, then click **Find cheapest holiday**."
    )
    st.markdown("""
    ### How it works
    1. **You enter** your group (names + home postcodes), candidate destinations, and date window
    2. **We check** every UK airport reachable from each person's home within your travel limit
    3. **We find** the cheapest flight + ground transport combo for each person to each destination
    4. **We rank** destinations by total group cost, with a fairness check so nobody gets stung

    Prices are from Aviasales' live database. Click through to book — same price as going direct.
    """)
