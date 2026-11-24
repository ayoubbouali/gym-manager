import { Component, ElementRef, OnDestroy, effect, input, viewChild } from '@angular/core';
import { BarController, BarElement, CategoryScale, Chart, ChartConfiguration, Legend, LinearScale, Tooltip } from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

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

/** Grouped bar chart (several series side by side, with a legend). */
export function seriesChart(labels: string[], series: { label: string; data: number[]; color: string }[],
                            format: (v: number) => string): ChartConfiguration<'bar'> {
  const cfg = barChart(labels, [], '', format);
  const text = cssColor('--muted', '#6b7280');
  cfg.data.datasets = series.map((x) => ({ label: x.label, data: x.data, backgroundColor: x.color, borderRadius: 6, maxBarThickness: 28 }));
  cfg.options!.plugins = {
    legend: { display: true, labels: { color: text } },
    tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label} : ${format(Number(ctx.parsed.y))}` } },
  };
  return cfg;
}
