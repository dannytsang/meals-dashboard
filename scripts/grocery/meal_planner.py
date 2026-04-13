#!/usr/bin/env python3
"""
Advanced Meal Planner
Multi-criteria meal planning with:
- Perishability awareness (use fresh items before they expire)
- Leftovers chaining (plan meals that use leftover proteins)
- Freezer rotation (prioritise frozen items to reduce waste)
- Cost efficiency (maximise value from current order)
- Weekday/weekend suitability (complexity gating)
- Variety/cooldown (avoid repeating same meals too soon)
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

class DayComplexity(Enum):
    """Meal complexity suitability for a given day."""
    WEEKDAY = "weekday"      # ≤30 min active prep
    WEEKEND = "weekend"       # Can be longer/complex
    ANY = "any"               # No restriction


class StorageType(Enum):
    """Where an ingredient/item is stored."""
    FRESH = "fresh"
    FRIDGE = "fridge"
    FREEZER = "freezer"
    CUPBOARD = "cupboard"
    UNKNOWN = "unknown"


class ProteinType(Enum):
    """Protein category for variety tracking."""
    LAMB = "lamb"
    BEEF = "beef"
    PORK = "pork"
    CHICKEN = "chicken"
    FISH = "fish"
    VEGETARIAN = "vegetarian"
    OTHER = "other"


@dataclass
class MealCandidate:
    """A possible meal for a given day."""
    name: str
    day: date
    complexity: DayComplexity
    tags: list[str] = field(default_factory=list)          # adult/children/both
    protein: ProteinType = ProteinType.OTHER
    score: float = 0.0
    uses_leftovers: bool = False
    leftover_source: Optional[str] = None                  # meal name leftovers came from
    uses_frozen: bool = False
    uses_fresh: bool = False
    cost_estimate: float = 0.0
    key_ingredients: list[str] = field(default_factory=list)
    missing_ingredients: list[str] = field(default_factory=list)
    why: str = ""


@dataclass
class PlannedMeal:
    """A confirmed meal in the plan."""
    name: str
    day: date
    complexity: DayComplexity
    tags: list[str]
    protein: ProteinType
    uses_leftovers: bool = False
    leftover_source: Optional[str] = None
    uses_frozen: bool = False
    uses_fresh: bool = False
    cost_estimate: float = 0.0
    key_ingredients: list[str] = field(default_factory=list)
    missing_ingredients: list[str] = field(default_factory=list)
    why: str = ""
    score: float = 0.0
    score_breakdown: dict = field(default_factory=dict)


@dataclass
class DayPlan:
    """A single day's plan (can contain multiple meals for different audiences)."""
    day: date
    weekday_name: str
    is_weekend: bool
    meals: list[PlannedMeal] = field(default_factory=list)
    gaps: list[str] = field(default_factory=list)          # "adult" or "children"
    external_notes: list[str] = field(default_factory=list) # "Terina out for dinner"


@dataclass
class PlannerConfig:
    """Configuration for the meal planner."""
    # Household preferences
    prefer_lamb_over_beef: bool = True
    no_chicken_for: list[str] = None                     # ["danny"]
    no_spicy_for: list[str] = None                        # ["terina"]
    plain_only_for: list[str] = None                      # ["leo"]
    no_chocolate_for: list[str] = None                    # ["ashlee"]
    # Planning window
    plan_days: int = 7
    cooldown_days: int = 7                                # Don't repeat same meal within this
    # Cost
    free_delivery_threshold: float = 50.0
    # Constraints
    weekday_complexity_limit_minutes: int = 30
    # Order context
    order_total: float = 0.0
    order_missing_estimate: float = 0.0                   # £ needed for free delivery

    def __post_init__(self):
        if self.no_chicken_for is None:
            self.no_chicken_for = []
        if self.no_spicy_for is None:
            self.no_spicy_for = []
        if self.plain_only_for is None:
            self.plain_only_for = []
        if self.no_chocolate_for is None:
            self.no_chocolate_for = []


# ---------------------------------------------------------------------------
# Meal database (could be extended to load from file/API)
# ---------------------------------------------------------------------------

