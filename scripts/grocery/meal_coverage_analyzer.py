#!/usr/bin/env python3
"""
Meal Coverage Analyzer

Rich meal-coverage analysis with:
- Pantry + freezer + fresh combined coverage
- Substitution-aware matching
- Leftovers-derived coverage
- Fuzzy ingredient equivalence
- Confidence-based full vs partial match decisions
- Structured debug reasoning

This module is INTERNAL and additive — it does not modify /meals check.
"""

from __future__ import annotations

import sys
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from enum import Enum, auto
from pathlib import Path
from typing import Optional
from difflib import SequenceMatcher

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent / "grocery"))


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class MatchConfidence(Enum):
    """Confidence level for an ingredient match."""
    EXACT = "exact"           # Exact name match
    FUZZY_HIGH = "fuzzy_high" # >90% similarity
    FUZZY_MEDIUM = "fuzzy_medium"  # 70-90% similarity
    CATEGORY = "category"     # Same category (e.g., both cheeses)
    SUBSTITUTION = "substitution"  # Explicit substitution
    NONE = "none"


class CoverageType(Enum):
    """Source of coverage for an ingredient."""
    FRESH = "fresh"           # Fresh delivery item
    PANTRY = "pantry"         # Pantry/cupboard stock
    FREEZER = "freezer"       # Freezer stock
    LEFTOVERS = "leftovers"   # From prior meal
    SUBSTITUTE = "substitute" # Substitution accepted
    MISSING = "missing"       # Not available


class MatchDecision(Enum):
    """Final match decision for a meal."""
    FULL = "full"             # All ingredients covered confidently
    PARTIAL = "partial"       # Some ingredients weakly covered
    GAP = "gap"               # Critical ingredients missing
    BLOCKED = "blocked"       # Dietary/constraint blocker


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------

@dataclass
class IngredientMatch:
    """Match details for a single ingredient."""
    ingredient_name: str
    matched_item: Optional[str] = None
    coverage_type: CoverageType = CoverageType.MISSING
    confidence: MatchConfidence = MatchConfidence.NONE
    is_substitution: bool = False
    substitution_quality: Optional[str] = None  # "upgrade", "equivalent", "downgrade"
    fuzzy_score: float = 0.0
    reasoning: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "ingredient": self.ingredient_name,
            "matched_item": self.matched_item,
            "coverage_type": self.coverage_type.value,
            "confidence": self.confidence.value,
            "is_substitution": self.is_substitution,
            "substitution_quality": self.substitution_quality,
            "fuzzy_score": round(self.fuzzy_score, 2),
            "reasoning": self.reasoning,
        }


