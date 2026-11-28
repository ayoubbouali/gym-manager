import { AfterViewInit, Directive, ElementRef, OnDestroy, inject, input } from '@angular/core';

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function whenVisible(el: Element, run: () => void, threshold = 0.15): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    run();
    return () => undefined;
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        run();
        io.disconnect();
      }
    },
    { threshold, rootMargin: '0px 0px -8% 0px' },
  );
  io.observe(el);
  return () => io.disconnect();
}

/** Fades and lifts the element in the first time it scrolls into view. */
@Directive({
  selector: '[reveal]',
  host: { class: 'reveal', '[style.--reveal-delay.ms]': 'reveal() || 0' },
})
export class Reveal implements AfterViewInit, OnDestroy {
  readonly reveal = input<number | ''>(0);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private stop = () => undefined as void;

  ngAfterViewInit(): void {
    const node = this.el.nativeElement;
    if (reducedMotion()) node.classList.add('in');
    else this.stop = whenVisible(node, () => node.classList.add('in'));
  }

  ngOnDestroy(): void {
    this.stop();
  }
}

/** Counts from 0 up to the value when it scrolls into view. */
@Directive({ selector: '[countUp]' })
export class CountUp implements AfterViewInit, OnDestroy {
  readonly countUp = input.required<number>();
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private stop = () => undefined as void;
  private frame = 0;

  ngAfterViewInit(): void {
    const node = this.el.nativeElement;
    const target = this.countUp();
    if (reducedMotion() || target <= 0) {
      node.textContent = String(target);
      return;
    }
    node.textContent = '0';
    this.stop = whenVisible(
      node,
      () => {
        const started = performance.now();
        const step = (t: number) => {
          const p = Math.min(1, (t - started) / 1400);
          node.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 4))));
          if (p < 1) this.frame = requestAnimationFrame(step);
        };
        this.frame = requestAnimationFrame(step);
      },
      0.6,
    );
  }

  ngOnDestroy(): void {
    this.stop();
    cancelAnimationFrame(this.frame);
  }
}
