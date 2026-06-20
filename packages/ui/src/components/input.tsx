import * as React from "react";
import { cn } from "./cn";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, className, ...rest }, ref) => {
    return (
      <div className="w-full">
        {label && <label className="o-label">{label}</label>}
        <input
          ref={ref}
          className={cn("o-input", error && "border-red-700", className)}
          {...rest}
        />
        {error ? (
          <p className="mt-1 text-xs text-red-400">{error}</p>
        ) : hint ? (
          <p className="mt-1 text-xs text-cream3">{hint}</p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = "Input";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, error, className, ...rest }, ref) => {
    return (
      <div className="w-full">
        {label && <label className="o-label">{label}</label>}
        <textarea
          ref={ref}
          className={cn("o-input min-h-[100px] resize-y", error && "border-red-700", className)}
          {...rest}
        />
        {error ? <p className="mt-1 text-xs text-red-400">{error}</p>
          : hint ? <p className="mt-1 text-xs text-cream3">{hint}</p>
          : null}
      </div>
    );
  },
);
Textarea.displayName = "Textarea";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
}
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hint, error, className, children, ...rest }, ref) => {
    return (
      <div className="w-full">
        {label && <label className="o-label">{label}</label>}
        <select
          ref={ref}
          className={cn("o-input cursor-pointer", error && "border-red-700", className)}
          {...rest}
        >
          {children}
        </select>
        {error ? <p className="mt-1 text-xs text-red-400">{error}</p>
          : hint ? <p className="mt-1 text-xs text-cream3">{hint}</p>
          : null}
      </div>
    );
  },
);
Select.displayName = "Select";
