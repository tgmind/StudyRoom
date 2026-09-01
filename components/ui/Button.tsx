import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { triggerHapticFeedback } from "@/lib/utils/haptics";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled,
      type = "button",
      onClick,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-bold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 focus:ring-offset-zinc-950 disabled:opacity-50 disabled:cursor-not-allowed select-none min-h-[44px] touch-manipulation shadow-sm active:scale-95";

    const variants = {
      primary:
        "bg-zinc-100 text-zinc-950 hover:bg-white hover:text-black active:bg-zinc-200 border border-zinc-200 font-extrabold opacity-100 shadow-md",
      secondary:
        "bg-zinc-900 text-zinc-100 hover:bg-zinc-800 active:bg-zinc-700 border border-zinc-700 font-semibold",
      danger:
        "bg-red-950 text-red-100 hover:bg-red-900 active:bg-red-800 border border-red-800 font-bold",
      ghost:
        "bg-transparent text-zinc-300 hover:text-white hover:bg-zinc-900 active:bg-zinc-800 font-medium",
      outline:
        "bg-zinc-950 text-zinc-100 border border-zinc-700 hover:bg-zinc-900 active:bg-zinc-800 font-semibold",
    };

    const sizes = {
      sm: "px-3 py-1.5 text-xs",
      md: "px-4 py-2.5 text-sm",
      lg: "px-6 py-3.5 text-base w-full",
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      triggerHapticFeedback(10);
      if (onClick) onClick(e);
    };

    return (
      <button
        ref={ref}
        type={type}
        className={twMerge(clsx(baseStyles, variants[variant], sizes[size], className))}
        disabled={disabled || isLoading}
        onClick={handleClick}
        {...props}
      >
        {isLoading ? (
          <span className="flex items-center space-x-2">
            <svg
              className="animate-spin h-4 w-4 text-current"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span>Processing...</span>
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
