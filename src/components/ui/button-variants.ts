import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center border border-transparent text-[11px] font-bold uppercase tracking-[0.14em] whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-1 focus-visible:ring-accent active:opacity-70 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-accent-foreground hover:bg-accent-hover",
        outline:
          "border-border bg-transparent text-foreground hover:text-accent hover:border-accent",
        secondary:
          "bg-secondary text-secondary-foreground hover:text-accent",
        ghost:
          "bg-transparent text-foreground hover:text-accent",
        destructive:
          "bg-transparent text-destructive border-destructive/40 hover:bg-destructive hover:text-primary-foreground",
        link: "bg-transparent text-foreground hover:text-accent underline-offset-4 hover:underline border-none",
        bracket:
          "bg-transparent text-muted-foreground hover:text-accent border-none before:content-['[_'] after:content-['_]']",
      },
      size: {
        default: "h-8 gap-1.5 px-3",
        xs: "h-6 gap-1 px-2 text-[10px]",
        sm: "h-7 gap-1 px-2.5",
        lg: "h-9 gap-1.5 px-4",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
