import { LeaderboardEntry } from "../types/contracts";

// Shared leaderboard list. Accepts any row with rank/name/score, so team
// standings (TeamEntry) render through the same component.
export default function Board({
  entries,
  emptyText = "Scores will show up after the first question.",
}: {
  entries: LeaderboardEntry[];
  emptyText?: string;
}) {
  if (entries.length === 0) {
    return <p className="muted">{emptyText}</p>;
  }
  return (
    <div>
      {entries.map((e) => (
        <div key={e.name} className={`lb-row ${e.rank === 1 ? "top1" : ""}`}>
          <span className="rank">{e.rank}</span>
          <span className="nm">{e.name}</span>
          <span className="sc">{e.score.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
