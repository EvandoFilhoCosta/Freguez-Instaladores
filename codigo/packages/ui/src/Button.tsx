import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

// Guia Visual 5.1
const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors duration-150 ease-out " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2 " +
    "disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_1px_2px_rgb(16_31_51/0.2)] hover:bg-brand-hover",
        accent: "bg-accent text-navy-900 hover:bg-amber-400",
        secondary: "border border-slate-200 bg-surface text-ink shadow-campo hover:border-slate-300 hover:bg-slate-50",
        ghost: "text-ink hover:bg-slate-100",
        danger: "bg-danger text-white hover:bg-red-800",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-5 text-base",
        xl: "h-16 px-6 text-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(button({ variant, size }), className)} {...props} />;
}
