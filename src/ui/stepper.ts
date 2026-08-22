/**
 * A vanilla port of the AnimatedStepper.
 *
 * Same behaviour as the React original — slide-and-fade between steps, a
 * container that animates to the height of its content, clickable indicators
 * with completion states — without adding React and framer-motion to an
 * extension that currently ships zero runtime dependencies. For a tool people
 * are asked to trust with every page they open, an auditable bundle is worth
 * more than the convenience of the original component.
 *
 * The easing is the same Power3-out curve the original used.
 */

export interface Step {
  title: string;
  /** Built fresh each time the step is shown, so it can host live controls. */
  render: () => HTMLElement;
}

export interface StepperOptions {
  steps: Step[];
  initialStep?: number;
  backText?: string;
  nextText?: string;
  finishText?: string;
  disableIndicators?: boolean;
  onStepChange?: (step: number) => void;
  onFinish?: () => void;
}

const EASE = 'cubic-bezier(.22,1,.36,1)';
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

export class Stepper {
  private current: number;
  private readonly opts: Required<Pick<StepperOptions, 'backText' | 'nextText' | 'finishText' | 'disableIndicators'>> & StepperOptions;
  private view!: HTMLElement;
  private observer: ResizeObserver | undefined;

  constructor(private host: HTMLElement, options: StepperOptions) {
    this.opts = {
      backText: 'Back',
      nextText: 'Continue',
      finishText: 'Done',
      disableIndicators: false,
      ...options,
    };
    this.current = options.initialStep ?? 1;
    this.host.classList.add('stepper');
    this.render();
    this.paint(1);
  }

  destroy(): void {
    this.observer?.disconnect();
  }

  private get total(): number {
    return this.opts.steps.length;
  }

  private go(next: number): void {
    if (next < 1) return;
    if (next > this.total) {
      this.opts.onFinish?.();
      return;
    }
    const direction = next >= this.current ? 1 : -1;
    this.current = next;
    this.render();
    this.paint(direction);
    this.opts.onStepChange?.(next);
  }

  /** Indicators and footer. Rebuilt on every step, which is cheap and keeps the
   *  completion states honest without any diffing. */
  private render(): void {
    const dots = document.createElement('div');
    dots.className = 'st-dots';

    this.opts.steps.forEach((_, i) => {
      const n = i + 1;
      const state = this.current === n ? 'active' : this.current > n ? 'complete' : 'inactive';

      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'st-dot';
      dot.dataset.state = state;
      dot.setAttribute('aria-label', `Step ${n} of ${this.total}`);
      if (state === 'complete') dot.innerHTML = CHECK;
      else dot.textContent = String(n);
      if (this.opts.disableIndicators) dot.disabled = true;
      else dot.addEventListener('click', () => this.go(n));
      dots.appendChild(dot);

      if (i < this.total - 1) {
        const conn = document.createElement('div');
        conn.className = 'st-conn';
        const fill = document.createElement('i');
        fill.style.width = this.current > n ? '100%' : '0%';
        conn.appendChild(fill);
        dots.appendChild(conn);
      }
    });

    const view = document.createElement('div');
    view.className = 'st-view';

    const foot = document.createElement('div');
    foot.className = 'st-foot';
    if (this.current > 1) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'st-back';
      back.textContent = this.opts.backText;
      back.addEventListener('click', () => this.go(this.current - 1));
      foot.appendChild(back);
    }
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'st-next brand';
    next.textContent = this.current === this.total ? this.opts.finishText : this.opts.nextText;
    next.addEventListener('click', () => this.go(this.current + 1));
    foot.appendChild(next);

    this.host.replaceChildren(dots, view, foot);
    this.view = view;
  }

  /** Slides the new panel in and the old one out, then animates the container
   *  to the new height — the job framer-motion's animate={{height}} was doing. */
  private paint(direction: number): void {
    const step = this.opts.steps[this.current - 1];
    if (!step) return;

    const panel = document.createElement('div');
    panel.className = 'st-panel';
    const heading = document.createElement('h3');
    heading.textContent = step.title;
    panel.append(heading, step.render());

    panel.style.opacity = '0';
    panel.style.transform = `translateX(${direction >= 0 ? 22 : -22}px)`;
    panel.style.transition = `opacity 240ms ${EASE}, transform 420ms ${EASE}`;

    this.view.appendChild(panel);

    requestAnimationFrame(() => {
      this.view.style.height = `${panel.offsetHeight}px`;
      panel.style.opacity = '1';
      panel.style.transform = 'translateX(0)';
    });

    this.observer?.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => {
        this.view.style.height = `${panel.offsetHeight}px`;
      });
      this.observer.observe(panel);
    }
  }
}

/** Styles for the stepper. Kept beside the component for the same reason
 *  Iris's are: one source of truth, injectable anywhere. */
export const STEPPER_CSS = `
.stepper { width: 100%; }
.st-dots { display: flex; align-items: center; padding: 4px 0 22px; }
.st-dot {
  position: relative; width: 32px; height: 32px; padding: 0; border-radius: 50%;
  flex-shrink: 0; display: grid; place-items: center;
  border: 2px solid var(--line); background: var(--surface-2); color: var(--ink-3);
  font-size: 12.5px; font-weight: 700;
  transition: all 340ms var(--ease);
}
.st-dot:not(:disabled) { cursor: pointer; }
.st-dot[data-state="active"] {
  border-color: var(--brand); background: var(--surface); color: var(--brand);
  box-shadow: 0 0 0 5px var(--brand-wash);
}
.st-dot[data-state="complete"] { border-color: var(--brand); background: var(--brand); color: #fff; }
.st-dot svg { width: 15px; height: 15px; stroke: currentColor; stroke-width: 3; fill: none;
  stroke-linecap: round; stroke-linejoin: round; }
.st-conn { flex: 1; height: 2px; margin: 0 10px; background: var(--line); border-radius: 999px; overflow: hidden; }
.st-conn i { display: block; height: 100%; background: var(--brand); transition: width 520ms var(--ease); }

.st-view { position: relative; overflow: hidden; transition: height 460ms var(--ease); }
.st-panel { position: absolute; inset: 0 0 auto 0; }
.st-panel h3 { font-size: 1.32rem; font-weight: 700; letter-spacing: -.02em; margin: 0 0 10px; }
.st-panel p { margin: 0 0 12px; color: var(--ink-2); font-size: 14px; }
.st-panel p:last-child { margin-bottom: 0; }

.st-foot { display: flex; align-items: center; gap: 12px; padding-top: 22px; }
.st-back { border: 0; background: none; color: var(--ink-3); padding: 8px 4px; }
.st-back:hover { color: var(--ink); border: 0; }
.st-next { margin-left: auto; height: 42px; padding: 0 24px; }
`;