@dataclass
class MealCoverageAnalysis:
    """Complete coverage analysis for a single meal."""
    meal_name: str
    planned_date: date
    ingredients: list[IngredientMatch] = field(default_factory=list)
    leftovers_yield: Optional[str] = None
    prior_leftovers: Optional[str] = None  # Leftovers from prior meal

    # Computed scores
    coverage_score: float = 0.0  # 0-100
    confidence_score: float = 0.0  # 0-100

    # Decision
    match_decision: MatchDecision = MatchDecision.GAP
    decision_reasoning: list[str] = field(default_factory=list)

    def __post_init__(self):
        self._compute_scores()
        self._make_decision()

    def _compute_scores(self) -> None:
        """Compute coverage and confidence scores."""
        if not self.ingredients:
            self.coverage_score = 0.0
            self.confidence_score = 0.0
            return

        # Coverage score: weighted by coverage type
        coverage_weights = {
            CoverageType.FRESH: 1.0,
            CoverageType.PANTRY: 0.9,
            CoverageType.FREEZER: 0.85,
            CoverageType.LEFTOVERS: 0.95,
            CoverageType.SUBSTITUTE: 0.7,
            CoverageType.MISSING: 0.0,
        }

        total_weight = sum(coverage_weights.get(i.coverage_type, 0.0) for i in self.ingredients)
        self.coverage_score = (total_weight / len(self.ingredients)) * 100

        # Confidence score: weighted by match confidence
        confidence_weights = {
            MatchConfidence.EXACT: 1.0,
            MatchConfidence.FUZZY_HIGH: 0.9,
            MatchConfidence.FUZZY_MEDIUM: 0.7,
            MatchConfidence.CATEGORY: 0.6,
            MatchConfidence.SUBSTITUTION: 0.5,
            MatchConfidence.NONE: 0.0,
        }

        total_conf = sum(confidence_weights.get(i.confidence, 0.0) for i in self.ingredients)
        self.confidence_score = (total_conf / len(self.ingredients)) * 100

    def _make_decision(self) -> None:
        """Make final match decision based on scores."""
        missing_critical = sum(1 for i in self.ingredients
                              if i.coverage_type == CoverageType.MISSING)

        if missing_critical > 0 and self.coverage_score < 50:
            self.match_decision = MatchDecision.GAP
            self.decision_reasoning.append(
                f"{missing_critical} critical ingredients missing"
            )
        elif self.coverage_score >= 80 and self.confidence_score >= 70:
            self.match_decision = MatchDecision.FULL
            self.decision_reasoning.append(
                f"Full coverage: {self.coverage_score:.0f}% coverage, "
                f"{self.confidence_score:.0f}% confidence"
            )
        elif self.coverage_score >= 50:
            self.match_decision = MatchDecision.PARTIAL
            self.decision_reasoning.append(
                f"Partial coverage: {self.coverage_score:.0f}% coverage"
            )
        else:
            self.match_decision = MatchDecision.GAP
            self.decision_reasoning.append(
                f"Insufficient coverage: {self.coverage_score:.0f}%"
            )

    @property
    def is_fully_covered(self) -> bool:
        return self.match_decision == MatchDecision.FULL

    @property
    def is_partially_covered(self) -> bool:
        return self.match_decision == MatchDecision.PARTIAL

    @property
    def has_gaps(self) -> bool:
        return self.match_decision == MatchDecision.GAP

    @property
    def missing_ingredients(self) -> list[str]:
        return [i.ingredient_name for i in self.ingredients
                if i.coverage_type == CoverageType.MISSING]

    @property
    def substitution_items(self) -> list[IngredientMatch]:
        return [i for i in self.ingredients if i.is_substitution]

    def to_dict(self) -> dict:
        return {
            "meal_name": self.meal_name,
            "planned_date": self.planned_date.isoformat(),
            "coverage_score": round(self.coverage_score, 1),
            "confidence_score": round(self.confidence_score, 1),
            "match_decision": self.match_decision.value,
            "decision_reasoning": self.decision_reasoning,
            "is_fully_covered": self.is_fully_covered,
            "is_partially_covered": self.is_partially_covered,
            "has_gaps": self.has_gaps,
            "missing_ingredients": self.missing_ingredients,
            "leftovers_yield": self.leftovers_yield,
            "prior_leftovers": self.prior_leftovers,
            "ingredients": [i.to_dict() for i in self.ingredients],
        }


# ---------------------------------------------------------------------------
# Fuzzy Matching
# ---------------------------------------------------------------------------

FUZZY_THRESHOLD_HIGH = 0.9
FUZZY_THRESHOLD_MEDIUM = 0.7


def fuzzy_similarity(a: str, b: str) -> float:
    """Calculate fuzzy similarity between two strings."""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def find_fuzzy_match(
    ingredient: str,
    available_items: list[str],
    threshold: float = FUZZY_THRESHOLD_MEDIUM
) -> Optional[tuple[str, float]]:
    """
    Find best fuzzy match for an ingredient in available items.

    Returns:
        Tuple of (matched_item, score) or None if no match above threshold
    """
    best_match = None
    best_score = 0.0

    for item in available_items:
        score = fuzzy_similarity(ingredient, item)
        if score > best_score and score >= threshold:
            best_score = score
            best_match = item

    if best_match:
        return (best_match, best_score)
    return None


# ---------------------------------------------------------------------------
# Ingredient Categories for Equivalence
# ---------------------------------------------------------------------------

INGREDIENT_CATEGORIES = {
    "cheese": ["cheddar", "mozzarella", "parmesan", "gruyere", "feta", "goat cheese"],
    "cream": ["double cream", "single cream", "creme fraiche", "sour cream"],
    "pasta": ["spaghetti", "penne", "fusilli", "tagliatelle", "macaroni"],
    "rice": ["basmati", "jasmine", "long grain", "risotto rice"],
    "stock": ["chicken stock", "beef stock", "vegetable stock", "stock cubes"],
    "oil": ["olive oil", "vegetable oil", "sunflower oil"],
}


def get_category_equivalent(ingredient: str) -> Optional[str]:
    """Check if ingredient belongs to a category with equivalents."""
    ing_lower = ingredient.lower()
    for category, members in INGREDIENT_CATEGORIES.items():
        if any(member in ing_lower for member in members):
            return category
    return None


