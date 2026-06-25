import pytest

from app.services.parser import parse_questions

GOOD = (
    "type,content,correct_answer,options,category,difficulty\n"
    "mcq,Capital of Japan?,Tokyo,Tokyo|Seoul|Bangkok,Geography,2\n"
    "true_false,Earth orbits the Sun.,True,,Science,1\n"
    "number,Cricket team size?,11,,Sports,15\n"  # difficulty clamps to 10
    "text,Telephone inventor?,Bell,,,\n"  # category defaults
).encode()


def test_parses_all_types():
    questions, errors = parse_questions("bank.csv", GOOD)
    assert errors == []
    assert len(questions) == 4
    by_type = {q["type"]: q for q in questions}
    assert by_type["mcq"]["options"] == ["Tokyo", "Seoul", "Bangkok"]
    assert by_type["number"]["difficulty"] == 10  # clamped from 15
    assert by_type["text"]["category"] == "General Knowledge"  # default


def test_type_aliases_normalize():
    csv = (
        "type,content,correct_answer,options\n"
        "multiple choice,Q,A,A|B\n"
        "tf,Q2,True,\n"
    ).encode()
    questions, _ = parse_questions("b.csv", csv)
    assert [q["type"] for q in questions] == ["mcq", "true_false"]


def test_missing_required_column_raises():
    csv = b"type,content\nmcq,Q\n"
    with pytest.raises(ValueError, match="Missing required column"):
        parse_questions("b.csv", csv)


def test_unsupported_extension_raises():
    with pytest.raises(ValueError, match="Unsupported file type"):
        parse_questions("bank.txt", b"whatever")


def test_bad_rows_are_skipped_and_reported():
    csv = (
        "type,content,correct_answer,options\n"
        "banana,Q,A,\n"  # unknown type
        "mcq,,A,A|B\n"  # missing content
        "mcq,Q,A,A\n"  # only one option
        "mcq,Q,Z,A|B\n"  # correct not in options
        "mcq,Valid?,A,A|B\n"  # the one good row
    ).encode()
    questions, errors = parse_questions("b.csv", csv)
    assert len(questions) == 1
    assert questions[0]["content"] == "Valid?"
    assert len(errors) == 4


def test_poll_allows_blank_correct_answer_with_options():
    csv = (
        "type,content,correct_answer,options,category\n"
        "poll,Favourite language?,,Python|Go|Rust,Tech\n"
    ).encode()
    questions, errors = parse_questions("b.csv", csv)
    assert errors == []
    assert len(questions) == 1
    q = questions[0]
    assert q["type"] == "poll"
    assert q["correct_answer"] == ""
    assert q["options"] == ["Python", "Go", "Rust"]


def test_poll_needs_options():
    csv = (
        "type,content,correct_answer,options\n"
        "poll,One option only?,,Solo\n"
    ).encode()
    questions, errors = parse_questions("b.csv", csv)
    assert questions == []
    assert len(errors) == 1


def test_hint_column_is_parsed():
    csv = (
        "type,content,correct_answer,options,category,difficulty,hint\n"
        "text,I speak without a mouth?,echo,,Riddles,6,You repeat after others\n"
        "number,Cricket players?,11,,Sports,2,\n"
    ).encode()
    questions, errors = parse_questions("b.csv", csv)
    assert errors == []
    assert questions[0]["hint"] == "You repeat after others"
    assert questions[1]["hint"] is None  # blank hint => None


def test_missing_correct_answer_still_rejected_for_non_poll():
    csv = (
        "type,content,correct_answer,options\n"
        "text,No answer here,,\n"
    ).encode()
    questions, errors = parse_questions("b.csv", csv)
    assert questions == []
    assert len(errors) == 1


def test_invalid_difficulty_defaults_to_one_with_warning():
    csv = (
        "type,content,correct_answer,options,difficulty\n"
        "text,Q,A,,high\n"
    ).encode()
    questions, errors = parse_questions("b.csv", csv)
    assert questions[0]["difficulty"] == 1
    assert any("difficulty" in e for e in errors)
