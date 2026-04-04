"""Tests for heuristic task classification module."""

import pytest
from task_classification import (
    classify_by_branch,
    classify_by_keywords,
    classify_task,
    TASK_TYPES,
    BRANCH_PREFIX_MAP,
)


# ─── TASK_TYPES constant ───────────────────────────────────────────


class TestTaskTypes:
    def test_has_8_types(self):
        assert len(TASK_TYPES) == 8

    def test_contains_all_expected(self):
        assert TASK_TYPES == [
            "feature", "bug_fix", "refactor", "debug",
            "test", "docs", "chore", "exploration",
        ]


# ─── BRANCH_PREFIX_MAP ─────────────────────────────────────────────


class TestBranchPrefixMap:
    def test_feature_prefixes(self):
        assert BRANCH_PREFIX_MAP["feature"] == "feature"
        assert BRANCH_PREFIX_MAP["feat"] == "feature"

    def test_bug_fix_prefixes(self):
        assert BRANCH_PREFIX_MAP["fix"] == "bug_fix"
        assert BRANCH_PREFIX_MAP["bugfix"] == "bug_fix"
        assert BRANCH_PREFIX_MAP["hotfix"] == "bug_fix"

    def test_chore_prefixes(self):
        assert BRANCH_PREFIX_MAP["chore"] == "chore"
        assert BRANCH_PREFIX_MAP["ci"] == "chore"
        assert BRANCH_PREFIX_MAP["build"] == "chore"


# ─── classify_by_branch ────────────────────────────────────────────


class TestClassifyByBranch:
    def test_none_branch(self):
        assert classify_by_branch(None) is None

    def test_empty_string(self):
        assert classify_by_branch("") is None

    def test_main(self):
        assert classify_by_branch("main") is None

    def test_master(self):
        assert classify_by_branch("master") is None

    def test_develop(self):
        assert classify_by_branch("develop") is None

    def test_no_slash(self):
        assert classify_by_branch("my-branch") is None

    def test_feature_prefix(self):
        assert classify_by_branch("feature/add-login") == "feature"

    def test_feat_prefix(self):
        assert classify_by_branch("feat/add-login") == "feature"

    def test_fix_prefix(self):
        assert classify_by_branch("fix/broken-button") == "bug_fix"

    def test_bugfix_prefix(self):
        assert classify_by_branch("bugfix/broken-button") == "bug_fix"

    def test_hotfix_prefix(self):
        assert classify_by_branch("hotfix/critical-issue") == "bug_fix"

    def test_refactor_prefix(self):
        assert classify_by_branch("refactor/cleanup-utils") == "refactor"

    def test_test_prefix(self):
        assert classify_by_branch("test/add-unit-tests") == "test"

    def test_docs_prefix(self):
        assert classify_by_branch("docs/update-readme") == "docs"

    def test_chore_prefix(self):
        assert classify_by_branch("chore/update-deps") == "chore"

    def test_ci_prefix(self):
        assert classify_by_branch("ci/fix-pipeline") == "chore"

    def test_build_prefix(self):
        assert classify_by_branch("build/update-webpack") == "chore"

    def test_case_insensitive(self):
        assert classify_by_branch("Feature/add-login") == "feature"
        assert classify_by_branch("FIX/broken-button") == "bug_fix"
        assert classify_by_branch("DOCS/update-readme") == "docs"

    def test_unrecognized_prefix(self):
        assert classify_by_branch("release/v1.0") is None
        assert classify_by_branch("unknown/something") is None


# ─── classify_by_keywords ──────────────────────────────────────────


class TestClassifyByKeywords:
    def test_empty_prompts(self):
        assert classify_by_keywords([]) is None

    def test_bug_fix_keywords(self):
        assert classify_by_keywords(["fix the login page"]) == "bug_fix"
        assert classify_by_keywords(["there is a bug in the parser"]) == "bug_fix"
        assert classify_by_keywords(["the button is broken"]) == "bug_fix"
        assert classify_by_keywords(["the app crashes on startup"]) == "bug_fix"
        assert classify_by_keywords(["this test fails"]) == "bug_fix"
        assert classify_by_keywords(["it is not working"]) == "bug_fix"

    def test_debug_keywords(self):
        assert classify_by_keywords(["debug the authentication flow"]) == "debug"
        assert classify_by_keywords(["why is the server slow"]) == "debug"
        # "what's wrong" contains "wrong" which matches bug_fix first (ordered matching)
        assert classify_by_keywords(["what's wrong with this code"]) == "bug_fix"
        assert classify_by_keywords(["investigate the memory leak"]) == "debug"

    def test_refactor_keywords(self):
        assert classify_by_keywords(["refactor the user module"]) == "refactor"
        assert classify_by_keywords(["clean up the utils file"]) == "refactor"
        assert classify_by_keywords(["simplify this function"]) == "refactor"

    def test_test_keywords(self):
        assert classify_by_keywords(["write a unit test for the parser"]) == "test"
        assert classify_by_keywords(["add test coverage for scoring"]) == "test"
        assert classify_by_keywords(["create a mock for the API"]) == "test"

    def test_docs_keywords(self):
        assert classify_by_keywords(["update the readme"]) == "docs"
        assert classify_by_keywords(["add jsdoc comments"]) == "docs"
        assert classify_by_keywords(["document the API"]) == "docs"

    def test_chore_keywords(self):
        assert classify_by_keywords(["update the CI pipeline"]) == "chore"
        assert classify_by_keywords(["bump the dependency versions"]) == "chore"
        assert classify_by_keywords(["configure the linter"]) == "chore"

    def test_feature_keywords(self):
        assert classify_by_keywords(["add a new dashboard"]) == "feature"
        assert classify_by_keywords(["implement user authentication"]) == "feature"
        assert classify_by_keywords(["create a settings page"]) == "feature"

    def test_exploration_keywords(self):
        assert classify_by_keywords(["explore different caching strategies"]) == "exploration"
        assert classify_by_keywords(["how do I use the API"]) == "exploration"
        assert classify_by_keywords(["what is dependency injection"]) == "exploration"
        # "prototype a new layout" — "new" matches feature first; use unambiguous prompt
        assert classify_by_keywords(["prototype a possible layout"]) == "exploration"

    def test_bug_fix_priority_over_feature(self):
        assert classify_by_keywords(["fix and add the new feature"]) == "bug_fix"

    def test_only_first_3_prompts(self):
        prompts = [
            "hello world",
            "how are you",
            "nice weather",
            "fix the critical bug",  # 4th — ignored
        ]
        assert classify_by_keywords(prompts) is None

    def test_no_match(self):
        assert classify_by_keywords(["hello world"]) is None
        assert classify_by_keywords(["just chatting"]) is None


# ─── classify_task ──────────────────────────────────────────────────


class TestClassifyTask:
    def test_branch_priority(self):
        assert classify_task("feature/add-login", ["fix the bug"]) == "feature"

    def test_fallback_to_keywords(self):
        assert classify_task(None, ["fix the login page"]) == "bug_fix"

    def test_fallback_when_branch_unrecognized(self):
        assert classify_task("main", ["implement new feature"]) == "feature"

    def test_both_null(self):
        assert classify_task(None, []) is None
        assert classify_task(None, ["hello world"]) is None

    def test_develop_no_match(self):
        assert classify_task("develop", ["just chatting"]) is None