# ---------------------------------------------------------------------------
# Coverage Analyzer
# ---------------------------------------------------------------------------

class MealCoverageAnalyzer:
    """
    Analyzer for rich meal coverage analysis.

    Combines multiple data sources to provide comprehensive coverage analysis
    with structured reasoning.
    """

    def __init__(self):
        self.meal_meta: dict = {}
        self.leftovers_chains: dict = {}
        self._load_meal_data()

    def _load_meal_data(self) -> None:
        """Load meal metadata and leftovers chains."""
        try:
            from meal_planner import MEAL_DATABASE
            self.meal_meta = MEAL_DATABASE
        except Exception:
            self.meal_meta = {}

        # Define leftovers chains: meal -> (yields, usable_for)
        self.leftovers_chains = {
            "roast chicken": {"yields": "cooked chicken", "usable_for": ["chicken salad", "chicken pasta"]},
            "roast beef": {"yields": "cooked beef", "usable_for": ["beef salad", "beef sandwiches"]},
            "shepherd's pie": {"yields": "mashed potato", "usable_for": ["cottage pie"]},
            "bolognese": {"yields": "sauce", "usable_for": ["chilli", "lasagna"]},
        }

    def analyze_meal_coverage(
        self,
        meal_name: str,
        planned_date: date,
        order_items: list[str],
        house_stock: dict,
        receipt_data: Optional[dict] = None,
        prior_meals: Optional[list[dict]] = None,
    ) -> MealCoverageAnalysis:
        """
        Analyze coverage for a single meal.

        Args:
            meal_name: Name of the meal
            planned_date: Date meal is planned
            order_items: Items in the Tesco order
            house_stock: House stock data with categories
            receipt_data: Optional receipt data for substitution info
            prior_meals: Optional list of prior meals for leftovers tracking

        Returns:
            MealCoverageAnalysis with full reasoning
        """
        # Get meal metadata
        meta = self.meal_meta.get(meal_name.lower(), {})
        key_ingredients = meta.get("key_ingredients", [])

        if not key_ingredients:
            # Unknown meal - return empty analysis
            return MealCoverageAnalysis(
                meal_name=meal_name,
                planned_date=planned_date,
                decision_reasoning=["Unknown meal - no metadata available"],
            )

        # Index available items by source
        fresh_items = {i.lower() for i in order_items}
        pantry_items = self._index_stock_category(house_stock, "pantry")
        freezer_items = self._index_stock_category(house_stock, "freezer")
        fridge_items = self._index_stock_category(house_stock, "fridge")

        # Check for prior leftovers
        prior_leftovers = None
        if prior_meals:
            prior_leftovers = self._check_prior_leftovers(meal_name, prior_meals)

        # Analyze each ingredient
        ingredient_matches = []
        for ingredient in key_ingredients:
            match = self._analyze_ingredient(
                ingredient=ingredient,
                fresh_items=fresh_items,
                pantry_items=pantry_items,
                freezer_items=freezer_items,
                fridge_items=fridge_items,
                receipt_data=receipt_data,
                prior_leftovers=prior_leftovers,
            )
            ingredient_matches.append(match)

        # Check if this meal yields leftovers
        leftovers_yield = self.leftovers_chains.get(meal_name.lower(), {}).get("yields")

        return MealCoverageAnalysis(
            meal_name=meal_name,
            planned_date=planned_date,
            ingredients=ingredient_matches,
            leftovers_yield=leftovers_yield,
            prior_leftovers=prior_leftovers,
        )

    def _index_stock_category(self, house_stock: dict, category: str) -> set[str]:
        """Index items in a stock category."""
        items = set()
        for cat, cat_items in house_stock.get("categories", {}).items():
            if cat.lower() == category.lower():
                for item in cat_items:
                    items.add(item.get("name", "").lower())
        return items

    def _check_prior_leftovers(self, meal_name: str, prior_meals: list[dict]) -> Optional[str]:
        """Check if prior meals yield leftovers usable for this meal."""
        meal_lower = meal_name.lower()
        for prior in prior_meals:
            prior_name = prior.get("content", "").lower()
            chain = self.leftovers_chains.get(prior_name)
            if chain and meal_lower in [m.lower() for m in chain.get("usable_for", [])]:
                return chain.get("yields")
        return None

    def _analyze_ingredient(
        self,
        ingredient: str,
        fresh_items: set[str],
        pantry_items: set[str],
        freezer_items: set[str],
        fridge_items: set[str],
        receipt_data: Optional[dict],
        prior_leftovers: Optional[str],
    ) -> IngredientMatch:
        """Analyze coverage for a single ingredient."""
        ing_lower = ingredient.lower()
        match = IngredientMatch(ingredient_name=ingredient)

        # 1. Check exact match in fresh items
        if ing_lower in fresh_items:
            match.matched_item = ingredient
            match.coverage_type = CoverageType.FRESH
            match.confidence = MatchConfidence.EXACT
            match.reasoning.append(f"Exact match in order: {ingredient}")
            return match

        # 2. Check for substitution in receipt
        if receipt_data:
            sub_info = self._check_substitution(ingredient, receipt_data)
            if sub_info:
                match.matched_item = sub_info["substituted_with"]
                match.coverage_type = CoverageType.SUBSTITUTE
                match.confidence = MatchConfidence.SUBSTITUTION
                match.is_substitution = True
                match.substitution_quality = sub_info.get("quality", "unknown")
                match.reasoning.append(
                    f"Substituted: {ingredient} → {sub_info['substituted_with']} "
                    f"({sub_info.get('quality', 'unknown')})"
                )
                return match

        # 3. Check prior leftovers
        if prior_leftovers and prior_leftovers.lower() in ing_lower:
            match.matched_item = prior_leftovers
            match.coverage_type = CoverageType.LEFTOVERS
            match.confidence = MatchConfidence.EXACT
            match.reasoning.append(f"Covered by leftovers: {prior_leftovers}")
            return match

        # 4. Check fuzzy match in fresh items
        fuzzy = find_fuzzy_match(ingredient, list(fresh_items))
        if fuzzy:
            matched_item, score = fuzzy
            match.matched_item = matched_item
            match.coverage_type = CoverageType.FRESH
            match.fuzzy_score = score
            if score >= FUZZY_THRESHOLD_HIGH:
                match.confidence = MatchConfidence.FUZZY_HIGH
            else:
                match.confidence = MatchConfidence.FUZZY_MEDIUM
            match.reasoning.append(f"Fuzzy match ({score:.0%}): {ingredient} → {matched_item}")
            return match

        # 5. Check pantry
        if ing_lower in pantry_items:
            match.matched_item = ingredient
            match.coverage_type = CoverageType.PANTRY
            match.confidence = MatchConfidence.EXACT
            match.reasoning.append(f"Available in pantry: {ingredient}")
            return match

        # 6. Check freezer
        if ing_lower in freezer_items:
            match.matched_item = ingredient
            match.coverage_type = CoverageType.FREEZER
            match.confidence = MatchConfidence.EXACT
            match.reasoning.append(f"Available in freezer: {ingredient}")
            return match

        # 7. Check category equivalence
        category = get_category_equivalent(ingredient)
        if category:
            # Look for any item in same category
            all_items = fresh_items | pantry_items | freezer_items
            for item in all_items:
                if get_category_equivalent(item) == category:
                    match.matched_item = item
                    match.coverage_type = CoverageType.FRESH if item in fresh_items else CoverageType.PANTRY
                    match.confidence = MatchConfidence.CATEGORY
                    match.reasoning.append(f"Category match ({category}): {ingredient} → {item}")
                    return match

        # 8. No match found
        match.reasoning.append(f"No match found for: {ingredient}")
        return match

    def _check_substitution(self, ingredient: str, receipt_data: dict) -> Optional[dict]:
        """Check if ingredient was substituted in receipt."""
        substitutions = receipt_data.get("substitutions", [])
        ing_lower = ingredient.lower()

        for sub in substitutions:
            requested = sub.get("requested", "").lower()
            if ing_lower in requested or fuzzy_similarity(ingredient, requested) > 0.8:
                return sub
        return None


