import type { SVGProps } from "react";

export type IconName =
  | "mic"
  | "mic-off"
  | "voice"
  | "globe"
  | "book"
  | "settings"
  | "info"
  | "x"
  | "check"
  | "plus"
  | "search"
  | "sliders"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "more"
  | "calendar"
  | "headphones"
  | "speaker"
  | "captions"
  | "save"
  | "merge"
  | "send"
  | "wave"
  | "folder"
  | "file"
  | "inbox"
  | "scheduled"
  | "stop"
  | "pause"
  | "play"
  | "bookmark";

type Props = Omit<SVGProps<SVGSVGElement>, "name" | "stroke" | "strokeWidth"> & {
  name: IconName;
  size?: number;
  stroke?: number;
};

export function Icon({ name, size = 18, stroke = 1.6, ...rest }: Props) {
  const props: SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...rest,
  };
  switch (name) {
    case "mic":
      return (
        <svg {...props}>
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <path d="M12 18v3" />
        </svg>
      );
    case "mic-off":
      return (
        <svg {...props}>
          <path d="M3 3l18 18" />
          <path d="M9 9v2a3 3 0 0 0 5.12 2.12" />
          <path d="M15 11V6a3 3 0 0 0-5.66-1.4" />
          <path d="M5 11a7 7 0 0 0 11.6 5.3" />
          <path d="M19 11a7 7 0 0 0-.07-1" />
          <path d="M12 18v3" />
        </svg>
      );
    case "voice":
      return (
        <svg {...props}>
          <path d="M12 3v18" />
          <path d="M8 7v10" />
          <path d="M16 7v10" />
          <path d="M4 10v4" />
          <path d="M20 10v4" />
        </svg>
      );
    case "globe":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a14 14 0 0 1 0 18" />
          <path d="M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    case "book":
      return (
        <svg {...props}>
          <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z" />
          <path d="M8 7h8" />
          <path d="M8 11h6" />
        </svg>
      );
    case "settings":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case "info":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01" />
          <path d="M11 12h1v5h1" />
        </svg>
      );
    case "x":
      return (
        <svg {...props}>
          <path d="M6 6l12 12" />
          <path d="M18 6l-12 12" />
        </svg>
      );
    case "check":
      return (
        <svg {...props}>
          <path d="M4 12l5 5 11-11" />
        </svg>
      );
    case "plus":
      return (
        <svg {...props}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "search":
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      );
    case "sliders":
      return (
        <svg {...props}>
          <path d="M4 21v-7" />
          <path d="M4 10V3" />
          <path d="M12 21v-9" />
          <path d="M12 8V3" />
          <path d="M20 21v-5" />
          <path d="M20 12V3" />
          <path d="M1 14h6" />
          <path d="M9 8h6" />
          <path d="M17 16h6" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...props}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg {...props}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      );
    case "chevron-left":
      return (
        <svg {...props}>
          <path d="M15 6l-6 6 6 6" />
        </svg>
      );
    case "more":
      return (
        <svg {...props}>
          <circle cx="5" cy="12" r="1.4" />
          <circle cx="12" cy="12" r="1.4" />
          <circle cx="19" cy="12" r="1.4" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18" />
          <path d="M8 3v4" />
          <path d="M16 3v4" />
        </svg>
      );
    case "headphones":
      return (
        <svg {...props}>
          <path d="M3 14a9 9 0 0 1 18 0" />
          <path d="M3 14v3a3 3 0 0 0 3 3h1v-7H6a3 3 0 0 0-3 3v0" />
          <path d="M21 14v3a3 3 0 0 1-3 3h-1v-7h1a3 3 0 0 1 3 3v0" />
        </svg>
      );
    case "speaker":
      return (
        <svg {...props}>
          <path d="M11 5L6 9H3v6h3l5 4z" />
          <path d="M16 9a4 4 0 0 1 0 6" />
          <path d="M19 6a8 8 0 0 1 0 12" />
        </svg>
      );
    case "captions":
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M7 12h3" />
          <path d="M14 12h3" />
        </svg>
      );
    case "save":
      return (
        <svg {...props}>
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <path d="M7 3v6h9" />
          <path d="M7 21v-7h10v7" />
        </svg>
      );
    case "merge":
      return (
        <svg {...props}>
          <path d="M8 3v4a4 4 0 0 0 4 4h4" />
          <path d="M16 3l3 4-3 4" />
          <path d="M8 21v-4a4 4 0 0 1 4-4h4" />
        </svg>
      );
    case "send":
      return (
        <svg {...props}>
          <path d="M22 2L11 13" />
          <path d="M22 2l-7 20-4-9-9-4z" />
        </svg>
      );
    case "wave":
      return (
        <svg {...props}>
          <path d="M2 12h2" />
          <path d="M6 8v8" />
          <path d="M10 5v14" />
          <path d="M14 9v6" />
          <path d="M18 6v12" />
          <path d="M22 12h-2" />
        </svg>
      );
    case "folder":
      return (
        <svg {...props}>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
      );
    case "file":
      return (
        <svg {...props}>
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6" />
        </svg>
      );
    case "inbox":
      return (
        <svg {...props}>
          <path d="M3 13l3-8h12l3 8" />
          <path d="M3 13v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6" />
          <path d="M3 13h5l1 3h6l1-3h5" />
        </svg>
      );
    case "scheduled":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "stop":
      return (
        <svg {...props}>
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      );
    case "pause":
      return (
        <svg {...props}>
          <rect x="7" y="5" width="3" height="14" rx="1" />
          <rect x="14" y="5" width="3" height="14" rx="1" />
        </svg>
      );
    case "play":
      return (
        <svg {...props}>
          <path d="M6 4l14 8-14 8z" />
        </svg>
      );
    case "bookmark":
      return (
        <svg {...props}>
          <path d="M6 3h12v18l-6-4-6 4z" />
        </svg>
      );
    default:
      return null;
  }
}
