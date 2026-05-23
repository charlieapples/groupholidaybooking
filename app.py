"""Group Holiday Optimiser — Streamlit web app."""
from __future__ import annotations

import json
import os
from datetime import date, timedelta

import pandas as pd
import streamlit as st

if os.path.exists(".env"):
    from dotenv import load_dotenv
    load_dotenv()

from group_holiday.config import Config, DateWindow, Person
from group_holiday.destinations import DEST_NAMES, POPULAR_LABELS, label
from group_holiday.optimiser import DestinationResult, optimise


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
    # People
    st.header("👥 Your group")
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

    # Destinations
    st.header("📍 Destinations")
    mode = st.radio(
        "Mode",
        ["Compare multiple destinations", "I know where we want to go"],
        captions=["Rank cheapest places to fly", "Just optimise flights for one place"],
    )

    if mode == "Compare multiple destinations":
        chosen_labels = st.multiselect(
            "Popular destinations",
            options=list(POPULAR_LABELS.keys()),
            default=[
                "Barcelona (BCN)", "Amsterdam (AMS)",
                "Lisbon (LIS)",    "Prague (PRG)",
            ],
        )
        custom_raw = st.text_input(
            "Or add custom IATA codes (comma-separated)",
            placeholder="e.g. DUB, NCE, VIE",
        )
        custom_codes = [c.strip().upper() for c in custom_raw.split(",") if c.strip()]
        destinations = [POPULAR_LABELS[l] for l in chosen_labels] + custom_codes
    else:
        single_label = st.selectbox(
            "Where are you going?",
            options=list(POPULAR_LABELS.keys()),
            index=1,  # Barcelona default
        )
        custom_single = st.text_input("Or custom IATA code", placeholder="e.g. NCE")
        if custom_single.strip():
            destinations = [custom_single.strip().upper()]
        else:
            destinations = [POPULAR_LABELS[single_label]]

    dest_display = st.radio(
        "Show destinations as",
        ["City name + code", "City name only", "IATA code only"],
        horizontal=True,
    )
    style_map = {
        "City name + code": "name_and_code",
        "City name only":   "name",
        "IATA code only":   "code",
    }
    style = style_map[dest_display]

    st.divider()

    # Dates
    st.header("📅 When?")
    default_out = date.today() + timedelta(days=60)
    default_in  = date.today() + timedelta(days=90)

    c1, c2 = st.columns(2)
    with c1:
        earliest_out = st.date_input(
            "Earliest outbound", value=default_out, min_value=date.today(),
        )
    with c2:
        latest_in = st.date_input(
            "Latest return",
            value=max(default_in, earliest_out + timedelta(days=5)),
            min_value=earliest_out + timedelta(days=2),
        )

    c1, c2 = st.columns(2)
    with c1:
        min_nights = st.number_input("Min nights", min_value=1, max_value=60, value=4)
    with c2:
        max_nights = st.number_input("Max nights", min_value=1, max_value=60, value=7)

    st.divider()

    # Options
    st.header("⚙️ Options")

    shared_dates = st.toggle(
        "Group flies on same dates",
        value=True,
        help=(
            "ON: everyone flies on the same outbound and return dates "
            "(realistic group travel). "
            "OFF: each person picks their own cheapest dates (may not coincide)."
        ),
    )

    budget_cap = st.number_input(
        "Budget cap per person (£, 0 = no cap)",
        min_value=0, value=0, step=50,
    )

    no_ground_limit = st.checkbox("No limit on ground travel time", value=True)
    if no_ground_limit:
        max_ground_hours = None
        st.caption("Searching all reachable UK airports.")
    else:
        max_ground_hours = float(st.number_input(
            "Max ground travel (hours)",
            min_value=0.5, max_value=24.0, value=3.0, step=0.5,
        ))

    st.markdown("**Value of travel time**")
    time_choice = st.radio(
        "How much is an hour of travel time worth?",
        ["£0 / hr — cheapest money cost only", "£10 / hr", "£15 / hr", "Custom"],
        captions=[
            "Ignore travel time",
            "Mild incentive to avoid long journeys",
            "Strong incentive to save time",
            "Set your own",
        ],
    )
    if time_choice == "Custom":
        time_value = st.number_input("£ per hour", min_value=0.0, value=10.0, step=5.0)
    else:
        time_value = float(time_choice.split("£")[1].split(" ")[0]) if "£" in time_choice else 0.0

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


