/**
 * echarts 子模块的副作用导入声明。
 *
 * EChart.tsx 用 `import("echarts/lib/chart/bar")` 这类深层路径按需注册图表与组件：
 * 这些模块**导入即注册**（内部调用 use(install)）、不导出任何内容，官方也未提供
 * .d.ts。若改回 `echarts/charts`、`echarts/components` 这类 barrel 导入，打包器会把
 * 全部图表与组件（map/geo/boxplot/pie…）一起打进 chunk——实测异步 chunk 从约 600KB
 * 涨到约 970KB。这里的空模块声明只为让 TS 通过，实际由打包器解析真实 JS 文件。
 */
declare module "echarts/lib/chart/bar";
declare module "echarts/lib/chart/line";
declare module "echarts/lib/component/grid";
declare module "echarts/lib/component/tooltip";
declare module "echarts/lib/component/legend";
declare module "echarts/lib/component/markLine";
declare module "echarts/lib/component/markArea";
declare module "echarts/lib/component/dataZoom";