# ---------------------------------------------------------------------------
# Batch Analysis
# ---------------------------------------------------------------------------

def analyze_meal_plan_coverage(
    planned_meals: list[dict],
    order_items: list[str],
    house_stock: dict,
    receipt_data: Optional[dict] = None,
    days_ahead: int = 7,
) -> list[MealCoverageAnalysis]:
    """
    Analyze coverage for an entire meal plan.

    Args:
        planned_meals: List of Todoist tasks with meal plans
        order_items: Items in the Tesco order
        house_stock: House stock data
        receipt_data: Optional receipt data
        days_ahead: Number of days to analyze

    Returns:
        List of MealCoverageAnalysis for each meal
    """
    analyzer = MealCoverageAnalyzer()
    analyses = []

    # Sort meals by date for leftovers tracking
    sorted_meals = sorted(planned_meals, key=lambda m: m.get("due", {}).get("date", ""))

    for i, task in enumerate(sorted_meals):
        meal_name = task.get("content", "")
        due = task.get("due", {})
        due_str = due.get("date", "") if isinstance(due, dict) else str(due)

        try:
            planned_date = date.fromisoformat(due_str) if due_str else date.today()
        except (ValueError, TypeError):
            planned_date = date.today()

        # Get prior meals for leftovers context
        prior_meals = sorted_meals[:i] if i > 0 else None

        analysis = analyzer.analyze_meal_coverage(
            meal_name=meal_name,
            planned_date=planned_date,
            order_items=order_items,
            house_stock=house_stock,
            receipt_data=receipt_data,
            prior_meals=prior_meals,
        )
        analyses.append(analysis)

    return analyses


