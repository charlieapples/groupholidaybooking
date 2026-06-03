"""Tests for ranked (Borda) destination voting helpers and the content safeguard."""

import pytest
from fastapi import HTTPException

from app.routes.destinations import (
    _ranked_candidate_to_dto,
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
    votes = [
        {"candidate_id": "a", "user_id": "u1", "vote_value": 1},
        {"candidate_id": "a", "user_id": "u2", "vote_value": 2},
        {"candidate_id": "a", "user_id": "u3", "vote_value": 3},
    ]
    dto = _ranked_candidate_to_dto(_cand("a", "BCN"), "u2", votes, reveal=True)
    assert dto.borda_points == 6          # 1 + 2 + 3
    assert dto.my_rank == 2


def test_borda_lowest_total_wins():
    """Sanity check on the winner rule: lowest summed rank is the winner."""
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
    a = _ranked_candidate_to_dto(_cand("A", "BCN"), "u1", votes, reveal=True)
    b = _ranked_candidate_to_dto(_cand("B", "ROM"), "u1", votes, reveal=True)
    assert a.borda_points == 4
    assert b.borda_points == 5
    assert a.borda_points < b.borda_points   # A wins


@pytest.mark.parametrize("bad", ["strippers", "Strip Club night", "find me an ESCORT", "cocaine tour"])
def test_safeguard_blocks_inappropriate(bad):
    with pytest.raises(HTTPException) as exc:
        assert_clean_text(bad)
    assert exc.value.status_code == 422


@pytest.mark.parametrize("ok", [None, "", "beach and sunshine", "somewhere with great food", "scunthorpe"])
def test_safeguard_allows_normal_text(ok):
    assert_clean_text(ok) is None   # no exception
