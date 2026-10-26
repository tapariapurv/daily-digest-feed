import type { CSSProperties, ReactNode } from 'react';
import type { Design } from '@/lib/profile';
import { DEFAULT_DESIGN } from '@/lib/profile';

/** Applies a reader's design (template, colours, size, density) to everything inside. */
export function Paper({ design = DEFAULT_DESIGN, children, className = '' }: { design?: Design; children: ReactNode; className?: string }) {
  const style = design.accent ? ({ '--accent-user': design.accent } as CSSProperties) : undefined;
  return (
    <div
      className={`paper ${className}`}
      data-template={design.template}
      data-mode={design.mode}
      data-size={design.textSize}
      data-density={design.density}
      style={style}
    >
      {children}
    </div>
  );
}