# ---------------------------------------------------------------------------
# Debug Output
# ---------------------------------------------------------------------------

def format_coverage_report(analyses: list[MealCoverageAnalysis]) -> str:
    """Format coverage analyses as a readable report."""
    lines = []
    lines.append("🍽️ MEAL COVERAGE ANALYSIS")
    lines.append("")

    full_count = sum(1 for a in analyses if a.is_fully_covered)
    partial_count = sum(1 for a in analyses if a.is_partially_covered)
    gap_count = sum(1 for a in analyses if a.has_gaps)

    lines.append(f"📊 Summary: {full_count} full, {partial_count} partial, {gap_count} gaps")
    lines.append("")

    for analysis in analyses:
        emoji = "✅" if analysis.is_fully_covered else "⚠️" if analysis.is_partially_covered else "🚨"
        lines.append(f"{emoji} {analysis.meal_name} ({analysis.planned_date})")
        lines.append(f"   Coverage: {analysis.coverage_score:.0f}% | Confidence: {analysis.confidence_score:.0f}%")
        lines.append(f"   Decision: {analysis.match_decision.value}")

        if analysis.decision_reasoning:
            lines.append(f"   Reason: {analysis.decision_reasoning[0]}")

        # Show ingredient details
        for ing in analysis.ingredients:
            if ing.coverage_type == CoverageType.MISSING:
                lines.append(f"   ❌ Missing: {ing.ingredient_name}")
            elif ing.is_substitution:
                lines.append(f"   🔄 Substituted: {ing.ingredient_name} → {ing.matched_item}")
            elif ing.coverage_type == CoverageType.LEFTOVERS:
                lines.append(f"   🥡 Leftovers: {ing.ingredient_name}")
            elif ing.confidence in (MatchConfidence.FUZZY_HIGH, MatchConfidence.FUZZY_MEDIUM):
                lines.append(f"   🔍 Fuzzy ({ing.fuzzy_score:.0%}): {ing.ingredient_name} → {ing.matched_item}")

        if analysis.leftovers_yield:
            lines.append(f"   📦 Yields leftovers: {analysis.leftovers_yield}")

        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    import argparse
    import json as _json

    parser = argparse.ArgumentParser(description="Meal coverage analyzer")
    parser.add_argument("--meals", help="JSON file with planned meals")
    parser.add_argument("--order", help="JSON file with order items")
    parser.add_argument("--stock", help="JSON file with house stock")
    parser.add_argument("--receipt", help="JSON file with receipt data")
    parser.add_argument("--days", type=int, default=7, help="Days ahead to analyze")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    parser.add_argument("--debug", action="store_true", help="Show detailed reasoning")
    args = parser.parse_args()

    # Load data
    meals = []
    if args.meals:
        with open(args.meals) as f:
            meals = _json.load(f)

    order_items = []
    if args.order:
        with open(args.order) as f:
            order_items = _json.load(f)

    house_stock = {}
    if args.stock:
        with open(args.stock) as f:
            house_stock = _json.load(f)

    receipt_data = None
    if args.receipt:
        with open(args.receipt) as f:
            receipt_data = _json.load(f)

    # Analyze
    analyses = analyze_meal_plan_coverage(
        planned_meals=meals,
        order_items=order_items,
        house_stock=house_stock,
        receipt_data=receipt_data,
        days_ahead=args.days,
    )

    if args.json:
        output = [a.to_dict() for a in analyses]
        print(_json.dumps(output, indent=2))
    else:
        print(format_coverage_report(analyses))


if __name__ == "__main__":
    main()
