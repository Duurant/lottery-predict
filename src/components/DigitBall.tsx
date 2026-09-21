const SIZES = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-11 w-11 text-base",
  xl: "h-14 w-14 text-xl",
} as const;

/**
 * 单个数字筹码（排列五）。
 * 注意与组合型的 Ball 不同：数字是 1 位（0-9），**不补零、不排序、带位置含义**，
 * 因此这里直接用单个字符渲染，并用 neutral 配色区分「位」的概念。
 * 尺寸档与 Ball 保持一致（首页三张开奖卡并排时球体大小才会齐平）。
 */
export default function DigitBall({
  n,
  size = "md",
  title,
  highlighted = false,
}: {
  n: number;
  size?: keyof typeof SIZES;
  title?: string;
  highlighted?: boolean;
}) {
  return (
    <span
      className={`ball ${highlighted ? "ball-digit-hit" : "ball-digit"} ${SIZES[size]}`}
      title={title}
    >
      {n}
    </span>
  );
}
