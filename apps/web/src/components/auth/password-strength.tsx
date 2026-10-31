import { PASSWORD_MIN_LENGTH } from '@snapsell/shared';
import { cn } from '@snapsell/ui';

function strength(pw: string) {
  let score = 0;
  if (pw.length >= PASSWORD_MIN_LENGTH) score++;
  if (pw.length >= 14) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

const LABELS = ['Too short', 'Okay', 'Good', 'Strong', 'Very strong'];
const COLORS = ['bg-danger', 'bg-warning', 'bg-warning', 'bg-success', 'bg-success'];

export function PasswordStrength({ value }: { value: string }) {
  const score = value ? strength(value) : 0;
  return (
    <div className="grid gap-1.5" aria-live="polite">
      <div className="grid grid-cols-4 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1 rounded-full transition-colors duration-300',
              value && i < Math.max(1, score) ? COLORS[score] : 'bg-muted',
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {value
          ? LABELS[score]
          : `At least ${PASSWORD_MIN_LENGTH} characters. A short sentence works well.`}
      </p>
    </div>
  );
}