# Known meals with metadata
MEAL_DATABASE: dict[str, dict] = {
    # === LAMB ===
    "shepherd's pie": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.LAMB,
        "tags": ["adult", "children"],
        "prep_minutes": 20,
        "cook_minutes": 45,
        "key_ingredients": ["lamb mince", "potato", "peas", "carrot"],
        "uses_fresh": True,
        "freezable": True,
        "leftovers_yield": "lamb cottage pie",
    },
    "lamb cottage pie": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.LAMB,
        "tags": ["adult", "children"],
        "prep_minutes": 20,
        "cook_minutes": 45,
        "key_ingredients": ["lamb mince", "potato", "peas", "carrot"],
        "uses_fresh": True,
        "freezable": True,
        "leftovers_yield": None,
    },
    "lamb kofta": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.LAMB,
        "tags": ["adult", "children"],
        "prep_minutes": 15,
        "cook_minutes": 20,
        "key_ingredients": ["lamb mince", "spices", "rice"],
        "uses_fresh": True,
        "freezable": True,
        "leftovers_yield": "lamb kofta wraps",
    },
    "lamb curry": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.LAMB,
        "tags": ["adult", "children"],
        "prep_minutes": 20,
        "cook_minutes": 35,
        "key_ingredients": ["lamb mince", "curry sauce", "rice"],
        "uses_fresh": True,
        "freezable": True,
        "spice_level": "mild",
        "leftovers_yield": None,
    },
    "lamb biryani": {
        "complexity": DayComplexity.WEEKEND,
        "protein": ProteinType.LAMB,
        "tags": ["adult"],
        "prep_minutes": 30,
        "cook_minutes": 60,
        "key_ingredients": ["lamb", "rice", "curry"],
        "uses_fresh": True,
        "freezable": True,
        "spice_level": "mild",
        "leftovers_yield": None,
    },
    "lamb burgers": {
        "complexity": DayComplexity.WEEKEND,
        "protein": ProteinType.LAMB,
        "tags": ["adult", "children"],
        "prep_minutes": 15,
        "cook_minutes": 15,
        "key_ingredients": ["lamb mince", "burger buns", "salad"],
        "uses_fresh": True,
        "freezable": True,
        "leftovers_yield": None,
    },

    # === BEEF ===
    "bolognese": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.BEEF,
        "tags": ["adult", "children"],
        "prep_minutes": 15,
        "cook_minutes": 30,
        "key_ingredients": ["beef mince", "pasta", "tomato sauce"],
        "uses_fresh": True,
        "freezable": True,
        "leftovers_yield": "bolognese pasta bake",
    },
    "beef chilli": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.BEEF,
        "tags": ["adult", "children"],
        "prep_minutes": 15,
        "cook_minutes": 30,
        "key_ingredients": ["beef mince", "kidney beans", "rice"],
        "uses_fresh": True,
        "freezable": True,
        "spice_level": "mild",
        "leftovers_yield": None,
    },
    "beef burger": {
        "complexity": DayComplexity.WEEKEND,
        "protein": ProteinType.BEEF,
        "tags": ["adult", "children"],
        "prep_minutes": 15,
        "cook_minutes": 15,
        "key_ingredients": ["beef mince", "burger buns", "salad"],
        "uses_fresh": True,
        "freezable": True,
        "leftovers_yield": None,
    },
    "beef stew": {
        "complexity": DayComplexity.WEEKEND,
        "protein": ProteinType.BEEF,
        "tags": ["adult", "children"],
        "prep_minutes": 20,
        "cook_minutes": 90,
        "key_ingredients": ["beef", "potato", "carrot", "onion"],
        "uses_fresh": True,
        "freezable": True,
        "leftovers_yield": None,
    },
    "cottage pie": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.BEEF,
        "tags": ["adult", "children"],
        "prep_minutes": 20,
        "cook_minutes": 45,
        "key_ingredients": ["beef mince", "potato", "peas", "carrot"],
        "uses_fresh": True,
        "freezable": True,
        "leftovers_yield": "lamb cottage pie",
    },
    "spaghetti bolognese": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.BEEF,
        "tags": ["adult", "children"],
        "prep_minutes": 15,
        "cook_minutes": 30,
        "key_ingredients": ["beef mince", "pasta", "tomato sauce"],
        "uses_fresh": True,
        "freezable": True,
        "leftovers_yield": "bolognese pasta bake",
    },

    # === PORK ===
    "pork stir fry": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.PORK,
        "tags": ["adult", "children"],
        "prep_minutes": 15,
        "cook_minutes": 15,
        "key_ingredients": ["pork", "stir fry veg", "noodles"],
        "uses_fresh": True,
        "freezable": False,
        "leftovers_yield": None,
    },
    "gammon stew": {
        "complexity": DayComplexity.WEEKEND,
        "protein": ProteinType.PORK,
        "tags": ["adult", "children"],
        "prep_minutes": 15,
        "cook_minutes": 60,
        "key_ingredients": ["gammon", "potato", "carrot", "onion"],
        "uses_fresh": True,
        "freezable": True,
        "leftovers_yield": None,
    },
    "sausages and mash": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.PORK,
        "tags": ["adult", "children"],
        "prep_minutes": 10,
        "cook_minutes": 25,
        "key_ingredients": ["sausages", "potato"],
        "uses_fresh": True,
        "freezable": True,
        "leftovers_yield": None,
    },
    "pork belly": {
        "complexity": DayComplexity.WEEKEND,
        "protein": ProteinType.PORK,
        "tags": ["adult"],
        "prep_minutes": 15,
        "cook_minutes": 90,
        "key_ingredients": ["pork belly", "potato", "vegetables"],
        "uses_fresh": True,
        "freezable": True,
        "leftovers_yield": None,
    },

    # === FISH ===
    "fish and chips": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.FISH,
        "tags": ["adult", "children"],
        "prep_minutes": 5,
        "cook_minutes": 25,
        "key_ingredients": ["fish fingers", "chips"],
        "uses_fresh": False,
        "freezable": True,
        "leftovers_yield": None,
    },
    "salmon pasta": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.FISH,
        "tags": ["adult", "children"],
        "prep_minutes": 10,
        "cook_minutes": 20,
        "key_ingredients": ["salmon", "pasta", "cream"],
        "uses_fresh": True,
        "freezable": False,
        "leftovers_yield": None,
    },
    "tuna pasta": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.FISH,
        "tags": ["adult", "children"],
        "prep_minutes": 5,
        "cook_minutes": 15,
        "key_ingredients": ["tuna", "pasta", "tomato sauce"],
        "uses_fresh": False,
        "freezable": False,
        "leftovers_yield": None,
    },
    "fish pie": {
        "complexity": DayComplexity.WEEKEND,
        "protein": ProteinType.FISH,
        "tags": ["adult", "children"],
        "prep_minutes": 25,
        "cook_minutes": 40,
        "key_ingredients": ["fish", "potato", "milk", "peas"],
        "uses_fresh": True,
        "freezable": True,
        "leftovers_yield": None,
    },
    "kedgeree": {
        "complexity": DayComplexity.WEEKEND,
        "protein": ProteinType.FISH,
        "tags": ["adult"],
        "prep_minutes": 15,
        "cook_minutes": 30,
        "key_ingredients": ["smoked haddock", "rice", "eggs"],
        "uses_fresh": True,
        "freezable": False,
        "leftovers_yield": None,
    },
    "salmon": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.FISH,
        "tags": ["adult"],
        "prep_minutes": 5,
        "cook_minutes": 20,
        "key_ingredients": ["salmon"],
        "uses_fresh": True,
        "freezable": True,
        "leftovers_yield": None,
    },

    # === VEGETARIAN ===
    "vegetable curry": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.VEGETARIAN,
        "tags": ["adult", "children"],
        "prep_minutes": 20,
        "cook_minutes": 25,
        "key_ingredients": ["vegetables", "curry sauce", "rice"],
        "uses_fresh": True,
        "freezable": True,
        "spice_level": "mild",
        "leftovers_yield": None,
    },
    "pasta bake": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.VEGETARIAN,
        "tags": ["adult", "children"],
        "prep_minutes": 10,
        "cook_minutes": 30,
        "key_ingredients": ["pasta", "cheese", "tomato sauce"],
        "uses_fresh": False,
        "freezable": True,
        "leftovers_yield": None,
    },
    "macaroni cheese": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.VEGETARIAN,
        "tags": ["adult", "children"],
        "prep_minutes": 10,
        "cook_minutes": 25,
        "key_ingredients": ["pasta", "cheese", "milk"],
        "uses_fresh": False,
        "freezable": True,
        "leftovers_yield": None,
    },
    "cheese on toast": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.VEGETARIAN,
        "tags": ["adult", "children"],
        "prep_minutes": 5,
        "cook_minutes": 5,
        "key_ingredients": ["bread", "cheese"],
        "uses_fresh": False,
        "freezable": False,
        "leftovers_yield": None,
    },

    # === KIDS FAVOURITES ===
    "nuggets and chips": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.OTHER,
        "tags": ["children"],
        "prep_minutes": 5,
        "cook_minutes": 20,
        "key_ingredients": ["nuggets", "chips"],
        "uses_fresh": False,
        "freezable": True,
        "leftovers_yield": None,
    },
    "pizza": {
        "complexity": DayComplexity.WEEKEND,
        "protein": ProteinType.OTHER,
        "tags": ["adult", "children"],
        "prep_minutes": 5,
        "cook_minutes": 15,
        "key_ingredients": ["pizza"],
        "uses_fresh": False,
        "freezable": True,
        "leftovers_yield": None,
    },
    "pasta with butter": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.VEGETARIAN,
        "tags": ["children"],
        "prep_minutes": 5,
        "cook_minutes": 15,
        "key_ingredients": ["pasta", "butter"],
        "uses_fresh": False,
        "freezable": False,
        "leftovers_yield": None,
    },

    # === QUICK / EMERGENCY ===
    "beans on toast": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.VEGETARIAN,
        "tags": ["adult", "children"],
        "prep_minutes": 2,
        "cook_minutes": 5,
        "key_ingredients": ["beans", "bread"],
        "uses_fresh": False,
        "freezable": False,
        "leftovers_yield": None,
    },
    "hotdogs": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.PORK,
        "tags": ["adult", "children"],
        "prep_minutes": 5,
        "cook_minutes": 10,
        "key_ingredients": ["sausages", "hot dog rolls"],
        "uses_fresh": True,
        "freezable": False,
        "leftovers_yield": None,
    },
    "omelette": {
        "complexity": DayComplexity.WEEKDAY,
        "protein": ProteinType.VEGETARIAN,
        "tags": ["adult", "children"],
        "prep_minutes": 5,
        "cook_minutes": 5,
        "key_ingredients": ["eggs"],
        "uses_fresh": True,
        "freezable": False,
        "leftovers_yield": None,
    },
    "fajitas": {
        "complexity": DayComplexity.WEEKEND,
        "protein": ProteinType.OTHER,
        "tags": ["adult", "children"],
        "prep_minutes": 20,
        "cook_minutes": 15,
        "key_ingredients": ["fajita kit", "chicken", "peppers"],
        "uses_fresh": True,
        "freezable": True,
        "spice_level": "mild",
        "leftovers_yield": None,
    },
}


