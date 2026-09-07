import { pad2 } from "@/lib/games";

const SIZES = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-11 w-11 text-base",
  xl: "h-14 w-14 text-xl",
} as const;

export default function Ball({
  n,
  zone,
  size = "md",
  title,
}: {
  n: number;
  zone: "red" | "blue";
  size?: keyof typeof SIZES;
  title?: string;
}) {
  return (
    <span
      className={`ball ${zone === "red" ? "ball-red" : "ball-blue"} ${SIZES[size]}`}
      title={title}
    >
      {pad2(n)}
    </span>
  );
}
