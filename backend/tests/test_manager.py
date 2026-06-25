from app.realtime.manager import GameSession


def make_session(team_mode=False, team_count=0):
    return GameSession(
        event_id=1,
        event_name="T",
        time_limit=20,
        base_points=100,
        speed_bonus=False,  # deterministic scoring (no time-based bonus)
        leaderboard_after_each=True,
        auto_advance=False,
        questions=[
            {"type": "true_false", "content": "Earth orbits Sun", "correct_answer": "true", "options": None},
            {"type": "number", "content": "Cricket players", "correct_answer": "11", "options": None},
        ],
        team_mode=team_mode,
        team_count=team_count,
    )


class TestGameplay:
    def test_scoring_and_leaderboard_order(self):
        s = make_session()
        s.add_participant("a", "Alice")
        s.add_participant("b", "Bob")
        s.show_next()
        assert s.submit_answer("a", "true")["correct"] is True
        assert s.submit_answer("b", "false")["correct"] is False
        board = s.leaderboard()
        assert board[0]["name"] == "Alice" and board[0]["score"] == 100
        assert board[1]["name"] == "Bob" and board[1]["score"] == 0
        assert board[0]["rank"] == 1

    def test_duplicate_answer_rejected(self):
        s = make_session()
        s.add_participant("a", "Alice")
        s.show_next()
        assert s.submit_answer("a", "true")["accepted"] is True
        again = s.submit_answer("a", "true")
        assert again["accepted"] is False and again["reason"] == "already_answered"

    def test_answered_count(self):
        s = make_session()
        s.add_participant("a", "Alice")
        s.add_participant("b", "Bob")
        s.show_next()
        assert s.answered_count() == 0
        s.submit_answer("a", "true")
        assert s.answered_count() == 1

    def test_capture_records_and_snapshot(self):
        s = make_session()
        s.add_participant("a", "Alice")
        s.show_next()
        s.submit_answer("a", "true")
        assert s.shown[0] == {"content": "Earth orbits Sun", "type": "true_false", "correct_answer": "true"}
        rec = s.responses[0][0]
        assert rec["participant_name"] == "Alice"
        assert rec["is_correct"] is True
        assert rec["elapsed_seconds"] is not None

    def test_answer_rejected_before_question_live(self):
        s = make_session()
        s.add_participant("a", "Alice")
        # state is LOBBY, no question shown yet
        assert s.submit_answer("a", "true")["accepted"] is False


class TestTeams:
    def test_off_by_default(self):
        s = make_session()
        p = s.add_participant("a", "Alice")
        assert p.team == -1
        assert s.team_leaderboard() == []

    def test_auto_balanced_assignment(self):
        s = make_session(team_mode=True, team_count=4)
        for i in range(6):
            s.add_participant(f"s{i}", f"P{i}")
        sizes = [0] * 4
        for p in s.participants.values():
            sizes[p.team] += 1
        assert sorted(sizes, reverse=True) == [2, 2, 1, 1]

    def test_team_leaderboard_aggregates_and_ranks(self):
        s = make_session(team_mode=True, team_count=2)
        a = s.add_participant("a", "Alice")  # team 0
        b = s.add_participant("b", "Bob")    # team 1
        c = s.add_participant("c", "Cara")   # team 0
        a.score, b.score, c.score = 100, 50, 30
        tlb = s.team_leaderboard()
        assert tlb[0]["name"] == "Team 1" and tlb[0]["score"] == 130
        assert tlb[0]["rank"] == 1
        assert set(tlb[0]["members"]) == {"Alice", "Cara"}
        assert tlb[1]["name"] == "Team 2" and tlb[1]["score"] == 50

    def test_individual_leaderboard_carries_team_label(self):
        s = make_session(team_mode=True, team_count=2)
        s.add_participant("a", "Alice")
        entry = s.leaderboard()[0]
        assert entry["team"] in ("Team 1", "Team 2")
