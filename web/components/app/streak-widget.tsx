type Streak = {
  current: number;
  longest: number;
  xp: number;
};

export function StreakWidget({ streak }: { streak: Streak }) {
  const active = Math.max(0, Math.min(7, Number(streak.current || 0)));
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div className="ody-card">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Study streak</h3>
        <div className="ody-chip">⚡ {streak.xp} XP</div>
      </div>
      <p className="mt-2 text-2xl font-bold">{streak.current} day(s)</p>
      <p className="text-sm text-ody-muted">Longest: {streak.longest} day(s)</p>
      <div className="mt-4 grid grid-cols-7 gap-2">
        {labels.map((label, index) => (
          <div
            key={`${label}-${index}`}
            className={`grid min-h-9 place-items-center rounded-full border text-xs ${index < active ? 'bg-ody-gradient text-black border-transparent' : 'border-ody-border text-ody-muted'}`}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
