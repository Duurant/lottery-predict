"use client";

import { useEffect, useRef, useState } from "react";
import type * as EchartsCore from "echarts/core";

export type EOption = EchartsCore.EChartsCoreOption;

// 模块级缓存：echarts 只加载注册一次，全部图表实例共享。
// 放在 useEffect 里动态 import（而非顶层静态 import），让 echarts 脚本
// 只在页面上真正出现图表时才下载——dlt/ssq/p5 首页 tab 是 DOM 走势表，
// 不再为用不到的图表付出数百 KB 首屏脚本。
//
// 图表与组件故意走 `echarts/lib/...` 深层路径：这些模块导入即自注册，
// 打包器只需收进这几个文件；用 `echarts/charts`、`echarts/components`
// 这类 barrel 会把全部图表组件（map/geo/boxplot…）一起打进来（实测约 +370KB）。
// 渲染器模块不自注册，需要显式 use(install)。
let echartsPromise: Promise<typeof EchartsCore> | null = null;

function loadEcharts(): Promise<typeof EchartsCore> {
  if (!echartsPromise) {
    echartsPromise = Promise.all([
      import("echarts/core"),
      import("echarts/renderers"),
      import("echarts/lib/chart/bar"),
      import("echarts/lib/chart/line"),
      import("echarts/lib/component/grid"),
      import("echarts/lib/component/tooltip"),
      import("echarts/lib/component/legend"),
      import("echarts/lib/component/markLine"),
      import("echarts/lib/component/markArea"),
      import("echarts/lib/component/dataZoom"),
    ]).then(([core, renderers]) => {
      core.use([renderers.CanvasRenderer]);
      return core;
    });
  }
  return echartsPromise;
}

export default function EChart({
  option,
  height = 300,
  ariaLabel,
}: {
  option: EOption;
  height?: number;
  /** 图表内容的一句话摘要（canvas 无法被屏幕阅读器读取） */
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<EchartsCore.ECharts | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  // 加载完成前渲染同高度占位 div，避免布局跳动
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    loadEcharts().then((echarts) => {
      if (disposed || !ref.current) return;
      chart.current = echarts.init(ref.current);
      const ro = new ResizeObserver(() => chart.current?.resize());
      ro.observe(ref.current);
      roRef.current = ro;
      setReady(true);
    });
    return () => {
      disposed = true;
      roRef.current?.disconnect();
      roRef.current = null;
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    // ready 翻转时应用首份 option；之后 option 变化增量更新
    if (ready) chart.current?.setOption(option, true);
  }, [option, ready]);

  return (
    <div
      ref={ref}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      style={{ height }}
      className="w-full"
    />
  );
}