# ---------------------------------------------------------------------------
# Leftovers chain tracking
# ---------------------------------------------------------------------------

@dataclass
class LeftoversInventory:
    """Tracks leftover ingredients from planned meals."""
    items: dict[str, date] = field(default_factory=dict)   # ingredient → use-by date

    def add(self, ingredient: str, use_by: date):
        self.items[ingredient] = use_by

    def consume(self, ingredient: str) -> bool:
        """Try to consume an ingredient. Returns True if used."""
        if ingredient in self.items:
            del self.items[ingredient]
            return True
        return False

    def get_near_expiry(self, days_ahead: int = 2) -> list[str]:
        """Get items that expire within days_ahead."""
        today = date.today()
        return [
            item for item, exp in self.items.items()
            if (exp - today).days <= days_ahead
        ]

    def has_ingredient(self, ingredient: str) -> bool:
        return ingredient in self.items


# ---------------------------------------------------------------------------
# Freezer inventory tracking
# ---------------------------------------------------------------------------

@dataclass
class FreezerInventory:
    """Tracks what's in the freezer."""
    items: dict[str, date] = field(default_factory=dict)   # item → date frozen

    def add(self, item: str, frozen_date: Optional[date] = None):
        self.items[item] = frozen_date or date.today()

    def get_age_days(self, item: str) -> Optional[int]:
        """Return age in days, or None if not found."""
        if item not in self.items:
            return None
        return (date.today() - self.items[item]).days

    def should_use_first(self, item: str, max_freezer_days: int = 90) -> bool:
        """Suggest using older items first."""
        age = self.get_age_days(item)
        if age is None:
            return False
        return age >= max_freezer_days


