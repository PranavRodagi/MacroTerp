import type { ReactNode } from "react";

export type IconName = "arrow-left" | "arrow-right" | "sliders" | "x" | "leaf" | "check" | "eye" | "eye-off";

const paths: Record<IconName, ReactNode> = {
  "arrow-left": <path d="m15 18-6-6 6-6" />,
  "arrow-right": <path d="m9 18 6-6-6-6" />,
  sliders: (
    <>
      <path d="M4 21v-7" />
      <path d="M4 10V3" />
      <path d="M12 21v-9" />
      <path d="M12 8V3" />
      <path d="M20 21v-5" />
      <path d="M20 12V3" />
      <path d="M1 14h6" />
      <path d="M9 8h6" />
      <path d="M17 16h6" />
    </>
  ),
  x: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  leaf: <path d="M20.8 3.2C13 3.2 6.2 6.6 4.2 12.3c-1.2 3.5.4 6.8 3.8 7.5 5.8 1.2 10.8-4.8 12.8-16.6ZM4 21c2.8-5.2 7.5-8.9 13.5-11" />,
  // From the onboarding prototype.
  check: <path d="m5 12.5 4.4 4.4L19 7.3" strokeWidth="2" />,
  eye: (
    <>
      <path d="M2.8 12s3.3-5 9.2-5 9.2 5 9.2 5-3.3 5-9.2 5-9.2-5-9.2-5Z" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.3" strokeWidth="1.6" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M2.8 12s3.3-5 9.2-5 9.2 5 9.2 5-3.3 5-9.2 5-9.2-5-9.2-5Z" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.3" strokeWidth="1.6" />
      <path d="m4 4 16 16" />
    </>
  ),
};

// Stroke icons from the Figma Make prototype; they inherit color via currentColor.
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
    >
      {paths[name]}
    </svg>
  );
}
