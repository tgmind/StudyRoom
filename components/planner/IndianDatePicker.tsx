"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  formatIndianDate,
  parseIndianDateToISO,
  validateIndianDateString,
  formatDateISO,
} from "@/lib/planner/calculations";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";

interface IndianDatePickerProps {
  value: string; // Canonical YYYY-MM-DD
  onChange: (isoDate: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  minDate?: string; // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
  hint?: string;
  error?: string;
  id?: string;
  className?: string;
  allowPastDates?: boolean;
}

export function IndianDatePicker({
  value,
  onChange,
  label,
  required = false,
  disabled = false,
  minDate,
  maxDate,
  hint,
  error: externalError,
  id,
  className = "",
  allowPastDates = true,
}: IndianDatePickerProps) {
  // Display text in Indian format DD/MM/YYYY
  const [displayText, setDisplayText] = useState(() => formatIndianDate(value));
  const [isOpen, setIsOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Calendar view state (year and month for the open calendar)
  const [viewYear, setViewYear] = useState(() => {
    if (value && value.length === 10) {
      const y = parseInt(value.slice(0, 4), 10);
      if (!isNaN(y)) return y;
    }
    return new Date().getFullYear();
  });

  const [viewMonth, setViewMonth] = useState(() => {
    if (value && value.length === 10) {
      const m = parseInt(value.slice(5, 7), 10);
      if (!isNaN(m)) return m - 1; // 0-indexed
    }
    return new Date().getMonth();
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Synchronize display text when incoming value prop changes externally
  useEffect(() => {
    const formatted = formatIndianDate(value);
    setDisplayText(formatted);
    if (value && value.length === 10) {
      const y = parseInt(value.slice(0, 4), 10);
      const m = parseInt(value.slice(5, 7), 10);
      if (!isNaN(y) && !isNaN(m)) {
        setViewYear(y);
        setViewMonth(m - 1);
      }
    }
    setLocalError(null);
  }, [value]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Handle direct typing in the input field
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setDisplayText(text);

    if (!text.trim()) {
      if (required) {
        setLocalError("Date is required");
      } else {
        setLocalError(null);
        onChange("");
      }
      return;
    }

    // Try parsing
    const validation = validateIndianDateString(text);
    if (validation.isValid && validation.isoDate) {
      // Check min/max bounds
      if (minDate && validation.isoDate < minDate) {
        setLocalError(`Date cannot be earlier than ${formatIndianDate(minDate)}`);
        return;
      }
      if (maxDate && validation.isoDate > maxDate) {
        setLocalError(`Date cannot be later than ${formatIndianDate(maxDate)}`);
        return;
      }
      setLocalError(null);
      onChange(validation.isoDate);
    } else {
      // Keep typed text intact, show guidance if user has typed full length
      if (text.length >= 10) {
        setLocalError(validation.error || "Invalid date");
      } else {
        setLocalError(null);
      }
    }
  };

  const handleInputBlur = () => {
    if (!displayText.trim()) {
      if (required) {
        setLocalError("Date is required");
      }
      return;
    }
    const validation = validateIndianDateString(displayText);
    if (!validation.isValid) {
      setLocalError(validation.error || "Please enter a valid date in DD/MM/YYYY format");
    } else if (validation.isoDate) {
      if (minDate && validation.isoDate < minDate) {
        setLocalError(`Date cannot be earlier than ${formatIndianDate(minDate)}`);
      } else if (maxDate && validation.isoDate > maxDate) {
        setLocalError(`Date cannot be later than ${formatIndianDate(maxDate)}`);
      } else {
        setLocalError(null);
        onChange(validation.isoDate);
      }
    }
  };

  // Calendar selection
  const handleSelectDate = (year: number, month: number, day: number) => {
    const isoDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;

    if (minDate && isoDate < minDate) return;
    if (maxDate && isoDate > maxDate) return;

    const indian = `${String(day).padStart(2, "0")}/${String(
      month + 1
    ).padStart(2, "0")}/${year}`;

    setDisplayText(indian);
    setLocalError(null);
    onChange(isoDate);
    setIsOpen(false);
  };

  const handleSelectToday = () => {
    const now = new Date();
    const todayISO = formatDateISO(
      new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    );
    if (minDate && todayISO < minDate) return;
    if (maxDate && todayISO > maxDate) return;

    setDisplayText(formatIndianDate(todayISO));
    setLocalError(null);
    onChange(todayISO);
    setIsOpen(false);
  };

  // Month navigation
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  // Generate calendar grid days for viewMonth and viewYear
  const getCalendarDays = () => {
    const days: Array<{
      day: number;
      month: number;
      year: number;
      isCurrentMonth: boolean;
      iso: string;
      isSelected: boolean;
      isToday: boolean;
      isDisabled: boolean;
    }> = [];

    // First day of current view month
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sunday
    // Adjust to Monday = 0
    const startDayOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    // Total days in current month
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    // Previous month filler days
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
    const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
    const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;

    for (let i = startDayOffset - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const iso = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(
        dayNum
      ).padStart(2, "0")}`;
      days.push({
        day: dayNum,
        month: prevMonth,
        year: prevYear,
        isCurrentMonth: false,
        iso,
        isSelected: iso === value,
        isToday: false,
        isDisabled: Boolean(
          (minDate && iso < minDate) || (maxDate && iso > maxDate)
        ),
      });
    }

    // Today's date string
    const now = new Date();
    const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(now.getDate()).padStart(2, "0")}`;

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(
        i
      ).padStart(2, "0")}`;
      days.push({
        day: i,
        month: viewMonth,
        year: viewYear,
        isCurrentMonth: true,
        iso,
        isSelected: iso === value,
        isToday: iso === todayISO,
        isDisabled: Boolean(
          (minDate && iso < minDate) || (maxDate && iso > maxDate)
        ),
      });
    }

    // Next month filler days to complete grid (up to 42 cells)
    const remaining = 42 - days.length;
    const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;

    for (let i = 1; i <= remaining && days.length % 7 !== 0; i++) {
      const iso = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(
        i
      ).padStart(2, "0")}`;
      days.push({
        day: i,
        month: nextMonth,
        year: nextYear,
        isCurrentMonth: false,
        iso,
        isSelected: iso === value,
        isToday: false,
        isDisabled: Boolean(
          (minDate && iso < minDate) || (maxDate && iso > maxDate)
        ),
      });
    }

    return days;
  };

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const weekDayLabels = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  // Years list for quick selector (5 years past to 15 years future)
  const currentYear = new Date().getFullYear();
  const yearOptions: number[] = [];
  for (let y = currentYear - 5; y <= currentYear + 15; y++) {
    yearOptions.push(y);
  }

  const activeError = externalError || localError;

  return (
    <div ref={containerRef} className={`relative w-full space-y-1.5 ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-bold text-zinc-300"
        >
          {label} {required && <span className="text-amber-400">*</span>}
        </label>
      )}

      {/* Input row */}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={displayText}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          disabled={disabled}
          placeholder="DD/MM/YYYY"
          aria-label={label || "Date in DD/MM/YYYY format"}
          aria-invalid={Boolean(activeError)}
          aria-describedby={
            activeError ? `${id}-error` : hint ? `${id}-hint` : undefined
          }
          className={`w-full min-h-[44px] pl-3.5 pr-11 py-2.5 bg-zinc-900 border rounded-xl text-sm font-medium text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 transition-all tabular-nums ${
            activeError
              ? "border-rose-500/80 focus:ring-rose-500/50"
              : "border-zinc-800 focus:ring-white/80 focus:border-zinc-700"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        />

        {/* Calendar popover trigger button */}
        <button
          type="button"
          onClick={() => {
            if (!disabled) setIsOpen((prev) => !prev);
          }}
          disabled={disabled}
          aria-label="Open calendar"
          aria-expanded={isOpen}
          className="absolute right-1.5 p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CalendarIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Error Message */}
      {activeError && (
        <p
          id={`${id}-error`}
          className="text-xs text-rose-400 font-semibold flex items-center space-x-1"
        >
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>{activeError}</span>
        </p>
      )}

      {/* Helper Hint */}
      {!activeError && hint && (
        <p id={`${id}-hint`} className="text-[11px] text-zinc-500">
          {hint}
        </p>
      )}

      {/* INTERACTIVE CALENDAR POPOVER */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Calendar date picker"
          className="absolute z-50 mt-1 left-0 sm:left-auto right-0 sm:right-auto sm:w-[320px] w-full max-w-[calc(100vw-2rem)] rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl p-3.5 space-y-3 backdrop-blur-xl animate-in fade-in-50 zoom-in-95 duration-150"
        >
          {/* Header Controls: Month/Year navigation */}
          <div className="flex items-center justify-between gap-1 pb-1 border-b border-zinc-850">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Previous month"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-1.5">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(parseInt(e.target.value, 10))}
                aria-label="Select month"
                className="bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-white"
              >
                {monthNames.map((m, idx) => (
                  <option key={m} value={idx}>
                    {m}
                  </option>
                ))}
              </select>

              <select
                value={viewYear}
                onChange={(e) => setViewYear(parseInt(e.target.value, 10))}
                aria-label="Select year"
                className="bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-white tabular-nums"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Next month"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day of Week Labels */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {weekDayLabels.map((day) => (
              <span
                key={day}
                className="text-[10px] font-black uppercase text-zinc-500 py-1"
              >
                {day}
              </span>
            ))}
          </div>

          {/* Month Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {getCalendarDays().map((cell, idx) => {
              const isPast =
                !allowPastDates &&
                cell.iso <
                  formatDateISO(
                    new Date(
                      Date.UTC(
                        new Date().getFullYear(),
                        new Date().getMonth(),
                        new Date().getDate()
                      )
                    )
                  );

              return (
                <button
                  key={`${cell.iso}-${idx}`}
                  type="button"
                  disabled={cell.isDisabled || isPast}
                  onClick={() =>
                    handleSelectDate(cell.year, cell.month, cell.day)
                  }
                  aria-label={`${cell.day} ${monthNames[cell.month]} ${
                    cell.year
                  }`}
                  aria-pressed={cell.isSelected}
                  className={`min-h-[34px] min-w-[34px] rounded-lg text-xs font-bold transition-all flex items-center justify-center relative tabular-nums ${
                    cell.isSelected
                      ? "bg-white text-zinc-950 font-black shadow-md scale-105 z-10"
                      : cell.isToday
                      ? "border border-amber-400/80 text-amber-300 font-black"
                      : cell.isCurrentMonth
                      ? "text-zinc-200 hover:bg-zinc-800"
                      : "text-zinc-600 hover:bg-zinc-900"
                  } ${
                    cell.isDisabled || isPast
                      ? "opacity-25 cursor-not-allowed hover:bg-transparent"
                      : "cursor-pointer"
                  }`}
                >
                  {cell.day}
                  {cell.isToday && !cell.isSelected && (
                    <span className="absolute bottom-1 w-1 h-1 rounded-full bg-amber-400" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer Quick Action Buttons */}
          <div className="pt-2 border-t border-zinc-850 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={handleSelectToday}
              className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-[11px] transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2.5 py-1 rounded-lg text-zinc-400 hover:text-zinc-100 text-[11px] font-semibold transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
