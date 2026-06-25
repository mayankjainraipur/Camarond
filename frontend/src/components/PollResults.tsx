import { DistributionItem } from "../types/contracts";

// Horizontal vote-distribution bars. Shared by the participant view, the host
// live console, and the reports dashboard. Styling lives in index.css (global)
// so it works both inside and outside the `.host` scope.
export default function PollResults({
  items,
  emptyText = "No votes yet.",
}: {
  items: DistributionItem[];
  emptyText?: string;
}) {
  if (!items || items.length === 0) {
    return <p className="poll-empty">{emptyText}</p>;
  }
  const total = items.reduce((sum, i) => sum + i.count, 0) || 1;
  const leader = Math.max(...items.map((i) => i.count));

  return (
    <div className="poll-results">
      {items.map((it) => {
        const pct = Math.round((it.count / total) * 100);
        const top = it.count === leader;
        return (
          <div key={it.answer} className={`poll-row ${top ? "lead" : ""}`}>
            <div className="poll-row-head">
              <span className="poll-ans">{it.answer}</span>
              <span className="poll-meta">
                {pct}% · {it.count} {it.count === 1 ? "vote" : "votes"}
              </span>
            </div>
            <div className="poll-track">
              <div className="poll-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