# ---------------------------------------------------------------------------
# Scoring engine
# ---------------------------------------------------------------------------

@dataclass
class ScoringWeights:
    """Weights for multi-criteria scoring."""
    leftovers_bonus: float = 30.0      # Use leftovers = bonus
    freezer_rotation_bonus: float = 25.0  # Use older frozen items = bonus
    perishability_bonus: float = 20.0   # Use fresh items before expiry = bonus
    variety_bonus: float = 15.0         # Different protein = bonus
    cooldown_bonus: float = 20.0         # Haven't eaten recently = bonus
    cost_penalty: float = 5.0            # More expensive = slight penalty
    order_coverage_bonus: float = 15.0  # Uses items in current order = bonus
    lamb_preference_bonus: float = 10.0  # Lamb over beef = bonus
    weekend_complexity_bonus: float = 5.0  # Saves weekday effort = bonus


class MealScorer:
    """Scores meal candidates across multiple criteria."""

    def __init__(
        self,
        config: PlannerConfig,
        recent_meals: list[str],           # Lower-case names eaten recently
        leftovers: LeftoversInventory,
        freezer: FreezerInventory,
        order_item_names: list[str],        # Items in current Tesco order
    ):
        self.config = config
        self.recent_meals = set(m.lower() for m in recent_meals)
        self.leftovers = leftovers
        self.freezer = freezer
        self.order_item_names = [n.lower() for n in order_item_names]
        self.weights = ScoringWeights()

    def score(self, candidate: MealCandidate) -> float:
        breakdown = {}
        total = 0.0

        # 1. Leftovers bonus
        if candidate.uses_leftovers:
            score = self.weights.leftovers_bonus
            breakdown["leftovers"] = score
            total += score

        # 2. Freezer rotation bonus
        if candidate.uses_frozen:
            # Check oldest key ingredient in freezer
            max_age = 0
            for ing in candidate.key_ingredients:
                age = self.freezer.get_age_days(ing.lower())
                if age and age > max_age:
                    max_age = age
            if max_age >= 30:
                bonus = min(self.weights.freezer_rotation_bonus, max_age / 3)
                breakdown["freezer_rotation"] = bonus
                total += bonus

        # 3. Perishability bonus — uses fresh items expiring soon
        if candidate.uses_fresh:
            near_expiry = self.leftovers.get_near_expiry(3)
            if near_expiry:
                bonus = self.weights.perishability_bonus
                breakdown["perishability"] = bonus
                total += bonus

        # 4. Variety bonus — different protein from recent meals
        recent_proteins = set()
        for meal_name in self.recent_meals:
            for meal_key, meta in MEAL_DATABASE.items():
                if meal_key in meal_name or meal_name in meal_key:
                    recent_proteins.add(meta.get("protein", ProteinType.OTHER))
        if candidate.protein not in recent_proteins and candidate.protein != ProteinType.OTHER:
            bonus = self.weights.variety_bonus
            breakdown["variety"] = bonus
            total += bonus

        # 5. Cooldown bonus — hasn't been eaten recently
        if candidate.name.lower() not in self.recent_meals:
            bonus = self.weights.cooldown_bonus
            breakdown["cooldown"] = bonus
            total += bonus

        # 6. Cost efficiency — prefer using order items
        order_coverage = sum(1 for ing in candidate.key_ingredients if any(ing.lower() in o for o in self.order_item_names))
        if order_coverage > 0:
            bonus = order_coverage * self.weights.order_coverage_bonus / max(len(candidate.key_ingredients), 1)
            breakdown["order_coverage"] = bonus
            total += bonus

        # 7. Lamb preference bonus
        if self.config.prefer_lamb_over_beef and candidate.protein == ProteinType.LAMB:
            breakdown["lamb_preference"] = self.weights.lamb_preference_bonus
            total += self.weights.lamb_preference_bonus

        # 8. Weekend complexity bonus — save complex meals for weekend
        if candidate.complexity == DayComplexity.WEEKEND and not self._is_weekend(candidate.day):
            bonus = self.weights.weekend_complexity_bonus
            breakdown["weekend_complexity"] = bonus
            total += bonus

        candidate.score = total
        candidate.score_breakdown = breakdown
        return total

    def _is_weekend(self, day: date) -> bool:
        return day.weekday() >= 5  # Saturday=5, Sunday=6


