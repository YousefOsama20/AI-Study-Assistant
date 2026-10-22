import * as SwitchPrimitive from '@radix-ui/react-switch'
import { useId } from 'react'

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled = false,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="relative h-6 w-11 rounded-full border border-border bg-surface-2 transition-colors
          data-[state=checked]:bg-primary data-[state=checked]:border-primary
          disabled:opacity-50"
      >
        <SwitchPrimitive.Thumb
          className="block size-5 translate-x-0.5 rounded-full bg-control-thumb shadow transition-transform
            data-[state=checked]:translate-x-5"
        />
      </SwitchPrimitive.Root>
      {label ? (
        <label htmlFor={id} className="text-sm text-fg select-none">
          {label}
        </label>
      ) : null}
    </div>
  )
}
