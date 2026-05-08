import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 border-b border-border bg-transparent px-0 py-1 text-sm tracking-[0.08em] transition-colors outline-none placeholder:text-muted-foreground placeholder:uppercase placeholder:tracking-[0.14em] placeholder:text-xs focus-visible:border-accent disabled:pointer-events-none disabled:opacity-40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
