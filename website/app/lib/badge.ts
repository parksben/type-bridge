// 生成 flat 风格 badge SVG，无需外部依赖。
// 字符宽度用 Verdana 11px 近似（每字符 ~6.5px）。

const CHAR_WIDTH = 6.5;
const PADDING = 10; // 每侧水平内边距
const HEIGHT = 20;
const FONT_SIZE = 11;

const COLORS: Record<string, string> = {
  blue: "#0075ca",
  brightgreen: "#44cc11",
  green: "#97ca00",
  orange: "#e05d44",
  inactive: "#9f9f9f",
};

function measureText(text: string): number {
  return Math.ceil(text.length * CHAR_WIDTH);
}

function resolveColor(color: string): string {
  return COLORS[color] ?? color;
}

export function generateBadgeSvg(
  label: string,
  message: string,
  color: string,
): string {
  const labelW = measureText(label) + PADDING * 2;
  const messageW = measureText(message) + PADDING * 2;
  const totalW = labelW + messageW;
  const bgColor = resolveColor(color);

  // text x 坐标：各段水平中心（×10 为 font-size scale 坐标系）
  const labelX = (labelW / 2) * 10;
  const messageX = (labelW + messageW / 2) * 10;
  const totalW10 = totalW * 10;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalW}" height="${HEIGHT}" role="img" aria-label="${label}: ${message}">
<title>${label}: ${message}</title>
<linearGradient id="s" x2="0" y2="100%">
  <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
  <stop offset="1" stop-opacity=".1"/>
</linearGradient>
<clipPath id="r">
  <rect width="${totalW}" height="${HEIGHT}" rx="3" fill="#fff"/>
</clipPath>
<g clip-path="url(#r)">
  <rect width="${labelW}" height="${HEIGHT}" fill="#555"/>
  <rect x="${labelW}" width="${messageW}" height="${HEIGHT}" fill="${bgColor}"/>
  <rect width="${totalW}" height="${HEIGHT}" fill="url(#s)"/>
</g>
<g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="${FONT_SIZE * 10}" transform="scale(.1)">
  <text x="${labelX}" y="150" fill="#010101" fill-opacity=".3" textLength="${(labelW - PADDING * 2) * 10}" lengthAdjust="spacing">${label}</text>
  <text x="${labelX}" y="140" textLength="${(labelW - PADDING * 2) * 10}" lengthAdjust="spacing">${label}</text>
  <text x="${messageX}" y="150" fill="#010101" fill-opacity=".3" textLength="${(messageW - PADDING * 2) * 10}" lengthAdjust="spacing">${message}</text>
  <text x="${messageX}" y="140" textLength="${(messageW - PADDING * 2) * 10}" lengthAdjust="spacing">${message}</text>
</g>
</svg>`;
}

// 格式化下载量为简写
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
