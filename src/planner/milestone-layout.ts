/** Milestones keep their own dates and identifiers; the chart groups only their pins. */
export interface MilestoneGroup<T> {
  date: string;
  items: T[];
}

/** Group dates without changing milestone order, content or the caller's arrays. */
export function groupMilestones<T extends {id: string; date: string}>(milestones: readonly T[]): MilestoneGroup<T>[] {
  const dates = new Map<string, T[]>();
  for (const milestone of milestones) {
    const items = dates.get(milestone.date);
    if (items) items.push(milestone);
    else dates.set(milestone.date, [milestone]);
  }
  return [...dates].sort(([left], [right]) => left.localeCompare(right))
    .map(([date, items]) => ({date, items}));
}
