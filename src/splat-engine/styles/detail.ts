/** The detail levels a scene written as data is cut at: the grid's spacing for each, coarsest first. */
export const SCENE_DETAIL = [
  { id: 'chunky', label: 'Chunky', spacing: 0.042 },
  { id: 'medium', label: 'Medium', spacing: 0.03 },
  { id: 'fine', label: 'Fine', spacing: 0.022 },
  { id: 'finest', label: 'Finest', spacing: 0.017 },
] as const
