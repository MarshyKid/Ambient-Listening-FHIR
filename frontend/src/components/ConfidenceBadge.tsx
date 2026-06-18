interface ConfidenceBadgeProps {
  confidence: number;
}

export default function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  const level = confidence >= 0.85 ? "high" : confidence >= 0.6 ? "medium" : "low";
  const label = level === "high" ? "High" : level === "medium" ? "Medium" : "Low";

  return (
    <span className={`confidence-badge confidence-${level}`}>
      {label} {(confidence * 100).toFixed(0)}%
    </span>
  );
}