def _result_dict(results: list[DestinationResult]) -> list[dict]:
    """Serialise results for JSON download."""
    return [
        {
            "destination": dr.destination,
            "destination_name": DEST_NAMES.get(dr.destination, dr.destination),
            "fully_viable": dr.is_fully_viable,
            "group_total_money_gbp": dr.total_group_money_cost,
            "group_total_inc_time_gbp": dr.total_group_cost,
            "avg_per_person_gbp": dr.avg_individual_cost,
            "max_per_person_gbp": dr.max_individual_cost,
            "fairness_ratio": dr.fairness_ratio,
            "shared_out_date": str(dr.shared_out_date) if dr.shared_out_date else None,
            "shared_return_date": str(dr.shared_return_date) if dr.shared_return_date else None,
            "date_spread_days": dr.date_spread_days,
            "note": dr.note,
            "people": [
                {
                    "name": p.person_name,
                    "viable": p.viable,
                    "airport": p.chosen_airport,
                    "ground_cost_gbp": p.ground_cost,
                    "ground_hours": p.ground_hours,
                    "outbound_cost_gbp": p.outbound_cost,
                    "outbound_date": str(p.out_date) if p.out_date else None,
                    "outbound_airline": p.outbound.airline if p.outbound else None,
                    "inbound_cost_gbp": p.inbound_cost,
                    "inbound_date": str(p.return_date) if p.return_date else None,
                    "total_money_gbp": p.flight_plus_ground_gbp,
                    "total_inc_time_gbp": p.total_cost_gbp,
                    "note": p.note,
                    "booking_link": p.outbound.deep_link if p.outbound else None,
                }
                for p in dr.person_results
            ],
        }
        for dr in results
    ]