# ---------------------------------------------------------------------------
# Meal candidate generator
# ---------------------------------------------------------------------------

class MealCandidateGenerator:
    """Generates valid meal candidates for a given day."""

    def __init__(
        self,
        config: PlannerConfig,
        leftovers: LeftoversInventory,
        freezer: FreezerInventory,
        order_items: list[str],
        available_ingredients: list[str],
    ):
        self.config = config
        self.leftovers = leftovers
        self.freezer = freezer
        self.order_items = [i.lower() for i in order_items]
        self.available_ingredients = [i.lower() for i in available_ingredients]

    def generate_for_day(self, day: date, audience: str = "both") -> list[MealCandidate]:
        """Generate valid meal candidates for a specific day."""
        candidates = []
        is_weekend = day.weekday() >= 5

        for meal_name, meta in MEAL_DATABASE.items():
            complexity = meta.get("complexity", DayComplexity.WEEKDAY)

            # Filter by audience tags
            tags = meta.get("tags", ["adult", "children"])
            if audience == "adult" and "children" in tags and "adult" not in tags:
                continue
            if audience == "children" and "adult" in tags and "children" not in tags:
                continue

            # Filter by weekday complexity
            if not is_weekend and complexity == DayComplexity.WEEKEND:
                continue  # Skip weekend-only meals on weekdays

            # Filter by dietary restrictions
            if "danny" in self.config.no_chicken_for and meta.get("protein") == ProteinType.CHICKEN:
                continue
            if "terina" in self.config.no_spicy_for and meta.get("spice_level") == "hot":
                continue

            # Check leftover usage
            uses_leftovers = False
            leftover_source = None
            for ing in meta.get("key_ingredients", []):
                if self.leftovers.has_ingredient(ing):
                    uses_leftovers = True
                    leftover_source = ing
                    break

            # Check freezer usage
            uses_frozen = any(
                ing.lower() in self.freezer.items
                for ing in meta.get("key_ingredients", [])
            )

            # Check fresh usage
            uses_fresh = meta.get("uses_fresh", False)

            # Missing ingredients
            missing = [
                ing for ing in meta.get("key_ingredients", [])
                if not any(ing.lower() in avail for avail in self.available_ingredients)
                and ing.lower() not in self.freezer.items
                and not self.leftovers.has_ingredient(ing)
            ]

            candidate = MealCandidate(
                name=meal_name,
                day=day,
                complexity=complexity,
                tags=tags,
                protein=meta.get("protein", ProteinType.OTHER),
                uses_leftovers=uses_leftovers,
                leftover_source=leftover_source,
                uses_frozen=uses_frozen,
                uses_fresh=uses_fresh,
                cost_estimate=0.0,  # Could be extended with price data
                key_ingredients=meta.get("key_ingredients", []),
                missing_ingredients=missing,
                why=self._build_why(meta, uses_leftovers, uses_frozen, leftover_source),
            )
            candidates.append(candidate)

        return candidates

    def _build_why(self, meta: dict, uses_leftovers: bool, uses_frozen: bool, leftover_source: Optional[str]) -> str:
        reasons = []
        if uses_leftovers and leftover_source:
            reasons.append(f"Uses leftovers ({leftover_source})")
        if uses_frozen:
            reasons.append("Uses freezer stock")
        if meta.get("leftovers_yield"):
            reasons.append(f"Leaves leftovers for {meta['leftovers_yield']}")
        prep = meta.get("prep_minutes", 0)
        cook = meta.get("cook_minutes", 0)
        reasons.append(f"{prep}+{cook}min")
        if not reasons:
            reasons.append("Balanced choice")
        return " • ".join(reasons)


