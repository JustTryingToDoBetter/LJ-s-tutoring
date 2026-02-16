import fs from 'node:fs';
import path from 'node:path';

export type CareerGoal = {
  id: string;
  title: string;
  recommendedSubjects: string[];
  targetMarks: Record<string, string>;
  skillsChecklist: string[];
  weeklyStudyAllocation: Record<string, number>;
  recommendedVaultTags: string[];
};

type GoalFile = {
  version: string;
  updatedAt: string;
  goals: CareerGoal[];
};

let cache: GoalFile | null = null;

function resolveGoalsFilePath() {
  const fromCwd = path.resolve(process.cwd(), 'data/career-goals.v1.json');
  if (fs.existsSync(fromCwd)) return fromCwd;

  const fromRepoRoot = path.resolve(process.cwd(), '../data/career-goals.v1.json');
  if (fs.existsSync(fromRepoRoot)) return fromRepoRoot;

  throw new Error('career_goals_dataset_missing');
}

export function loadCareerGoals(): GoalFile {
  if (cache) return cache;
  const file = resolveGoalsFilePath();
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw) as GoalFile;
  if (!Array.isArray(parsed.goals)) {
    throw new Error('career_goals_dataset_invalid');
  }
  cache = parsed;
  return parsed;
}

export function findCareerGoal(goalId: string) {
  const goals = loadCareerGoals();
  return goals.goals.find((goal) => goal.id === goalId) ?? null;
}
