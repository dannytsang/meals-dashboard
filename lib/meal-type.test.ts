import { describe, it, expect } from 'vitest';
import { getMealType, type Meal } from './meal-type';

describe('getMealType', () => {
  // --- Explicit meal_type field (from Todoist section_id) ---

  it('returns "lunch" when meal_type is explicitly "lunch"', () => {
    const meal: Meal = { id: '1', content: 'Mash potato cheese (Ashlee)', date: '2026-04-15', labels: [], section: 'Planned', meal_type: 'lunch' };
    expect(getMealType(meal)).toBe('lunch');
  });

  it('returns "dinner" when meal_type is explicitly "dinner"', () => {
    const meal: Meal = { id: '1', content: 'Jacket potatoes (school)', date: '2026-04-16', labels: [], section: 'Planned', meal_type: 'dinner' };
    expect(getMealType(meal)).toBe('dinner');
  });

  it('returns "dinner" for KFC when meal_type is explicitly "dinner"', () => {
    const meal: Meal = { id: '1', content: 'KFC', date: '2026-04-16', labels: [], section: 'Planned', meal_type: 'dinner' };
    expect(getMealType(meal)).toBe('dinner');
  });

  it('returns "lunch" for Terina chicken and rice when meal_type is "lunch"', () => {
    // Terina's meals are also in Ashlee's lunch section
    const meal: Meal = { id: '1', content: 'Chicken and rice veg (Terina)', date: '2026-04-15', labels: [], section: 'Planned', meal_type: 'lunch' };
    expect(getMealType(meal)).toBe('lunch');
  });

  // --- Keyword-based fallback (when meal_type is undefined) ---

  it('falls back to "lunch" when content contains "lunch"', () => {
    const meal: Meal = { id: '1', content: 'Lunch: Chicken sandwich', date: '2026-04-15', labels: [], section: 'Planned' };
    expect(getMealType(meal)).toBe('lunch');
  });

  it('falls back to "lunch" when content contains "sandwich"', () => {
    const meal: Meal = { id: '1', content: 'Ham and cheese sandwich', date: '2026-04-15', labels: [], section: 'Planned' };
    expect(getMealType(meal)).toBe('lunch');
  });

  it('falls back to "breakfast" when content contains "breakfast"', () => {
    const meal: Meal = { id: '1', content: 'Breakfast cereal', date: '2026-04-15', labels: [], section: 'Planned' };
    expect(getMealType(meal)).toBe('breakfast');
  });

  it('falls back to "breakfast" when content contains "cereal"', () => {
    const meal: Meal = { id: '1', content: 'Porridge with cereal', date: '2026-04-15', labels: [], section: 'Planned' };
    expect(getMealType(meal)).toBe('breakfast');
  });

  it('falls back to "dinner" for generic meals with no keywords', () => {
    const meal: Meal = { id: '1', content: 'Pizza', date: '2026-04-15', labels: [], section: 'Planned' };
    expect(getMealType(meal)).toBe('dinner');
  });

  it('falls back to "dinner" for KFC (no lunch/dinner/breakfast keywords)', () => {
    const meal: Meal = { id: '1', content: 'KFC', date: '2026-04-16', labels: [], section: 'Planned' };
    expect(getMealType(meal)).toBe('dinner');
  });

  it('falls back to "dinner" for Jacket potatoes', () => {
    const meal: Meal = { id: '1', content: 'Jacket potatoes (school)', date: '2026-04-16', labels: [], section: 'Planned' };
    expect(getMealType(meal)).toBe('dinner');
  });

  it('falls back to "dinner" for Nachos', () => {
    const meal: Meal = { id: '1', content: 'Nachos (Ashlee and Danny)', date: '2026-04-18', labels: [], section: 'Planned' };
    expect(getMealType(meal)).toBe('dinner');
  });

  it('falls back to "dinner" for Salmon kebabs', () => {
    const meal: Meal = { id: '1', content: 'Salmon kebabs, salad and new potatoes', date: '2026-04-20', labels: [], section: 'Planned' };
    expect(getMealType(meal)).toBe('dinner');
  });

  // --- Priority: explicit meal_type beats keyword fallback ---

  it('prefers explicit meal_type over keyword detection', () => {
    // A meal in Ashlee's section with meal_type: 'lunch' should return 'lunch'
    // even if the content has no lunch-related keywords
    const meal: Meal = { id: '1', content: 'Mash potato cheese (Ashlee)', date: '2026-04-15', labels: [], section: 'Planned', meal_type: 'lunch' };
    expect(getMealType(meal)).toBe('lunch');
  });

  it('prefers explicit meal_type: dinner over lunch keyword in content', () => {
    // If someone names a dinner "Lunch Special", explicit type should win
    const meal: Meal = { id: '1', content: 'Lunch Special curry', date: '2026-04-15', labels: [], section: 'Planned', meal_type: 'dinner' };
    expect(getMealType(meal)).toBe('dinner');
  });

  // --- Ashlee / Terina meals: these are actually lunches ---

  it('correctly classifies "Mash potato cheese (Ashlee)" as lunch', () => {
    const meal: Meal = { id: '1', content: 'Mash potato cheese (Ashlee)', date: '2026-04-15', labels: [], section: 'Planned', meal_type: 'lunch' };
    expect(getMealType(meal)).toBe('lunch');
  });

  it('correctly classifies "Chicken and rice veg (Terina)" as lunch', () => {
    const meal: Meal = { id: '1', content: 'Chicken and rice veg (Terina)', date: '2026-04-15', labels: [], section: 'Planned', meal_type: 'lunch' };
    expect(getMealType(meal)).toBe('lunch');
  });

  it('correctly classifies "Pizza (Leo)" as dinner', () => {
    const meal: Meal = { id: '1', content: 'Pizza (Leo)', date: '2026-04-15', labels: [], section: 'Planned', meal_type: 'dinner' };
    expect(getMealType(meal)).toBe('dinner');
  });

  it('correctly classifies "Nachos (Ashlee and Danny)" as dinner', () => {
    const meal: Meal = { id: '1', content: 'Nachos (Ashlee and Danny)', date: '2026-04-18', labels: [], section: 'Planned', meal_type: 'dinner' };
    expect(getMealType(meal)).toBe('dinner');
  });
});