# ---------------------------------------------------------------------------
# Plan builder (greedy algorithm)
# ---------------------------------------------------------------------------

class PlanBuilder:
    """Builds a multi-day meal plan using greedy selection."""

    def __init__(
        self,
        config: PlannerConfig,
        leftovers: LeftoversInventory,
        freezer: FreezerInventory,
        recent_meals: list[str],
        order_items: list[str],
        available_ingredients: list[str],
        planned_meal_names: list[str],   # Already planned meal names to avoid duplicates
    ):
        self.config = config
        self.leftovers = leftovers
        self.freezer = freezer
        self.planned_meal_names = set(m.lower() for m in planned_meal_names)
        self.scorer = MealScorer(config, recent_meals, leftovers, freezer, order_items)
        self.generator = MealCandidateGenerator(config, leftovers, freezer, order_items, available_ingredients)

    def build(self, days: list[date]) -> list[DayPlan]:
        """Build plan for the given days using greedy selection."""
        plans = []
        recent_meals_sliding = list(self.planned_meal_names)  # Start with already-planned

        for day in days:
            is_weekend = day.weekday() >= 5
            day_plan = DayPlan(
                day=day,
                weekday_name=day.strftime("%A %d %b"),
                is_weekend=is_weekend,
            )

            # Generate candidates for family meals
            family_candidates = [
                c for c in self.generator.generate_for_day(day, "both")
                if c.name.lower() not in recent_meals_sliding
            ]

            # Score all candidates
            for c in family_candidates:
                self.scorer.score(c)

            # Sort by score descending
            family_candidates.sort(key=lambda c: c.score, reverse=True)

            # Pick the best family meal
            if family_candidates:
                best = family_candidates[0]
                planned = PlannedMeal(
                    name=best.name,
                    day=best.day,
                    complexity=best.complexity,
                    tags=best.tags,
                    protein=best.protein,
                    uses_leftovers=best.uses_leftovers,
                    leftover_source=best.leftover_source,
                    uses_frozen=best.uses_frozen,
                    uses_fresh=best.uses_fresh,
                    cost_estimate=best.cost_estimate,
                    key_ingredients=best.key_ingredients,
                    missing_ingredients=best.missing_ingredients,
                    why=best.why,
                    score=best.score,
                    score_breakdown=best.score_breakdown,
                )
                day_plan.meals.append(planned)
                recent_meals_sliding.append(best.name.lower())

                # Update leftovers if this meal yields leftovers
                meta = MEAL_DATABASE.get(best.name, {})
                if meta.get("leftovers_yield"):
                    # Next day's date as use-by (leftovers typically used within 2 days)
                    self.leftovers.add(meta["leftovers_yield"], day + timedelta(days=2))

                # Mark key ingredients as consumed
                for ing in best.key_ingredients:
                    self.leftovers.consume(ing)
            else:
                day_plan.gaps.append("family")

            plans.append(day_plan)

        return plans


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_meal_plan(
    days: list[date],
    config: PlannerConfig,
    recent_meals: list[str],
    planned_meal_names: list[str],
    order_items: list[str],
    available_ingredients: list[str],
    freezer_items: Optional[dict[str, date]] = None,
    leftovers_items: Optional[dict[str, date]] = None,
) -> list[DayPlan]:
    """
    Build an advanced multi-day meal plan.

    Args:
        days: List of dates to plan for
        config: PlannerConfig with preferences
        recent_meals: List of recently eaten meal names (for cooldown)
        planned_meal_names: Meal names already in plan (avoid duplicates)
        order_items: Item names in current Tesco order
        available_ingredients: Ingredients available at home
        freezer_items: {item_name: date_frozen}
        leftovers_items: {ingredient: use_by_date}

    Returns:
        List of DayPlan objects
    """
    freezer = FreezerInventory()
    if freezer_items:
        for item, frozen_date in freezer_items.items():
            if isinstance(frozen_date, str):
                frozen_date = date.fromisoformat(frozen_date)
            freezer.add(item, frozen_date)

    leftovers = LeftoversInventory()
    if leftovers_items:
        for ingredient, use_by in leftovers_items.items():
            if isinstance(use_by, str):
                use_by = date.fromisoformat(use_by)
            leftovers.add(ingredient, use_by)

    builder = PlanBuilder(
        config=config,
        leftovers=leftovers,
        freezer=freezer,
        recent_meals=recent_meals,
        order_items=order_items,
        available_ingredients=available_ingredients,
        planned_meal_names=planned_meal_names,
    )

    return builder.build(days)


