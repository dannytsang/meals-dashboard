/**
 * Meal type detection utilities.
 *
 * Logic:
 * 1. If meal has explicit meal_type (from Todoist section_id), use it
 * 2. Otherwise fall back to keyword detection in content
 */

import type { Meal } from './meals-data';
export type { Meal } from './meals-data';

export type MealType = 'breakfast' | 'lunch' | 'dinner';

/**
 * Determine meal type from a Meal object.
 *
 * Priority:
 * 1. Explicit meal_type field (set by sync script based on Todoist section_id)
 * 2. Keyword matching on content as fallback
 */
export function getMealType(meal: Meal): MealType {
  // 1. Use explicit meal_type if present (from Todoist section_id mapping)
  if (meal.meal_type === 'lunch') return 'lunch';
  if (meal.meal_type === 'dinner') return 'dinner';

  // 2. Keyword-based fallback for meals without explicit type
  const m = meal.content.toLowerCase();
  if (m.includes('breakfast') || m.includes('cereal')) return 'breakfast';
  if (m.includes('lunch') || m.includes('sandwich')) return 'lunch';

  // Default: dinner
  return 'dinner';
}
