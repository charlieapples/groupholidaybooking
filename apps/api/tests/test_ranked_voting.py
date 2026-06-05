"""Tests for ranked (Borda) destination voting helpers and the content safeguard."""

import pytest
from fastapi import HTTPException

from app.routes.destinations import (
    _ranked_candidate_to_dto,
    _borda_totals,
    assert_clean_text,
)


def _cand(cid, iata):
    return {"id": cid, "iata_code": iata, "proposed_by": None, "total_cost_gbp": None, "cost_breakdown": {}}


def test_ranked_dto_hides_borda_until_revealed():
    votes = [
        {"candidate_id": "a", "user_id": "u1", "vote_value": 1},
        {"candidate_id": "a", "user_id": "u2", "vote_value": 2},
    ]
    dto = _ranked_candidate_to_dto(_cand("a", "BCN"), "u1", votes, reveal=False)
    assert dto.borda_points is None       # hidden before everyone locks in
    assert dto.my_rank == 1               # but caller always sees their own rank


def test_ranked_dto_shows_borda_total_when_revealed():
    votes = [{"candidate_id": "a", "user_id": "u2", "vote_value": 2}]
    dto = _ranked_candidate_to_dto(_cand("a", "BCN"), "u2", votes, reveal=True, borda_value=6)
    assert dto.borda_points == 6          # passed-in central total
    assert dto.my_rank == 2


def test_borda_lowest_total_wins():
    """Sanity check on the winner rule: lowest summed rank is the winner."""
    cands = [_cand("A", "BCN"), _cand("B", "ROM")]
    votes = [
        # candidate A: ranks 1,1,2 -> 4
        {"candidate_id": "A", "user_id": "u1", "vote_value": 1},
        {"candidate_id": "A", "user_id": "u2", "vote_value": 1},
        {"candidate_id": "A", "user_id": "u3", "vote_value": 2},
        # candidate B: ranks 2,2,1 -> 5
        {"candidate_id": "B", "user_id": "u1", "vote_value": 2},
        {"candidate_id": "B", "user_id": "u2", "vote_value": 2},
        {"candidate_id": "B", "user_id": "u3", "vote_value": 1},
    ]
    totals = _borda_totals(cands, votes)
    assert totals["A"] == 4
    assert totals["B"] == 5
    assert totals["A"] < totals["B"]      # A wins


def test_borda_imputes_worst_rank_for_missing_ballots():
    """A candidate proposed after some people locked in must NOT win just because
    those people never ranked it — missing entries count as last place."""
    cands = [_cand("A", "BCN"), _cand("B", "ROM"), _cand("C", "LIS")]
    # u1 and u2 ranked only A and B (C didn't exist yet); u3 ranked all three.
    votes = [
        {"candidate_id": "A", "user_id": "u1", "vote_value": 1},
        {"candidate_id": "B", "user_id": "u1", "vote_value": 2},
        {"candidate_id": "A", "user_id": "u2", "vote_value": 1},
        {"candidate_id": "B", "user_id": "u2", "vote_value": 2},
        {"candidate_id": "A", "user_id": "u3", "vote_value": 2},
        {"candidate_id": "B", "user_id": "u3", "vote_value": 3},
        {"candidate_id": "C", "user_id": "u3", "vote_value": 1},
    ]
    totals = _borda_totals(cands, votes)
    worst = 3  # number of candidates
    # C: u1 missing(=3) + u2 missing(=3) + u3 ranked 1 = 7
    assert totals["C"] == worst + worst + 1
    # C must not beat A despite u3 loving it
    assert totals["A"] < totals["C"]


@pytest.mark.parametrize("bad", ["strippers", "Strip Club night", "find me an ESCORT", "cocaine tour"])
def test_safeguard_blocks_inappropriate(bad):
    with pytest.raises(HTTPException) as exc:
        assert_clean_text(bad)
    assert exc.value.status_code == 422


@pytest.mark.parametrize("ok", [None, "", "beach and sunshine", "somewhere with great food", "scunthorpe"])
def test_safeguard_allows_normal_text(ok):
    assert_clean_text(ok) is None   # no exception