def _show_results(results: list[DestinationResult], time_value: float) -> None:
    viable  = [r for r in results if r.is_fully_viable]
    partial = [r for r in results if not r.is_fully_viable]

    time_note = (
        f" *(ranked by money + £{time_value:.0f}/hr travel time)*"
        if time_value > 0 else ""
    )

    st.subheader(f"🏆 Destination ranking{time_note}")

    if viable:
        rows = []
        for rank, dr in enumerate(viable, 1):
            row = {
                "Rank": rank,
                "Destination": label(dr.destination, style),
                "Group total (£)": f"{dr.total_group_money_cost:,.2f}",
                "Avg / person": _fmt(dr.avg_individual_cost),
                "Max / person": _fmt(dr.max_individual_cost),
                "Fairness": f"{dr.fairness_ratio:.2f}x",
            }
            if shared_dates and dr.shared_out_date:
                row["Trip dates"] = (
                    f"{dr.shared_out_date:%d %b} → {dr.shared_return_date:%d %b}"
                )
            elif not shared_dates and dr.date_spread_days:
                row["Date spread"] = f"{dr.date_spread_days} days"
            if time_value > 0:
                row["Incl. time value"] = _fmt(dr.total_group_cost)
            rows.append(row)
        st.dataframe(pd.DataFrame(rows).set_index("Rank"), use_container_width=True)

        if not shared_dates and any(dr.date_spread_days > 2 for dr in viable):
            st.info(
                "💡 Some destinations have people flying on dates several days apart. "
                "Enable **\"Group flies on same dates\"** in the sidebar to coordinate the trip."
            )
    else:
        st.info("No destinations had a complete route for everyone — see below.")

    if partial:
        with st.expander(f"⚠️ {len(partial)} destination(s) with incomplete data"):
            for dr in partial:
                missing = [p.person_name for p in dr.person_results if not p.viable]
                st.write(f"**{label(dr.destination, style)}** — missing for: {', '.join(missing)}")
            st.caption(
                "Missing data means the Aviasales price cache doesn't have a recent "
                "fare matching the constraints. Try widening the date window or unticking "
                "\"Group flies on same dates\" to use each person's own cheapest dates."
            )

    st.divider()
    st.subheader("📋 Per-person breakdown")

    all_results = viable + partial
    tab_labels = [label(r.destination, style) for r in all_results]
    tabs = st.tabs(tab_labels)

    for tab, dr in zip(tabs, all_results):
        with tab:
            if dr.shared_out_date and dr.shared_return_date:
                nights = (dr.shared_return_date - dr.shared_out_date).days
                st.markdown(
                    f"**Trip dates:** {dr.shared_out_date:%a %d %b} → "
                    f"{dr.shared_return_date:%a %d %b} · "
                    f"{nights} nights"
                )

            rows = []
            for p in dr.person_results:
                if p.viable:
                    out_d = p.out_date.strftime("%d %b") if p.out_date else "—"
                    in_d  = p.return_date.strftime("%d %b") if p.return_date else "—"
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
                    if time_value > 0:
                        row["+ Time"] = _fmt(p.total_cost_gbp)
                else:
                    row = {
                        "Person": p.person_name, "Airport": "—",
                        "Ground ~": "—", "Travel": "—",
                        "Outbound": "—", "Out date": "—",
                        "Return": "—", "In date": "—",
                        "Total": p.note or "No route",
                    }
                    if time_value > 0:
                        row["+ Time"] = "—"
                rows.append(row)

            st.dataframe(pd.DataFrame(rows).set_index("Person"), use_container_width=True)
            st.caption("Ground ~ = estimate; click through to book at live prices")

            if dr.is_fully_viable:
                most  = max(dr.person_results, key=lambda p: p.total_cost_gbp)
                least = min(dr.person_results, key=lambda p: p.total_cost_gbp)
                c1, c2, c3 = st.columns(3)
                c1.metric("Group money total", _fmt(dr.total_group_money_cost))
                c2.metric("Best deal", f"{least.person_name} · {_fmt(least.flight_plus_ground_gbp)}")
                c3.metric(
                    "Priciest person",
                    f"{most.person_name} · {_fmt(most.flight_plus_ground_gbp)}",
                    delta=f"+{_fmt(most.flight_plus_ground_gbp - least.flight_plus_ground_gbp)}",
                    delta_color="inverse",
                )

            first_viable = next((p for p in dr.person_results if p.viable and p.outbound), None)
            if first_viable and first_viable.outbound.deep_link:
                st.link_button(
                    f"🔗 Search {label(dr.destination, style)} flights on Aviasales",
                    first_viable.outbound.deep_link,
                    use_container_width=True,
                )

    # Download as JSON
    st.divider()
    st.download_button(
        "💾 Download results as JSON",
        data=json.dumps(_result_dict(results), indent=2),
        file_name=f"group_holiday_results_{date.today():%Y%m%d}.json",
        mime="application/json",
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
            time_value_per_hour=float(time_value),
            shared_dates=shared_dates,
        )
        with st.spinner("Searching… first run takes a minute, then results are cached."):
            results = optimise(config)
        _show_results(results, float(time_value))
else:
    st.info("👈 Fill in your group and dates in the sidebar, then click **Find cheapest holiday**.")
    with st.expander("How does this work?"):
        st.markdown("""
        1. **Enter your group** — names and home postcodes (anywhere in the UK)
        2. **Pick destinations**, or have us rank from a list
        3. **Set your dates** — earliest outbound, latest return, nights range
        4. **Toggle "Group flies on same dates"** if you want everyone on the same trip
        5. **Click Find** — results ranked by total group cost, with per-person breakdown

        **What "Value of travel time" does:** If you set this to e.g. £10/hr, the algorithm
        adds £10 × ground travel hours to each person's cost. This biases choices toward
        airports closer to home, even if the flight is a bit pricier.

        **Note on ground transport:** Distances and times come from Google Maps and are real.
        The £ cost is an estimate (£0.15/km for train/bus). Real ticket prices vary.

        **Note on flight prices:** They come from Aviasales' price cache (refreshed ~daily).
        Click through to book at the live price.
        """)
    with st.expander("About"):
        st.markdown("""
        Built to solve a real problem: groups of friends from different UK cities want to
        go on holiday together — what's the cheapest destination and best airport for everyone?

        Open source on [GitHub](https://github.com/charlieapples/groupholidaybooking).
        Feedback / bug reports welcome.
        """)