def format_plan_text(plans: list[DayPlan], config: PlannerConfig) -> str:
    """Format a plan for Telegram output."""
    lines = []
    lines.append("🍽️ ADVANCED MEAL PLAN")
    lines.append("")

    # Header
    lines.append(f"📅 Planning window: {plans[0].weekday_name} → {plans[-1].weekday_name}")
    if config.order_total > 0:
        if config.order_total < config.free_delivery_threshold:
            shortfall = config.free_delivery_threshold - config.order_total
            lines.append(f"🛒 Order: £{config.order_total:.2f} (need £{shortfall:.2f} more for free delivery)")
        else:
            lines.append(f"🛒 Order: £{config.order_total:.2f} ✅ Free delivery qualified")
    lines.append("")

    for plan in plans:
        # Day header
        is_weekend_marker = " (weekend)" if plan.is_weekend else ""
        lines.append(f"📆 {plan.weekday_name}{is_weekend_marker}")
        lines.append("─" * 40)

        if not plan.meals and not plan.gaps:
            lines.append("  No meal planned (gap)")
        elif plan.meals:
            for meal in plan.meals:
                tags_str = " ".join(f"[{t}]" for t in meal.tags)
                lines.append(f"  🍽️ {meal.name} {tags_str}")
                if meal.why:
                    lines.append(f"     └─ {meal.why}")
                if meal.missing_ingredients:
                    lines.append(f"     ⚠️  Missing: {', '.join(meal.missing_ingredients[:3])}")
                if meal.score_breakdown:
                    scores = "+".join(f"{k}:{v:.0f}" for k, v in meal.score_breakdown.items())
                    lines.append(f"     📊 Score: {meal.score:.1f} ({scores})")
        elif plan.gaps:
            for gap in plan.gaps:
                lines.append(f"  ⚠️  Gap: {gap} meal not planned")

        if plan.external_notes:
            for note in plan.external_notes:
                lines.append(f"  📝 {note}")

        lines.append("")

    # Summary
    total_meals = sum(len(p.meals) for p in plans)
    total_gaps = sum(len(p.gaps) for p in plans)
    lines.append(f"📊 Summary: {total_meals} meals planned, {total_gaps} gaps")
    lines.append("")

    # Leftovers tracking
    # (Could add more summary stats)

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    import argparse
    from datetime import datetime, timedelta

    parser = argparse.ArgumentParser(description="Advanced meal planner")
    parser.add_argument("--start-date", default=None, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--days", type=int, default=7, help="Number of days to plan")
    parser.add_argument("--order-total", type=float, default=0.0, help="Current Tesco order total")
    parser.add_argument("--config", type=str, help="JSON config file")
    args = parser.parse_args()

    # Build date range
    if args.start_date:
        start = datetime.fromisoformat(args.start_date).date()
    else:
        start = datetime.now().date()

    days = [start + timedelta(days=i) for i in range(args.days)]

    # Build config
    config = PlannerConfig(
        plan_days=args.days,
        order_total=args.order_total,
        free_delivery_threshold=50.0,
        prefer_lamb_over_beef=True,
        no_chicken_for=["danny"],
        no_spicy_for=["terina"],
        plain_only_for=["leo"],
    )

    # Build plan
    plans = build_meal_plan(
        days=days,
        config=config,
        recent_meals=["bolognese", "curry"],  # Example recent meals
        planned_meal_names=[],
        order_items=["lamb mince", "potato", "peas", "carrot", "pasta", "cheese"],
        available_ingredients=["lamb mince", "potato", "peas", "carrot", "pasta", "cheese", "rice"],
    )

    print(format_plan_text(plans, config))


if __name__ == "__main__":
    main()
