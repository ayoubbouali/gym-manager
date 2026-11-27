import { Component, ElementRef, OnDestroy, effect, input, viewChild } from '@angular/core';
import {
  ArcElement, BarController, BarElement, CategoryScale, Chart, ChartConfiguration, Legend, LineController, LineElement, LinearScale,
  PieController, PointElement, Tooltip,
} from 'chart.js';

Chart.register(BarController, BarElement, LineController, LineElement, PointElement, PieController, ArcElement, CategoryScale, LinearScale,
  Tooltip, Legend);

/** Minimal Chart.js wrapper: re-renders when the configuration changes. */
@Component({
  selector: 'app-chart',
  template: `<div class="chart-box" [style.height.px]="height()"><canvas #canvas role="img" [attr.aria-label]="label()"></canvas></div>`,
})
export class ChartComponent implements OnDestroy {
  config = input.required<ChartConfiguration>();
  height = input(260);
  label = input('Graphique');
  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart;

  constructor() {
    effect(() => {
      const cfg = this.config();
      this.chart?.destroy();
      this.chart = new Chart(this.canvas().nativeElement, cfg);
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}

/** Resolves a CSS custom property (possibly using light-dark()) to an rgb() color usable by canvas. */
export function cssColor(variable: string, fallback: string): string {
  const el = document.createElement('span');
  el.style.color = `var(${variable}, ${fallback})`;
  el.style.display = 'none';
  document.body.appendChild(el);
  const color = getComputedStyle(el).color;
  el.remove();
  return color || fallback;
}

/** Shared look of bar charts. */
export function barChart(labels: string[], data: number[], colors: string | string[], format: (v: number) => string,
                         horizontal = false): ChartConfiguration<'bar'> {
  const text = cssColor('--muted', '#6b7280');
  const grid = cssColor('--line', '#e5e7eb');
  return {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 6, maxBarThickness: 42 }] },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => format(Number(horizontal ? ctx.parsed.x : ctx.parsed.y)) } },
      },
      scales: {
        x: { grid: { display: horizontal, color: grid }, ticks: { color: text, ...(horizontal ? { callback: (v) => format(Number(v)) } : {}) } },
        y: { grid: { display: !horizontal, color: grid }, ticks: { color: text, ...(!horizontal ? { callback: (v) => format(Number(v)) } : {}) }, beginAtZero: true },
      },
    },
  };
}

/** Grouped bar chart (several series side by side, with a legend); {@code stacked}: one bar per label, series piled up. */
export function seriesChart(labels: string[], series: { label: string; data: number[]; color: string }[],
                            format: (v: number) => string, stacked = false): ChartConfiguration<'bar'> {
  const cfg = barChart(labels, [], '', format);
  if (stacked) {
    cfg.options!.scales!['x']!.stacked = true;
    cfg.options!.scales!['y']!.stacked = true;
  }
  const text = cssColor('--muted', '#6b7280');
  cfg.data.datasets = series.map((x) => ({ label: x.label, data: x.data, backgroundColor: x.color, borderRadius: 6, maxBarThickness: 28 }));
  cfg.options!.plugins = {
    legend: { display: true, labels: { color: text } },
    tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label} : ${format(Number(ctx.parsed.y))}` } },
  };
  return cfg;
}

/** Categorical series color of a fixed slot (1-based, see --series-N in styles.scss): an entity keeps its slot. */
export function seriesColor(slot: number): string {
  const fallbacks = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6', '#008300'];
  return cssColor(`--series-${slot}`, fallbacks[slot - 1]);
}

/** Line chart, one line per series, with a legend and a tooltip listing every series of the hovered point. */
export function lineChart(labels: string[], series: { label: string; data: number[]; color: string }[],
                          format: (v: number) => string): ChartConfiguration<'line'> {
  const text = cssColor('--muted', '#6b7280');
  const grid = cssColor('--line', '#e5e7eb');
  const surface = cssColor('--card', '#ffffff');
  return {
    type: 'line',
    data: {
      labels,
      datasets: series.map((x) => ({
        label: x.label, data: x.data, borderColor: x.color, backgroundColor: x.color, borderWidth: 2, cubicInterpolationMode: 'monotone',
        pointRadius: 4, pointHoverRadius: 6, pointBorderColor: surface, pointBorderWidth: 2,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, labels: { color: text, usePointStyle: true } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label} : ${format(Number(ctx.parsed.y))}` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: text } },
        y: { grid: { color: grid }, ticks: { color: text, precision: 0, callback: (v) => format(Number(v)) }, beginAtZero: true },
      },
    },
  };
}

/** Pie chart: slices separated by a 2px surface gap, legend, tooltip with the amount and its share. */
export function pieChart(labels: string[], data: number[], colors: string[], format: (v: number) => string): ChartConfiguration<'pie'> {
  const text = cssColor('--muted', '#6b7280');
  const total = data.reduce((a, b) => a + b, 0);
  return {
    type: 'pie',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: cssColor('--card', '#ffffff'), borderWidth: 2, hoverOffset: 6 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'right', labels: { color: text, usePointStyle: true } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label} : ${format(Number(ctx.parsed))} (${share(Number(ctx.parsed), total)})` } },
      },
    },
  };
}

/** Share of a total as "42 %" (French notation). */
export function share(value: number, total: number): string {
  return total > 0 ? `${Math.round((value * 100) / total)} %` : '—';
}
