from app.services import scoring


class TestIsCorrect:
    def test_mcq_case_insensitive(self):
        assert scoring.is_correct("mcq", "Tokyo", "tokyo")
        assert not scoring.is_correct("mcq", "Tokyo", "Seoul")

    def test_text_trims_and_lowercases(self):
        assert scoring.is_correct("text", "Bell", "  bell ")

    def test_number_numeric_equality(self):
        assert scoring.is_correct("number", "11", "11")
        assert scoring.is_correct("number", "11", "11.0")
        assert not scoring.is_correct("number", "11", "12")

    def test_number_non_numeric_falls_back_to_string(self):
        assert scoring.is_correct("number", "approx ten", "approx ten")

    def test_true_false_synonyms(self):
        for given in ("true", "True", "t", "yes", "1"):
            assert scoring.is_correct("true_false", "True", given)
        for given in ("false", "no", "0", "f"):
            assert not scoring.is_correct("true_false", "True", given)

    def test_none_is_never_correct(self):
        assert not scoring.is_correct("mcq", "Tokyo", None)


class TestAwardPoints:
    def test_wrong_answer_scores_zero(self):
        assert scoring.award_points(correct=False, base_points=100, speed_bonus=True, time_limit=20, elapsed=0) == 0

    def test_no_bonus_returns_base(self):
        assert scoring.award_points(correct=True, base_points=100, speed_bonus=False, time_limit=20, elapsed=5) == 100

    def test_instant_answer_doubles_base(self):
        assert scoring.award_points(correct=True, base_points=100, speed_bonus=True, time_limit=20, elapsed=0) == 200

    def test_buzzer_answer_returns_base(self):
        assert scoring.award_points(correct=True, base_points=100, speed_bonus=True, time_limit=20, elapsed=20) == 100

    def test_half_time_is_one_and_a_half_base(self):
        assert scoring.award_points(correct=True, base_points=100, speed_bonus=True, time_limit=20, elapsed=10) == 150

    def test_zero_time_limit_avoids_div_by_zero(self):
        assert scoring.award_points(correct=True, base_points=100, speed_bonus=True, time_limit=0, elapsed=0) == 100
