import { cn } from '../../lib/utils'

export function RangeSlider({
  value,
  min = 0,
  max = 1,
  step = 0.05,
  onChange,
  label,
  hint,
  formatValue,
  disabled = false,
}: {
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  label: string
  hint?: string
  formatValue?: (value: number) => string
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-fg">{label}</label>
        <span className="text-sm tabular-nums text-muted">
          {formatValue ? formatValue(value) : value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className={cn(
          'h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-primary',
          'disabled:opacity-50',
        )}
        aria-label={label}
      />
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  )
}
